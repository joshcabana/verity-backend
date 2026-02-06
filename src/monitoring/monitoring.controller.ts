import {
  Body,
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

type WebVitalName = 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB';
type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

type WebVitalsPayload = {
  name: WebVitalName;
  value: number;
  id: string;
  rating?: WebVitalRating;
  timestamp?: number;
  path?: string;
};

type FrontendErrorPayload = {
  type: 'error' | 'unhandledrejection';
  message?: string;
  reason?: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  path?: string;
  timestamp?: number;
};

@Controller('monitoring')
export class MonitoringController {
  @Post('web-vitals')
  @HttpCode(202)
  captureWebVitals(
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() payloadRaw: unknown,
  ) {
    this.assertAllowedOrigin(origin);
    const payload = this.parseWebVitalsPayload(payloadRaw);
    // Structured logs are intended for ingestion by external log sinks.
    console.info(
      JSON.stringify({
        channel: 'frontend.monitoring.web_vital',
        ...payload,
        origin: origin ?? null,
        userAgent: this.limit(userAgent, 200),
        receivedAt: Date.now(),
      }),
    );
    return { accepted: true };
  }

  @Post('frontend-errors')
  @HttpCode(202)
  captureFrontendError(
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() payloadRaw: unknown,
  ) {
    this.assertAllowedOrigin(origin);
    const payload = this.parseFrontendErrorPayload(payloadRaw);
    console.warn(
      JSON.stringify({
        channel: 'frontend.monitoring.error',
        ...payload,
        origin: origin ?? null,
        userAgent: this.limit(userAgent, 200),
        receivedAt: Date.now(),
      }),
    );
    return { accepted: true };
  }

  private assertAllowedOrigin(origin: string | undefined) {
    const rawOrigins = process.env.APP_ORIGINS ?? process.env.APP_URL ?? '';
    const allowedOrigins = rawOrigins
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (allowedOrigins.length === 0) {
      return;
    }

    if (!origin || !allowedOrigins.includes(origin)) {
      throw new UnauthorizedException('Origin not allowed');
    }
  }

  private parseWebVitalsPayload(input: unknown): WebVitalsPayload {
    if (!this.isRecord(input)) {
      throw new BadRequestException('Invalid web vitals payload');
    }

    const name = this.parseWebVitalName(input.name);
    const value = this.parseFiniteNumber(input.value, 'value');
    const id = this.parseString(input.id, 'id', 1, 120);
    const rating = this.parseWebVitalRating(input.rating);
    const timestamp = this.parseOptionalNumber(input.timestamp, 'timestamp');
    const path = this.parseOptionalString(input.path, 'path', 1, 200);

    return {
      name,
      value,
      id,
      rating,
      timestamp,
      path,
    };
  }

  private parseFrontendErrorPayload(input: unknown): FrontendErrorPayload {
    if (!this.isRecord(input)) {
      throw new BadRequestException('Invalid frontend error payload');
    }

    const type = this.parseErrorType(input.type);
    const message = this.parseOptionalString(input.message, 'message', 1, 500);
    const reason = this.parseOptionalString(input.reason, 'reason', 1, 500);
    const source = this.parseOptionalString(input.source, 'source', 1, 300);
    const line = this.parseOptionalNumber(input.line, 'line');
    const column = this.parseOptionalNumber(input.column, 'column');
    const stack = this.parseOptionalString(input.stack, 'stack', 1, 4000);
    const path = this.parseOptionalString(input.path, 'path', 1, 200);
    const timestamp = this.parseOptionalNumber(input.timestamp, 'timestamp');

    if (!message && !reason) {
      throw new BadRequestException('message or reason is required');
    }

    return {
      type,
      message,
      reason,
      source,
      line,
      column,
      stack,
      path,
      timestamp,
    };
  }

  private parseWebVitalName(input: unknown): WebVitalName {
    const value = this.parseString(input, 'name', 1, 12);
    if (
      value === 'CLS' ||
      value === 'INP' ||
      value === 'LCP' ||
      value === 'FCP' ||
      value === 'TTFB'
    ) {
      return value;
    }
    throw new BadRequestException('Unsupported web vital name');
  }

  private parseWebVitalRating(input: unknown): WebVitalRating | undefined {
    if (typeof input === 'undefined' || input === null) {
      return undefined;
    }
    const value = this.parseString(input, 'rating', 1, 32);
    if (
      value === 'good' ||
      value === 'needs-improvement' ||
      value === 'poor'
    ) {
      return value;
    }
    throw new BadRequestException('Invalid rating');
  }

  private parseErrorType(input: unknown): 'error' | 'unhandledrejection' {
    const value = this.parseString(input, 'type', 1, 40);
    if (value === 'error' || value === 'unhandledrejection') {
      return value;
    }
    throw new BadRequestException('Invalid error type');
  }

  private parseString(
    input: unknown,
    field: string,
    min: number,
    max: number,
  ): string {
    if (typeof input !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const value = input.trim();
    if (value.length < min || value.length > max) {
      throw new BadRequestException(`${field} length is invalid`);
    }
    return value;
  }

  private parseOptionalString(
    input: unknown,
    field: string,
    min: number,
    max: number,
  ): string | undefined {
    if (typeof input === 'undefined' || input === null) {
      return undefined;
    }
    return this.parseString(input, field, min, max);
  }

  private parseFiniteNumber(input: unknown, field: string): number {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
      throw new BadRequestException(`${field} must be a finite number`);
    }
    return input;
  }

  private parseOptionalNumber(
    input: unknown,
    field: string,
  ): number | undefined {
    if (typeof input === 'undefined' || input === null) {
      return undefined;
    }
    return this.parseFiniteNumber(input, field);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private limit(value: string | undefined, maxLength: number) {
    if (!value) {
      return undefined;
    }
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }
}
