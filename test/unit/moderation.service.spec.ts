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

    prisma.moderationReport.create.mockResolvedValue({
      id: 'report-1',
      reporterId: 'user-1',
      reportedUserId: 'user-2',
      reason: 'spam',
      details: 'details',
      status: 'OPEN',
      createdAt: new Date(),
    });

    const report = await service.createReport('user-1', {
      reportedUserId: 'user-2',
      reason: 'spam',
      details: 'details',
    } as any);

    expect(report.id).toBe('report-1');
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
  });

  it('rejects stale timestamps and invalid signatures', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';

    const raw = Buffer.from('payload');
    const oldTs = (Date.now() - 10 * 60 * 1000).toString();

    expect(() =>
      service.verifyWebhookSignature(raw, 'sha256=deadbeef', oldTs),
    ).toThrow(BadRequestException);

    expect(() =>
      service.verifyWebhookSignature(raw, 'sha256=deadbeef'),
    ).toThrow(BadRequestException);
  });

  it('accepts webhook signature with valid timestamp', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';
    const raw = Buffer.from('payload');
    const signature = createHmac('sha256', 'secret')
      .update(raw)
      .digest('hex');
    const timestamp = Date.now().toString();

    expect(() =>
      service.verifyWebhookSignature(raw, `sha256=${signature}`, timestamp),
    ).not.toThrow();
  });

  it('accepts valid webhook signature', () => {
    process.env.HIVE_WEBHOOK_SECRET = 'secret';
    const raw = Buffer.from('payload');
    const signature = createHmac('sha256', 'secret')
      .update(raw)
      .digest('hex');

    expect(() =>
      service.verifyWebhookSignature(raw, `sha256=${signature}`),
    ).not.toThrow();
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
      reportedUserId: 'user-1',
      status: 'BANNED',
      reason: 'abuse',
    });

    const result = await service.resolveReport('report-1', 'ban');

    expect(result.status).toBe('BANNED');
    expect(await redis.get('moderation:ban:user-1')).toBe('1');
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('resolves report with warn action without banning', async () => {
    prisma.moderationReport.update.mockResolvedValue({
      id: 'report-2',
      reportedUserId: 'user-2',
      status: 'WARNED',
      reason: 'abuse',
    });

    const result = await service.resolveReport('report-2', 'warn');

    expect(result.status).toBe('WARNED');
    expect(await redis.get('moderation:ban:user-2')).toBeNull();
  });
});
