import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser, UserRole } from './auth.types';

export function getRequestUserId(req: Request): string {
  const user = req.user as RequestUser | undefined;
  const userId = user?.sub ?? user?.id ?? user?.userId;
  if (!userId) {
    throw new UnauthorizedException('Invalid access token');
  }
  return userId;
}

export function getRequestUserRole(req: Request): UserRole {
  const user = req.user as RequestUser | undefined;
  return user?.role === 'ADMIN' ? 'ADMIN' : 'USER';
}
