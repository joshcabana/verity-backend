import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type AccessPayload = {
  sub: string;
  typ?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        process.env.JWT_ACCESS_SECRET ??
        process.env.JWT_SECRET ??
        'dev_access_secret',
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessPayload) {
    if (!payload?.sub || (payload.typ && payload.typ !== 'access')) {
      throw new UnauthorizedException('Invalid access token');
    }
    return payload;
  }
}
