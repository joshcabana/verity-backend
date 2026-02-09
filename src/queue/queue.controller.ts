import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
import { QueueService } from './queue.service';

class JoinQueueDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('join')
  @UseGuards(AuthGuard('jwt'))
  async joinQueue(@Req() req: Request, @Body() dto: JoinQueueDto) {
    const userId = getRequestUserId(req);
    return this.queueService.joinQueue(userId, {
      city: dto.city,
      region: dto.region,
      preferences: dto.preferences,
    });
  }

  @Delete('leave')
  @UseGuards(AuthGuard('jwt'))
  async leaveQueue(@Req() req: Request) {
    const userId = getRequestUserId(req);
    return this.queueService.leaveQueue(userId);
  }
}
