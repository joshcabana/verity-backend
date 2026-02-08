import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Session } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import { SessionService } from '../session/session.service';
import { AnalyticsService } from '../analytics/analytics.service';

const QUEUE_KEYS_SET = 'queue:keys';
const QUEUE_ZSET_PREFIX = 'queue:zset:';
const USER_QUEUE_PREFIX = 'queue:user:';
const USER_LOCK_PREFIX = 'queue:lock:';
const USER_MATCHED_PREFIX = 'queue:matched:';

const LOCK_TTL_MS = 3000;
const QUEUE_TTL_MS = 5 * 60 * 1000;
const MATCHED_TTL_MS = 60 * 60 * 1000;

export type QueueJoinInput = {
  region: string;
  preferences?: Record<string, unknown>;
};

type QueueEntryState = {
  queueKey: string;
  joinedAt: number;
};

type QueuePair = {
  userA: string;
  userB: string;
  scoreA: number;
  scoreB: number;
};

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly sessionService: SessionService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async joinQueue(
    userId: string,
    input: QueueJoinInput,
  ): Promise<{
    status: 'queued' | 'already_queued';
    queueKey: string;
    position: number | null;
  }> {
    const banned = await this.redis.get(this.userBanKey(userId));
    if (banned) {
      throw new UnauthorizedException('Account is temporarily suspended');
    }
    const queueKey = this.buildQueueKey(input.region, input.preferences);
    const queueUserKey = this.userQueueKey(userId);

    const lockValue = await this.acquireLock(userId);
    if (!lockValue) {
      const existing = await this.redis.get(queueUserKey);
      if (existing) {
        const state = JSON.parse(existing) as QueueEntryState;
        const position = await this.redis.zrank(
          this.queueZsetKey(state.queueKey),
          userId,
        );
        return { status: 'already_queued', queueKey: state.queueKey, position };
      }
      throw new ConflictException('Queue operation in progress');
    }

    try {
      const existing = await this.redis.get(queueUserKey);
      if (existing) {
        const state = JSON.parse(existing) as QueueEntryState;
        const position = await this.redis.zrank(
          this.queueZsetKey(state.queueKey),
          userId,
        );
        return { status: 'already_queued', queueKey: state.queueKey, position };
      }

      const updated = await this.prisma.user.updateMany({
        where: { id: userId, tokenBalance: { gte: 1 } },
        data: { tokenBalance: { decrement: 1 } },
      });

      if (updated.count !== 1) {
        throw new BadRequestException('Insufficient token balance');
      }

      const joinedAt = Date.now();
      try {
        const results = await this.redis
          .multi()
          .zadd(this.queueZsetKey(queueKey), joinedAt, userId)
          .set(
            queueUserKey,
            JSON.stringify({ queueKey, joinedAt } satisfies QueueEntryState),
            'PX',
            QUEUE_TTL_MS,
          )
          .sadd(QUEUE_KEYS_SET, queueKey)
          .exec();

        if (!results) {
          throw new Error('Redis transaction failed');
        }
      } catch (error) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: 1 } },
        });
        throw error;
      }

      const position = await this.redis.zrank(
        this.queueZsetKey(queueKey),
        userId,
      );
      this.analyticsService.trackServerEvent({
        userId,
        name: 'queue_joined',
        properties: {
          queueKey,
          status: 'queued',
          position: position ?? -1,
        },
      });
      return { status: 'queued', queueKey, position };
    } finally {
      await this.releaseLock(this.userLockKey(userId), lockValue);
    }
  }

  async leaveQueue(userId: string): Promise<{
    status: 'left' | 'not_queued' | 'already_matched';
    refunded: boolean;
  }> {
    const queueUserKey = this.userQueueKey(userId);
    return this.withUserLock(userId, async () => {
      const stateRaw = await this.redis.get(queueUserKey);
      if (!stateRaw) {
        return { status: 'not_queued', refunded: false };
      }

      const state = JSON.parse(stateRaw) as QueueEntryState;
      const zsetKey = this.queueZsetKey(state.queueKey);
      const matched = await this.redis.get(this.userMatchedKey(userId));

      const removed = await this.redis.zrem(zsetKey, userId);
      await this.redis.del(queueUserKey);
      await this.cleanupQueueKey(state.queueKey);

      if (removed === 1 && !matched) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: 1 } },
        });
        return { status: 'left', refunded: true };
      }

      return { status: matched ? 'already_matched' : 'left', refunded: false };
    });
  }

  async popPair(queueKey: string): Promise<QueuePair | null> {
    const zsetKey = this.queueZsetKey(queueKey);
    const popped = await this.redis.zpopmin(zsetKey, 2);

    if (popped.length < 4) {
      return null;
    }

    return {
      userA: popped[0],
      scoreA: Number(popped[1]),
      userB: popped[2],
      scoreB: Number(popped[3]),
    };
  }

  async validatePair(
    queueKey: string,
    pair: QueuePair,
  ): Promise<{ userA: string; userB: string } | null> {
    const zsetKey = this.queueZsetKey(queueKey);
    const [stateA, stateB] = await this.redis.mget(
      this.userQueueKey(pair.userA),
      this.userQueueKey(pair.userB),
    );

    if (!stateA && !stateB) {
      return null;
    }

    if (!stateA) {
      await this.redis.zadd(zsetKey, pair.scoreB, pair.userB);
      return null;
    }

    if (!stateB) {
      await this.redis.zadd(zsetKey, pair.scoreA, pair.userA);
      return null;
    }

    if (await this.isPairBlocked(pair.userA, pair.userB)) {
      await this.deferBlockedPair(queueKey, pair);
      return null;
    }

    return { userA: pair.userA, userB: pair.userB };
  }

  async createSession(
    userAId: string,
    userBId: string,
    queueKey: string,
  ): Promise<Session> {
    const [region] = queueKey.split(':');
    const session = await this.prisma.session.create({
      data: {
        userAId,
        userBId,
        region,
        queueKey,
      },
    });
    void this.sessionService.handleSessionCreated(session);
    return session;
  }

  async markMatched(userAId: string, userBId: string, sessionId: string) {
    await this.redis
      .multi()
      .del(this.userQueueKey(userAId), this.userQueueKey(userBId))
      .set(this.userMatchedKey(userAId), sessionId, 'PX', MATCHED_TTL_MS)
      .set(this.userMatchedKey(userBId), sessionId, 'PX', MATCHED_TTL_MS)
      .exec();
  }

  async cleanupExpiredSessions() {
    await this.sessionService.cleanupExpiredSessions();
  }

  async cleanupQueueKey(queueKey: string) {
    const remaining = await this.redis.zcard(this.queueZsetKey(queueKey));
    if (remaining === 0) {
      await this.redis.srem(QUEUE_KEYS_SET, queueKey);
    }
  }

  async lockUsers(userIds: string[]): Promise<Map<string, string> | null> {
    const locks = new Map<string, string>();
    for (const userId of userIds) {
      const lockValue = await this.acquireLock(userId);
      if (!lockValue) {
        await this.releaseUserLocks(locks);
        return null;
      }
      locks.set(userId, lockValue);
    }
    return locks;
  }

  async releaseUserLocks(locks: Map<string, string>) {
    for (const [userId, lockValue] of locks) {
      await this.releaseLock(this.userLockKey(userId), lockValue);
    }
  }

  async requeuePair(queueKey: string, pair: QueuePair) {
    await this.redis.zadd(
      this.queueZsetKey(queueKey),
      pair.scoreA,
      pair.userA,
      pair.scoreB,
      pair.userB,
    );
  }

  buildQueueKey(
    regionRaw: string,
    preferences?: Record<string, unknown>,
  ): string {
    const region = regionRaw?.trim().toLowerCase();
    if (!region) {
      throw new BadRequestException('Region is required');
    }
    const stable = stableStringify(preferences ?? {});
    const hash = createHash('sha256').update(stable).digest('hex').slice(0, 12);
    return `${region}:${hash}`;
  }

  private queueZsetKey(queueKey: string) {
    return `${QUEUE_ZSET_PREFIX}${queueKey}`;
  }

  private userQueueKey(userId: string) {
    return `${USER_QUEUE_PREFIX}${userId}`;
  }

  private userMatchedKey(userId: string) {
    return `${USER_MATCHED_PREFIX}${userId}`;
  }

  private userBanKey(userId: string) {
    return `moderation:ban:${userId}`;
  }

  private async withUserLock<T>(
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = this.userLockKey(userId);
    const lockValue = await this.acquireLock(userId);
    if (!lockValue) {
      throw new ConflictException('Queue operation in progress');
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  private userLockKey(userId: string) {
    return `${USER_LOCK_PREFIX}${userId}`;
  }

  private async acquireLock(userId: string): Promise<string | null> {
    const lockKey = this.userLockKey(userId);
    const lockValue = randomUUID();
    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    return acquired ? lockValue : null;
  }

  private async releaseLock(lockKey: string, lockValue: string) {
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await this.redis.eval(script, 1, lockKey, lockValue);
  }

  private async isPairBlocked(userAId: string, userBId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        liftedAt: null,
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  private async deferBlockedPair(queueKey: string, pair: QueuePair) {
    // Delay rematching for blocked pairs to avoid hot-looping.
    const scoreBase = Date.now() + 5000;
    await this.redis.zadd(
      this.queueZsetKey(queueKey),
      scoreBase,
      pair.userA,
      scoreBase + 1,
      pair.userB,
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `"${key}":${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

export { QueueGateway } from './queue.gateway';
