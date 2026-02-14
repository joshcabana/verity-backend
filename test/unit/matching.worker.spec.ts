import { Test } from '@nestjs/testing';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { MatchingWorker } from '../../src/queue/matching.worker';
import { QueueGateway, QueueService } from '../../src/queue/queue.service';

describe('MatchingWorker (unit)', () => {
  const originalEnv = { ...process.env };
  let worker: MatchingWorker;
  let queueService: {
    popPair: jest.Mock;
    validatePair: jest.Mock;
    lockUsers: jest.Mock;
    createSession: jest.Mock;
    markMatched: jest.Mock;
    releaseUserLocks: jest.Mock;
    cleanupQueueKey: jest.Mock;
    cleanupExpiredSessions: jest.Mock;
    getQueueSize: jest.Mock;
  };
  let gateway: { emitMatch: jest.Mock; emitQueueStatus: jest.Mock };
  let notificationsService: { notifyUsers: jest.Mock };
  let analyticsService: { trackServerEvent: jest.Mock };
  let redis: { smembers: jest.Mock };

  beforeEach(async () => {
    queueService = {
      popPair: jest.fn(),
      validatePair: jest.fn(),
      lockUsers: jest.fn(),
      createSession: jest.fn(),
      markMatched: jest.fn(),
      releaseUserLocks: jest.fn(),
      cleanupQueueKey: jest.fn(),
      cleanupExpiredSessions: jest.fn(),
      getQueueSize: jest.fn(),
    };
    gateway = { emitMatch: jest.fn(), emitQueueStatus: jest.fn() };
    notificationsService = { notifyUsers: jest.fn() };
    analyticsService = { trackServerEvent: jest.fn() };
    redis = { smembers: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingWorker,
        { provide: QueueService, useValue: queueService },
        { provide: QueueGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    worker = moduleRef.get(MatchingWorker);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    worker.onModuleDestroy();
  });

  it('skips scheduling when worker is disabled by env', () => {
    process.env.ENABLE_MATCHING_WORKER = 'false';

    worker.onModuleInit();

    expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('dispatches queue match notification when a pair is matched', async () => {
    const locks = new Map<string, string>([
      ['user-a', 'lock-a'],
      ['user-b', 'lock-b'],
    ]);
    redis.smembers.mockResolvedValue(['au:hash']);
    queueService.popPair
      .mockResolvedValueOnce({
        userA: 'user-a',
        userB: 'user-b',
        scoreA: 1,
        scoreB: 2,
      })
      .mockResolvedValue(null);
    queueService.validatePair.mockResolvedValue({
      userA: 'user-a',
      userB: 'user-b',
    });
    queueService.lockUsers.mockResolvedValue(locks);
    queueService.createSession.mockResolvedValue({
      id: 'session-1',
      queueKey: 'au:hash',
    });
    queueService.getQueueSize.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(gateway.emitMatch).toHaveBeenCalledWith(
      'user-a',
      'user-b',
      expect.objectContaining({ id: 'session-1' }),
    );
    expect(notificationsService.notifyUsers).toHaveBeenCalledWith(
      ['user-a', 'user-b'],
      'queue_match_found',
      expect.objectContaining({
        sessionId: 'session-1',
        queueKey: 'au:hash',
      }),
    );
    expect(gateway.emitQueueStatus).toHaveBeenCalledWith('au:hash');
  });

  it('does not emit queue status when queue size is unchanged', async () => {
    redis.smembers.mockResolvedValue(['au:hash']);
    queueService.popPair.mockResolvedValue(null);
    queueService.getQueueSize.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(gateway.emitQueueStatus).not.toHaveBeenCalled();
  });
});
