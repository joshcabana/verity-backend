import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import type { StageGateSnapshot } from './telemetry.types';

const WAIT_P90_BREACH_KEY = 'telemetry:alerts:wait_p90:breach_since';
const AUTO_PAUSE_COOLDOWN_KEY = 'telemetry:alerts:auto_pause:cooldown';
const WAIT_P90_THRESHOLD_SECONDS = 150;
const WAIT_P90_SUSTAIN_MS = 2 * 60 * 60 * 1000;
const AUTO_PAUSE_COOLDOWN_MS = 15 * 60 * 1000;
const SEVERE_INCIDENT_THRESHOLD_PER_10K = 5;

@Injectable()
export class TelemetryAlertsService {
  private readonly logger = new Logger(TelemetryAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async evaluateAndAlert(snapshot: StageGateSnapshot) {
    const reasons: string[] = [];

    if (
      snapshot.severeIncidentPer10k !== null &&
      snapshot.severeIncidentPer10k > SEVERE_INCIDENT_THRESHOLD_PER_10K
    ) {
      reasons.push(
        `Severe incidents ${snapshot.severeIncidentPer10k.toFixed(2)} > ${SEVERE_INCIDENT_THRESHOLD_PER_10K} per 10k (rolling 24h).`,
      );
    }

    const sustainedWaitBreach = await this.isSustainedWaitBreach(
      snapshot.waitP90Seconds,
    );
    if (sustainedWaitBreach) {
      reasons.push(
        `Wait p90 ${snapshot.waitP90Seconds?.toFixed(2)}s > ${WAIT_P90_THRESHOLD_SECONDS}s for over 2 hours.`,
      );
    }

    const appealBacklog = await this.getAppealBacklogBreachCount();
    if (appealBacklog > 0) {
      reasons.push(
        `Appeal backlog SLA breach: ${appealBacklog} open appeals older than ${this.appealBacklogSlaHours()}h.`,
      );
    }

    if (reasons.length === 0) {
      return { triggered: false, reasons, sent: false };
    }

    const sent = await this.sendAutoPauseAlert(snapshot, reasons);
    return { triggered: true, reasons, sent };
  }

  private async isSustainedWaitBreach(
    waitP90Seconds: number | null,
  ): Promise<boolean> {
    if (waitP90Seconds === null || waitP90Seconds <= WAIT_P90_THRESHOLD_SECONDS) {
      await this.redis.del(WAIT_P90_BREACH_KEY);
      return false;
    }

    const nowMs = Date.now();
    const existing = await this.redis.get(WAIT_P90_BREACH_KEY);
    if (!existing) {
      await this.redis.set(WAIT_P90_BREACH_KEY, String(nowMs), 'PX', WAIT_P90_SUSTAIN_MS * 2);
      return false;
    }

    const breachStartedMs = Number.parseInt(existing, 10);
    if (!Number.isFinite(breachStartedMs)) {
      await this.redis.set(WAIT_P90_BREACH_KEY, String(nowMs), 'PX', WAIT_P90_SUSTAIN_MS * 2);
      return false;
    }

    return nowMs - breachStartedMs >= WAIT_P90_SUSTAIN_MS;
  }

  private async getAppealBacklogBreachCount(): Promise<number> {
    const cutoff = new Date(Date.now() - this.appealBacklogSlaHours() * 60 * 60 * 1000);
    return this.prisma.moderationAppeal.count({
      where: {
        status: 'OPEN',
        createdAt: { lte: cutoff },
      },
    });
  }

  private async sendAutoPauseAlert(
    snapshot: StageGateSnapshot,
    reasons: string[],
  ): Promise<boolean> {
    const allowed = await this.redis.set(
      AUTO_PAUSE_COOLDOWN_KEY,
      '1',
      'PX',
      AUTO_PAUSE_COOLDOWN_MS,
      'NX',
    );
    if (!allowed) {
      return false;
    }

    const webhook = process.env.TELEMETRY_ALERT_WEBHOOK_URL?.trim();
    if (!webhook) {
      this.logger.warn(
        `Auto-pause triggered but TELEMETRY_ALERT_WEBHOOK_URL is not configured. reasons=${reasons.join(' | ')}`,
      );
      return false;
    }

    const escalationOwner =
      process.env.TELEMETRY_ALERT_ESCALATION_OWNER?.trim() ?? 'unassigned';
    const runbookLink =
      process.env.TELEMETRY_ALERT_RUNBOOK_URL?.trim() ??
      'docs/notes/incident-runbook.md#telemetry-outage-play';

    const payload = {
      text: 'Verity auto-pause trigger fired',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Verity auto-pause trigger fired*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Escalation owner:* ${escalationOwner}\n*Window:* ${snapshot.windowStart.toISOString()} to ${snapshot.windowEnd.toISOString()}\n*Runbook:* ${runbookLink}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: reasons.map((reason) => `- ${reason}`).join('\n'),
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Metrics:* wait p90=${this.metric(snapshot.waitP90Seconds, 's')} | severe/10k=${this.metric(snapshot.severeIncidentPer10k)} | appeal overturn=${this.metric(snapshot.appealOverturnRate)}`,
          },
        },
      ],
    };

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        this.logger.warn(
          `Telemetry alert webhook failed: ${response.status} ${response.statusText}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Telemetry alert webhook error: ${error}`);
      return false;
    }
  }

  private appealBacklogSlaHours(): number {
    const raw = process.env.TELEMETRY_APPEAL_BACKLOG_SLA_HOURS;
    if (!raw) {
      return 24;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 24;
    }
    return parsed;
  }

  private metric(value: number | null, suffix = ''): string {
    if (value === null) {
      return 'n/a';
    }
    return `${value.toFixed(2)}${suffix}`;
  }
}
