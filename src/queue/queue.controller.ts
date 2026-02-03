import {
  Body,
  Controller,
  Delete,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import { QueueService } from './queue.service';

class JoinQueueDto {
  @IsString()
  region!: string;

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
    const userId = this.getUserId(req);
    return this.queueService.joinQueue(userId, {
      region: dto.region,
      preferences: dto.preferences,
    });
  }

  @Delete('leave')
  @UseGuards(AuthGuard('jwt'))
  async leaveQueue(@Req() req: Request) {
    const userId = this.getUserId(req);
    return this.queueService.leaveQueue(userId);
  }

  private getUserId(req: Request): string {
    const user = req.user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const userId = user?.sub ?? user?.id ?? user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }
    return userId;
  }
}
