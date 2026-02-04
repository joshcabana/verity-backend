import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import { VideoGateway } from '../video/video.gateway';

const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const BAN_THRESHOLD = 3;
const BAN_TTL_MS = 24 * 60 * 60 * 1000;
const BAN_RATE_LIMIT_MS = 60 * 1000;

type HiveViolationPayload = {
  sessionId: string;
  userId?: string;
  violation?: boolean;
  action?: string;
  event?: string;
  labels?: string[];
  severity?: string;
  timestamp?: string;
  reason?: string;
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly videoGateway: VideoGateway,
  ) {}

  static async startStreamMonitoring(input: {
    sessionId: string;
    channelName: string;
    rtcToken: string;
    rtcUid: number;
  }) {
    const url = process.env.HIVE_STREAM_URL;
    if (!url) {
      return;
    }

    const payload = {
      sessionId: input.sessionId,
      channel: input.channelName,
      rtcToken: input.rtcToken,
      rtcUid: input.rtcUid,
      appId: process.env.AGORA_APP_ID,
      noRecording: true,
    };

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const apiKey = process.env.HIVE_API_KEY;
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        await ModerationService.requestScreenshotFallback(
          input.sessionId,
          input.channelName,
        );
      }
    } catch {
      await ModerationService.requestScreenshotFallback(
        input.sessionId,
        input.channelName,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async requestScreenshotFallback(
    sessionId: string,
    channelName: string,
  ) {
    const url = process.env.HIVE_SCREENSHOT_URL;
    if (!url) {
      return;
    }

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: process.env.HIVE_API_KEY
            ? `Bearer ${process.env.HIVE_API_KEY}`
            : '',
        },
        body: JSON.stringify({
          sessionId,
          channel: channelName,
          appId: process.env.AGORA_APP_ID,
        }),
      });
    } catch {
      // best-effort fallback
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signature?: string,
    timestamp?: string,
  ) {
    const secret = process.env.HIVE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Hive webhook secret not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing Hive signature');
    }

    if (timestamp) {
      const ts = Number.parseInt(timestamp, 10);
      if (Number.isFinite(ts)) {
        const drift = Math.abs(Date.now() - ts);
        if (drift > 5 * 60 * 1000) {
          throw new BadRequestException('Stale Hive webhook timestamp');
        }
      }
    }

    const rawSig = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');

    const a = Buffer.from(rawSig, 'hex');
    const b = Buffer.from(computed, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid Hive signature');
    }
  }

  async handleWebhook(payload: HiveViolationPayload) {
    if (!payload.sessionId) {
      throw new BadRequestException('Missing sessionId');
    }

    if (!this.isViolation(payload)) {
      return { received: true };
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session) {
      return { received: true };
    }

    const offenderIds = payload.userId
      ? [payload.userId]
      : [session.userAId, session.userBId];

    await Promise.all(offenderIds.map((id) => this.logModerationEvent(id)));
    await Promise.all(
      offenderIds.map((id) =>
        this.applyModerationAction(
          id,
          payload.reason ?? payload.severity ?? 'violation',
        ),
      ),
    );

    await this.sessionService.endSession(session, 'ended');
    return { received: true };
  }

  private isViolation(payload: HiveViolationPayload): boolean {
    if (payload.violation === true) {
      return true;
    }
    const type = payload.action ?? payload.event;
    if (type && type.toLowerCase() === 'violation') {
      return true;
    }
    if (payload.labels && payload.labels.length > 0) {
      return true;
    }
    return false;
  }

  private async logModerationEvent(userId: string) {
    await this.prisma.moderationEvent.create({
      data: { userId },
    });
  }

  private async applyModerationAction(userId: string, reason: string) {
    const now = new Date();
    const since = new Date(now.getTime() - VIOLATION_WINDOW_MS);

    const count = await this.prisma.moderationEvent.count({
      where: {
        userId,
        createdAt: { gte: since },
      },
    });

    if (count >= BAN_THRESHOLD) {
      const cooldownKey = this.banCooldownKey(userId);
      const allowed = await this.redis.set(
        cooldownKey,
        '1',
        'PX',
        BAN_RATE_LIMIT_MS,
        'NX',
      );
      if (allowed) {
        await this.redis.set(this.banKey(userId), '1', 'PX', BAN_TTL_MS);
        this.emitModerationAction(userId, 'ban', reason);
      }
      return;
    }

    this.emitModerationAction(userId, 'warn', reason);
  }

  private emitModerationAction(
    userId: string,
    action: 'warn' | 'ban',
    reason: string,
  ) {
    if (!this.videoGateway.server) {
      return;
    }
    this.videoGateway.server
      .to(this.userRoom(userId))
      .emit('moderation:action', {
        action,
        reason,
      });
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private banKey(userId: string) {
    return `moderation:ban:${userId}`;
  }

  private banCooldownKey(userId: string) {
    return `moderation:ban:cooldown:${userId}`;
  }
}
