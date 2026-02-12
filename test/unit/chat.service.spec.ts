import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AnalyticsService } from '../../src/analytics/analytics.service';
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
  let analyticsService: { trackServerEvent: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    gateway = new ChatGatewayMock();
    notificationsService = { notifyUsers: jest.fn() };
    analyticsService = { trackServerEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AnalyticsService, useValue: analyticsService },
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
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
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
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
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
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
    });

    await expect(
      service.sendMessage('match-1', 'user-c', 'Hi'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sends messages and emits to both users when both acknowledged', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
    });
    prisma.message.create.mockResolvedValue({
      id: 'msg-1',
      matchId: 'match-1',
      senderId: 'user-a',
      text: 'Hello',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    prisma.user.findUnique.mockResolvedValue({
      displayName: 'Alex',
    });

    const message = await service.sendMessage('match-1', 'user-a', 'Hello');

    expect(message.text).toBe('Hello');
    expect(gateway.events).toHaveLength(2);
    expect(gateway.events.map((event) => event.userId).sort()).toEqual([
      'user-a',
      'user-b',
    ]);
    expect(notificationsService.notifyUsers).toHaveBeenCalledWith(
      ['user-b'],
      'chat_message_new',
      expect.objectContaining({
        matchId: 'match-1',
        senderId: 'user-a',
        title: 'New message',
        body: 'From Alex',
        deepLinkTarget: 'chat',
      }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      select: { displayName: true },
    });
    const payload = notificationsService.notifyUsers.mock.calls[0][2];
    expect(payload).not.toHaveProperty('preview');
    expect(payload).not.toHaveProperty('text');
  });

  it('does not emit to recipients who have not acknowledged reveal', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: null,
    });
    prisma.message.create.mockResolvedValue({
      id: 'msg-1',
      matchId: 'match-1',
      senderId: 'user-a',
      text: 'Hello',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    prisma.user.findUnique.mockResolvedValue({
      displayName: 'Alex',
    });

    const message = await service.sendMessage('match-1', 'user-a', 'Hello');

    expect(message.text).toBe('Hello');
    expect(gateway.events).toHaveLength(1);
    expect(gateway.events[0]).toMatchObject({
      userId: 'user-a',
      payload: expect.objectContaining({ matchId: 'match-1', text: 'Hello' }),
    });
    expect(notificationsService.notifyUsers).toHaveBeenCalledWith(
      ['user-b'],
      'chat_reveal_required',
      expect.objectContaining({
        matchId: 'match-1',
        senderId: 'user-a',
        title: 'New match',
        body: 'A message is waiting — reveal to view',
        deepLinkTarget: 'reveal',
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks message access when users are blocked', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
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

  it('requires reveal acknowledgment before chat access', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: null,
      userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
    });

    await expect(service.listMessages('match-1', 'user-a')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REVEAL_ACK_REQUIRED',
      }),
    });
    await expect(
      service.sendMessage('match-1', 'user-a', 'Hello'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REVEAL_ACK_REQUIRED',
      }),
    });
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
        userARevealAcknowledgedAt: null,
        userBRevealAcknowledgedAt: null,
      },
      {
        id: 'match-2',
        createdAt,
        userAId: 'user-c',
        userBId: 'user-a',
        userARevealAcknowledgedAt: null,
        userBRevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-c',
        displayName: 'C',
        photos: ['https://cdn.example/c.jpg'],
        age: 29,
        bio: 'C bio',
      },
    ]);

    const result = await service.listMatches('user-a');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      matchId: 'match-1',
      partnerRevealVersion: 1,
      revealAcknowledged: false,
      revealAcknowledgedAt: null,
      partnerReveal: null,
    });
    expect(result[1]).toEqual({
      matchId: 'match-2',
      partnerRevealVersion: 1,
      revealAcknowledged: true,
      revealAcknowledgedAt: '2024-01-01T00:00:00.000Z',
      partnerReveal: {
        id: 'user-c',
        displayName: 'C',
        primaryPhotoUrl: 'https://cdn.example/c.jpg',
        age: 29,
        bio: 'C bio',
      },
    });
  });

  it('filters blocked partners from matches', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        createdAt,
        userAId: 'user-a',
        userBId: 'user-b',
        userARevealAcknowledgedAt: null,
        userBRevealAcknowledgedAt: null,
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

  it('returns partner reveal and acknowledgment status', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      userAId: 'user-a',
      userBId: 'user-b',
      userARevealAcknowledgedAt: now,
      userBRevealAcknowledgedAt: null,
      userA: {
        id: 'user-a',
        displayName: 'A',
        photos: [],
        age: 30,
        bio: 'A bio',
      },
      userB: {
        id: 'user-b',
        displayName: 'B',
        photos: ['https://cdn.example/b.jpg'],
        age: 31,
        bio: 'B bio',
      },
    });

    const result = await service.getReveal('match-1', 'user-a');

    expect(result.partnerRevealVersion).toBe(1);
    expect(result.partnerReveal).toEqual({
      id: 'user-b',
      displayName: 'B',
      primaryPhotoUrl: 'https://cdn.example/b.jpg',
      age: 31,
      bio: 'B bio',
    });
    expect(result.revealAcknowledged).toBe(true);
    expect(result.revealAcknowledgedAt).toBe(now.toISOString());
  });

  it('acknowledges reveal for the requesting participant', async () => {
    prisma.match.findUnique
      .mockResolvedValueOnce({
        id: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        userARevealAcknowledgedAt: null,
        userBRevealAcknowledgedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        userARevealAcknowledgedAt: new Date('2024-01-01T00:00:00Z'),
        userBRevealAcknowledgedAt: null,
        userA: {
          id: 'user-a',
          displayName: 'A',
          photos: [],
          age: 30,
          bio: 'A bio',
        },
        userB: {
          id: 'user-b',
          displayName: 'B',
          photos: [],
          age: 31,
          bio: 'B bio',
        },
      });

    prisma.match.update.mockResolvedValue({
      id: 'match-1',
    });

    const result = await service.acknowledgeReveal('match-1', 'user-a');

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: { userARevealAcknowledgedAt: expect.any(Date) },
    });
    expect(result.revealAcknowledged).toBe(true);
  });
});
