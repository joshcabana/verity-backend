import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ChatGateway } from '../src/chat/chat.gateway';
import { QueueGateway } from '../src/queue/queue.service';
import { MatchingWorker } from '../src/queue/matching.worker';
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

class NoopMatchingWorker {
  onModuleInit() {
    return;
  }

  onModuleDestroy() {
    return;
  }
}

describe('Compliance (e2e)', () => {
  let app: INestApplication<App> | null = null;
  let prisma: PrismaClient;
  let redis: Redis;
  let previousAdminKey: string | undefined;

  beforeAll(async () => {
    previousAdminKey = process.env.MODERATION_ADMIN_KEY;
    process.env.MODERATION_ADMIN_KEY = 'test-admin';

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
      .overrideProvider(MatchingWorker)
      .useClass(NoopMatchingWorker)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
    await redis.quit();
    redis.disconnect();
    if (previousAdminKey === undefined) {
      delete process.env.MODERATION_ADMIN_KEY;
    } else {
      process.env.MODERATION_ADMIN_KEY = previousAdminKey;
    }
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('stores consent metadata on signup', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .send({
        dateOfBirth: '2000-01-01',
        privacyNoticeVersion: '2026-02-04',
        tosVersion: '2026-02-04',
        consents: {
          ageConfirmed: true,
          videoConsent: true,
          aiModerationConsent: true,
          termsAccepted: true,
        },
      })
      .expect(201);

    const userId = response.body.user.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    expect(user?.dateOfBirth).toBeTruthy();
    expect(user?.ageVerifiedAt).toBeTruthy();
    expect(user?.privacyNoticeVersion).toBe('2026-02-04');
    expect(user?.tosVersion).toBe('2026-02-04');
    expect(user?.consents).toBeTruthy();

    const exportResponse = await request(app.getHttpServer())
      .get('/users/me/export')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);

    expect(exportResponse.body.user?.id).toBe(userId);
  });

  it('creates a report and deletes user data', async () => {
    const reporterSignup = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .send({ dateOfBirth: '1998-05-20' })
      .expect(201);
    const reportedSignup = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .send({ dateOfBirth: '1999-08-11' })
      .expect(201);

    const reporter = reporterSignup.body.user;
    const reported = reportedSignup.body.user;
    const reporterToken = reporterSignup.body.accessToken as string;

    const reportResponse = await request(app.getHttpServer())
      .post('/moderation/reports')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        reportedUserId: reported.id,
        reason: 'harassment',
        details: 'Test report',
      })
      .expect(201);

    const reportId = reportResponse.body.id as string;
    const storedReport = await prisma.moderationReport.findUnique({
      where: { id: reportId },
    });
    expect(storedReport).toBeTruthy();

    const listResponse = await request(app.getHttpServer())
      .get('/moderation/reports')
      .set('Authorization', `Bearer ${reporterToken}`)
      .set('x-admin-key', 'test-admin')
      .expect(200);
    expect(Array.isArray(listResponse.body)).toBe(true);

    await request(app.getHttpServer())
      .post(`/moderation/reports/${reportId}/resolve`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .set('x-admin-key', 'test-admin')
      .send({ action: 'ban' })
      .expect(201);
    const banned = await redis.get(`moderation:ban:${reported.id}`);
    expect(banned).toBeTruthy();

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);

    const deletedUser = await prisma.user.findUnique({
      where: { id: reporter.id },
    });
    const deletedReport = await prisma.moderationReport.findUnique({
      where: { id: reportId },
    });

    expect(deletedUser).toBeNull();
    expect(deletedReport).toBeNull();
  });

  it('blocks queue join when user is banned', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .send({ dateOfBirth: '1990-01-01' })
      .expect(201);

    const user = signup.body.user;
    const token = signup.body.accessToken as string;

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: 1 },
    });

    await redis.set(`moderation:ban:${user.id}`, '1', 'PX', 60 * 60 * 1000);

    await request(app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ region: 'au', preferences: {} })
      .expect(401);
  });
});
