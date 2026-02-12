import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { PartnerReveal } from '../types/reveal';

export type MatchItem = {
  matchId: string;
  partnerRevealVersion: number;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
  partnerReveal: PartnerReveal | null;
};

export function useMatchesQuery() {
  const { logout } = useAuth();

  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const response = await apiJson<MatchItem[]>('/matches');
      if (response.status === 401 || response.status === 403) {
        await logout();
        return [];
      }
      if (!response.ok || !response.data) {
        return [];
      }
      return response.data;
    },
  });
}
