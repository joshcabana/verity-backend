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

describe('Matching + video flow (e2e)', () => {
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

  it('matches users and emits match + session events', async () => {
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

    await context.prisma.user.update({
      where: { id: userA.id },
      data: { tokenBalance: 1 },
    });
    await context.prisma.user.update({
      where: { id: userB.id },
      data: { tokenBalance: 1 },
    });

    const queueSocketA = await connectSocket(context.baseUrl, '/queue', tokenA);
    const queueSocketB = await connectSocket(context.baseUrl, '/queue', tokenB);
    const videoSocketA = await connectSocket(context.baseUrl, '/video', tokenA);
    const videoSocketB = await connectSocket(context.baseUrl, '/video', tokenB);

    const matchA = waitForEvent(queueSocketA, 'match');
    const matchB = waitForEvent(queueSocketB, 'match');
    const sessionStartA = waitForEvent(videoSocketA, 'session:start');
    const sessionStartB = waitForEvent(videoSocketB, 'session:start');

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

    const matchPayloadA = await matchA;
    const matchPayloadB = await matchB;

    expect(matchPayloadA.sessionId).toEqual(expect.any(String));
    expect(matchPayloadB.sessionId).toEqual(matchPayloadA.sessionId);
    expect(matchPayloadA.partnerId).toBeUndefined();
    expect(matchPayloadB.partnerId).toBeUndefined();
    expect(matchPayloadA.partnerAnonymousId).toEqual(expect.any(String));
    expect(matchPayloadB.partnerAnonymousId).toEqual(expect.any(String));
    expect(matchPayloadA.partnerAnonymousId).not.toBe(userB.id);
    expect(matchPayloadB.partnerAnonymousId).not.toBe(userA.id);

    const session = await waitForSession(context.prisma, userA.id, userB.id);

    const startPayloadA = await sessionStartA;
    const startPayloadB = await sessionStartB;
    expect(startPayloadA.sessionId).toBe(session.id);
    expect(startPayloadB.sessionId).toBe(session.id);
    expect(startPayloadA.channelName).toEqual(expect.any(String));

    const endA = waitForEvent(videoSocketA, 'session:end');
    const endB = waitForEvent(videoSocketB, 'session:end');

    const sessionService = context.app.get(SessionService);
    await sessionService.endSession(session, 'ended');

    const endPayloadA = await endA;
    const endPayloadB = await endB;
    expect(endPayloadA.sessionId).toBe(session.id);
    expect(endPayloadB.sessionId).toBe(session.id);
    expect(endPayloadA.reason).toBe('ended');

    const balances = await context.prisma.user.findMany({
      where: { id: { in: [userA.id, userB.id] } },
      select: { id: true, tokenBalance: true },
    });
    const balanceById = new Map(
      balances.map((entry) => [entry.id, entry.tokenBalance]),
    );
    expect(balanceById.get(userA.id)).toBe(0);
    expect(balanceById.get(userB.id)).toBe(0);

    queueSocketA.disconnect();
    queueSocketB.disconnect();
    videoSocketA.disconnect();
    videoSocketB.disconnect();
  });

  it('does not match users who blocked each other', async () => {
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

    await context.prisma.user.update({
      where: { id: userA.id },
      data: { tokenBalance: 1 },
    });
    await context.prisma.user.update({
      where: { id: userB.id },
      data: { tokenBalance: 1 },
    });

    await request(context.app.getHttpServer())
      .post('/moderation/blocks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ blockedUserId: userB.id })
      .expect(201);

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
    await new Promise((resolve) => setTimeout(resolve, 300));
    await (context.worker as any).processQueueKey?.(joinA.body.queueKey);

    const session = await context.prisma.session.findFirst({
      where: {
        OR: [
          { userAId: userA.id, userBId: userB.id },
          { userAId: userB.id, userBId: userA.id },
        ],
      },
    });
    expect(session).toBeNull();
  });
});
