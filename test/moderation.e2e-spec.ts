import { Session } from '@prisma/client';
import { ModerationService } from '../src/moderation/moderation.service';

class FakeRedis {
  store = new Map<string, string>();
  async set(key: string, value: string, ...args: string[]) {
    const nx = args.includes('NX');
    if (nx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
}

class FakePrismaService {
  sessions = new Map<string, Session>();
  moderationEvents: Array<{ userId: string; createdAt: Date }> = [];

  session = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.sessions.get(where.id) ?? null;
    },
  };

  moderationEvent = {
    create: async ({ data }: { data: { userId: string } }) => {
      this.moderationEvents.push({
        userId: data.userId,
        createdAt: new Date(),
      });
      return data;
    },
    count: async ({ where }: any) => {
      return this.moderationEvents.filter(
        (event) =>
          event.userId === where.userId &&
          event.createdAt >= where.createdAt.gte,
      ).length;
    },
  };
}

class FakeSessionService {
  ended: Session[] = [];
  async endSession(session: Session) {
    this.ended.push(session);
  }
}

class FakeVideoGateway {
  server = {
    to: (room: string) => ({
      emit: (_event: string, _payload: any) => {
        return;
      },
    }),
  };
}

describe('Moderation (e2e)', () => {
  it('terminates session and logs moderation events on violation', async () => {
    const prisma = new FakePrismaService();
    const redis = new FakeRedis();
    const sessionService = new FakeSessionService();
    const gateway = new FakeVideoGateway();

    const moderationService = new ModerationService(
      prisma as any,
      sessionService as any,
      redis as any,
      gateway as any,
    );

    const session: Session = {
      id: 'session-1',
      userAId: 'user-a',
      userBId: 'user-b',
      region: null,
      queueKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.sessions.set(session.id, session);

    await moderationService.handleWebhook({
      sessionId: session.id,
      userId: session.userAId,
      violation: true,
    });

    expect(sessionService.ended).toHaveLength(1);
    expect(prisma.moderationEvents).toHaveLength(1);
  });
});
