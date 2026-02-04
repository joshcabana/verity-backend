import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Queue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');

    prisma = new PrismaClient();
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
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

    await Promise.all([
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

    const deadline = Date.now() + 3000;
    let session = null;
    while (Date.now() < deadline) {
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
