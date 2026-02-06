import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueGateway, QueueService } from './queue.service';

const QUEUE_KEYS_SET = 'queue:keys';
const TICK_INTERVAL_MS = 500;
const MAX_MATCHES_PER_KEY = 10;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class MatchingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchingWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastCleanupAt = 0;

  constructor(
    private readonly queueService: QueueService,
    private readonly gateway: QueueGateway,
    private readonly notificationsService: NotificationsService,
    private readonly analyticsService: AnalyticsService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const keys = await this.redis.smembers(QUEUE_KEYS_SET);
      for (const key of keys) {
        await this.processQueueKey(key);
      }

      const now = Date.now();
      if (now - this.lastCleanupAt > CLEANUP_INTERVAL_MS) {
        this.lastCleanupAt = now;
        await this.queueService.cleanupExpiredSessions();
      }
    } catch (error) {
      this.logger.error(`Queue tick failed: ${error}`);
    } finally {
      this.running = false;
    }
  }

  private async processQueueKey(queueKey: string) {
    for (let i = 0; i < MAX_MATCHES_PER_KEY; i += 1) {
      const pair = await this.queueService.popPair(queueKey);
      if (!pair) {
        break;
      }

      const valid = await this.queueService.validatePair(queueKey, pair);
      if (!valid) {
        continue;
      }

      const locks = await this.queueService.lockUsers([
        valid.userA,
        valid.userB,
      ]);
      if (!locks) {
        await this.queueService.requeuePair(queueKey, pair);
        continue;
      }

      try {
        const session = await this.queueService.createSession(
          valid.userA,
          valid.userB,
          queueKey,
        );
        await this.queueService.markMatched(
          valid.userA,
          valid.userB,
          session.id,
        );
        this.analyticsService.trackServerEvent({
          userId: valid.userA,
          name: 'queue_match_found',
          properties: {
            sessionId: session.id,
            queueKey: session.queueKey ?? '',
            partnerId: valid.userB,
          },
        });
        this.analyticsService.trackServerEvent({
          userId: valid.userB,
          name: 'queue_match_found',
          properties: {
            sessionId: session.id,
            queueKey: session.queueKey ?? '',
            partnerId: valid.userA,
          },
        });
        this.gateway.emitMatch(valid.userA, valid.userB, session);
        void this.notificationsService.notifyUsers(
          [valid.userA, valid.userB],
          'queue_match_found',
          {
            sessionId: session.id,
            queueKey: session.queueKey,
          },
        );
      } finally {
        await this.queueService.releaseUserLocks(locks);
      }
    }

    await this.queueService.cleanupQueueKey(queueKey);
  }
}
