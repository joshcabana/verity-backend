import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';

const DEFAULT_MESSAGE_LIMIT = 50;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
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

    const safeLimit = Math.max(1, Math.min(limit, 100));
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
}
