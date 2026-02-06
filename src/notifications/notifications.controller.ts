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
import type { Request } from 'express';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('tokens')
  @UseGuards(AuthGuard('jwt'))
  async registerToken(@Req() req: Request, @Body() dto: RegisterPushTokenDto) {
    return this.notificationsService.registerPushToken(this.getUserId(req), dto);
  }

  @Delete('tokens')
  @UseGuards(AuthGuard('jwt'))
  async unregisterToken(
    @Req() req: Request,
    @Body() dto: UnregisterPushTokenDto,
  ) {
    return this.notificationsService.unregisterPushToken(
      this.getUserId(req),
      dto.token,
    );
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
