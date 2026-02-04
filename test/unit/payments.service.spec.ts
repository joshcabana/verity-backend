import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import { PaymentsService } from '../../src/payments/payments.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createStripeMock } from '../mocks/stripe.mock';

describe('PaymentsService (unit)', () => {
  const originalEnv = { ...process.env };
  let service: PaymentsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let stripeMock: ReturnType<typeof createStripeMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    stripeMock = createStripeMock();

    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRICE_STARTER = 'price_starter';
    process.env.STRIPE_PRICE_PLUS = 'price_plus';
    process.env.STRIPE_PRICE_PRO = 'price_pro';

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: Stripe, useValue: stripeMock as unknown as Stripe },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when user not found in getBalance', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getBalance('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws for unknown token pack', async () => {
    await expect(service.createCheckoutSession('user-1', 'invalid')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when price env is missing', async () => {
    delete process.env.STRIPE_PRICE_STARTER;

    await expect(service.createCheckoutSession('user-1', 'starter')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates checkout session with metadata', async () => {
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_1',
      url: 'https://stripe.test/checkout',
    });

    const result = await service.createCheckoutSession('user-1', 'starter');

    expect(result.sessionId).toBe('cs_1');
    expect(result.url).toBe('https://stripe.test/checkout');
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: 'user-1',
          packId: 'starter',
          tokens: '5',
        }),
      }),
    );
  });

  it('ignores non-checkout and unpaid webhook events', async () => {
    const nonCheckout = { type: 'charge.failed' } as any;
    const unpaid = {
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'unpaid' } },
    } as any;

    await service.handleStripeWebhookEvent(nonCheckout);
    await service.handleStripeWebhookEvent(unpaid);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ignores webhook events with missing metadata', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          metadata: { userId: 'user-1' },
        },
      },
    } as any;

    await service.handleStripeWebhookEvent(event);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not double-credit on idempotent webhook', async () => {
    prisma.tokenTransaction.findUnique.mockResolvedValue({ id: 'tx-1' });

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          metadata: { userId: 'user-1', packId: 'starter', tokens: '5' },
        },
      },
    } as any;

    await service.handleStripeWebhookEvent(event);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('credits balance and records transaction on success', async () => {
    prisma.tokenTransaction.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ tokenBalance: 5 });
    prisma.tokenTransaction.create.mockResolvedValue({ id: 'tx-1' });

    const event = {
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_2',
          payment_status: 'paid',
          metadata: { userId: 'user-1', packId: 'starter', tokens: '5' },
        },
      },
    } as any;

    await service.handleStripeWebhookEvent(event);

    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.tokenTransaction.create).toHaveBeenCalled();
  });

  it('verifies stripe signature', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(() => service.verifyStripeSignature('payload', 'sig')).toThrow(
      BadRequestException,
    );

    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

    expect(() => service.verifyStripeSignature('payload', undefined)).toThrow(
      BadRequestException,
    );

    stripeMock.webhooks.constructEvent.mockReturnValue({ id: 'evt_1' });

    const event = service.verifyStripeSignature('payload', 'sig');

    expect(event).toEqual({ id: 'evt_1' });
  });
});
