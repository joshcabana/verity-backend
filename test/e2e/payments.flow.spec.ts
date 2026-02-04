import request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  resetRedis,
  type TestAppContext,
} from '../e2e.setup';
import { PaymentsService } from '../../src/payments/payments.service';

describe('Payments flow (e2e)', () => {
  jest.setTimeout(20000);
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    context = await createTestApp({ mockStripe: true });
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

  it('purchases tokens, spends one on queue, then rejects insufficient balance', async () => {
    if (!context) {
      throw new Error('Missing test context');
    }

    const signupA = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const tokenA = signupA.body.accessToken as string;
    const userA = signupA.body.user;

    const purchase = await request(context.app.getHttpServer())
      .post('/tokens/purchase')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ packId: 'starter' })
      .expect(201);

    expect(purchase.body.sessionId).toEqual(expect.any(String));
    expect(purchase.body.url).toEqual(expect.any(String));

    const stripeEvent = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          metadata: {
            userId: userA.id,
            packId: 'starter',
            tokens: '1',
          },
        },
      },
    } as any;

    const paymentsService = context.app.get(PaymentsService);
    jest
      .spyOn(paymentsService, 'verifyStripeSignature')
      .mockReturnValue(stripeEvent);

    await request(context.app.getHttpServer())
      .post('/webhooks/stripe')
      .set('stripe-signature', 'test')
      .send(stripeEvent)
      .expect(200);

    const balance = await request(context.app.getHttpServer())
      .get('/tokens/balance')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(balance.body.tokenBalance).toBe(1);

    const txCount = await context.prisma.tokenTransaction.count({
      where: { userId: userA.id },
    });
    expect(txCount).toBe(1);

    const signupB = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    const tokenB = signupB.body.accessToken as string;
    const userB = signupB.body.user;

    await context.prisma.user.update({
      where: { id: userA.id },
      data: { tokenBalance: 1 },
    });

    await context.prisma.user.update({
      where: { id: userB.id },
      data: { tokenBalance: 1 },
    });

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

    const balanceAfterMatch = await request(context.app.getHttpServer())
      .get('/tokens/balance')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(balanceAfterMatch.body.tokenBalance).toBe(0);

    const insufficient = await request(context.app.getHttpServer())
      .post('/queue/join')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ region: 'na', preferences: { mode: 'standard' } })
      .expect(400);

    expect(insufficient.body.message).toBe('Insufficient token balance');
  });
});
