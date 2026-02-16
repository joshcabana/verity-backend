import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './analytics.types';

const ALLOWED_EVENTS = new Set<AnalyticsEventName>(ANALYTICS_EVENT_NAMES);
const KEY_PATTERN = /^[a-zA-Z0-9_]+$/;
const MAX_PROPERTY_COUNT = 24;
const MAX_STRING_LENGTH = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  'reason',
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
  eventId?: string;
  occurredAt?: string;
};

@Injectable()
export class AnalyticsService {
  trackClientEvent(
    userId: string,
    event: { name: string; properties?: Record<string, unknown> },
    context?: ClientContext,
  ) {
    const name = this.parseEventName(event.name);
    const properties = this.parseProperties(event.properties);

    this.emit({
      source: this.parseClientPlatform(context?.platform),
      userId,
      name,
      properties,
      appVersion: this.parseMetadataString(context?.appVersion, 64),
      buildNumber: this.parseMetadataString(context?.buildNumber, 64),
      requestId: this.parseMetadataString(context?.requestId, 128),
      eventId: this.parseEventId(context?.eventId),
      occurredAt: this.parseOccurredAt(context?.occurredAt),
    });
  }

  trackServerEvent(input: {
    userId?: string;
    name: string;
    properties?: Record<string, unknown>;
  }) {
    const name = this.parseEventName(input.name);
    const properties = this.parseProperties(input.properties);

    this.emit({
      source: 'backend',
      userId: input.userId,
      name,
      properties,
      appVersion: null,
      buildNumber: null,
      requestId: null,
      eventId: null,
      occurredAt: null,
    });
  }

  private emit(input: {
    source: EventSource;
    userId?: string;
    name: AnalyticsEventName;
    properties: AnalyticsProperties;
    appVersion: string | null;
    buildNumber: string | null;
    requestId: string | null;
    eventId: string | null;
    occurredAt: string | null;
  }) {
    const occurredAt = input.occurredAt ?? new Date().toISOString();

    // Structured log for event pipelines and sink forwarding.
    console.info(
      JSON.stringify({
        channel: 'analytics.event',
        schemaVersion: 1,
        eventId: input.eventId ?? randomUUID(),
        eventName: input.name,
        source: input.source,
        platform: input.source,
        userId: input.userId ?? null,
        name: input.name,
        properties: input.properties,
        appVersion: input.appVersion,
        buildNumber: input.buildNumber,
        requestId: input.requestId,
        occurredAt,
        receivedAt: new Date().toISOString(),
        receivedAtMs: Date.now(),
      }),
    );
  }

  private parseEventName(value: string): AnalyticsEventName {
    if (!ALLOWED_EVENTS.has(value as AnalyticsEventName)) {
      throw new BadRequestException('Unsupported analytics event name');
    }
    return value as AnalyticsEventName;
  }

  private parseProperties(
    value?: Record<string, unknown>,
  ): AnalyticsProperties {
    if (!value) {
      return {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('properties must be an object');
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_PROPERTY_COUNT) {
      throw new BadRequestException('Too many analytics properties');
    }

    const output: AnalyticsProperties = {};
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      if (!key || key.length > 64 || !KEY_PATTERN.test(key)) {
        throw new BadRequestException('Invalid analytics property key');
      }
      if (BLOCKED_PROPERTY_KEYS.has(key.toLowerCase())) {
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
        throw new BadRequestException(`Property "${key}" must be finite`);
      }
      if (typeof rawValue === 'string') {
        if (rawValue.length > MAX_STRING_LENGTH) {
          throw new BadRequestException(
            `Property "${key}" exceeds ${MAX_STRING_LENGTH} characters`,
          );
        }
        output[key] = rawValue;
        continue;
      }

      throw new BadRequestException(
        `Property "${key}" must be string, number, boolean, or null`,
      );
    }

    return output;
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

  private parseEventId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!UUID_PATTERN.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private parseOccurredAt(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  }
}
