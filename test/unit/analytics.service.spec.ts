import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import {
  createPrismaMock,
  createPrismaUniqueError,
} from '../mocks/prisma.mock';

describe('AnalyticsService (unit)', () => {
  let service: AnalyticsService;
  let infoSpy: jest.SpyInstance;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.analyticsEvent.create.mockResolvedValue({ id: 'event-1' });
    prisma.analyticsIngestHourly.upsert.mockResolvedValue({ id: 'hour-1' });

    service = new AnalyticsService(prisma as any);
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    jest.useRealTimers();
  });

  it('accepts supported events with safe properties', async () => {
    const result = await service.trackClientEvent('user-1', {
      name: 'queue_joined',
      properties: {
        queueKey: 'au:abc',
        position: 1,
        retry: false,
      },
    });

    expect(result.accepted).toBe(true);
    expect(prisma.analyticsEvent.create).toHaveBeenCalled();
    expect(prisma.analyticsIngestHourly.upsert).toHaveBeenCalled();

    const payload = JSON.parse(infoSpy.mock.calls.at(-1)?.[0] as string);
    expect(payload.eventName).toBe('queue_joined');
    expect(payload.source).toBe('web');
    expect(payload.eventSchemaVersion).toBe(1);
  });

  it('rejects unsupported schema versions', async () => {
    await expect(
      service.trackClientEvent(
        'user-1',
        {
          name: 'queue_timeout_shown',
          properties: {
            queueKey: 'canberra:abc123',
            elapsedSeconds: 45,
          },
        },
        {
          eventSchemaVersion: 2,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('drops impossible timestamps with skew guard', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-16T00:00:00.000Z'));

    await expect(
      service.trackClientEvent(
        'user-1',
        {
          name: 'queue_match_found',
          properties: {
            queueKey: 'canberra:abc123',
            waitSeconds: 12,
          },
        },
        {
          occurredAt: '2025-02-16T00:00:00.000Z',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('dedupes duplicate eventIds', async () => {
    prisma.analyticsEvent.create
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockRejectedValueOnce(createPrismaUniqueError());

    const eventId = '7cbf25b3-d070-4697-8515-8e86f39b9f7c';

    const first = await service.trackClientEvent(
      'user-1',
      {
        name: 'queue_joined',
        properties: {
          queueKey: 'au:abc',
        },
      },
      { eventId },
    );
    const second = await service.trackClientEvent(
      'user-1',
      {
        name: 'queue_joined',
        properties: {
          queueKey: 'au:abc',
        },
      },
      { eventId },
    );

    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: false, droppedReason: 'duplicate_event_id' });
  });
});
