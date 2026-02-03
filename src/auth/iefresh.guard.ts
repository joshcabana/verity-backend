import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

const REFRESH_COOKIE_NAME = 'refresh_token';

function parseCookies(header?: string): Record<string, string> {
  if (!header) {
    return {};
  }

  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

@Injectable()
export class RefreshGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = (req as { cookies?: Record<string, string> }).cookies ?? parseCookies(req.headers.cookie);
    const token = cookies[REFRESH_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }

    (req as { refreshToken?: string }).refreshToken = token;
    return true;
  }
}
