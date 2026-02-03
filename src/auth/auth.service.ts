import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_COOKIE_NAME = 'refresh_token';

type RefreshPayload = {
  sub: string;
  fid: string;
  typ: 'refresh';
  jti?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signupAnonymous(userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.create({ data: {} });
    const tokens = await this.issueTokens(user.id, { userAgent, ipAddress });
    return { user, ...tokens };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        displayName: true,
        photos: true,
        bio: true,
        age: true,
        gender: true,
        interests: true,
        phone: true,
        email: true,
        tokenBalance: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async verifyPhone(userId: string, phoneRaw: string, code?: string) {
    const phone = this.normalizePhone(phoneRaw);
    if (!phone) {
      throw new BadRequestException('Invalid phone number');
    }
    this.assertVerificationCodePresent(code);

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { phone },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Phone already in use');
      }
      throw error;
    }
  }

  async verifyEmail(userId: string, emailRaw: string, code?: string) {
    const email = this.normalizeEmail(emailRaw);
    if (!email) {
      throw new BadRequestException('Invalid email address');
    }
    this.assertVerificationCodePresent(code);

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { email },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async refreshSession(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenId = payload.jti as string;

    const now = new Date();
    const tokenHash = this.hashToken(refreshToken);

    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { id: tokenId },
      });

      if (!stored || stored.userId !== payload.sub || stored.familyId !== payload.fid) {
        if (stored?.familyId) {
          await this.revokeFamilyTx(tx, stored.familyId, now);
        }
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (stored.tokenHash !== tokenHash) {
        await this.revokeFamilyTx(tx, stored.familyId, now);
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (stored.revokedAt) {
        await this.revokeFamilyTx(tx, stored.familyId, now);
        throw new UnauthorizedException('Refresh token reused');
      }

      if (stored.expiresAt <= now) {
        await tx.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: now, lastUsedAt: now },
        });
        throw new UnauthorizedException('Refresh token expired');
      }

      const nextTokenId = randomUUID();
      const nextToken = await this.createRefreshToken(payload.sub, payload.fid, nextTokenId);

      const updated = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: {
          revokedAt: now,
          replacedById: nextTokenId,
          lastUsedAt: now,
        },
      });

      if (updated.count !== 1) {
        await this.revokeFamilyTx(tx, stored.familyId, now);
        throw new UnauthorizedException('Refresh token already used');
      }

      await tx.refreshToken.create({
        data: {
          id: nextTokenId,
          userId: payload.sub,
          familyId: stored.familyId,
          tokenHash: this.hashToken(nextToken),
          userAgent,
          ipAddress,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
          expiresAt: this.refreshExpiry(now),
        },
      });

      const accessToken = await this.createAccessToken(payload.sub);
      return { accessToken, refreshToken: nextToken };
    });
  }

  async logoutAll(userId: string) {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, lastUsedAt: now },
    });
  }

  setRefreshCookie(response: Response, token: string) {
    response.cookie(REFRESH_COOKIE_NAME, token, this.getRefreshCookieOptions());
  }

  clearRefreshCookie(response: Response) {
    response.clearCookie(REFRESH_COOKIE_NAME, this.getRefreshCookieOptions());
  }

  async issueTokens(
    userId: string,
    options: { familyId?: string; userAgent?: string; ipAddress?: string } = {},
  ) {
    const now = new Date();
    const familyId = options.familyId ?? randomUUID();
    const refreshTokenId = randomUUID();
    const refreshToken = await this.createRefreshToken(userId, familyId, refreshTokenId);

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId,
        familyId,
        tokenHash: this.hashToken(refreshToken),
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        expiresAt: this.refreshExpiry(now),
      },
    });

    const accessToken = await this.createAccessToken(userId);
    return { accessToken, refreshToken };
  }

  private async createAccessToken(userId: string) {
    return this.jwt.signAsync(
      { sub: userId, typ: 'access' },
      {
        expiresIn: ACCESS_TOKEN_TTL,
        secret: this.accessSecret,
      },
    );
  }

  private async createRefreshToken(userId: string, familyId: string, tokenId: string) {
    return this.jwt.signAsync(
      { sub: userId, fid: familyId, typ: 'refresh' },
      {
        expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
        secret: this.refreshSecret,
        jwtid: tokenId,
      },
    );
  }

  private async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.refreshSecret,
      });
      if (payload.typ !== 'refresh' || !payload.sub || !payload.fid || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload;
    } catch (error) {
      if (this.isJwtError(error)) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      throw error;
    }
  }

  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? 'dev_access_secret';
  }

  private get refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? 'dev_refresh_secret';
  }

  private getRefreshCookieOptions(): CookieOptions {
    const isProd = process.env.NODE_ENV === 'production';
    const maxAge = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge,
    };
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(value: string): string | null {
    const email = value.trim().toLowerCase();
    return email.length > 0 ? email : null;
  }

  private normalizePhone(value: string): string | null {
    const cleaned = value.replace(/[^\d+]/g, '');
    return cleaned.length >= 8 ? cleaned : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  private isJwtError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(
        (error as { name: string }).name,
      )
    );
  }

  private async revokeFamilyTx(tx: Prisma.TransactionClient, familyId: string, now: Date) {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, lastUsedAt: now },
    });
  }

  private assertVerificationCodePresent(code?: string) {
    if (code === undefined) {
      return;
    }
    if (code.trim().length === 0) {
      throw new BadRequestException('Verification code is required');
    }
  }
}
