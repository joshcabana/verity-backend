import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChatService } from '../../src/chat/chat.service';
import { ChatGateway } from '../../src/chat/chat.gateway';
import { MatchesService } from '../../src/matches/matches.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock } from '../mocks/prisma.mock';
import { ChatGatewayMock } from '../mocks/gateway.mock';

describe('ChatService (unit)', () => {
  let service: ChatService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let gateway: ChatGatewayMock;
  let notificationsService: { notifyUsers: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    gateway = new ChatGatewayMock();
    notificationsService = { notifyUsers: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = moduleRef.get(ChatService);
  });

  it('throws when match not found in listMessages', async () => {
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(service.listMessages('match-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('limits message history and returns ascending order', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });

    const newest = { id: 'm2', createdAt: new Date('2024-01-02T00:00:00Z') };
    const oldest = { id: 'm1', createdAt: new Date('2024-01-01T00:00:00Z') };

    prisma.message.findMany.mockResolvedValue([newest, oldest]);

    const result = await service.listMessages('match-1', 'user-a', 200);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(result[0].id).toBe('m1');
    expect(result[1].id).toBe('m2');
  });

  it('rejects empty message text', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });

    await expect(service.sendMessage('match-1', 'user-a', '  ')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects missing match and non-participants', async () => {
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(
      service.sendMessage('match-1', 'user-a', 'Hi'),
    ).rejects.toThrow(NotFoundException);

    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });

    await expect(
      service.sendMessage('match-1', 'user-c', 'Hi'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sends messages and emits to both users', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });
    prisma.message.create.mockResolvedValue({
      id: 'msg-1',
      matchId: 'match-1',
      senderId: 'user-a',
      text: 'Hello',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });

    const message = await service.sendMessage('match-1', 'user-a', 'Hello');

    expect(message.text).toBe('Hello');
    expect(gateway.events).toHaveLength(2);
    expect(notificationsService.notifyUsers).toHaveBeenCalledWith(
      ['user-b'],
      'chat_message_new',
      expect.objectContaining({
        matchId: 'match-1',
        senderId: 'user-a',
      }),
    );
  });

  it('blocks message access when users are blocked', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });
    prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

    await expect(service.listMessages('match-1', 'user-a')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.sendMessage('match-1', 'user-a', 'Hello'),
    ).rejects.toThrow(ForbiddenException);
    expect(notificationsService.notifyUsers).not.toHaveBeenCalled();
  });
});

describe('MatchesService (unit)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: MatchesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new MatchesService(prisma as unknown as PrismaService);
  });

  it('maps matches to partner profiles', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        createdAt,
        userAId: 'user-a',
        userBId: 'user-b',
        userA: { id: 'user-a', displayName: 'A' },
        userB: { id: 'user-b', displayName: 'B' },
      },
      {
        id: 'match-2',
        createdAt,
        userAId: 'user-c',
        userBId: 'user-a',
        userA: { id: 'user-c', displayName: 'C' },
        userB: { id: 'user-a', displayName: 'A' },
      },
    ]);

    const result = await service.listMatches('user-a');

    expect(result).toHaveLength(2);
    expect(result[0].partner.id).toBe('user-b');
    expect(result[1].partner.id).toBe('user-c');
  });

  it('filters blocked partners from matches', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        createdAt,
        userAId: 'user-a',
        userBId: 'user-b',
        userA: { id: 'user-a', displayName: 'A' },
        userB: { id: 'user-b', displayName: 'B' },
      },
    ]);
    prisma.block.findMany.mockResolvedValue([
      {
        blockerId: 'user-a',
        blockedId: 'user-b',
      },
    ]);

    const result = await service.listMatches('user-a');

    expect(result).toHaveLength(0);
  });
});
