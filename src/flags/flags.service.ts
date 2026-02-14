import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PublicFlags = {
  onboardingVariant: string;
  sessionDurationSeconds: number;
  reportDialogEnabled: boolean;
};

type UpsertFlagInput = {
  enabled: boolean;
  variant?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class FlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicFlags(): Promise<PublicFlags> {
    const rows = await this.prisma.featureFlag.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const onboardingVariant =
      this.envString('FEATURE_FLAG_ONBOARDING_VARIANT') ??
      (byKey.get('onboarding_variant')?.enabled
        ? (byKey.get('onboarding_variant')?.variant ?? 'control')
        : 'control');

    const sessionDurationSeconds =
      this.envNumber('FEATURE_FLAG_SESSION_DURATION_SECONDS') ??
      this.numberVariant(byKey.get('session_duration_seconds')?.variant, 45);

    const reportDialogEnabled =
      this.envBoolean('FEATURE_FLAG_REPORT_DIALOG_ENABLED') ??
      byKey.get('report_dialog_enabled')?.enabled ??
      true;

    return {
      onboardingVariant,
      sessionDurationSeconds: Math.max(
        15,
        Math.min(sessionDurationSeconds, 180),
      ),
      reportDialogEnabled,
    };
  }

  async upsertFlag(key: string, input: UpsertFlagInput) {
    return this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        enabled: input.enabled,
        variant: input.variant ?? null,
        description: input.description ?? null,
        metadata: this.mapMetadata(input.metadata),
      },
      create: {
        key,
        enabled: input.enabled,
        variant: input.variant ?? null,
        description: input.description ?? null,
        metadata: this.mapMetadata(input.metadata),
      },
      select: {
        key: true,
        enabled: true,
        variant: true,
        description: true,
        metadata: true,
        updatedAt: true,
      },
    });
  }

  private numberVariant(value: string | null | undefined, fallback: number) {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private envString(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
  }

  private envNumber(name: string): number | undefined {
    const raw = process.env[name];
    if (!raw) {
      return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private envBoolean(name: string): boolean | undefined {
    const raw = process.env[name];
    if (!raw) {
      return undefined;
    }
    const normalized = raw.trim().toLowerCase();
    if (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    ) {
      return true;
    }
    if (
      normalized === '0' ||
      normalized === 'false' ||
      normalized === 'no' ||
      normalized === 'off'
    ) {
      return false;
    }
    return undefined;
  }

  private mapMetadata(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }
}
