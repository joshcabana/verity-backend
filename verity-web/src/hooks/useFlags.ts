import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';

export type PublicFlags = {
  onboardingVariant: string;
  sessionDurationSeconds: number;
  reportDialogEnabled: boolean;
};

const DEFAULT_FLAGS: PublicFlags = {
  onboardingVariant: 'control',
  sessionDurationSeconds: 45,
  reportDialogEnabled: true,
};

export function useFlags() {
  const hasRemoteFlagsEndpoint =
    typeof import.meta.env.VITE_API_URL === 'string' &&
    import.meta.env.VITE_API_URL.trim().length > 0;

  const query = useQuery({
    queryKey: ['public-flags'],
    enabled: hasRemoteFlagsEndpoint,
    queryFn: async () => {
      try {
        const response = await apiJson<Partial<PublicFlags>>('/config/flags');
        if (!response.ok || !response.data) {
          return DEFAULT_FLAGS;
        }

        const flags: PublicFlags = {
          onboardingVariant:
            typeof response.data.onboardingVariant === 'string' &&
            response.data.onboardingVariant.trim().length > 0
              ? response.data.onboardingVariant
              : DEFAULT_FLAGS.onboardingVariant,
          sessionDurationSeconds:
            typeof response.data.sessionDurationSeconds === 'number' &&
            Number.isFinite(response.data.sessionDurationSeconds)
              ? response.data.sessionDurationSeconds
              : DEFAULT_FLAGS.sessionDurationSeconds,
          reportDialogEnabled:
            typeof response.data.reportDialogEnabled === 'boolean'
              ? response.data.reportDialogEnabled
              : DEFAULT_FLAGS.reportDialogEnabled,
        };
        return flags;
      } catch {
        return DEFAULT_FLAGS;
      }
    },
    staleTime: 60_000,
  });

  return useMemo(
    () => ({
      ...query,
      flags: query.data ?? DEFAULT_FLAGS,
    }),
    [query],
  );
}
