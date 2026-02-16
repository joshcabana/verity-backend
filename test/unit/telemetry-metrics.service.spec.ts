import { TelemetryMetricsService } from '../../src/telemetry/telemetry-metrics.service';
import { createPrismaMock } from '../mocks/prisma.mock';

describe('TelemetryMetricsService (unit)', () => {
  it('computes stage-gate metrics from canonical events', async () => {
    const prisma = createPrismaMock();
    const alertsService = { evaluateAndAlert: jest.fn() };

    prisma.telemetryGateSnapshot.findFirst.mockResolvedValue(null);
    prisma.analyticsEvent.findMany.mockResolvedValue([
      { eventName: 'queue_match_found', properties: { waitSeconds: 20 } },
      { eventName: 'queue_match_found', properties: { waitSeconds: 80 } },
      { eventName: 'queue_joined', properties: {} },
      { eventName: 'queue_joined', properties: {} },
      { eventName: 'queue_left', properties: { reason: 'manual' } },
      { eventName: 'session_started', properties: {} },
      { eventName: 'session_started', properties: {} },
      { eventName: 'session_ended', properties: { durationSeconds: 50 } },
      { eventName: 'session_ended', properties: { durationSeconds: 20 } },
      { eventName: 'session_result', properties: { result: 'mutual_match' } },
      { eventName: 'session_result', properties: { result: 'non_mutual' } },
      { eventName: 'match_chat_opened', properties: {} },
      {
        eventName: 'safety_action_taken',
        properties: { action: 'ban', actionLatencyMs: 1000 },
      },
      {
        eventName: 'safety_action_taken',
        properties: { action: 'warn', actionLatencyMs: 500 },
      },
      {
        eventName: 'safety_appeal_resolved',
        properties: { resolution: 'overturned' },
      },
    ]);

    const service = new TelemetryMetricsService(
      prisma as any,
      alertsService as any,
    );

    const view = await service.getStageGateView();

    expect(view.metrics.waitP50Seconds).toBe(20);
    expect(view.metrics.waitP90Seconds).toBe(80);
    expect(view.metrics.abandonmentRate).toBeCloseTo(0.5, 5);
    expect(view.metrics.completionRate).toBeCloseTo(0.5, 5);
    expect(view.metrics.mutualMatchRate).toBeCloseTo(0.5, 5);
    expect(view.metrics.chatActivationRate).toBeCloseTo(1, 5);
    expect(view.metrics.severeIncidentPer10k).toBeCloseTo(5000, 5);
    expect(view.metrics.appealOverturnRate).toBeCloseTo(1, 5);
    expect(view.metrics.severeActionLatencyP95).toBe(1000);

    expect(prisma.telemetryGateSnapshot.create).toHaveBeenCalled();
  });
});
