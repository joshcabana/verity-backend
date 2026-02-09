import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import { VideoGateway } from '../video/video.gateway';
import { ReportUserDto } from './dto/report-user.dto';

const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const BAN_THRESHOLD = 3;
const BAN_TTL_MS = 24 * 60 * 60 * 1000;
const BAN_RATE_LIMIT_MS = 60 * 1000;
const REPORT_SPAM_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_USER_PER_DAY = 10;
const REPORT_ESCALATION_THRESHOLD = 3;
const REPORT_ESCALATION_TTL_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_REPLAY_TTL_MS = 10 * 60 * 1000;

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

type HiveWebhookDelivery = {
  signature?: string;
  timestamp?: string;
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

  async createReport(reporterId: string, input: ReportUserDto) {
    if (reporterId === input.reportedUserId) {
      throw new BadRequestException('Cannot report yourself');
    }

    const details = input.details?.trim();
    if (details && details.length > 500) {
      throw new BadRequestException('Report details must be 500 characters or fewer');
    }

    const reportWindowStart = new Date(Date.now() - REPORT_SPAM_WINDOW_MS);
    const reportCount = await this.prisma.moderationReport.count({
      where: {
        reporterId,
        createdAt: { gte: reportWindowStart },
      },
    });
    if (reportCount >= MAX_REPORTS_PER_USER_PER_DAY) {
      throw new BadRequestException('Daily report limit reached');
    }

    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moderationReport.create({
        data: {
          reporterId,
          reportedUserId: input.reportedUserId,
          reason: input.reason,
          details,
          status: 'OPEN',
        },
        select: {
          id: true,
          createdAt: true,
          reporterId: true,
          reportedUserId: true,
          reason: true,
          details: true,
          status: true,
        },
      });

      const existingBlock = await tx.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: reporterId,
            blockedId: input.reportedUserId,
          },
        },
      });

      if (!existingBlock) {
        await tx.block.create({
          data: {
            blockerId: reporterId,
            blockedId: input.reportedUserId,
          },
        });
      } else if (existingBlock.liftedAt) {
        await tx.block.update({
          where: { id: existingBlock.id },
          data: { liftedAt: null },
        });
      }

      return created;
    });

    await this.bumpReportEscalation(input.reportedUserId);
    await this.removeFromQueueIfPresent(input.reportedUserId);
    return report;
  }

  async createBlock(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: {
        id: true,
        blockerId: true,
        blockedId: true,
        createdAt: true,
        updatedAt: true,
        liftedAt: true,
      },
    });

    if (!existing) {
      const created = await this.prisma.block.create({
        data: { blockerId, blockedId },
        select: {
          id: true,
          blockerId: true,
          blockedId: true,
          createdAt: true,
          updatedAt: true,
          liftedAt: true,
        },
      });
      await this.removeFromQueueIfPresent(blockedId);
      return { status: 'blocked' as const, block: created };
    }

    if (!existing.liftedAt) {
      return { status: 'already_blocked' as const, block: existing };
    }

    const reopened = await this.prisma.block.update({
      where: { id: existing.id },
      data: { liftedAt: null },
      select: {
        id: true,
        blockerId: true,
        blockedId: true,
        createdAt: true,
        updatedAt: true,
        liftedAt: true,
      },
    });
    await this.removeFromQueueIfPresent(blockedId);
    return { status: 'blocked' as const, block: reopened };
  }

  async listBlocks(userId: string, limit = 100) {
    const boundedLimit = Number.isFinite(limit) ? limit : 100;
    const safeLimit = Math.max(1, Math.min(boundedLimit, 200));
    const blocks = await this.prisma.block.findMany({
      where: {
        blockerId: userId,
        liftedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        createdAt: true,
        blockedId: true,
      },
    });

    return blocks.map((block) => ({
      id: block.id,
      createdAt: block.createdAt,
      blockedUserId: block.blockedId,
    }));
  }

  async unblock(blockerId: string, blockedId: string) {
    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true, liftedAt: true },
    });
    if (!existing || existing.liftedAt) {
      return { status: 'not_blocked' as const };
    }

    await this.prisma.block.update({
      where: { id: existing.id },
      data: { liftedAt: new Date() },
    });

    return { status: 'unblocked' as const };
  }

  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
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

    if (!timestamp) {
      throw new BadRequestException('Missing Hive webhook timestamp');
    }

    if (!/^\d{10,16}$/.test(timestamp)) {
      throw new BadRequestException('Invalid Hive webhook timestamp');
    }
    let ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new BadRequestException('Invalid Hive webhook timestamp');
    }
    if (ts < 1_000_000_000_000) {
      ts *= 1000;
    }
    const drift = Math.abs(Date.now() - ts);
    if (drift > 5 * 60 * 1000) {
      throw new BadRequestException('Stale Hive webhook timestamp');
    }

    const rawSig = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;
    if (!/^[0-9a-fA-F]{64}$/.test(rawSig)) {
      throw new BadRequestException('Invalid Hive signature');
    }
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');

    const a = Buffer.from(rawSig, 'hex');
    const b = Buffer.from(computed, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid Hive signature');
    }
  }

  async handleWebhook(
    payload: HiveViolationPayload,
    delivery?: HiveWebhookDelivery,
  ) {
    if (!payload.sessionId) {
      throw new BadRequestException('Missing sessionId');
    }

    if (delivery?.signature && delivery.timestamp) {
      const accepted = await this.reserveWebhookDelivery(
        delivery.signature,
        delivery.timestamp,
      );
      if (!accepted) {
        return { received: true };
      }
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

  private async reserveWebhookDelivery(
    signature: string,
    timestamp: string,
  ): Promise<boolean> {
    const normalizedSignature = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;
    const dedupeHash = createHash('sha256')
      .update(`${timestamp}:${normalizedSignature}`)
      .digest('hex');
    const key = `moderation:hive:webhook:${dedupeHash}`;
    const reserved = await this.redis.set(
      key,
      '1',
      'PX',
      WEBHOOK_REPLAY_TTL_MS,
      'NX',
    );
    return Boolean(reserved);
  }

  async listReports(status?: string, limit = 50) {
    const boundedLimit = Number.isFinite(limit) ? limit : 50;
    const safeLimit = Math.max(1, Math.min(boundedLimit, 200));
    return this.prisma.moderationReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        createdAt: true,
        reporterId: true,
        reportedUserId: true,
        reason: true,
        details: true,
        status: true,
      },
    });
  }

  async resolveReport(reportId: string, action: 'warn' | 'ban') {
    const report = await this.prisma.moderationReport.update({
      where: { id: reportId },
      data: { status: action === 'ban' ? 'BANNED' : 'WARNED' },
    });

    // Legacy report records may exist from before auto-block behavior.
    await this.createBlock(report.reporterId, report.reportedUserId);

    if (action === 'ban') {
      await this.redis.set(
        this.banKey(report.reportedUserId),
        '1',
        'PX',
        BAN_TTL_MS,
      );
    }

    this.emitModerationAction(report.reportedUserId, action, report.reason);

    return {
      id: report.id,
      status: report.status,
      action,
    };
  }

  private async removeFromQueueIfPresent(userId: string) {
    const stateRaw = await this.redis.get(`queue:user:${userId}`);
    if (!stateRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(stateRaw) as { queueKey?: string };
      if (parsed.queueKey) {
        await this.redis.zrem(`queue:zset:${parsed.queueKey}`, userId);
      }
    } catch {
      // Ignore malformed queue state.
    } finally {
      await this.redis.del(`queue:user:${userId}`);
    }
  }

  private async bumpReportEscalation(userId: string) {
    const key = `user:reports:${userId}`;
    const currentRaw = await this.redis.get(key);
    const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const next = safeCurrent + 1;
    await this.redis.set(key, String(next), 'PX', REPORT_ESCALATION_TTL_MS);

    if (next >= REPORT_ESCALATION_THRESHOLD) {
      this.logger.warn(
        `User ${userId} reached ${next} reports in 24h and should be reviewed by human moderation`,
      );
    }
  }
}
