import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Queue -> Session -> Decision (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(async () => {
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
