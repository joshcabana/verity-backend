import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock } from '../mocks/prisma.mock';

describe('NotificationsService (unit)', () => {
  const originalEnv = { ...process.env };
  let service: NotificationsService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    prisma = createPrismaMock();
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('registers token with upsert', async () => {
    prisma.pushToken.upsert.mockResolvedValue({
      id: 'push-1',
      platform: 'WEB',
      lastSeenAt: new Date('2026-02-06T00:00:00.000Z'),
    });

    const result = await service.registerPushToken('user-1', {
      token: '  token-12345678  ',
      platform: 'WEB',
      deviceId: '  browser-1  ',
    });

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'token-12345678' },
        create: expect.objectContaining({
          userId: 'user-1',
          token: 'token-12345678',
          platform: 'WEB',
          deviceId: 'browser-1',
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('unregisters active token for user', async () => {
    prisma.pushToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.unregisterPushToken(
      'user-1',
      ' token-12345678 ',
    );

    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          token: 'token-12345678',
          revokedAt: null,
        },
      }),
    );
    expect(result).toEqual({ success: true, removed: 1 });
  });

  it('returns token count in dry-run mode when webhook is not configured', async () => {
    prisma.pushToken.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        token: 'token-a',
        platform: 'WEB',
      },
    ]);

    const result = await service.notifyUsers(['user-1'], 'match_mutual', {
      matchId: 'match-1',
    });

    expect(result).toEqual({ attemptedUsers: 1, tokenCount: 1 });
  });

  it('posts payload to dispatch webhook when configured', async () => {
    process.env.PUSH_DISPATCH_WEBHOOK_URL =
      'https://push.example.test/dispatch';
    prisma.pushToken.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        token: 'token-a',
        platform: 'WEB',
      },
    ]);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    (global as { fetch?: unknown }).fetch = fetchMock;

    const result = await service.notifyUsers(['user-1'], 'chat_message_new', {
      matchId: 'match-1',
      messageId: 'msg-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://push.example.test/dispatch',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toEqual({ attemptedUsers: 1, tokenCount: 1 });
  });
});
