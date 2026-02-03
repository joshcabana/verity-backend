import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { RefreshGuard } from './iefresh.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup-anonymous')
  async signupAnonymous(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.signupAnonymous(
      this.getUserAgent(req),
      this.getIpAddress(req),
    );

    this.authService.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Post('verify-phone')
  @UseGuards(AuthGuard('jwt'))
  async verifyPhone(@Req() req: Request, @Body() dto: VerifyPhoneDto) {
    const userId = this.getUserId(req);
    return this.authService.verifyPhone(userId, dto.phone, dto.code);
  }

  @Post('verify-email')
  @UseGuards(AuthGuard('jwt'))
  async verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    const userId = this.getUserId(req);
    return this.authService.verifyEmail(userId, dto.email, dto.code);
  }

  @Post('refresh')
  @UseGuards(RefreshGuard)
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
  async logoutAll(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = this.getUserId(req);
    await this.authService.logoutAll(userId);
    this.authService.clearRefreshCookie(res);
    return { success: true };
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
    const user = req.user as { sub?: string; id?: string; userId?: string } | undefined;
    const userId = user?.sub ?? user?.id ?? user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }
    return this.authService.getCurrentUser(userId);
  }
}
