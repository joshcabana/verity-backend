import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Session } from '@prisma/client';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { SessionService } from '../../src/session/session.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { VideoService } from '../../src/video/video.service';
import { VideoGateway } from '../../src/video/video.gateway';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createRedisMock } from '../mocks/redis.mock';

const baseSession: Session = {
  id: 'session-1',
  userAId: 'user-a',
  userBId: 'user-b',
  region: 'na',
  queueKey: 'na:test',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const sessionStateJson = (endAt: string) =>
  JSON.stringify({
    sessionId: 'session-1',
    userAId: 'user-a',
    userBId: 'user-b',
    channelName: 'channel-1',
    startAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    endAt,
  });

describe('SessionService (unit)', () => {
  let service: SessionService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let videoService: { buildSessionTokens: jest.Mock };
  let videoGateway: any;
  let notificationsService: { notifyUsers: jest.Mock };
  let analyticsService: { trackServerEvent: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    prisma = createPrismaMock();
    redis = createRedisMock();
    videoService = {
      buildSessionTokens: jest.fn().mockReturnValue({
        channelName: 'channel-1',
        expiresAt: new Date(Date.now() + 60_000),
        byUser: {
          'user-a': {
            rtcToken: 'rtc-a',
            rtmToken: 'rtm-a',
            rtcUid: 1,
            rtmUserId: 'user-a',
          },
          'user-b': {
            rtcToken: 'rtc-b',
            rtmToken: 'rtm-b',
            rtcUid: 2,
            rtmUserId: 'user-b',
          },
        },
      }),
    };
    videoGateway = {
      emitSessionStart: jest.fn(),
      emitSessionEnd: jest.fn(),
      server: {
        to: jest.fn(() => ({
          emit: jest.fn(),
        })),
      },
    };
    notificationsService = { notifyUsers: jest.fn() };
    analyticsService = { trackServerEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: VideoService, useValue: videoService },
        { provide: VideoGateway, useValue: videoGateway },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: AnalyticsService, useValue: analyticsService },
      ],
    }).compile();

    service = moduleRef.get(SessionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('returns early when session lock is not acquired', async () => {
    await redis.set('session:lock:session-1', '1', 'PX', 1000);

    await service.handleSessionCreated(baseSession);

    expect(videoService.buildSessionTokens).not.toHaveBeenCalled();
  });

  it('persists state and emits start on session creation', async () => {
    await service.handleSessionCreated(baseSession);

    const state = await redis.get('session:state:session-1');
    expect(state).toBeTruthy();
    expect(videoGateway.emitSessionStart).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('calls endSession on token error', async () => {
    const endSpy = jest
      .spyOn(service, 'endSession')
      .mockResolvedValue();
    videoService.buildSessionTokens.mockImplementation(() => {
      throw new Error('token error');
    });

    await service.handleSessionCreated(baseSession);

    expect(endSpy).toHaveBeenCalledWith(baseSession, 'token_error');
  });

  it('endSession is idempotent when already ended', async () => {
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    await service.endSession(baseSession);

    expect(videoGateway.emitSessionEnd).not.toHaveBeenCalled();
  });

  it('endSession clears active keys and schedules choice timeout', async () => {
    await redis.set('session:active:user-a', 'session-1');
    await redis.set('session:active:user-b', 'session-1');

    await service.endSession(baseSession, 'ended');

    expect(await redis.get('session:active:user-a')).toBeNull();
    expect(await redis.get('session:active:user-b')).toBeNull();
    expect(videoGateway.emitSessionEnd).toHaveBeenCalledTimes(2);
    expect(await redis.get('session:choice:deadline:session-1')).toBeTruthy();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('submitChoice validates session and participant', async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(
      service.submitChoice('session-1', 'user-a', 'MATCH'),
    ).rejects.toThrow(NotFoundException);

    prisma.session.findUnique.mockResolvedValue(baseSession);

    await expect(
      service.submitChoice('session-1', 'user-c', 'MATCH'),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.submitChoice('session-1', 'user-a', 'MATCH'),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns pending when only one MATCH before deadline', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    const result = await service.submitChoice('session-1', 'user-a', 'MATCH');

    expect(result.status).toBe('pending');
    expect(result).toHaveProperty('deadline');
  });

  it('uses existing deadline when provided', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    const deadline = new Date(Date.now() + 30_000).toISOString();
    await redis.set('session:choice:deadline:session-1', deadline, 'PX', 1000);

    const result = await service.submitChoice('session-1', 'user-a', 'MATCH');

    expect(result.status).toBe('pending');
    expect(result.deadline).toBe(deadline);
  });

  it('returns resolved when choice already stored', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    await redis.hset('session:choice:session-1', 'user-a', 'MATCH');
    await redis.hset('session:choice:session-1', 'user-b', 'PASS');

    const result = await service.submitChoice('session-1', 'user-a', 'MATCH');

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('non_mutual');
  });

  it('finalizes when deadline has passed', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    const past = new Date(Date.now() - 1000).toISOString();
    await redis.set('session:choice:deadline:session-1', past, 'PX', 1000);

    const result = await service.submitChoice('session-1', 'user-a', 'MATCH');

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('non_mutual');
  });

  it('resolves mutual match and emits events', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    prisma.match.upsert.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('mutual');
    expect(result.matchId).toBe('match-1');
    expect(videoGateway.server.to).toHaveBeenCalled();
    expect(notificationsService.notifyUsers).toHaveBeenCalledWith(
      ['user-a', 'user-b'],
      'match_mutual',
      expect.objectContaining({
        sessionId: 'session-1',
        matchId: 'match-1',
      }),
    );
  });

  it('uses existing match on mutual decision', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    prisma.match.upsert.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.outcome).toBe('mutual');
    expect(prisma.match.upsert).toHaveBeenCalledWith({
      where: {
        userAId_userBId: {
          userAId: 'user-a',
          userBId: 'user-b',
        },
      },
      update: {},
      create: {
        userAId: 'user-a',
        userBId: 'user-b',
      },
    });
  });

  it('resolves non-mutual when PASS is submitted', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    const result = await service.submitChoice('session-1', 'user-a', 'PASS');

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('non_mutual');
  });

  it('returns cached decision if already stored', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    await redis.set(
      'session:decision:session-1',
      JSON.stringify({ status: 'resolved', outcome: 'non_mutual' }),
      'PX',
      1000,
    );

    const result = await service.submitChoice('session-1', 'user-a', 'MATCH');

    expect(result.outcome).toBe('non_mutual');
    expect(prisma.match.create).not.toHaveBeenCalled();
  });

  it('skips emit when gateway server missing', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    prisma.match.upsert.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    videoGateway.server = undefined;

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.outcome).toBe('mutual');
  });

  it('recovers overdue endSession on module init', async () => {
    const overdueEndAt = new Date(Date.now() - 1000).toISOString();
    await redis.set(
      'session:state:session-1',
      sessionStateJson(overdueEndAt),
      'PX',
      60 * 60 * 1000,
    );
    await redis.set('session:active:user-a', 'session-1');
    await redis.set('session:active:user-b', 'session-1');

    await service.onModuleInit();

    expect(await redis.get('session:ended:session-1')).toBe('1');
    expect(await redis.get('session:active:user-a')).toBeNull();
    expect(await redis.get('session:active:user-b')).toBeNull();
    expect(videoGateway.emitSessionEnd).toHaveBeenCalledTimes(2);
  });

  it('reschedules future session end on module init', async () => {
    const futureEndAt = new Date(Date.now() + 5000).toISOString();
    await redis.set(
      'session:state:session-1',
      sessionStateJson(futureEndAt),
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    expect(videoGateway.emitSessionEnd).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await jest.advanceTimersByTimeAsync(5000);

    expect(await redis.get('session:ended:session-1')).toBe('1');
    expect(videoGateway.emitSessionEnd).toHaveBeenCalledTimes(2);
  });

  it('uses SCAN and not KEYS during recovery', async () => {
    const scanSpy = jest.spyOn(redis as any, 'scan');
    const keysSpy = jest.spyOn(redis as any, 'keys');
    await redis.set(
      'session:state:session-1',
      sessionStateJson(new Date(Date.now() + 5000).toISOString()),
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    expect(scanSpy).toHaveBeenCalled();
    expect(keysSpy).not.toHaveBeenCalled();
  });

  it('skips recovery when stored decision is already resolved', async () => {
    const finalized = JSON.stringify({
      status: 'resolved',
      outcome: 'non_mutual',
    });
    const finalizeSpy = jest.spyOn(service as any, 'finalizeDecision');
    await redis.set(
      'session:choice:deadline:session-1',
      new Date(Date.now() - 1000).toISOString(),
      'PX',
      60 * 60 * 1000,
    );
    await redis.set(
      'session:decision:session-1',
      finalized,
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    expect(finalizeSpy).not.toHaveBeenCalled();
    expect(await redis.get('session:decision:session-1')).toBe(finalized);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('finalizes pending stored decision when pending deadline has passed', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    await redis.set(
      'session:choice:deadline:session-1',
      new Date(Date.now() + 60_000).toISOString(),
      'PX',
      60 * 60 * 1000,
    );
    await redis.set(
      'session:decision:session-1',
      JSON.stringify({
        status: 'pending',
        deadline: new Date(Date.now() - 1000).toISOString(),
      }),
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    const decision = await redis.get('session:decision:session-1');
    expect(decision).toBeTruthy();
    expect(JSON.parse(decision as string)).toMatchObject({
      status: 'resolved',
      outcome: 'non_mutual',
    });
  });

  it('reschedules from pending stored decision deadline when still in future', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    const pendingDeadline = new Date(Date.now() + 5000).toISOString();
    await redis.set(
      'session:choice:deadline:session-1',
      new Date(Date.now() - 1000).toISOString(),
      'PX',
      60 * 60 * 1000,
    );
    await redis.set(
      'session:decision:session-1',
      JSON.stringify({
        status: 'pending',
        deadline: pendingDeadline,
      }),
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    expect(jest.getTimerCount()).toBeGreaterThan(0);
    const pending = await redis.get('session:decision:session-1');
    expect(JSON.parse(pending as string)).toMatchObject({
      status: 'pending',
      deadline: pendingDeadline,
    });

    await jest.advanceTimersByTimeAsync(5000);

    const resolved = await redis.get('session:decision:session-1');
    expect(JSON.parse(resolved as string)).toMatchObject({
      status: 'resolved',
      outcome: 'non_mutual',
    });
  });

  it('finalizes overdue choice window on module init', async () => {
    await redis.set(
      'session:state:session-1',
      sessionStateJson(new Date(Date.now() - 60_000).toISOString()),
      'PX',
      60 * 60 * 1000,
    );
    await redis.set('session:ended:session-1', '1', 'PX', 60 * 60 * 1000, 'NX');
    await redis.set(
      'session:choice:deadline:session-1',
      new Date(Date.now() - 1000).toISOString(),
      'PX',
      60 * 60 * 1000,
    );

    await service.onModuleInit();

    const decision = await redis.get('session:decision:session-1');
    expect(decision).toBeTruthy();
    expect(JSON.parse(decision as string)).toMatchObject({
      status: 'resolved',
      outcome: 'non_mutual',
    });
    expect(prisma.match.upsert).not.toHaveBeenCalled();
  });

  it('logs recovery summaries with counts and duration', async () => {
    const logger = (service as any).logger;
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();

    await service.onModuleInit();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Session recovery summary'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Choice recovery summary'),
    );
  });

  it('truncates recovery work when scan budget is exceeded', async () => {
    const logger = (service as any).logger;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();
    const baseScan = (redis as any).scan.bind(redis);
    jest.spyOn(redis as any, 'scan').mockImplementation(
      async (cursor: string | number, ...args: Array<string | number>) => {
        const pattern = String(args[1] ?? '');
        if (pattern === 'session:state:*' && String(cursor) === '0') {
          const oversized = Array.from(
            { length: 10_050 },
            (_, index) => `session:state:session-${index}`,
          );
          return ['0', oversized] as [string, string[]];
        }
        return baseScan(cursor, ...args);
      },
    );

    await service.onModuleInit();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Session recovery truncated'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('truncated=true'),
    );
  });

  it('cleanupExpiredSessions logs when deletions occur', async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation();

    await service.cleanupExpiredSessions();

    expect(prisma.session.deleteMany).toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalled();
  });
});
