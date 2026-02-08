import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { ModerationService } from '../../src/moderation/moderation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SessionService } from '../../src/session/session.service';
import { VideoGateway } from '../../src/video/video.gateway';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createRedisMock } from '../mocks/redis.mock';

describe('ModerationService (unit)', () => {
  const originalEnv = { ...process.env };
  let service: ModerationService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let sessionService: { endSession: jest.Mock };
  let videoGateway: any;

  beforeEach(async () => {
    prisma = createPrismaMock();
    redis = createRedisMock();
    sessionService = { endSession: jest.fn() };
    videoGateway = {
      server: {
        to: jest.fn(() => ({ emit: jest.fn() })),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ModerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: SessionService, useValue: sessionService },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: VideoGateway, useValue: videoGateway },
      ],
    }).compile();

    service = moduleRef.get(ModerationService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates reports and prevents self-reporting', async () => {
    await expect(
      service.createReport('user-1', {
        reportedUserId: 'user-1',
        reason: 'abuse',
        details: 'self',
      } as any),
    ).rejects.toThrow(BadRequestException);

    prisma.moderationReport.count.mockResolvedValue(0);
    prisma.moderationReport.create.mockResolvedValue({
      id: 'report-1',
      reporterId: 'user-1',
      reportedUserId: 'user-2',
      reason: 'spam',
      details: 'details',
      status: 'OPEN',
      createdAt: new Date(),
    });
    prisma.block.findUnique.mockResolvedValue(null);
    prisma.block.create.mockResolvedValue({
      id: 'block-1',
      blockerId: 'user-1',
      blockedId: 'user-2',
      liftedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const report = await service.createReport('user-1', {
      reportedUserId: 'user-2',
      reason: 'spam',
      details: 'details',
    } as any);

    expect(report.id).toBe('report-1');
    expect(prisma.block.create).toHaveBeenCalled();
  });

  it('enforces daily report spam limits', async () => {
    prisma.moderationReport.count.mockResolvedValue(10);

    await expect(
      service.createReport('user-1', {
        reportedUserId: 'user-2',
        reason: 'spam',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates and reopens blocks', async () => {
    prisma.block.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'block-1',
        blockerId: 'user-1',
        blockedId: 'user-2',
        liftedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

    prisma.block.create.mockResolvedValue({
      id: 'block-1',
      blockerId: 'user-1',
      blockedId: 'user-2',
      liftedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.block.update.mockResolvedValue({
      id: 'block-1',
      blockerId: 'user-1',
      blockedId: 'user-2',
      liftedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const first = await service.createBlock('user-1', 'user-2');
    const second = await service.createBlock('user-1', 'user-2');

    expect(first.status).toBe('blocked');
    expect(second.status).toBe('blocked');
    expect(prisma.block.update).toHaveBeenCalled();
  });

  it('marks blocks as lifted on unblock', async () => {
    prisma.block.findUnique.mockResolvedValue({
      id: 'block-1',
      liftedAt: null,
    });
    prisma.block.update.mockResolvedValue({
      id: 'block-1',
      liftedAt: new Date(),
    });

    const result = await service.unblock('user-1', 'user-2');

    expect(result.status).toBe('unblocked');
  });

  it('detects bidirectional blocks', async () => {
    prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
    await expect(service.isBlocked('user-1', 'user-2')).resolves.toBe(true);
  });

  it('startStreamMonitoring is a no-op without URL', async () => {
    delete process.env.HIVE_STREAM_URL;
    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    await ModerationService.startStreamMonitoring({
      sessionId: 'session-1',
      channelName: 'channel',
      rtcToken: 'token',
      rtcUid: 1,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('falls back to screenshot when stream request fails', async () => {
    process.env.HIVE_STREAM_URL = 'https://hive.test/stream';
    process.env.HIVE_SCREENSHOT_URL = 'https://hive.test/screenshot';
    process.env.HIVE_API_KEY = 'key';
    const fetchSpy = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: false } as any)
      .mockResolvedValueOnce({ ok: true } as any);

    await ModerationService.startStreamMonitoring({
      sessionId: 'session-1',
      channelName: 'channel',
      rtcToken: 'token',
      rtcUid: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('validates webhook signature requirements', () => {
    delete process.env.HIVE_WEBHOOK_SECRET;
    expect(() => service.verifyWebhookSignature(Buffer.from('a'), 'sig')).toThrow(
      BadRequestException,
    );

    process.env.HIVE_WEBHOOK_SECRET = 'secret';
    expect(() => service.verifyWebhookSignature(Buffer.from('a'))).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.verifyWebhookSignature(Buffer.from('a'), 'sha256=deadbeef'),
    ).toThrow(BadRequestException);
  });

  it('rejects stale timestamps, invalid timestamps, and invalid signatures', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';

    const raw = Buffer.from('payload');
    const oldTs = (Date.now() - 10 * 60 * 1000).toString();
    const validTs = Date.now().toString();

    expect(() =>
      service.verifyWebhookSignature(raw, 'sha256=deadbeef', oldTs),
    ).toThrow(BadRequestException);

    expect(() =>
      service.verifyWebhookSignature(raw, 'sha256=deadbeef', 'invalid'),
    ).toThrow(BadRequestException);

    expect(() =>
      service.verifyWebhookSignature(raw, 'sha256=deadbeef', validTs),
    ).toThrow(BadRequestException);
  });

  it('accepts webhook signature with valid timestamp', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';
    const raw = Buffer.from('payload');
    const signature = createHmac('sha256', 'secret')
      .update(raw)
      .digest('hex');
    const timestamp = Date.now().toString();
    const secondTimestamp = Math.floor(Date.now() / 1000).toString();

    expect(() =>
      service.verifyWebhookSignature(raw, `sha256=${signature}`, timestamp),
    ).not.toThrow();
    expect(() =>
      service.verifyWebhookSignature(raw, `sha256=${signature}`, secondTimestamp),
    ).not.toThrow();
  });

  it('rejects missing webhook timestamp even when signature is valid', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';
    const raw = Buffer.from('payload');
    const signature = createHmac('sha256', 'secret')
      .update(raw)
      .digest('hex');

    expect(() =>
      service.verifyWebhookSignature(raw, `sha256=${signature}`),
    ).toThrow(BadRequestException);
  });

  it('rejects missing sessionId in webhook', async () => {
    await expect(service.handleWebhook({} as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ignores non-violation webhooks', async () => {
    const result = await service.handleWebhook({
      sessionId: 'session-1',
      violation: false,
    });

    expect(result).toEqual({ received: true });
  });

  it('ignores violation webhooks when session missing', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    const result = await service.handleWebhook({
      sessionId: 'session-1',
      violation: true,
    });

    expect(result).toEqual({ received: true });
  });

  it('logs events and ends session on violation', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });
    prisma.moderationEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.moderationEvent.count.mockResolvedValue(0);

    const result = await service.handleWebhook({
      sessionId: 'session-1',
      userId: 'user-a',
      violation: true,
      reason: 'spam',
    });

    expect(result).toEqual({ received: true });
    expect(prisma.moderationEvent.create).toHaveBeenCalledTimes(1);
    expect(sessionService.endSession).toHaveBeenCalled();
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('deduplicates repeated webhook deliveries for the same signature and timestamp', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });
    prisma.moderationEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.moderationEvent.count.mockResolvedValue(0);

    await service.handleWebhook(
      {
        sessionId: 'session-1',
        userId: 'user-a',
        violation: true,
      },
      {
        signature: 'sha256=abc123',
        timestamp: '1704067200000',
      },
    );

    await service.handleWebhook(
      {
        sessionId: 'session-1',
        userId: 'user-a',
        violation: true,
      },
      {
        signature: 'sha256=abc123',
        timestamp: '1704067200000',
      },
    );

    expect(prisma.moderationEvent.create).toHaveBeenCalledTimes(1);
    expect(sessionService.endSession).toHaveBeenCalledTimes(1);
  });

  it('handles violations for both session users when userId missing', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      userAId: 'user-a',
      userBId: 'user-b',
    });
    prisma.moderationEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.moderationEvent.count.mockResolvedValue(0);

    await service.handleWebhook({
      sessionId: 'session-1',
      action: 'violation',
    });

    expect(prisma.moderationEvent.create).toHaveBeenCalledTimes(2);
    expect(sessionService.endSession).toHaveBeenCalled();
  });

  it('emits warn action when below threshold', async () => {
    prisma.moderationEvent.count.mockResolvedValue(1);

    await (service as any).applyModerationAction('user-1', 'reason');

    expect(await redis.get('moderation:ban:user-1')).toBeNull();
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('skips ban when cooldown already set', async () => {
    prisma.moderationEvent.count.mockResolvedValue(3);
    await redis.set('moderation:ban:cooldown:user-1', '1', 'PX', 1000, 'NX');

    await (service as any).applyModerationAction('user-1', 'reason');

    expect(await redis.get('moderation:ban:user-1')).toBeNull();
  });

  it('applies ban action when threshold exceeded', async () => {
    prisma.moderationEvent.count.mockResolvedValue(3);

    await (service as any).applyModerationAction('user-1', 'reason');

    expect(await redis.get('moderation:ban:user-1')).toBe('1');
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('resolves report and applies ban', async () => {
    prisma.moderationReport.update.mockResolvedValue({
      id: 'report-1',
      reporterId: 'user-x',
      reportedUserId: 'user-1',
      status: 'BANNED',
      reason: 'abuse',
    });
    prisma.block.findUnique.mockResolvedValue({
      id: 'block-1',
      blockerId: 'user-x',
      blockedId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      liftedAt: null,
    });

    const result = await service.resolveReport('report-1', 'ban');

    expect(result.status).toBe('BANNED');
    expect(await redis.get('moderation:ban:user-1')).toBe('1');
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('resolves report with warn action without banning', async () => {
    prisma.moderationReport.update.mockResolvedValue({
      id: 'report-2',
      reporterId: 'user-x',
      reportedUserId: 'user-2',
      status: 'WARNED',
      reason: 'abuse',
    });
    prisma.block.findUnique.mockResolvedValue({
      id: 'block-2',
      blockerId: 'user-x',
      blockedId: 'user-2',
      createdAt: new Date(),
      updatedAt: new Date(),
      liftedAt: null,
    });

    const result = await service.resolveReport('report-2', 'warn');

    expect(result.status).toBe('WARNED');
    expect(await redis.get('moderation:ban:user-2')).toBeNull();
  });
});
