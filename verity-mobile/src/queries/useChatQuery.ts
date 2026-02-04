import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

export function useChatQuery(matchId?: string, limit = 50) {
  const { logout } = useAuth();

  return useQuery({
    queryKey: ['chat', matchId, limit],
    enabled: Boolean(matchId),
    queryFn: async () => {
      if (!matchId) {
        return [] as ChatMessage[];
      }
      const response = await apiJson<ChatMessage[]>(
        `/matches/${matchId}/messages?limit=${limit}`,
      );
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

export function useSendMessageMutation(matchId?: string) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (text: string) => {
      if (!matchId) {
        throw new Error('Missing match ID');
      }
      const response = await apiJson<ChatMessage>(`/matches/${matchId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });

      if (response.status === 401 || response.status === 403) {
        await logout();
        throw new Error('Unauthorized');
      }

      if (!response.ok || !response.data) {
        throw new Error('Send failed');
      }

      return response.data;
    },
    onMutate: async (text: string) => {
      if (!matchId) {
        return;
      }
      const optimistic: ChatMessage = {
        id: `temp-${Date.now()}`,
        matchId,
        senderId: user?.id ?? 'me',
        text,
        createdAt: new Date().toISOString(),
      };

      const existing = queryClient.getQueriesData<ChatMessage[]>({
        queryKey: ['chat', matchId],
      });

      existing.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<ChatMessage[]>(key, [...data, optimistic]);
      });

      return { optimisticId: optimistic.id };
    },
    onError: (_error, _text, context) => {
      if (!matchId || !context?.optimisticId) {
        return;
      }
      const existing = queryClient.getQueriesData<ChatMessage[]>({
        queryKey: ['chat', matchId],
      });
      existing.forEach(([key, data]) => {
        if (!data) return;
        queryClient.setQueryData<ChatMessage[]>(
          key,
          data.filter((msg) => msg.id !== context.optimisticId),
        );
      });
    },
    onSuccess: (message, _text, context) => {
      if (!matchId) {
        return;
      }
      const existing = queryClient.getQueriesData<ChatMessage[]>({
        queryKey: ['chat', matchId],
      });
      existing.forEach(([key, data]) => {
        if (!data) return;
        const filtered = context?.optimisticId
          ? data.filter((msg) => msg.id !== context.optimisticId)
          : data;
        if (filtered.some((msg) => msg.id === message.id)) {
          return;
        }
        queryClient.setQueryData<ChatMessage[]>(key, [...filtered, message]);
      });
    },
  });
}
