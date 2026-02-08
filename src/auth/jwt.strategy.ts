import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { AccessPayload } from './auth.types';
import { getAccessTokenSecret } from '../common/security-config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // Passport's Strategy constructor typing is not strongly typed in this package.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: (request: Request) => {
        const header = request.headers.authorization;
        if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
          return null;
        }
        return header.slice(7);
      },
      secretOrKey: getAccessTokenSecret(),
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessPayload) {
    if (!payload?.sub || (payload.typ && payload.typ !== 'access')) {
      throw new UnauthorizedException('Invalid access token');
    }
    return {
      ...payload,
      role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
    };
  }
}
