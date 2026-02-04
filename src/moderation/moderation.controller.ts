import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ModerationService } from './moderation.service';
import { ReportUserDto } from './dto/report-user.dto';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('reports')
  @UseGuards(AuthGuard('jwt'))
  async reportUser(@Req() req: Request, @Body() dto: ReportUserDto) {
    const user = req.user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const reporterId = user?.sub ?? user?.id ?? user?.userId;
    if (!reporterId) {
      throw new UnauthorizedException('Invalid access token');
    }
    return this.moderationService.createReport(reporterId, dto);
  }
}
