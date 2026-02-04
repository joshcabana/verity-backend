import { Session } from '@prisma/client';
import { SessionService } from '../src/session/session.service';

class FakeRedis {
  private store = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();

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

  async del(...keys: string[]) {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        count += 1;
      }
    }
    return count;
  }

  async hget(key: string, field: string) {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }

  async hmget(key: string, ...fields: string[]) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    return fields.map((field) => hash.get(field) ?? null);
  }

  async pexpire() {
    return 1;
  }
}

class FakePrismaService {
  sessions = new Map<string, Session>();
  matches: Array<{ id: string; userAId: string; userBId: string }> = [];

  session = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.sessions.get(where.id) ?? null;
    },
  };

  match = {
    findUnique: async ({ where }: any) => {
      const composite = where.userAId_userBId;
      return (
        this.matches.find(
          (match) =>
            (match.userAId === composite.userAId &&
              match.userBId === composite.userBId) ||
            (match.userAId === composite.userBId &&
              match.userBId === composite.userAId),
        ) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: { userAId: string; userBId: string };
    }) => {
      const match = { id: `match-${this.matches.length + 1}`, ...data };
      this.matches.push(match);
      return match;
    },
  };

  $use() {
    return;
  }
}

class FakeVideoGateway {
  events: Array<{ userId: string; event: string; payload: any }> = [];

  server = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        const userId = room.replace('user:', '');
        this.events.push({ userId, event, payload });
      },
    }),
  };

  emitSessionEnd() {
    return;
  }
}

describe('Match decision (e2e)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a match and emits match:mutual when both choose MATCH', async () => {
    const prisma = new FakePrismaService();
    const redis = new FakeRedis();
    const gateway = new FakeVideoGateway();

    const service = new SessionService(
      prisma as unknown as any,
      {} as any,
      gateway as unknown as any,
      redis as unknown as any,
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
    await service.endSession(session, 'timeout');

    await service.submitChoice(session.id, session.userAId, 'MATCH');
    const result = await service.submitChoice(
      session.id,
      session.userBId,
      'MATCH',
    );

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('mutual');
    expect(prisma.matches).toHaveLength(1);

    const mutualEvents = gateway.events.filter(
      (event) => event.event === 'match:mutual',
    );
    expect(mutualEvents).toHaveLength(2);
  });

  it('emits a soft notification when choices are not mutual', async () => {
    const prisma = new FakePrismaService();
    const redis = new FakeRedis();
    const gateway = new FakeVideoGateway();

    const service = new SessionService(
      prisma as unknown as any,
      {} as any,
      gateway as unknown as any,
      redis as unknown as any,
    );

    const session: Session = {
      id: 'session-2',
      userAId: 'user-a',
      userBId: 'user-b',
      region: null,
      queueKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.sessions.set(session.id, session);
    await service.endSession(session, 'timeout');

    const result = await service.submitChoice(
      session.id,
      session.userAId,
      'PASS',
    );

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('non_mutual');
    expect(prisma.matches).toHaveLength(0);

    const softEvents = gateway.events.filter(
      (event) => event.event === 'match:non_mutual',
    );
    expect(softEvents).toHaveLength(2);
  });

  it('defaults to PASS if no choice after 60 seconds', async () => {
    const prisma = new FakePrismaService();
    const redis = new FakeRedis();
    const gateway = new FakeVideoGateway();

    const service = new SessionService(
      prisma as unknown as any,
      {} as any,
      gateway as unknown as any,
      redis as unknown as any,
    );

    const session: Session = {
      id: 'session-3',
      userAId: 'user-a',
      userBId: 'user-b',
      region: null,
      queueKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.sessions.set(session.id, session);
    await service.endSession(session, 'timeout');

    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    await Promise.resolve();

    const decision = await redis.get(`session:decision:${session.id}`);
    expect(decision).toBeTruthy();

    const softEvents = gateway.events.filter(
      (event) => event.event === 'match:non_mutual',
    );
    expect(softEvents).toHaveLength(2);
  });
});
