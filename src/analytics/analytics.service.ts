import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './analytics.types';

const ALLOWED_EVENTS = new Set<AnalyticsEventName>(ANALYTICS_EVENT_NAMES);
const ALLOWED_SCHEMA_VERSIONS = new Set([1]);
const KEY_PATTERN = /^[a-zA-Z0-9_]+$/;
const MAX_PROPERTY_COUNT = 24;
const MAX_STRING_LENGTH = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_FUTURE_SKEW_SECONDS = 300;
const DEFAULT_MAX_PAST_SKEW_SECONDS = 86400;

const BLOCKED_PROPERTY_KEYS = new Set([
  'email',
  'phone',
  'text',
  'message',
  'bio',
  'display_name',
  'displayname',
  'name',
  'photos',
  'photo',
  'details',
  'token',
  'authorization',
  'cookie',
]);

type ClientPlatform = 'web' | 'ios' | 'android';
type EventSource = ClientPlatform | 'backend';

type ClientContext = {
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  requestId?: string;
  region?: string;
  eventId?: string;
  occurredAt?: string;
  eventSchemaVersion?: number;
};

type EmitInput = {
  source: EventSource;
  userId?: string;
  name: AnalyticsEventName;
  properties: AnalyticsProperties;
  appVersion: string | null;
  buildNumber: string | null;
  requestId: string | null;
  region: string | null;
  eventId: string;
  occurredAt: Date;
  eventSchemaVersion: number;
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async trackClientEvent(
    userId: string,
    event: { name: string; properties?: Record<string, unknown> },
    context?: ClientContext,
  ): Promise<{ accepted: boolean; droppedReason?: string }> {
    const normalized = this.normalizeEvent(
      {
        source: this.parseClientPlatform(context?.platform),
        userId,
        name: event.name,
        properties: event.properties,
        appVersion: context?.appVersion,
        buildNumber: context?.buildNumber,
        requestId: context?.requestId,
        region: context?.region,
        eventId: context?.eventId,
        occurredAt: context?.occurredAt,
        eventSchemaVersion: context?.eventSchemaVersion,
      },
      true,
    );

    return this.persistEvent(normalized, true);
  }

  trackServerEvent(input: {
    userId?: string;
    name: string;
    properties?: Record<string, unknown>;
    occurredAt?: string;
    eventId?: string;
    eventSchemaVersion?: number;
  }) {
    let normalized: EmitInput;

    try {
      normalized = this.normalizeEvent(
        {
          source: 'backend',
          userId: input.userId,
          name: input.name,
          properties: input.properties,
          appVersion: null,
          buildNumber: null,
          requestId: null,
          region: process.env.APP_REGION,
          eventId: input.eventId,
          occurredAt: input.occurredAt,
          eventSchemaVersion: input.eventSchemaVersion,
        },
        false,
      );
    } catch (error) {
      this.logger.warn(
        `Dropping backend analytics event name=${input.name}: ${error}`,
      );
      return;
    }

    void this.persistEvent(normalized, false).catch((error) => {
      this.logger.warn(`Failed to persist backend analytics event: ${error}`);
    });
  }

  private normalizeEvent(
    input: {
      source: EventSource;
      userId?: string;
      name: string;
      properties?: Record<string, unknown>;
      appVersion?: string | null;
      buildNumber?: string | null;
      requestId?: string | null;
      region?: string | null;
      eventId?: string;
      occurredAt?: string;
      eventSchemaVersion?: number;
    },
    strictValidation: boolean,
  ): EmitInput {
    const name = this.parseEventName(input.name, strictValidation);
    const properties = this.parseProperties(input.properties, name, strictValidation);
    const eventSchemaVersion = this.parseEventSchemaVersion(
      input.eventSchemaVersion,
      name,
      strictValidation,
    );
    const eventId = this.parseEventId(input.eventId, name, strictValidation);
    const occurredAt = this.parseOccurredAt(
      input.occurredAt,
      name,
      strictValidation,
    );

    return {
      source: input.source,
      userId: input.userId,
      name,
      properties,
      appVersion: this.parseMetadataString(input.appVersion, 64),
      buildNumber: this.parseMetadataString(input.buildNumber, 64),
      requestId: this.parseMetadataString(input.requestId, 128),
      region:
        this.parseMetadataString(input.region, 64) ??
        this.parseMetadataString(process.env.APP_REGION, 64),
      eventId,
      occurredAt,
      eventSchemaVersion,
    };
  }

  private async persistEvent(
    input: EmitInput,
    strictPersistence: boolean,
  ): Promise<{ accepted: boolean; droppedReason?: string }> {
    const receivedAt = new Date();
    const correlation = this.extractCorrelationFields(input.properties);

    if (!this.prisma) {
      this.logEvent({
        ...input,
        ...correlation,
        receivedAt,
      });
      return { accepted: true };
    }

    try {
      await this.prisma.analyticsEvent.create({
        data: {
          eventSchemaVersion: input.eventSchemaVersion,
          eventId: input.eventId,
          eventName: input.name,
          occurredAt: input.occurredAt,
          receivedAt,
          source: input.source,
          platform: input.source,
          appVersion: input.appVersion,
          buildNumber: input.buildNumber,
          region: input.region,
          requestId: input.requestId,
          userId: input.userId ?? null,
          sessionId: correlation.sessionId,
          matchId: correlation.matchId,
          queueKey: correlation.queueKey,
          properties: input.properties as Prisma.InputJsonValue,
        },
      });
      await this.incrementIngestCounter(input.name, 'accepted', receivedAt);
      this.logEvent({
        ...input,
        ...correlation,
        receivedAt,
      });
      return { accepted: true };
    } catch (error) {
      if (this.isDuplicateEventIdError(error)) {
        await this.incrementIngestCounter(
          input.name,
          'dropped',
          receivedAt,
        ).catch((counterError) => {
          this.logger.warn(`Failed to increment drop counter: ${counterError}`);
        });
        this.logEvent({
          ...input,
          ...correlation,
          receivedAt,
          droppedReason: 'duplicate_event_id',
        });
        return { accepted: false, droppedReason: 'duplicate_event_id' };
      }

      this.logEvent({
        ...input,
        ...correlation,
        receivedAt,
        droppedReason: 'sink_error',
      });

      if (strictPersistence) {
        throw error;
      }

      return { accepted: false, droppedReason: 'sink_error' };
    }
  }

  private parseEventName(value: string, strictValidation: boolean): AnalyticsEventName {
    if (!ALLOWED_EVENTS.has(value as AnalyticsEventName)) {
      this.recordDropped(value, strictValidation ? 'unsupported_event_name' : 'server_unsupported_event');
      throw new BadRequestException('Unsupported analytics event name');
    }
    return value as AnalyticsEventName;
  }

  private parseProperties(
    value: Record<string, unknown> | undefined,
    eventName: string,
    strictValidation: boolean,
  ): AnalyticsProperties {
    if (!value) {
      return {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.recordDropped(eventName, 'invalid_properties_type');
      throw new BadRequestException('properties must be an object');
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_PROPERTY_COUNT) {
      this.recordDropped(eventName, 'too_many_properties');
      throw new BadRequestException('Too many analytics properties');
    }

    const output: AnalyticsProperties = {};
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      if (!key || key.length > 64 || !KEY_PATTERN.test(key)) {
        this.recordDropped(eventName, 'invalid_property_key');
        throw new BadRequestException('Invalid analytics property key');
      }
      if (BLOCKED_PROPERTY_KEYS.has(key.toLowerCase())) {
        this.recordDropped(eventName, 'blocked_property_key');
        throw new BadRequestException(
          `Property key "${key}" is not allowed in analytics events`,
        );
      }

      if (rawValue === null) {
        output[key] = null;
        continue;
      }
      if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
        if (
          Number.isFinite(rawValue as number) ||
          typeof rawValue === 'boolean'
        ) {
          output[key] = rawValue;
          continue;
        }
        this.recordDropped(eventName, 'invalid_numeric_property');
        throw new BadRequestException(`Property "${key}" must be finite`);
      }
      if (typeof rawValue === 'string') {
        if (rawValue.length > MAX_STRING_LENGTH) {
          this.recordDropped(eventName, 'property_too_long');
          throw new BadRequestException(
            `Property "${key}" exceeds ${MAX_STRING_LENGTH} characters`,
          );
        }
        output[key] = rawValue;
        continue;
      }

      this.recordDropped(eventName, 'invalid_property_value');
      throw new BadRequestException(
        `Property "${key}" must be string, number, boolean, or null`,
      );
    }

    return output;
  }

  private parseEventSchemaVersion(
    value: unknown,
    eventName: string,
    strictValidation: boolean,
  ): number {
    if (typeof value === 'undefined' || value === null) {
      return 1;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || !ALLOWED_SCHEMA_VERSIONS.has(parsed)) {
      this.recordDropped(eventName, 'unsupported_schema_version');
      throw new BadRequestException('Unsupported eventSchemaVersion');
    }

    return parsed;
  }

  private parseClientPlatform(value: unknown): ClientPlatform {
    if (typeof value !== 'string') {
      return 'web';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'ios' || normalized === 'android' || normalized === 'web') {
      return normalized;
    }
    return 'web';
  }

  private parseMetadataString(
    value: unknown,
    maxLength: number,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > maxLength) {
      return trimmed.slice(0, maxLength);
    }
    return trimmed;
  }

  private parseEventId(
    value: unknown,
    eventName: string,
    strictValidation: boolean,
  ): string {
    if (typeof value === 'undefined' || value === null) {
      return randomUUID();
    }

    if (typeof value !== 'string') {
      this.recordDropped(eventName, 'invalid_event_id');
      throw new BadRequestException('eventId must be a UUID string');
    }

    const trimmed = value.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      this.recordDropped(eventName, 'invalid_event_id');
      throw new BadRequestException('eventId must be a UUID string');
    }

    return trimmed;
  }

  private parseOccurredAt(
    value: unknown,
    eventName: string,
    strictValidation: boolean,
  ): Date {
    if (typeof value === 'undefined' || value === null) {
      return new Date();
    }

    if (typeof value !== 'string') {
      this.recordDropped(eventName, 'invalid_occurred_at');
      throw new BadRequestException('occurredAt must be an ISO timestamp');
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      this.recordDropped(eventName, 'invalid_occurred_at');
      throw new BadRequestException('occurredAt must be an ISO timestamp');
    }

    const nowMs = Date.now();
    const skewMs = parsed.getTime() - nowMs;
    const maxFutureSkewMs = this.maxFutureSkewSeconds() * 1000;
    const maxPastSkewMs = this.maxPastSkewSeconds() * 1000;

    if (skewMs > maxFutureSkewMs || skewMs < -maxPastSkewMs) {
      this.recordDropped(eventName, 'time_skew');
      throw new BadRequestException('occurredAt is outside allowed skew window');
    }

    return parsed;
  }

  private extractCorrelationFields(properties: AnalyticsProperties): {
    sessionId: string | null;
    matchId: string | null;
    queueKey: string | null;
  } {
    const sessionId = this.extractPropertyString(properties.sessionId);
    const matchId = this.extractPropertyString(properties.matchId);
    const queueKey = this.extractPropertyString(properties.queueKey);

    return {
      sessionId,
      matchId,
      queueKey,
    };
  }

  private extractPropertyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 128) : null;
  }

  private async incrementIngestCounter(
    eventNameRaw: string,
    field: 'accepted' | 'dropped',
    receivedAt = new Date(),
  ) {
    if (!this.prisma) {
      return;
    }

    const hourStart = new Date(receivedAt);
    hourStart.setUTCMinutes(0, 0, 0);

    const eventName = this.sanitizeEventNameForCounter(eventNameRaw);

    if (field === 'accepted') {
      await this.prisma.analyticsIngestHourly.upsert({
        where: {
          hourStart_eventName: {
            hourStart,
            eventName,
          },
        },
        create: {
          hourStart,
          eventName,
          acceptedCount: 1,
          droppedCount: 0,
        },
        update: {
          acceptedCount: { increment: 1 },
        },
      });
      return;
    }

    await this.prisma.analyticsIngestHourly.upsert({
      where: {
        hourStart_eventName: {
          hourStart,
          eventName,
        },
      },
      create: {
        hourStart,
        eventName,
        acceptedCount: 0,
        droppedCount: 1,
      },
      update: {
        droppedCount: { increment: 1 },
      },
    });
  }

  private sanitizeEventNameForCounter(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'unknown';
    }
    if (trimmed.length <= 120) {
      return trimmed;
    }
    return trimmed.slice(0, 120);
  }

  private recordDropped(eventNameRaw: string, reason: string) {
    const eventName = this.sanitizeEventNameForCounter(eventNameRaw);
    void this.incrementIngestCounter(eventName, 'dropped').catch((error) => {
      this.logger.warn(`Failed to increment drop counter: ${error}`);
    });
    this.logDrop(eventName, reason);
  }

  private logDrop(eventName: string, reason: string) {
    console.info(
      JSON.stringify({
        channel: 'analytics.event.drop',
        eventName,
        reason,
        droppedAt: new Date().toISOString(),
      }),
    );
  }

  private logEvent(input: {
    source: EventSource;
    userId?: string;
    name: AnalyticsEventName;
    properties: AnalyticsProperties;
    appVersion: string | null;
    buildNumber: string | null;
    requestId: string | null;
    region: string | null;
    eventId: string;
    occurredAt: Date;
    eventSchemaVersion: number;
    receivedAt: Date;
    sessionId: string | null;
    matchId: string | null;
    queueKey: string | null;
    droppedReason?: string;
  }) {
    console.info(
      JSON.stringify({
        channel: 'analytics.event',
        schemaVersion: input.eventSchemaVersion,
        eventSchemaVersion: input.eventSchemaVersion,
        eventId: input.eventId,
        eventName: input.name,
        source: input.source,
        platform: input.source,
        userId: input.userId ?? null,
        sessionId: input.sessionId,
        matchId: input.matchId,
        queueKey: input.queueKey,
        name: input.name,
        properties: input.properties,
        appVersion: input.appVersion,
        buildNumber: input.buildNumber,
        requestId: input.requestId,
        region: input.region,
        occurredAt: input.occurredAt.toISOString(),
        receivedAt: input.receivedAt.toISOString(),
        receivedAtMs: input.receivedAt.getTime(),
        droppedReason: input.droppedReason ?? null,
      }),
    );
  }

  private isDuplicateEventIdError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    return error.code === 'P2002';
  }

  private maxFutureSkewSeconds(): number {
    return this.readPositiveIntEnv(
      process.env.ANALYTICS_MAX_FUTURE_SKEW_SECONDS,
      DEFAULT_MAX_FUTURE_SKEW_SECONDS,
    );
  }

  private maxPastSkewSeconds(): number {
    return this.readPositiveIntEnv(
      process.env.ANALYTICS_MAX_PAST_SKEW_SECONDS,
      DEFAULT_MAX_PAST_SKEW_SECONDS,
    );
  }

  private readPositiveIntEnv(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }
}
