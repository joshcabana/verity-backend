import request from 'supertest';
import {
  closeTestApp,
  connectSocket,
  createTestApp,
  resetDatabase,
  resetRedis,
  waitForEvent,
  waitForSession,
  type TestAppContext,
} from '../e2e.setup';
import { SessionService } from '../../src/session/session.service';

describe('Match + chat flow (e2e)', () => {
  jest.setTimeout(25000);
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    if (!context) {
      return;
    }
    await resetDatabase(context.prisma);
    await resetRedis(context.redis);
  });

  it('creates a mutual match and delivers chat messages', async () => {
    if (!context) {
      throw new Error('Missing test context');
    }

    const signupA = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const signupB = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const userA = signupA.body.user;
    const userB = signupB.body.user;
    const tokenA = signupA.body.accessToken as string;
    const tokenB = signupB.body.accessToken as string;

    await request(context.app.getHttpServer())
      .post('/auth/verify-email')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'alpha@example.com', code: '111111' })
      .expect(201);

    await request(context.app.getHttpServer())
      .post('/auth/verify-phone')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ phone: '+15555550001', code: '222222' })
      .expect(201);

    await context.prisma.user.update({
      where: { id: userA.id },
      data: { tokenBalance: 1, displayName: 'Alpha' },
    });
    await context.prisma.user.update({
      where: { id: userB.id },
      data: { tokenBalance: 1, displayName: 'Beta' },
    });

    const videoSocketA = await connectSocket(context.baseUrl, '/video', tokenA);
    const videoSocketB = await connectSocket(context.baseUrl, '/video', tokenB);

    const mutualPromise = waitForEvent(videoSocketA, 'match:mutual');

    const [joinA] = await Promise.all([
      request(context.app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ region: 'na', preferences: { mode: 'standard' } })
        .expect(201),
      request(context.app.getHttpServer())
        .post('/queue/join')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ region: 'na', preferences: { mode: 'standard' } })
        .expect(201),
    ]);

    await (context.worker as any).processQueueKey?.(joinA.body.queueKey);

    const session = await waitForSession(
      context.prisma,
      userA.id,
      userB.id,
    );

    const sessionService = context.app.get(SessionService);
    await sessionService.endSession(session, 'ended');

    const choiceA = await request(context.app.getHttpServer())
      .post(`/sessions/${session.id}/choice`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ choice: 'MATCH' })
      .expect(201);

    expect(choiceA.body.status).toBe('pending');

    const choiceB = await request(context.app.getHttpServer())
      .post(`/sessions/${session.id}/choice`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ choice: 'MATCH' })
      .expect(201);

    expect(choiceB.body.status).toBe('resolved');
    expect(choiceB.body.outcome).toBe('mutual');
    expect(choiceB.body.matchId).toEqual(expect.any(String));
    expect(choiceB.body.partnerRevealVersion).toBe(1);
    expect(choiceB.body.partnerReveal).toEqual(
      expect.objectContaining({
        id: userA.id,
      }),
    );

    const mutualPayload = await mutualPromise;
    expect(mutualPayload.matchId).toBe(choiceB.body.matchId);
    expect(mutualPayload.sessionId).toBe(session.id);
    expect(mutualPayload.partnerRevealVersion).toBe(1);
    expect(mutualPayload.partnerReveal).toEqual(
      expect.objectContaining({
        id: userB.id,
      }),
    );

    const match = await context.prisma.match.findUnique({
      where: {
        userAId_userBId:
          userA.id < userB.id
            ? { userAId: userA.id, userBId: userB.id }
            : { userAId: userB.id, userBId: userA.id },
      },
    });

    expect(match).toBeTruthy();

    const list = await request(context.app.getHttpServer())
      .get('/matches')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: choiceB.body.matchId,
          partner: expect.objectContaining({
            id: userB.id,
            displayName: 'Beta',
          }),
        }),
      ]),
    );

    await request(context.app.getHttpServer())
      .get(`/matches/${choiceB.body.matchId}/reveal`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.revealAcknowledged).toBe(false);
        expect(res.body.partnerRevealVersion).toBe(1);
      });

    await request(context.app.getHttpServer())
      .post(`/matches/${choiceB.body.matchId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Hello before ack' })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe('REVEAL_ACK_REQUIRED');
      });

    await request(context.app.getHttpServer())
      .post(`/matches/${choiceB.body.matchId}/reveal-ack`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201)
      .expect((res) => {
        expect(res.body.revealAcknowledged).toBe(true);
      });

    const chatSocketA = await connectSocket(context.baseUrl, '/chat', tokenA);
    const chatSocketB = await connectSocket(context.baseUrl, '/chat', tokenB);

    const messagePromise = waitForEvent(chatSocketB, 'message:new');

    const message = await request(context.app.getHttpServer())
      .post(`/matches/${choiceB.body.matchId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Hello from e2e' })
      .expect(201);

    expect(message.body.text).toBe('Hello from e2e');

    const messagePayload = await messagePromise;
    expect(messagePayload.text).toBe('Hello from e2e');
    expect(messagePayload.matchId).toBe(choiceB.body.matchId);

    const history = await request(context.app.getHttpServer())
      .get(`/matches/${choiceB.body.matchId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(history.body.length).toBeGreaterThanOrEqual(1);

    chatSocketA.disconnect();
    chatSocketB.disconnect();
    videoSocketA.disconnect();
    videoSocketB.disconnect();
  });

  it('prevents chat access after a user blocks their match', async () => {
    if (!context) {
      throw new Error('Missing test context');
    }

    const signupA = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);
    const signupB = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const userA = signupA.body.user;
    const userB = signupB.body.user;
    const tokenA = signupA.body.accessToken as string;
    const tokenB = signupB.body.accessToken as string;

    const [low, high] =
      userA.id < userB.id ? [userA.id, userB.id] : [userB.id, userA.id];
    const now = new Date();
    const match = await context.prisma.match.create({
      data: {
        userAId: low,
        userBId: high,
        userARevealAcknowledgedAt: now,
        userBRevealAcknowledgedAt: now,
      },
    });

    await request(context.app.getHttpServer())
      .post('/moderation/blocks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blockedUserId: userB.id })
      .expect(201);

    await request(context.app.getHttpServer())
      .get(`/matches/${match.id}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);

    await request(context.app.getHttpServer())
      .post(`/matches/${match.id}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'blocked message' })
      .expect(403);

    await request(context.app.getHttpServer())
      .get('/matches')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect([]);
  });
});
