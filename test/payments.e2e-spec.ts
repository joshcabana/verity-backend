import { PaymentsService } from '../src/payments/payments.service';

class FakePrismaService {
  users = new Map<string, { id: string; tokenBalance: number }>();
  transactions: Array<{ stripeEventId?: string | null }> = [];

  user = {
    findUnique: async ({ where, select }: any) => {
      const user = this.users.get(where.id);
      if (!user) {
        return null;
      }
      return select ? { tokenBalance: user.tokenBalance } : user;
    },
    update: async ({ where, data, select }: any) => {
      const user = this.users.get(where.id);
      if (!user) {
        throw new Error('User not found');
      }
      if (data?.tokenBalance?.increment) {
        user.tokenBalance += data.tokenBalance.increment;
      }
      if (data?.tokenBalance?.decrement) {
        user.tokenBalance -= data.tokenBalance.decrement;
      }
      return select ? { tokenBalance: user.tokenBalance } : user;
    },
  };

  tokenTransaction = {
    findUnique: async ({ where }: any) => {
      return this.transactions.find((tx) => tx.stripeEventId === where.stripeEventId) ?? null;
    },
    create: async ({ data }: any) => {
      this.transactions.push({ stripeEventId: data.stripeEventId });
      return data;
    },
  };

  $transaction = async (fn: any) => {
    return fn(this);
  };
}

class FakeStripe {
  checkout = {
    sessions: {
      create: async () => ({ id: 'cs_test', url: 'https://stripe.test/checkout' }),
    },
  };
  webhooks = {
    constructEvent: (payload: any, sig: string, secret: string) => {
      return payload;
    },
  };
}

describe('Payments (e2e)', () => {
  it('credits token balance once for a successful checkout', async () => {
    const prisma = new FakePrismaService();
    prisma.users.set('user-1', { id: 'user-1', tokenBalance: 0 });

    const service = new PaymentsService(prisma as any, new FakeStripe() as any);

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          metadata: {
            userId: 'user-1',
            packId: 'starter',
            tokens: '5',
          },
        },
      },
    } as any;

    await service.handleStripeWebhookEvent(event);
    await service.handleStripeWebhookEvent(event);

    const balance = await service.getBalance('user-1');
    expect(balance.tokenBalance).toBe(5);
  });
});
