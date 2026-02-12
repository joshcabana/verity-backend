import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../../src/analytics/analytics.service';

describe('AnalyticsService (unit)', () => {
  let service: AnalyticsService;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new AnalyticsService();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('accepts supported events with safe properties', () => {
    service.trackClientEvent('user-1', {
      name: 'queue_joined',
      properties: {
        queueKey: 'au:abc',
        position: 1,
        retry: false,
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(payload.name).toBe('queue_joined');
    expect(payload.source).toBe('web');
  });

  it('accepts queue timeout events', () => {
    service.trackClientEvent('user-1', {
      name: 'queue_timeout_shown',
      properties: {
        queueKey: 'canberra:abc123',
        elapsedSeconds: 45,
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(payload.name).toBe('queue_timeout_shown');
  });

  it('rejects unsupported event names', () => {
    expect(() =>
      service.trackClientEvent('user-1', {
        name: 'unknown_event',
        properties: {},
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects blocked pii-like property keys', () => {
    expect(() =>
      service.trackServerEvent({
        userId: 'user-1',
        name: 'message_sent',
        properties: {
          text: 'hello',
        },
      }),
    ).toThrow(BadRequestException);
  });
});
