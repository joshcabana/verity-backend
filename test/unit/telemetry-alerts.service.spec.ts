import { TelemetryAlertsService } from '../../src/telemetry/telemetry-alerts.service';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createRedisMock } from '../mocks/redis.mock';

describe('TelemetryAlertsService (unit)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('sends auto-pause alert for severe incident breach and respects cooldown', async () => {
    process.env.TELEMETRY_ALERT_WEBHOOK_URL = 'https://hooks.slack.test';
    process.env.TELEMETRY_ALERT_ESCALATION_OWNER = 'oncall-verity';

    const prisma = createPrismaMock();
    const redis = createRedisMock();
    prisma.moderationAppeal.count.mockResolvedValue(0);

    const fetchSpy = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

    const service = new TelemetryAlertsService(prisma as any, redis as any);

    const snapshot = {
      windowStart: new Date('2026-02-16T00:00:00.000Z'),
      windowEnd: new Date('2026-02-17T00:00:00.000Z'),
      waitP50Seconds: 20,
      waitP90Seconds: 90,
      abandonmentRate: 0.1,
      completionRate: 0.9,
      mutualMatchRate: 0.2,
      chatActivationRate: 0.6,
      severeIncidentPer10k: 6,
      appealOverturnRate: 0.1,
      severeActionLatencyP95: 1000,
      stage0Status: 'GREEN' as const,
      stage1Status: 'GREEN' as const,
      stage2Status: 'AMBER' as const,
      autoPauseTriggered: true,
      autoPauseReasons: ['severe_incidents_over_5_per_10k'],
    };

    const first = await service.evaluateAndAlert(snapshot);
    const second = await service.evaluateAndAlert(snapshot);

    expect(first.triggered).toBe(true);
    expect(first.sent).toBe(true);
    expect(second.triggered).toBe(true);
    expect(second.sent).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
