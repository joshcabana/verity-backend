import { FlagsService } from '../../src/flags/flags.service';
import { createPrismaMock } from '../mocks/prisma.mock';

describe('FlagsService (unit)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses db values when env overrides are absent', async () => {
    const prisma = createPrismaMock();
    prisma.featureFlag.findMany.mockResolvedValue([
      {
        key: 'onboarding_variant',
        enabled: true,
        variant: 'v2',
      },
      {
        key: 'session_duration_seconds',
        enabled: true,
        variant: '60',
      },
      {
        key: 'report_dialog_enabled',
        enabled: false,
        variant: null,
      },
    ]);

    const service = new FlagsService(prisma as any);
    const flags = await service.getPublicFlags();

    expect(flags).toEqual({
      onboardingVariant: 'v2',
      sessionDurationSeconds: 60,
      reportDialogEnabled: false,
    });
  });

  it('prefers env overrides for public flags', async () => {
    const prisma = createPrismaMock();
    prisma.featureFlag.findMany.mockResolvedValue([]);
    process.env.FEATURE_FLAG_ONBOARDING_VARIANT = 'env-a';
    process.env.FEATURE_FLAG_SESSION_DURATION_SECONDS = '75';
    process.env.FEATURE_FLAG_REPORT_DIALOG_ENABLED = 'false';

    const service = new FlagsService(prisma as any);
    const flags = await service.getPublicFlags();

    expect(flags).toEqual({
      onboardingVariant: 'env-a',
      sessionDurationSeconds: 75,
      reportDialogEnabled: false,
    });
  });
});
