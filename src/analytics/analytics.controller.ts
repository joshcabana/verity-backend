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
};

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  @HttpCode(202)
  @UseGuards(AuthGuard('jwt'))
  captureClientEvent(@Req() req: Request, @Body() body: ClientEventDto) {
    const userId = getRequestUserId(req);
    this.analyticsService.trackClientEvent(userId, body);
    return { accepted: true };
  }
}
