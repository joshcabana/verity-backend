import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './analytics.types';

const ALLOWED_EVENTS = new Set<AnalyticsEventName>(ANALYTICS_EVENT_NAMES);
const KEY_PATTERN = /^[a-zA-Z0-9_]+$/;
const MAX_PROPERTY_COUNT = 24;
const MAX_STRING_LENGTH = 200;

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

@Injectable()
export class AnalyticsService {
  trackClientEvent(
    userId: string,
    event: { name: string; properties?: Record<string, unknown> },
  ) {
    const name = this.parseEventName(event.name);
    const properties = this.parseProperties(event.properties);

    this.emit({
      source: 'web',
      userId,
      name,
      properties,
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
    });
  }

  private emit(input: {
    source: 'web' | 'backend';
    userId?: string;
    name: AnalyticsEventName;
    properties: AnalyticsProperties;
  }) {
    // Structured log for event pipelines and future sink forwarding.
    console.info(
      JSON.stringify({
        channel: 'analytics.event',
        source: input.source,
        userId: input.userId ?? null,
        name: input.name,
        properties: input.properties,
        receivedAt: Date.now(),
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
        if (Number.isFinite(rawValue as number) || typeof rawValue === 'boolean') {
          output[key] = rawValue as boolean | number;
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
}
