import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { QueueGateway, QueueService } from '../../src/queue/queue.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SessionService } from '../../src/session/session.service';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createRedisMock } from '../mocks/redis.mock';

describe('QueueService (unit)', () => {
  let service: QueueService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let sessionService: { handleSessionCreated: jest.Mock; cleanupExpiredSessions: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    redis = createRedisMock();
    sessionService = {
      handleSessionCreated: jest.fn(),
      cleanupExpiredSessions: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: PrismaService, useValue: prisma },
        { provide: SessionService, useValue: sessionService },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(QueueService);
  });

  it('throws when region is empty', () => {
    expect(() => service.buildQueueKey('')).toThrow(BadRequestException);
  });

  it('blocks banned users from joining', async () => {
    await redis.set('moderation:ban:user-1', '1');

    await expect(
      service.joinQueue('user-1', { region: 'na' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns already_queued when lock contention and state exists', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    const queueUserKey = `queue:user:user-1`;
    const zsetKey = `queue:zset:${queueKey}`;

    await redis.set(`queue:lock:user-1`, 'locked', 'PX', 3000, 'NX');
    await redis.set(queueUserKey, JSON.stringify({ queueKey, joinedAt: 1 }));
    await redis.zadd(zsetKey, 1, 'user-1');

    const result = await service.joinQueue('user-1', { region: 'na' });

    expect(result.status).toBe('already_queued');
    expect(result.queueKey).toBe(queueKey);
    expect(result.position).toBe(0);
  });

  it('throws conflict when lock contention and no state', async () => {
    await redis.set(`queue:lock:user-1`, 'locked', 'PX', 3000, 'NX');

    await expect(
      service.joinQueue('user-1', { region: 'na' }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns already_queued when already in queue after lock acquired', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    const queueUserKey = `queue:user:user-1`;
    const zsetKey = `queue:zset:${queueKey}`;

    await redis.set(queueUserKey, JSON.stringify({ queueKey, joinedAt: 1 }));
    await redis.zadd(zsetKey, 1, 'user-1');

    const result = await service.joinQueue('user-1', { region: 'na' });

    expect(result.status).toBe('already_queued');
    expect(result.queueKey).toBe(queueKey);
  });

  it('throws when insufficient token balance', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.joinQueue('user-1', { region: 'na' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('joins queue and returns position on success', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.joinQueue('user-1', { region: 'na' });

    expect(result.status).toBe('queued');
    expect(result.position).toBe(0);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });

  it('refunds token when redis multi fails', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({ id: 'user-1' });
    redis.failExec = true;

    await expect(
      service.joinQueue('user-1', { region: 'na' }),
    ).rejects.toThrow(Error);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenBalance: { increment: 1 } },
    });
  });

  it('returns not_queued when leaving without state', async () => {
    const result = await service.leaveQueue('user-1');

    expect(result.status).toBe('not_queued');
    expect(result.refunded).toBe(false);
  });

  it('does not refund when user entry missing from zset', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    const queueUserKey = `queue:user:user-1`;

    await redis.set(queueUserKey, JSON.stringify({ queueKey, joinedAt: 1 }));

    const result = await service.leaveQueue('user-1');

    expect(result.status).toBe('left');
    expect(result.refunded).toBe(false);
  });

  it('refunds token when leaving queue and not matched', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-1' });

    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    const queueUserKey = `queue:user:user-1`;
    const zsetKey = `queue:zset:${queueKey}`;

    await redis.set(queueUserKey, JSON.stringify({ queueKey, joinedAt: 1 }));
    await redis.zadd(zsetKey, 1, 'user-1');

    const result = await service.leaveQueue('user-1');

    expect(result.status).toBe('left');
    expect(result.refunded).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('returns already_matched when matched on leave', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    const queueUserKey = `queue:user:user-1`;
    const zsetKey = `queue:zset:${queueKey}`;

    await redis.set(queueUserKey, JSON.stringify({ queueKey, joinedAt: 1 }));
    await redis.zadd(zsetKey, 1, 'user-1');
    await redis.set(`queue:matched:user-1`, 'session-1');

    const result = await service.leaveQueue('user-1');

    expect(result.status).toBe('already_matched');
    expect(result.refunded).toBe(false);
  });

  it('returns null when both users missing during validatePair', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });

    const result = await service.validatePair(queueKey, {
      userA: 'user-a',
      userB: 'user-b',
      scoreA: 1,
      scoreB: 2,
    });

    expect(result).toBeNull();
  });

  it('requeues missing users in validatePair', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.set(
      `queue:user:user-b`,
      JSON.stringify({ queueKey, joinedAt: 2 }),
    );

    const result = await service.validatePair(queueKey, {
      userA: 'user-a',
      userB: 'user-b',
      scoreA: 1,
      scoreB: 2,
    });

    expect(result).toBeNull();
    const rank = await redis.zrank(`queue:zset:${queueKey}`, 'user-b');
    expect(rank).toBe(0);
  });

  it('requeues when userB state is missing', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.set(
      `queue:user:user-a`,
      JSON.stringify({ queueKey, joinedAt: 1 }),
    );

    const result = await service.validatePair(queueKey, {
      userA: 'user-a',
      userB: 'user-b',
      scoreA: 1,
      scoreB: 2,
    });

    expect(result).toBeNull();
    const rank = await redis.zrank(`queue:zset:${queueKey}`, 'user-a');
    expect(rank).toBe(0);
  });

  it('returns pair when both users exist', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.set(
      `queue:user:user-a`,
      JSON.stringify({ queueKey, joinedAt: 1 }),
    );
    await redis.set(
      `queue:user:user-b`,
      JSON.stringify({ queueKey, joinedAt: 2 }),
    );

    const result = await service.validatePair(queueKey, {
      userA: 'user-a',
      userB: 'user-b',
      scoreA: 1,
      scoreB: 2,
    });

    expect(result).toEqual({ userA: 'user-a', userB: 'user-b' });
  });

  it('pops a pair from the queue', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.zadd(`queue:zset:${queueKey}`, 1, 'user-a', 2, 'user-b');

    const result = await service.popPair(queueKey);

    expect(result).toEqual({
      userA: 'user-a',
      scoreA: 1,
      userB: 'user-b',
      scoreB: 2,
    });
  });

  it('returns null when not enough entries to pop', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.zadd(`queue:zset:${queueKey}`, 1, 'user-a');

    const result = await service.popPair(queueKey);

    expect(result).toBeNull();
  });

  it('releases acquired locks when lockUsers fails mid-way', async () => {
    await redis.set(`queue:lock:user-b`, 'locked', 'PX', 3000, 'NX');

    const result = await service.lockUsers(['user-a', 'user-b']);

    expect(result).toBeNull();
    const lockA = await redis.get(`queue:lock:user-a`);
    expect(lockA).toBeNull();
  });

  it('returns locks when lockUsers succeeds', async () => {
    const result = await service.lockUsers(['user-a', 'user-b']);

    expect(result).toBeInstanceOf(Map);
    expect(result?.size).toBe(2);
  });

  it('removes empty queue key from set', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.sadd('queue:keys', queueKey);

    await service.cleanupQueueKey(queueKey);

    const remaining = await redis.srem('queue:keys', queueKey);
    expect(remaining).toBe(0);
  });

  it('keeps queue key when entries remain', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });
    await redis.sadd('queue:keys', queueKey);
    await redis.zadd(`queue:zset:${queueKey}`, 1, 'user-a');

    await service.cleanupQueueKey(queueKey);

    const removed = await redis.srem('queue:keys', queueKey);
    expect(removed).toBe(1);
  });

  it('requeues a pair into the queue', async () => {
    const queueKey = service.buildQueueKey('na', { mode: 'standard' });

    await service.requeuePair(queueKey, {
      userA: 'user-a',
      userB: 'user-b',
      scoreA: 1,
      scoreB: 2,
    });

    expect(await redis.zrank(`queue:zset:${queueKey}`, 'user-a')).toBe(0);
    expect(await redis.zrank(`queue:zset:${queueKey}`, 'user-b')).toBe(1);
  });

  it('creates session and triggers session handler', async () => {
    prisma.session.create.mockResolvedValue({
      id: 'session-1',
      userAId: 'user-a',
      userBId: 'user-b',
      region: 'na',
      queueKey: 'na:test',
    });

    const session = await service.createSession('user-a', 'user-b', 'na:test');

    expect(session.id).toBe('session-1');
    expect(sessionService.handleSessionCreated).toHaveBeenCalled();
  });

  it('marks users as matched and clears queue state', async () => {
    await redis.set('queue:user:user-a', JSON.stringify({ queueKey: 'na:1', joinedAt: 1 }));
    await redis.set('queue:user:user-b', JSON.stringify({ queueKey: 'na:1', joinedAt: 1 }));

    await service.markMatched('user-a', 'user-b', 'session-1');

    expect(await redis.get('queue:user:user-a')).toBeNull();
    expect(await redis.get('queue:matched:user-a')).toBe('session-1');
    expect(await redis.get('queue:matched:user-b')).toBe('session-1');
  });

  it('delegates cleanup of expired sessions', async () => {
    await service.cleanupExpiredSessions();

    expect(sessionService.cleanupExpiredSessions).toHaveBeenCalled();
  });

  it('throws conflict when leaveQueue cannot acquire lock', async () => {
    await redis.set('queue:lock:user-1', 'locked', 'PX', 3000, 'NX');

    await expect(service.leaveQueue('user-1')).rejects.toThrow(ConflictException);
  });
});

