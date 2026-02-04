import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ChatGateway } from '../src/chat/chat.gateway';
import { REDIS_CLIENT, type RedisClient } from '../src/common/redis.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { QueueGateway } from '../src/queue/queue.service';
import { MatchingWorker } from '../src/queue/matching.worker';
import { SessionService } from '../src/session/session.service';
import { VideoGateway } from '../src/video/video.gateway';
import { VideoService } from '../src/video/video.service';

class NoopQueueGateway {
  emitMatch() {
    return;
  }
}

class NoopChatGateway {
  emitMessage() {
    return;
  }
}

class NoopVideoGateway {
  server = {
    to: () => ({ emit: () => undefined }),
  };

  emitSessionStart() {
    return;
  }

  emitSessionEnd() {
    return;
  }
}

class FakeVideoService {
  buildSessionTokens(sessionId: string, userIds: string[]) {
    const expiresAt = new Date(Date.now() + 60_000);
    const byUser = Object.fromEntries(
      userIds.map((userId, index) => [
        userId,
        {
          rtcToken: `test-rtc-${userId}`,
          rtmToken: `test-rtm-${userId}`,
          rtcUid: index + 1,
          rtmUserId: userId,
        },
      ]),
    );

    return {
      channelName: `test_${sessionId}`,
      expiresAt,
      byUser,
    };
  }
}

describe('Queue -> Session -> Decision (e2e)', () => {
  let app: INestApplication<App> | null = null;
  let prisma: PrismaClient;
  let redis: Redis;
  let worker: MatchingWorker;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(QueueGateway)
      .useClass(NoopQueueGateway)
      .overrideProvider(ChatGateway)
      .useClass(NoopChatGateway)
      .overrideProvider(VideoGateway)
      .useClass(NoopVideoGateway)
      .overrideProvider(VideoService)
      .useClass(FakeVideoService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    worker = app.get(MatchingWorker);
  });

  afterAll(async () => {
    if (app) {
      const closeGateway = (gateway: { server?: unknown } | undefined) => {
        const target = gateway?.server as
          | { close?: () => void; server?: { close?: () => void } }
          | undefined;
        if (!target) {
          return;
        }
        if (typeof target.close === 'function') {
          target.close();
          return;
        }
        if (typeof target.server?.close === 'function') {
          target.server.close();
        }
      };
      const matchingWorker = app.get(MatchingWorker);
      matchingWorker?.onModuleDestroy?.();
      const sessionService = app.get(SessionService);
      sessionService?.onModuleDestroy?.();
      closeGateway(app.get(VideoGateway));
      closeGateway(app.get(ChatGateway));
      closeGateway(app.get(QueueGateway));
      const appRedis = app.get<RedisClient>(REDIS_CLIENT);
      await appRedis.quit();
      appRedis.disconnect();
      await app.close();
    }
    await redis.quit();
    redis.disconnect();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('creates a mutual match after both users choose MATCH', async () => {
    const signupA = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const signupB = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const userA = signupA.body.user;
    const userB = signupB.body.user;
    const tokenA = signupA.body.accessToken as string;
    const tokenB = signupB.body.accessToken as string;

    await prisma.user.update({
      where: { id: userA.id },
      data: { tokenBalance: 1 },
    });
    await prisma.user.update({
      where: { id: userB.id },
      data: { tokenBalance: 1 },
    });

    const [joinA, joinB] = await Promise.all([
      request(app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ region: 'na', preferences: { mode: 'standard' } })
        .expect(201),
      request(app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ region: 'na', preferences: { mode: 'standard' } })
        .expect(201),
    ]);

    const queueKey = joinA.body.queueKey;
    if (worker && queueKey) {
      await (worker as any).processQueueKey?.(queueKey);
    }

    const deadline = Date.now() + 10_000;
    let session = null;
    while (Date.now() < deadline) {
      if (worker) {
        await (worker as any).tick?.();
      }
      session = await prisma.session.findFirst({
        where: {
          OR: [
            { userAId: userA.id, userBId: userB.id },
            { userAId: userB.id, userBId: userA.id },
          ],
        },
      });
      if (session) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(session).toBeTruthy();
    if (!session) {
      return;
    }

    await redis.set(
      `session:ended:${session.id}`,
      '1',
      'PX',
      60 * 60 * 1000,
    );

    const choiceA = await request(app.getHttpServer())
      .post(`/sessions/${session.id}/choice`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ choice: 'MATCH' })
      .expect(201);

    expect(choiceA.body.status).toBe('pending');

    const choiceB = await request(app.getHttpServer())
      .post(`/sessions/${session.id}/choice`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ choice: 'MATCH' })
      .expect(201);

    expect(choiceB.body.status).toBe('resolved');
    expect(choiceB.body.outcome).toBe('mutual');
    expect(choiceB.body.matchId).toBeTruthy();

    const [userLow, userHigh] =
      userA.id < userB.id ? [userA.id, userB.id] : [userB.id, userA.id];

    const match = await prisma.match.findUnique({
      where: {
        userAId_userBId: { userAId: userLow, userBId: userHigh },
      },
    });

    expect(match).toBeTruthy();
    expect(match?.id).toBe(choiceB.body.matchId);
  });
});
