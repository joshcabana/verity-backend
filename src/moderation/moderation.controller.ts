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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ModerationService } from './moderation.service';
import { BlockUserDto } from './dto/block-user.dto';
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

  @Get('reports')
  @UseGuards(AuthGuard('jwt'))
  async listReports(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertAdmin(req);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.moderationService.listReports(status, parsedLimit);
  }

  @Post('reports/:id/resolve')
  @UseGuards(AuthGuard('jwt'))
  async resolveReport(
    @Req() req: Request,
    @Param('id') reportId: string,
    @Body('action') action: 'warn' | 'ban',
  ) {
    this.assertAdmin(req);
    if (action !== 'warn' && action !== 'ban') {
      throw new BadRequestException('Invalid action');
    }
    return this.moderationService.resolveReport(reportId, action);
  }

  @Post('blocks')
  @UseGuards(AuthGuard('jwt'))
  async blockUser(@Req() req: Request, @Body() dto: BlockUserDto) {
    const blockerId = this.getUserId(req);
    return this.moderationService.createBlock(blockerId, dto.blockedUserId);
  }

  @Delete('blocks/:blockedUserId')
  @UseGuards(AuthGuard('jwt'))
  async unblockUser(
    @Req() req: Request,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    const blockerId = this.getUserId(req);
    return this.moderationService.unblock(blockerId, blockedUserId);
  }

  @Get('blocks')
  @UseGuards(AuthGuard('jwt'))
  async listBlocks(@Req() req: Request, @Query('limit') limit?: string) {
    const blockerId = this.getUserId(req);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.moderationService.listBlocks(blockerId, parsedLimit);
  }

  private assertAdmin(req: Request) {
    const adminKey = process.env.MODERATION_ADMIN_KEY;
    if (!adminKey) {
      throw new UnauthorizedException('Admin key not configured');
    }
    const provided = req.headers['x-admin-key'];
    if (typeof provided !== 'string' || provided !== adminKey) {
      throw new UnauthorizedException('Invalid admin key');
    }
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
