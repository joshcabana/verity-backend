import { createHmac } from 'crypto';
import request from 'supertest';
import {
  closeTestApp,
  connectSocket,
  createTestApp,
  resetDatabase,
  resetRedis,
  waitForEvent,
  waitForEventWhere,
  waitForSession,
  type TestAppContext,
} from '../e2e.setup';

describe('Moderation flow (e2e)', () => {
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

  it('terminates session and bans on repeated violations', async () => {
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

    const videoSocketA = await connectSocket(context.baseUrl, '/video', tokenA);
    const videoSocketB = await connectSocket(context.baseUrl, '/video', tokenB);

    const sessionEndPromise = waitForEvent(videoSocketA, 'session:end');
    const banPromise = waitForEventWhere(
      videoSocketA,
      'moderation:action',
      (payload) => payload?.action === 'ban',
    );

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

    const secret = process.env.HIVE_WEBHOOK_SECRET ?? 'hive_test_secret';
    const timestamp = Date.now().toString();

    const sendViolation = async () => {
      const payload = {
        sessionId: session.id,
        userId: userA.id,
        violation: true,
        reason: 'test-violation',
      };
      const raw = Buffer.from(JSON.stringify(payload));
      const signature = createHmac('sha256', secret)
        .update(raw)
        .digest('hex');

      return request(context.app.getHttpServer())
        .post('/webhooks/hive')
        .set('x-hive-signature', `sha256=${signature}`)
        .set('x-hive-timestamp', timestamp)
        .send(payload)
        .expect(201);
    };

    await sendViolation();
    await sendViolation();
    await sendViolation();

    const endPayload = await sessionEndPromise;
    expect(endPayload.sessionId).toBe(session.id);
    expect(endPayload.reason).toBe('ended');

    const banPayload = await banPromise;
    expect(banPayload.action).toBe('ban');
    expect(banPayload.reason).toBe('test-violation');

    const banKey = await context.redis.get(`moderation:ban:${userA.id}`);
    expect(banKey).toBe('1');

    const count = await context.prisma.moderationEvent.count({
      where: { userId: userA.id },
    });
    expect(count).toBe(3);

    videoSocketA.disconnect();
    videoSocketB.disconnect();
  });
});
