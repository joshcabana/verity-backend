import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

export type PushEventType =
  | 'queue_match_found'
  | 'match_mutual'
  | 'chat_message_new'
  | 'chat_reveal_required';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    const token = dto.token.trim();
    const deviceId = dto.deviceId?.trim() || null;
    const now = new Date();

    const record = await this.prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: dto.platform,
        deviceId,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: dto.platform,
        deviceId,
        lastSeenAt: now,
        revokedAt: null,
      },
      select: {
        id: true,
        platform: true,
        lastSeenAt: true,
      },
    });

    return { success: true, token: record };
  }

  async unregisterPushToken(userId: string, tokenRaw: string) {
    const token = tokenRaw.trim();
    const updated = await this.prisma.pushToken.updateMany({
      where: {
        userId,
        token,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true, removed: updated.count };
  }

  async notifyUsers(
    userIds: string[],
    event: PushEventType,
    data: Record<string, unknown>,
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return { attemptedUsers: 0, tokenCount: 0 };
    }

    const tokens = await this.prisma.pushToken.findMany({
      where: {
        userId: { in: uniqueUserIds },
        revokedAt: null,
      },
      select: {
        userId: true,
        token: true,
        platform: true,
      },
    });

    if (tokens.length === 0) {
      return { attemptedUsers: uniqueUserIds.length, tokenCount: 0 };
    }

    const webhook = process.env.PUSH_DISPATCH_WEBHOOK_URL?.trim();
    if (!webhook) {
      this.logger.log(
        `Push dry-run event=${event} users=${uniqueUserIds.length} tokens=${tokens.length}`,
      );
      return {
        attemptedUsers: uniqueUserIds.length,
        tokenCount: tokens.length,
      };
    }

    try {
      const payload = {
        event,
        sentAt: new Date().toISOString(),
        deliveries: tokens.map((entry) => ({
          userId: entry.userId,
          token: entry.token,
          platform: entry.platform,
          data,
        })),
      };

      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        this.logger.warn(
          `Push dispatch webhook failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Push dispatch failed: ${error}`);
    }

    return { attemptedUsers: uniqueUserIds.length, tokenCount: tokens.length };
  }
}
