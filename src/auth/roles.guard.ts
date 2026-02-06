import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { getRequestUserRole } from './request-user';
import type { UserRole } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const role = getRequestUserRole(req);
    if (requiredRoles.includes(role)) {
      return true;
    }

    if (requiredRoles.includes('ADMIN') && this.isAdminKeyFallbackAllowed()) {
      const provided = req.headers['x-admin-key'];
      const expected = process.env.MODERATION_ADMIN_KEY;
      if (
        expected &&
        typeof provided === 'string' &&
        provided.length > 0 &&
        provided === expected
      ) {
        return true;
      }
    }

    throw new ForbiddenException('Insufficient role');
  }

  private isAdminKeyFallbackAllowed() {
    const value = process.env.MODERATION_ADMIN_KEY_FALLBACK;
    if (!value) {
      return true;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
}
