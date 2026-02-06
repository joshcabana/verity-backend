export type UserRole = 'USER' | 'ADMIN';

export type AccessPayload = {
  sub: string;
  typ?: string;
  role?: UserRole;
};

export type RequestUser = {
  sub?: string;
  id?: string;
  userId?: string;
  role?: UserRole;
};
