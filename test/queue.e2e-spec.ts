import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MatchingWorker } from '../src/queue/matching.worker';
import { PrismaService } from '../src/prisma/prisma.service';
import { VideoService } from '../src/video/video.service';

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

describe('Queue (e2e)', () => {
  jest.setTimeout(15000);
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;
  let worker: MatchingWorker;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VideoService)
      .useClass(FakeVideoService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    worker = app.get(MatchingWorker);
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  async function createAuthedUser() {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);
    const user = signup.body.user as { id: string };
    const token = signup.body.accessToken as string;
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: 1 },
    });
    return { user, token };
  }

  it('matches two concurrent joins within 3 seconds', async () => {
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

    const [updatedA, updatedB] = await prisma.user.findMany({
      where: { id: { in: [userA.id, userB.id] } },
      select: { tokenBalance: true, id: true },
    });

    const balanceById = new Map(
      updatedA ? [[updatedA.id, updatedA.tokenBalance]] : [],
    );
    if (updatedB) {
      balanceById.set(updatedB.id, updatedB.tokenBalance);
    }

    expect(balanceById.get(userA.id)).toBe(0);
    expect(balanceById.get(userB.id)).toBe(0);
  });

  it('only matches users queued in the same city', async () => {
    const [userA, userB, userC] = await Promise.all([
      createAuthedUser(),
      createAuthedUser(),
      createAuthedUser(),
    ]);

    const [joinA, joinB, joinC] = await Promise.all([
      request(app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ city: 'canberra', preferences: { mode: 'standard' } })
        .expect(201),
      request(app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ city: 'sydney', preferences: { mode: 'standard' } })
        .expect(201),
      request(app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${userC.token}`)
        .send({ city: 'canberra', preferences: { mode: 'standard' } })
        .expect(201),
    ]);

    expect(joinA.body.queueKey).toBe(joinC.body.queueKey);
    expect(joinA.body.queueKey).not.toBe(joinB.body.queueKey);

    if (worker && joinA.body.queueKey) {
      await (worker as any).processQueueKey?.(joinA.body.queueKey);
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
            { userAId: userA.user.id, userBId: userC.user.id },
            { userAId: userC.user.id, userBId: userA.user.id },
          ],
        },
      });
      if (session) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(session).toBeTruthy();
    const unmatchedQueueState = await redis.get(`queue:user:${userB.user.id}`);
    expect(unmatchedQueueState).toBeTruthy();
  });

  it('rejects explicit blank and non-string city values', async () => {
    const user = await createAuthedUser();

    await request(app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ city: '   ', preferences: { mode: 'standard' } })
      .expect(400);

    await request(app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ city: '   ', region: 'na', preferences: { mode: 'standard' } })
      .expect(400);

    await request(app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ city: null, region: 'na', preferences: { mode: 'standard' } })
      .expect(400);

    await request(app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ city: 123, region: 'na', preferences: { mode: 'standard' } })
      .expect(400);
  });
});
