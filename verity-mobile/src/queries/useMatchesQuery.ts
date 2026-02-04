import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export type MatchProfile = {
  id: string;
  displayName?: string | null;
  age?: number | null;
  bio?: string | null;
  interests?: string[] | null;
  photos?: string[] | null;
};

export type MatchItem = {
  id: string;
  partner: MatchProfile;
  createdAt?: string;
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
