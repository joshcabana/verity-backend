import { Session } from '@prisma/client';
import { SessionService } from '../src/session/session.service';
import {
  SessionEndPayload,
  SessionStartPayload,
} from '../src/video/video.gateway';
import { VideoService } from '../src/video/video.service';

class FakeRedis {
  private store = new Map<string, string>();

  async set(key: string, value: string, ...args: string[]) {
    const hasNx = args.includes('NX');
    if (hasNx && this.store.has(key)) {
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
}

class FakePrismaService {
  $use() {
    return;
  }
}

class FakeVideoGateway {
  startEvents: Array<{ userId: string; payload: SessionStartPayload }> = [];
  endEvents: Array<{ userId: string; payload: SessionEndPayload }> = [];

  emitSessionStart(userId: string, payload: SessionStartPayload) {
    this.startEvents.push({ userId, payload });
  }

  emitSessionEnd(userId: string, payload: SessionEndPayload) {
    this.endEvents.push({ userId, payload });
  }
}

describe('Video session timer (e2e)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits session:start immediately and session:end at 45s', async () => {
    process.env.AGORA_APP_ID = 'testappidtestappidtestappidtestappid';
    process.env.AGORA_APP_CERTIFICATE = 'testcerttestcerttestcerttestcert';

    const redis = new FakeRedis();
    const gateway = new FakeVideoGateway();
    const service = new SessionService(
      new FakePrismaService() as unknown as any,
      new VideoService(),
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

    await service.handleSessionCreated(session);

    expect(gateway.startEvents).toHaveLength(2);
    expect(gateway.endEvents).toHaveLength(0);

    const { payload } = gateway.startEvents[0];
    const startMs = Date.parse(payload.startAt);
    const endMs = Date.parse(payload.endAt);
    expect(endMs - startMs).toBe(45_000);

    jest.advanceTimersByTime(44_999);
    await Promise.resolve();
    expect(gateway.endEvents).toHaveLength(0);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(gateway.endEvents).toHaveLength(2);
  });

  it('is idempotent for repeated session creation', async () => {
    process.env.AGORA_APP_ID = 'testappidtestappidtestappidtestappid';
    process.env.AGORA_APP_CERTIFICATE = 'testcerttestcerttestcerttestcert';

    const redis = new FakeRedis();
    const gateway = new FakeVideoGateway();
    const service = new SessionService(
      new FakePrismaService() as unknown as any,
      new VideoService(),
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

    await service.handleSessionCreated(session);
    await service.handleSessionCreated(session);

    expect(gateway.startEvents).toHaveLength(2);
  });
});
