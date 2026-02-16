import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { PushEventType } from '../notifications/notifications.service';
import { Message } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';

const DEFAULT_MESSAGE_LIMIT = 50;
const REVEAL_ACK_REQUIRED_CODE = 'REVEAL_ACK_REQUIRED';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly analyticsService?: AnalyticsService,
  ) {}

  async listMessages(
    matchId: string,
    userId: string,
    limit = DEFAULT_MESSAGE_LIMIT,
  ) {
    const match = await this.getMatchForUser(matchId, userId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    await this.assertNotBlocked(match.userAId, match.userBId);
    this.assertRevealAcknowledged(match, userId);

    const boundedLimit = Number.isFinite(limit) ? limit : DEFAULT_MESSAGE_LIMIT;
    const safeLimit = Math.max(1, Math.min(boundedLimit, 100));
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
    const timeFromMutualMatchSec = this.timeFromMutualMatchSec(
      match.createdAt,
    );

    this.analyticsService?.trackServerEvent({
      userId,
      name: 'match_chat_opened',
      properties: {
        matchId,
        messageCount: messages.length,
        timeFromMutualMatchSec,
      },
    });

    return messages.reverse();
  }

  async sendMessage(
    matchId: string,
    userId: string,
    text: string,
  ): Promise<Message> {
    const content = text.trim();
    if (!content) {
      throw new BadRequestException('Message text is required');
    }

    const match = await this.getMatchForUser(matchId, userId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    await this.assertNotBlocked(match.userAId, match.userBId);
    this.assertRevealAcknowledged(match, userId);

    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not a match participant');
    }

    const existingCount = await this.getExistingMessageCount(matchId);
    const timeFromMutualMatchSec = this.timeFromMutualMatchSec(
      match.createdAt,
    );

    const message = await this.prisma.message.create({
      data: {
        matchId,
        senderId: userId,
        text: content,
      },
    });

    const payload = {
      id: message.id,
      matchId: message.matchId,
      senderId: message.senderId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };

    if (match.userARevealAcknowledgedAt) {
      this.gateway.emitMessage(match.userAId, payload);
    }
    if (match.userBRevealAcknowledgedAt) {
      this.gateway.emitMessage(match.userBId, payload);
    }

    const recipientId =
      match.userAId === userId ? match.userBId : match.userAId;
    const recipientRevealAcknowledged = this.hasRevealAcknowledged(
      match,
      recipientId,
    );
    let notificationEvent: PushEventType;
    let notificationData: Record<string, string>;
    if (recipientRevealAcknowledged) {
      const sender = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const senderDisplayName = sender?.displayName?.trim() || 'Someone';
      notificationEvent = 'chat_message_new';
      notificationData = {
        matchId: message.matchId,
        messageId: message.id,
        senderId: message.senderId,
        title: 'New message',
        body: `From ${senderDisplayName}`,
        deepLinkTarget: 'chat',
      };
    } else {
      notificationEvent = 'chat_reveal_required';
      notificationData = {
        matchId: message.matchId,
        messageId: message.id,
        senderId: message.senderId,
        title: 'New match',
        body: 'A message is waiting — reveal to view',
        deepLinkTarget: 'reveal',
      };
    }

    void this.notificationsService.notifyUsers(
      [recipientId],
      notificationEvent,
      notificationData,
    );

    this.analyticsService?.trackServerEvent({
      userId,
      name: existingCount === 0 ? 'first_message_sent' : 'message_sent',
      properties: {
        matchId,
        messageId: message.id,
      },
    });
    this.analyticsService?.trackServerEvent({
      userId,
      name: 'match_message_sent',
      properties: {
        matchId,
        messageId: message.id,
        isFirstMessage: existingCount === 0,
        timeFromMutualMatchSec,
      },
    });

    return message;
  }

  private async getMatchForUser(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      return null;
    }
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not a match participant');
    }
    return match;
  }

  private async assertNotBlocked(userAId: string, userBId: string) {
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

    if (block) {
      throw new ForbiddenException('Conversation unavailable');
    }
  }

  private assertRevealAcknowledged(
    match: {
      userAId: string;
      userBId: string;
      userARevealAcknowledgedAt?: Date | null;
      userBRevealAcknowledgedAt?: Date | null;
    },
    userId: string,
  ) {
    const acknowledgedAt =
      match.userAId === userId
        ? match.userARevealAcknowledgedAt
        : match.userBRevealAcknowledgedAt;
    if (acknowledgedAt) {
      return;
    }
    throw new ForbiddenException({
      code: REVEAL_ACK_REQUIRED_CODE,
      message: 'Profile reveal acknowledgement required before chat',
    });
  }

  private hasRevealAcknowledged(
    match: {
      userAId: string;
      userBId: string;
      userARevealAcknowledgedAt?: Date | null;
      userBRevealAcknowledgedAt?: Date | null;
    },
    userId: string,
  ): boolean {
    return Boolean(
      match.userAId === userId
        ? match.userARevealAcknowledgedAt
        : match.userBRevealAcknowledgedAt,
    );
  }

  private async getExistingMessageCount(matchId: string): Promise<number> {
    const countFn = (
      this.prisma.message as unknown as {
        count?: (args: { where: { matchId: string } }) => Promise<number>;
      }
    ).count;
    if (typeof countFn === 'function') {
      return countFn({ where: { matchId } });
    }

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      select: { id: true },
    });
    return messages.length;
  }

  private timeFromMutualMatchSec(matchCreatedAt?: Date | null): number {
    if (!matchCreatedAt) {
      return 0;
    }
    const elapsedMs = Date.now() - matchCreatedAt.getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return 0;
    }
    return Math.round(elapsedMs / 1000);
  }
}
