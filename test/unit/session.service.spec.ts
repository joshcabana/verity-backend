import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Session } from '@prisma/client';
import { SessionService } from '../../src/session/session.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { VideoService } from '../../src/video/video.service';
import { VideoGateway } from '../../src/video/video.gateway';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
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

describe('SessionService (unit)', () => {
  let service: SessionService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let videoService: { buildSessionTokens: jest.Mock };
  let videoGateway: any;

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: VideoService, useValue: videoService },
        { provide: VideoGateway, useValue: videoGateway },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(SessionService);
  });

  afterEach(() => {
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
    prisma.match.findUnique.mockResolvedValue(null);
    prisma.match.create.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.status).toBe('resolved');
    expect(result.outcome).toBe('mutual');
    expect(result.matchId).toBe('match-1');
    expect(videoGateway.server.to).toHaveBeenCalled();
  });

  it('uses existing match on mutual decision', async () => {
    prisma.session.findUnique.mockResolvedValue(baseSession);
    prisma.match.findUnique.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.outcome).toBe('mutual');
    expect(prisma.match.create).not.toHaveBeenCalled();
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
    prisma.match.findUnique.mockResolvedValue({ id: 'match-1' });
    await redis.set('session:ended:session-1', '1', 'PX', 1000, 'NX');
    videoGateway.server = undefined;

    await service.submitChoice('session-1', 'user-a', 'MATCH');
    const result = await service.submitChoice('session-1', 'user-b', 'MATCH');

    expect(result.outcome).toBe('mutual');
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
