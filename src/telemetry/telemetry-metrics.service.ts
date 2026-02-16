import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryAlertsService } from './telemetry-alerts.service';
import type { StageGateSnapshot, StageGateView, StageStatus } from './telemetry.types';

const SNAPSHOT_WINDOW_HOURS = 24;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class TelemetryMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryMetricsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: TelemetryAlertsService,
  ) {}

  onModuleInit() {
    if (!this.isWorkerProcess()) {
      return;
    }

    void this.computePersistAndAlert();
    this.timer = setInterval(() => {
      void this.computePersistAndAlert();
    }, SNAPSHOT_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async getStageGateView(): Promise<StageGateView> {
    const latest = await this.prisma.telemetryGateSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      const computed = await this.computeAndPersistSnapshot();
      return this.toView(computed);
    }

    return {
      windowStart: latest.windowStart.toISOString(),
      windowEnd: latest.windowEnd.toISOString(),
      metrics: {
        waitP50Seconds: latest.waitP50Seconds,
        waitP90Seconds: latest.waitP90Seconds,
        abandonmentRate: latest.abandonmentRate,
        completionRate: latest.completionRate,
        mutualMatchRate: latest.mutualMatchRate,
        chatActivationRate: latest.chatActivationRate,
        severeIncidentPer10k: latest.severeIncidentPer10k,
        appealOverturnRate: latest.appealOverturnRate,
        severeActionLatencyP95: latest.severeActionLatencyP95,
      },
      statuses: {
        stage0: latest.stage0Status as StageStatus,
        stage1: latest.stage1Status as StageStatus,
        stage2: latest.stage2Status as StageStatus,
      },
      autoPause: {
        triggered: latest.autoPauseTriggered,
        reasons: this.parseReasons(latest.autoPauseReasons),
      },
    };
  }

  async emitSyntheticBackendEvents(userId = 'synthetic-user') {
    const now = new Date();
    const matchId = `synthetic-match-${Date.now()}`;
    const sessionId = `synthetic-session-${Date.now()}`;
    const queueKey = 'synthetic:default';

    const synthetic = [
      {
        name: 'queue_joined',
        properties: { queueKey, usersSearchingSnapshot: 3 },
      },
      {
        name: 'queue_match_found',
        properties: { queueKey, sessionId, waitSeconds: 24 },
      },
      {
        name: 'session_started',
        properties: { sessionId },
      },
      {
        name: 'session_ended',
        properties: { sessionId, durationSeconds: 58, endedBy: 'timer' },
      },
      {
        name: 'session_result',
        properties: { sessionId, matchId, result: 'mutual_match' },
      },
      {
        name: 'match_chat_opened',
        properties: { matchId, timeFromMutualMatchSec: 8 },
      },
      {
        name: 'safety_action_taken',
        properties: {
          action: 'warn',
          actionLatencyMs: 850,
          automated: true,
        },
      },
      {
        name: 'safety_appeal_resolved',
        properties: {
          actionType: 'warn',
          resolution: 'upheld',
          resolutionLatencySec: 45,
        },
      },
    ] as const;

    for (const event of synthetic) {
      try {
        await this.prisma.analyticsEvent.create({
          data: {
            eventSchemaVersion: 1,
            eventId: randomUUID(),
            eventName: event.name,
            occurredAt: now,
            receivedAt: now,
            source: 'backend',
            platform: 'backend',
            region: process.env.APP_REGION ?? 'synthetic',
            userId,
            sessionId,
            matchId,
            queueKey,
            properties: event.properties,
          },
        });
      } catch (error) {
        this.logger.warn(`Synthetic backend event insert failed: ${error}`);
      }
    }

    return {
      emitted: synthetic.length,
      userId,
      sessionId,
      matchId,
      queueKey,
    };
  }

  private async computePersistAndAlert() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const snapshot = await this.computeAndPersistSnapshot();
      await this.alertsService.evaluateAndAlert(snapshot);
    } catch (error) {
      this.logger.warn(`Telemetry snapshot tick failed: ${error}`);
    } finally {
      this.running = false;
    }
  }

  private async computeAndPersistSnapshot(): Promise<StageGateSnapshot> {
    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - SNAPSHOT_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        occurredAt: {
          gte: windowStart,
          lte: windowEnd,
        },
        eventName: {
          in: [
            'queue_match_found',
            'queue_left',
            'queue_joined',
            'session_ended',
            'session_started',
            'session_result',
            'match_chat_opened',
            'safety_action_taken',
            'safety_appeal_resolved',
          ],
        },
      },
      select: {
        eventName: true,
        properties: true,
      },
    });

    const waits: number[] = [];
    const actionLatencies: number[] = [];

    let queueJoined = 0;
    let queueAbandoned = 0;
    let sessionStarted = 0;
    let sessionCompleted = 0;
    let sessionResults = 0;
    let mutualResults = 0;
    let chatOpened = 0;
    let severeActions = 0;
    let appealResolved = 0;
    let appealOverturned = 0;

    for (const event of events) {
      const properties = this.asRecord(event.properties);
      switch (event.eventName) {
        case 'queue_match_found': {
          const waitSeconds = this.numberProperty(properties.waitSeconds);
          if (waitSeconds !== null) {
            waits.push(waitSeconds);
          }
          break;
        }
        case 'queue_joined': {
          queueJoined += 1;
          break;
        }
        case 'queue_left': {
          const reason = this.stringProperty(properties.reason);
          if (reason !== 'matched') {
            queueAbandoned += 1;
          }
          break;
        }
        case 'session_started': {
          sessionStarted += 1;
          break;
        }
        case 'session_ended': {
          const duration = this.numberProperty(properties.durationSeconds);
          if (duration !== null && duration >= 40) {
            sessionCompleted += 1;
          }
          break;
        }
        case 'session_result': {
          sessionResults += 1;
          const result = this.stringProperty(properties.result);
          if (result === 'mutual_match') {
            mutualResults += 1;
          }
          break;
        }
        case 'match_chat_opened': {
          chatOpened += 1;
          break;
        }
        case 'safety_action_taken': {
          const action = this.stringProperty(properties.action);
          const latency = this.numberProperty(properties.actionLatencyMs);
          if (latency !== null) {
            actionLatencies.push(latency);
          }
          if (action === 'ban' || action === 'terminate_session') {
            severeActions += 1;
          }
          break;
        }
        case 'safety_appeal_resolved': {
          appealResolved += 1;
          const resolution = this.stringProperty(properties.resolution);
          if (resolution === 'overturned') {
            appealOverturned += 1;
          }
          break;
        }
        default:
          break;
      }
    }

    const waitP50Seconds = this.percentile(waits, 0.5);
    const waitP90Seconds = this.percentile(waits, 0.9);
    const abandonmentRate =
      queueJoined > 0 ? queueAbandoned / queueJoined : null;
    const completionRate =
      sessionStarted > 0 ? sessionCompleted / sessionStarted : null;
    const mutualMatchRate =
      sessionResults > 0 ? mutualResults / sessionResults : null;
    const chatActivationRate =
      mutualResults > 0 ? chatOpened / mutualResults : null;
    const severeIncidentPer10k =
      sessionStarted > 0 ? (severeActions * 10000) / sessionStarted : null;
    const appealOverturnRate =
      appealResolved > 0 ? appealOverturned / appealResolved : null;
    const severeActionLatencyP95 = this.percentile(actionLatencies, 0.95);

    const stage0Status = this.stage0Status(severeActionLatencyP95);
    const stage1Status = this.stage1Status({
      waitP50Seconds,
      waitP90Seconds,
      abandonmentRate,
      severeIncidentPer10k,
    });
    const stage2Status = this.stage2Status({
      completionRate,
      mutualMatchRate,
      chatActivationRate,
    });

    const autoPauseReasons: string[] = [];
    if (severeIncidentPer10k !== null && severeIncidentPer10k > 5) {
      autoPauseReasons.push('severe_incidents_over_5_per_10k');
    }
    if (waitP90Seconds !== null && waitP90Seconds > 150) {
      autoPauseReasons.push('wait_p90_over_150s');
    }

    await this.prisma.telemetryGateSnapshot.create({
      data: {
        windowStart,
        windowEnd,
        waitP50Seconds,
        waitP90Seconds,
        abandonmentRate,
        completionRate,
        mutualMatchRate,
        chatActivationRate,
        severeIncidentPer10k,
        appealOverturnRate,
        severeActionLatencyP95,
        stage0Status,
        stage1Status,
        stage2Status,
        autoPauseTriggered: autoPauseReasons.length > 0,
        autoPauseReasons,
      },
    });

    return {
      windowStart,
      windowEnd,
      waitP50Seconds,
      waitP90Seconds,
      abandonmentRate,
      completionRate,
      mutualMatchRate,
      chatActivationRate,
      severeIncidentPer10k,
      appealOverturnRate,
      severeActionLatencyP95,
      stage0Status,
      stage1Status,
      stage2Status,
      autoPauseTriggered: autoPauseReasons.length > 0,
      autoPauseReasons,
    };
  }

  private toView(snapshot: StageGateSnapshot): StageGateView {
    return {
      windowStart: snapshot.windowStart.toISOString(),
      windowEnd: snapshot.windowEnd.toISOString(),
      metrics: {
        waitP50Seconds: snapshot.waitP50Seconds,
        waitP90Seconds: snapshot.waitP90Seconds,
        abandonmentRate: snapshot.abandonmentRate,
        completionRate: snapshot.completionRate,
        mutualMatchRate: snapshot.mutualMatchRate,
        chatActivationRate: snapshot.chatActivationRate,
        severeIncidentPer10k: snapshot.severeIncidentPer10k,
        appealOverturnRate: snapshot.appealOverturnRate,
        severeActionLatencyP95: snapshot.severeActionLatencyP95,
      },
      statuses: {
        stage0: snapshot.stage0Status,
        stage1: snapshot.stage1Status,
        stage2: snapshot.stage2Status,
      },
      autoPause: {
        triggered: snapshot.autoPauseTriggered,
        reasons: snapshot.autoPauseReasons,
      },
    };
  }

  private parseReasons(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private numberProperty(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private stringProperty(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private percentile(values: number[], rank: number): number | null {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1));
    return sorted[index];
  }

  private stage0Status(severeActionLatencyP95: number | null): StageStatus {
    if (severeActionLatencyP95 === null) {
      return 'AMBER';
    }
    return severeActionLatencyP95 <= 2000 ? 'GREEN' : 'RED';
  }

  private stage1Status(input: {
    waitP50Seconds: number | null;
    waitP90Seconds: number | null;
    abandonmentRate: number | null;
    severeIncidentPer10k: number | null;
  }): StageStatus {
    if (
      input.waitP50Seconds === null ||
      input.waitP90Seconds === null ||
      input.abandonmentRate === null ||
      input.severeIncidentPer10k === null
    ) {
      return 'AMBER';
    }

    if (
      input.waitP50Seconds <= 30 &&
      input.waitP90Seconds <= 90 &&
      input.abandonmentRate <= 0.15 &&
      input.severeIncidentPer10k <= 3
    ) {
      return 'GREEN';
    }

    return 'RED';
  }

  private stage2Status(input: {
    completionRate: number | null;
    mutualMatchRate: number | null;
    chatActivationRate: number | null;
  }): StageStatus {
    if (
      input.completionRate === null ||
      input.mutualMatchRate === null ||
      input.chatActivationRate === null
    ) {
      return 'AMBER';
    }

    if (
      input.completionRate >= 0.85 &&
      input.mutualMatchRate >= 0.12 &&
      input.mutualMatchRate <= 0.35 &&
      input.chatActivationRate >= 0.6
    ) {
      return 'AMBER';
    }

    return 'RED';
  }

  private isWorkerProcess(): boolean {
    const raw = process.env.ENABLE_MATCHING_WORKER;
    if (!raw) {
      return false;
    }

    const normalized = raw.trim().toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  }
}
