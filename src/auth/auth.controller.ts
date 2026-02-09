import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupAnonymousDto } from './dto/signup-anonymous.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { RefreshGuard } from './iefresh.guard';
import { getRequestUserId } from './request-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup-anonymous')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async signupAnonymous(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: SignupAnonymousDto,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.signupAnonymous(
        this.getUserAgent(req),
        this.getIpAddress(req),
        dto,
      );

    this.authService.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Post('verify-phone')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async verifyPhone(@Req() req: Request, @Body() dto: VerifyPhoneDto) {
    const userId = getRequestUserId(req);
    return this.authService.verifyPhone(userId, dto.phone, dto.code);
  }

  @Post('verify-email')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    const userId = getRequestUserId(req);
    return this.authService.verifyEmail(userId, dto.email, dto.code);
  }

  @Post('refresh')
  @UseGuards(RefreshGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req as { refreshToken?: string }).refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken: nextRefreshToken } =
      await this.authService.refreshSession(
        refreshToken,
        this.getUserAgent(req),
        this.getIpAddress(req),
      );

    this.authService.setRefreshCookie(res, nextRefreshToken);
    return { accessToken };
  }

  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = getRequestUserId(req);
    await this.authService.logoutAll(userId);
    this.authService.clearRefreshCookie(res);
    return { success: true };
  }

  private getUserAgent(req: Request): string | undefined {
    return req.headers['user-agent'];
  }

  private getIpAddress(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return req.ip;
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: Request) {
    const userId = getRequestUserId(req);
    return this.authService.getCurrentUser(userId);
  }

  @Get('me/export')
  @UseGuards(AuthGuard('jwt'))
  async exportMe(@Req() req: Request) {
    const userId = getRequestUserId(req);
    return this.authService.exportUserData(userId);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Req() req: Request, @Body() dto: UpdateUserProfileDto) {
    const userId = getRequestUserId(req);
    return this.authService.updateCurrentUser(userId, dto);
  }

  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  async deleteMe(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = getRequestUserId(req);
    await this.authService.deleteAccount(userId);
    this.authService.clearRefreshCookie(res);
    return { success: true };
  }
}
