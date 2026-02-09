import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT, type RedisClient } from '../src/common/redis.provider';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MatchingWorker } from '../src/queue/matching.worker';
import { SessionService } from '../src/session/session.service';
import { VideoService } from '../src/video/video.service';

export type TestAppContext = {
  app: INestApplication<App>;
  prisma: PrismaClient;
  redis: RedisClient;
  worker: MatchingWorker;
  baseUrl: string;
  httpServer: unknown;
};

export class FakeVideoService {
  buildSessionTokens(sessionId: string, userIds: string[]) {
    const expiresAt = new Date(Date.now() + 60_000);
    const byUser = Object.fromEntries(
      userIds.map((userId, index) => [
        userId,
        {
          rtcToken: `test-rtc-${userId}`,
          rtmToken: `test-rtm-${userId}`,
          rtcUid: index + 1,
          rtmUserId: userId,
        },
      ]),
    );

    return {
      channelName: `test_${sessionId}`,
      expiresAt,
      byUser,
    };
  }
}

class FakeStripe {
  checkout = {
    sessions: {
      create: async () => ({
        id: 'cs_test',
        url: 'https://stripe.test/checkout',
      }),
    },
  };

  webhooks = {
    constructEvent: (payload: any) => payload,
  };
}

class TestPaymentsService extends PaymentsService {
  constructor(prisma: PrismaService) {
    super(
      prisma,
      {
        trackServerEvent: () => undefined,
      } as any,
      new FakeStripe() as any,
    );
  }
}

export function setTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/verity';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test_access_secret';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret';
  process.env.STRIPE_SECRET_KEY =
    process.env.STRIPE_SECRET_KEY ?? 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET =
    process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
  process.env.STRIPE_PRICE_STARTER =
    process.env.STRIPE_PRICE_STARTER ?? 'price_test_starter';
  process.env.STRIPE_PRICE_PLUS =
    process.env.STRIPE_PRICE_PLUS ?? 'price_test_plus';
  process.env.STRIPE_PRICE_PRO =
    process.env.STRIPE_PRICE_PRO ?? 'price_test_pro';
  process.env.HIVE_WEBHOOK_SECRET =
    process.env.HIVE_WEBHOOK_SECRET ?? 'hive_test_secret';
}

export async function createTestApp(options?: {
  mockStripe?: boolean;
  mockVideo?: boolean;
}): Promise<TestAppContext> {
  setTestEnv();

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options?.mockVideo !== false) {
    builder.overrideProvider(VideoService).useClass(FakeVideoService);
  }

  if (options?.mockStripe) {
    builder.overrideProvider(PaymentsService).useClass(TestPaymentsService);
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication();
  await app.listen(0, '127.0.0.1');

  const prisma = app.get(PrismaService);
  const redis = app.get<RedisClient>(REDIS_CLIENT);
  const worker = app.get(MatchingWorker);
  const httpServer = app.getHttpServer();
  const address = httpServer.address() as { port?: number } | null;
  if (!address?.port) {
    throw new Error('Failed to determine test app port');
  }

  return {
    app,
    prisma,
    redis,
    worker,
    baseUrl: `http://127.0.0.1:${address.port}`,
    httpServer,
  };
}

export async function closeTestApp(context: TestAppContext | null) {
  if (!context) {
    return;
  }

  const { app, prisma, redis, worker } = context;

  try {
    worker?.onModuleDestroy?.();
    const workerTimer = (worker as { timer?: NodeJS.Timeout }).timer;
    if (workerTimer) {
      clearInterval(workerTimer);
    }
    const sessionService = app.get(SessionService, { strict: false });
    sessionService?.onModuleDestroy?.();
  } catch {
    // best-effort cleanup
  }

  const httpServer = app.getHttpServer() as
    | { close?: (cb: () => void) => void }
    | undefined;
  if (httpServer?.close) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  await app.close();

  if (redis) {
    try {
      if (typeof redis.quit === 'function') {
        await redis.quit();
      }
      if (typeof redis.disconnect === 'function') {
        redis.disconnect();
      }
    } catch {
      // ignore redis shutdown errors
    }
  }

  await prisma.$disconnect();
}

export async function resetDatabase(prisma: PrismaClient) {
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Message",
        "Match",
        "Block",
        "PushToken",
        "Session",
        "TokenTransaction",
        "ModerationEvent",
        "ModerationReport",
        "FeatureFlag",
        "RefreshToken",
        "User"
      RESTART IDENTITY CASCADE
    `);
    return;
  } catch {
    // fall back to per-table deletes (useful for non-Postgres test DBs)
  }

  await prisma.message.deleteMany();
  await prisma.match.deleteMany();
  await prisma.block.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.tokenTransaction.deleteMany();
  await prisma.moderationEvent.deleteMany();
  await prisma.moderationReport.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function resetRedis(redis: RedisClient) {
  const anyRedis = redis as unknown as {
    flushdb?: () => Promise<'OK'>;
    flushall?: () => Promise<'OK'>;
  };
  if (typeof anyRedis.flushdb === 'function') {
    await anyRedis.flushdb();
    return;
  }
  if (typeof anyRedis.flushall === 'function') {
    await anyRedis.flushall();
  }
}

export async function connectSocket(
  baseUrl: string,
  namespace: string,
  token: string,
) {
  const connectTimeoutMs = 10_000;
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const socket = io(`${baseUrl}${namespace}`, {
      transports: ['websocket'],
      auth: { token },
      forceNew: true,
      reconnection: false,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Socket connect timeout: ${namespace}`)),
          connectTimeoutMs,
        );
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', (err: unknown) => {
          clearTimeout(timer);
          reject(
            err instanceof Error
              ? err
              : new Error(`Socket connect error: ${String(err)}`),
          );
        });
      });

      return socket;
    } catch (error) {
      lastError = error;
      socket.disconnect();

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Socket connect failed: ${namespace}`);
}

export function waitForEvent<T = any>(
  socket: {
    once: (event: string, handler: (...args: any[]) => void) => void;
  },
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function waitForEventWhere<T = any>(
  socket: {
    on: (event: string, handler: (...args: any[]) => void) => void;
  },
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs,
    );
    socket.on(event, (payload: T) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        resolve(payload);
      }
    });
  });
}

export async function waitForSession(
  prisma: PrismaClient,
  userAId: string,
  userBId: string,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { userAId, userBId },
          { userAId: userBId, userBId: userAId },
        ],
      },
    });
    if (session) {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for session to be created');
}