describe('QueueGateway (unit)', () => {
  const originalEnv = { ...process.env };
  let gateway: QueueGateway;
  let queueService: { leaveQueue: jest.Mock };

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    queueService = { leaveQueue: jest.fn() };
    gateway = new QueueGateway(queueService as any);
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as any;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('authenticates socket with bearer token', () => {
    const jwt = new JwtService({ secret: 'test-secret' });
    const token = jwt.sign({ sub: 'user-1' }, { secret: 'test-secret' });
    const client = {
      handshake: { headers: { authorization: `Bearer ${token}` } },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    gateway.handleConnection(client);

    expect(client.data.userId).toBe('user-1');
    expect(client.join).toHaveBeenCalledWith('user:user-1');
  });

  it('disconnects when token missing or invalid', () => {
    const clientMissing = {
      handshake: { headers: {} },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    gateway.handleConnection(clientMissing);
    expect(clientMissing.disconnect).toHaveBeenCalledWith(true);

    const clientInvalid = {
      handshake: { auth: { token: 'bad' } },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    gateway.handleConnection(clientInvalid);
    expect(clientInvalid.disconnect).toHaveBeenCalledWith(true);
  });

  it('calls leaveQueue on disconnect when userId present', async () => {
    const client = {
      data: { userId: 'user-1' },
    } as any;

    await gateway.handleDisconnect(client);

    expect(queueService.leaveQueue).toHaveBeenCalledWith('user-1');
  });

  it('emits match payload to both users', () => {
    gateway.emitMatch('user-a', 'user-b', {
      id: 'session-1',
      queueKey: 'na:test',
      createdAt: new Date(),
    } as any);

    expect((gateway.server as any).to).toHaveBeenCalledWith('user:user-a');
    expect((gateway.server as any).to).toHaveBeenCalledWith('user:user-b');
  });
});
