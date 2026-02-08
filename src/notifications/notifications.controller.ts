import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('tokens')
  @UseGuards(AuthGuard('jwt'))
  async registerToken(@Req() req: Request, @Body() dto: RegisterPushTokenDto) {
    return this.notificationsService.registerPushToken(
      getRequestUserId(req),
      dto,
    );
  }

  @Delete('tokens')
  @UseGuards(AuthGuard('jwt'))
  async unregisterToken(
    @Req() req: Request,
    @Body() dto: UnregisterPushTokenDto,
  ) {
    return this.notificationsService.unregisterPushToken(
      getRequestUserId(req),
      dto.token,
    );
  }
}
