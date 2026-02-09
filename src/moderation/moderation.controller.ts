import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { getRequestUserId } from '../auth/request-user';
import { ModerationService } from './moderation.service';
import { BlockUserDto } from './dto/block-user.dto';
import { ReportUserDto } from './dto/report-user.dto';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('reports')
  @UseGuards(AuthGuard('jwt'))
  async reportUser(@Req() req: Request, @Body() dto: ReportUserDto) {
    const reporterId = getRequestUserId(req);
    return this.moderationService.createReport(reporterId, dto);
  }

  @Get('reports')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async listReports(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimitRaw = limit ? Number.parseInt(limit, 10) : undefined;
    const parsedLimit = Number.isFinite(parsedLimitRaw)
      ? parsedLimitRaw
      : undefined;
    return this.moderationService.listReports(status, parsedLimit);
  }

  @Post('reports/:id/resolve')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async resolveReport(
    @Req() req: Request,
    @Param('id') reportId: string,
    @Body('action') action: 'warn' | 'ban',
  ) {
    if (action !== 'warn' && action !== 'ban') {
      throw new BadRequestException('Invalid action');
    }
    return this.moderationService.resolveReport(reportId, action);
  }

  @Post('blocks')
  @UseGuards(AuthGuard('jwt'))
  async blockUser(@Req() req: Request, @Body() dto: BlockUserDto) {
    const blockerId = getRequestUserId(req);
    return this.moderationService.createBlock(blockerId, dto.blockedUserId);
  }

  @Delete('blocks/:blockedUserId')
  @UseGuards(AuthGuard('jwt'))
  async unblockUser(
    @Req() req: Request,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    const blockerId = getRequestUserId(req);
    return this.moderationService.unblock(blockerId, blockedUserId);
  }

  @Get('blocks')
  @UseGuards(AuthGuard('jwt'))
  async listBlocks(@Req() req: Request, @Query('limit') limit?: string) {
    const blockerId = getRequestUserId(req);
    const parsedLimitRaw = limit ? Number.parseInt(limit, 10) : undefined;
    const parsedLimit = Number.isFinite(parsedLimitRaw)
      ? parsedLimitRaw
      : undefined;
    return this.moderationService.listBlocks(blockerId, parsedLimit);
  }
}
