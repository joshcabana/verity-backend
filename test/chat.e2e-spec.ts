import { ForbiddenException } from '@nestjs/common';
import { Match, Message, User } from '@prisma/client';
import { ChatService } from '../src/chat/chat.service';
import { MatchesService } from '../src/matches/matches.service';

class FakeChatGateway {
  events: Array<{ userId: string; payload: any }> = [];

  emitMessage(userId: string, payload: any) {
    this.events.push({ userId, payload });
  }
}

class FakeNotificationsService {
  async notifyUsers() {
    return;
  }
}

class FakePrismaService {
  users = new Map<string, User>();
  matches = new Map<string, Match>();
  messages: Message[] = [];

  match = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return this.matches.get(where.id) ?? null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Match>;
    }) => {
      const current = this.matches.get(where.id);
      if (!current) {
        return null;
      }
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date(),
      } as Match;
      this.matches.set(where.id, updated);
      return updated;
    },
    findMany: async ({ where, include, orderBy }: any) => {
      const results = Array.from(this.matches.values()).filter(
        (match) =>
          match.userAId === where.OR[0].userAId ||
          match.userBId === where.OR[1].userBId,
      );

      const withUsers = results.map((match) => ({
        ...match,
        userA: this.users.get(match.userAId),
        userB: this.users.get(match.userBId),
      }));

      if (orderBy?.createdAt === 'desc') {
        withUsers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      return withUsers;
    },
  };

  block = {
    findMany: async () => [],
    findFirst: async () => null,
  };

  message = {
    create: async ({
      data,
    }: {
      data: { matchId: string; senderId: string; text: string };
    }) => {
      const message: Message = {
        id: `msg-${this.messages.length + 1}`,
        matchId: data.matchId,
        senderId: data.senderId,
        text: data.text,
        createdAt: new Date(),
      };
      this.messages.push(message);
      return message;
    },
    findMany: async ({ where, orderBy, take }: any) => {
      let results = this.messages.filter(
        (message) => message.matchId === where.matchId,
      );
      if (orderBy?.createdAt === 'desc') {
        results = results.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      if (take) {
        results = results.slice(0, take);
      }
      return results;
    },
  };
}

describe('Chat & identity reveal (e2e)', () => {
  it('lists matches with partner profile and delivers chat messages', async () => {
    const prisma = new FakePrismaService();
    const gateway = new FakeChatGateway();
    const chatService = new ChatService(
      prisma as unknown as any,
      gateway as any,
      new FakeNotificationsService() as any,
    );
    const matchesService = new MatchesService(prisma as unknown as any);

    const userA: User = {
      id: 'user-a',
      createdAt: new Date(),
      updatedAt: new Date(),
      displayName: 'A',
      photos: null,
      bio: 'Hello',
      age: 25,
      gender: 'F',
      interests: [],
      phone: null,
      email: null,
      tokenBalance: 0,
    };
    const userB: User = {
      id: 'user-b',
      createdAt: new Date(),
      updatedAt: new Date(),
      displayName: 'B',
      photos: null,
      bio: 'Hi',
      age: 26,
      gender: 'M',
      interests: [],
      phone: null,
      email: null,
      tokenBalance: 0,
    };

    prisma.users.set(userA.id, userA);
    prisma.users.set(userB.id, userB);

    const match: Match = {
      id: 'match-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userAId: userA.id,
      userBId: userB.id,
      userARevealAcknowledgedAt: new Date(),
      userBRevealAcknowledgedAt: new Date(),
    };
    prisma.matches.set(match.id, match);

    const list = await matchesService.listMatches(userA.id);
    expect(list).toHaveLength(1);
    expect(list[0].partner.id).toBe(userB.id);
    expect(list[0].partner.displayName).toBe('B');

    const message = await chatService.sendMessage(
      match.id,
      userA.id,
      'Hello there',
    );
    expect(message.text).toBe('Hello there');
    expect(gateway.events).toHaveLength(2);

    const history = await chatService.listMessages(match.id, userA.id, 50);
    expect(history).toHaveLength(1);
  });

  it('prevents non-participants from sending messages', async () => {
    const prisma = new FakePrismaService();
    const gateway = new FakeChatGateway();
    const chatService = new ChatService(
      prisma as unknown as any,
      gateway as any,
      new FakeNotificationsService() as any,
    );

    const match: Match = {
      id: 'match-2',
      createdAt: new Date(),
      updatedAt: new Date(),
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: new Date(),
      userBRevealAcknowledgedAt: new Date(),
    };
    prisma.matches.set(match.id, match);

    await expect(
      chatService.sendMessage(match.id, 'user-c', 'Hey'),
    ).rejects.toThrow(ForbiddenException);
  });
});
