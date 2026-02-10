import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPartnerReveal,
  PARTNER_REVEAL_VERSION,
  type PartnerReveal,
} from './reveal.types';

const PUBLIC_PROFILE_FIELDS = {
  id: true,
  displayName: true,
  photos: true,
  bio: true,
  age: true,
  gender: true,
  interests: true,
};

const REVEAL_PROFILE_FIELDS = {
  id: true,
  displayName: true,
  photos: true,
  age: true,
  bio: true,
};

export type MatchRevealPayload = {
  matchId: string;
  partnerRevealVersion: typeof PARTNER_REVEAL_VERSION;
  partnerReveal: PartnerReveal;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
};

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMatches(userId: string) {
    const [matches, activeBlocks] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
        },
        include: {
          userA: { select: PUBLIC_PROFILE_FIELDS },
          userB: { select: PUBLIC_PROFILE_FIELDS },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.block.findMany({
        where: {
          liftedAt: null,
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
        select: {
          blockerId: true,
          blockedId: true,
        },
      }),
    ]);

    const blockedUserIds = new Set<string>();
    for (const block of activeBlocks ?? []) {
      if (block.blockerId === userId) {
        blockedUserIds.add(block.blockedId);
      } else {
        blockedUserIds.add(block.blockerId);
      }
    }

    return matches.map((match) => {
      const partner = match.userAId === userId ? match.userB : match.userA;
      return {
        id: match.id,
        createdAt: match.createdAt,
        partner,
      };
    }).filter((match) => !blockedUserIds.has(match.partner.id));
  }

  async getReveal(matchId: string, userId: string): Promise<MatchRevealPayload> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        userA: { select: REVEAL_PROFILE_FIELDS },
        userB: { select: REVEAL_PROFILE_FIELDS },
      },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const side = this.resolveParticipantSide(match, userId);
    const partner = side === 'A' ? match.userB : match.userA;
    const acknowledgedAt =
      side === 'A'
        ? match.userARevealAcknowledgedAt
        : match.userBRevealAcknowledgedAt;

    return {
      matchId: match.id,
      partnerRevealVersion: PARTNER_REVEAL_VERSION,
      partnerReveal: buildPartnerReveal(partner),
      revealAcknowledged: Boolean(acknowledgedAt),
      revealAcknowledgedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
    };
  }

  async acknowledgeReveal(
    matchId: string,
    userId: string,
  ): Promise<MatchRevealPayload> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        userAId: true,
        userBId: true,
        userARevealAcknowledgedAt: true,
        userBRevealAcknowledgedAt: true,
      },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const side = this.resolveParticipantSide(match, userId);
    const now = new Date();
    if (side === 'A' && !match.userARevealAcknowledgedAt) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { userARevealAcknowledgedAt: now },
      });
    }
    if (side === 'B' && !match.userBRevealAcknowledgedAt) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { userBRevealAcknowledgedAt: now },
      });
    }

    return this.getReveal(matchId, userId);
  }

  async isRevealAcknowledged(matchId: string, userId: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        userAId: true,
        userBId: true,
        userARevealAcknowledgedAt: true,
        userBRevealAcknowledgedAt: true,
      },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const side = this.resolveParticipantSide(match, userId);
    const acknowledgedAt =
      side === 'A'
        ? match.userARevealAcknowledgedAt
        : match.userBRevealAcknowledgedAt;
    return Boolean(acknowledgedAt);
  }

  private resolveParticipantSide(
    match: {
      userAId: string;
      userBId: string;
    },
    userId: string,
  ): 'A' | 'B' {
    if (match.userAId === userId) {
      return 'A';
    }
    if (match.userBId === userId) {
      return 'B';
    }
    throw new ForbiddenException('Not a match participant');
  }
}
