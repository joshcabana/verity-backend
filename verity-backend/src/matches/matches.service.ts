import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PUBLIC_PROFILE_FIELDS = {
  id: true,
  displayName: true,
  photos: true,
  bio: true,
  age: true,
  gender: true,
  interests: true,
};

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: PUBLIC_PROFILE_FIELDS },
        userB: { select: PUBLIC_PROFILE_FIELDS },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const partner = match.userAId === userId ? match.userB : match.userA;
      return {
        id: match.id,
        createdAt: match.createdAt,
        partner,
      };
    });
  }
}
