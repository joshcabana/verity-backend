import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
import { AnalyticsService } from './analytics.service';

type ClientEventDto = {
  name: string;
  properties?: Record<string, unknown>;
  eventSchemaVersion?: number;
  eventId?: string;
  occurredAt?: string;
};

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  @HttpCode(202)
  @UseGuards(AuthGuard('jwt'))
  async captureClientEvent(@Req() req: Request, @Body() body: ClientEventDto) {
    const userId = getRequestUserId(req);

    const result = await this.analyticsService.trackClientEvent(
      userId,
      {
        name: body.name,
        properties: body.properties,
      },
      {
        platform: req.header('x-client-platform') ?? undefined,
        appVersion: req.header('x-app-version') ?? undefined,
        buildNumber: req.header('x-build-number') ?? undefined,
        requestId: req.header('x-request-id') ?? undefined,
        region: req.header('x-region') ?? undefined,
        eventSchemaVersion: body.eventSchemaVersion,
        eventId: body.eventId,
        occurredAt: body.occurredAt,
      },
    );

    return {
      accepted: result.accepted,
      droppedReason: result.droppedReason ?? null,
    };
  }
}
