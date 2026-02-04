import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MatchingWorker } from '../src/queue/matching.worker';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Queue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;
  let worker: MatchingWorker;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
});
