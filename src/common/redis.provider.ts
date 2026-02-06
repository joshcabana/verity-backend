import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type RedisClient = Redis;

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });

    // Ensure app shutdown closes Redis sockets so tests/processes can exit cleanly.
    const shutdown = async () => {
      try {
        await client.quit();
      } catch {
        // Ignore quit failures (e.g. already closed) and force disconnect.
      } finally {
        client.disconnect();
      }
    };

    (
      client as Redis & {
        onModuleDestroy?: () => Promise<void>;
        onApplicationShutdown?: () => Promise<void>;
      }
    ).onModuleDestroy = shutdown;
    (
      client as Redis & {
        onModuleDestroy?: () => Promise<void>;
        onApplicationShutdown?: () => Promise<void>;
      }
    ).onApplicationShutdown = shutdown;

    return client;
  },
};
