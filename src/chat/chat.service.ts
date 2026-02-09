import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Message } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';

const DEFAULT_MESSAGE_LIMIT = 50;

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

    const boundedLimit = Number.isFinite(limit) ? limit : DEFAULT_MESSAGE_LIMIT;
    const safeLimit = Math.max(1, Math.min(boundedLimit, 100));
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
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

    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not a match participant');
    }

    const existingCount = await this.getExistingMessageCount(matchId);

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

    this.gateway.emitMessage(match.userAId, payload);
    this.gateway.emitMessage(match.userBId, payload);

    const recipientId = match.userAId === userId ? match.userBId : match.userAId;
    void this.notificationsService.notifyUsers(
      [recipientId],
      'chat_message_new',
      {
        matchId: message.matchId,
        messageId: message.id,
        senderId: message.senderId,
      },
    );

    this.analyticsService?.trackServerEvent({
      userId,
      name: existingCount === 0 ? 'first_message_sent' : 'message_sent',
      properties: {
        matchId,
        messageId: message.id,
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
}
