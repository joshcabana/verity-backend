export class RefreshTokenEntity {
  id!: string;
  userId!: string;
  familyId!: string;
  tokenHash!: string;
  createdAt!: Date;
  updatedAt!: Date;
  expiresAt!: Date;
  revokedAt?: Date | null;
  replacedById?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastUsedAt?: Date | null;
  sessionName?: string | null;

  get isActive(): boolean {
    return !this.revokedAt && this.expiresAt > new Date();
  }
}
