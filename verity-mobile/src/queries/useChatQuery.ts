import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { MatchRevealPayload } from '../types/reveal';

export type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

type ApiErrorData = {
  code?: string;
  message?: string | { code?: string; message?: string };
};

const REVEAL_ACK_REQUIRED_CODE = 'REVEAL_ACK_REQUIRED';

function parseApiErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as ApiErrorData;
  if (typeof payload.code === 'string') {
    return payload.code;
  }
  if (payload.message && typeof payload.message === 'object') {
    if (typeof payload.message.code === 'string') {
      return payload.message.code;
    }
  }
  return null;
}

export function useChatQuery(
  matchId?: string,
  limit = 50,
  options?: { enabled?: boolean },
) {
  const { logout } = useAuth();

  return useQuery({
    queryKey: ['chat', matchId, limit],
    enabled: Boolean(matchId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!matchId) {
        return [] as ChatMessage[];
      }
      const response = await apiJson<ChatMessage[] | ApiErrorData>(
        `/matches/${matchId}/messages?limit=${limit}`,
      );
      if (response.status === 401) {
        await logout();
        return [];
      }
      if (response.status === 403) {
        const code = parseApiErrorCode(response.data);
        if (code === REVEAL_ACK_REQUIRED_CODE) {
          throw new Error(REVEAL_ACK_REQUIRED_CODE);
        }
        throw new Error('FORBIDDEN');
      }
      if (!response.ok || !response.data) {
        return [];
      }
      return Array.isArray(response.data) ? response.data : [];
    },
  });
}

export function useMatchRevealQuery(
  matchId?: string,
  options?: { enabled?: boolean },
) {
  const { logout } = useAuth();

  return useQuery({
    queryKey: ['match-reveal', matchId],
    enabled: Boolean(matchId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!matchId) {
        throw new Error('Missing match ID');
      }
      const response = await apiJson<MatchRevealPayload>(
        `/matches/${matchId}/reveal`,
      );
      if (response.status === 401) {
        await logout();
        throw new Error('UNAUTHORIZED');
      }
      if (!response.ok || !response.data) {
        throw new Error('REVEAL_LOAD_FAILED');
      }
      return response.data;
    },
    retry: false,
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
      const response = await apiJson<ChatMessage>(
        `/matches/${matchId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
      );

      if (response.status === 401) {
        await logout();
        throw new Error('Unauthorized');
      }
      if (response.status === 403) {
        const code = parseApiErrorCode(response.data);
        if (code === REVEAL_ACK_REQUIRED_CODE) {
          throw new Error(REVEAL_ACK_REQUIRED_CODE);
        }
        throw new Error('FORBIDDEN');
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

export function useAcknowledgeRevealMutation(matchId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!matchId) {
        throw new Error('Missing match ID');
      }
      const response = await apiJson<MatchRevealPayload>(
        `/matches/${matchId}/reveal-ack`,
        {
          method: 'POST',
        },
      );
      if (!response.ok || !response.data) {
        throw new Error('REVEAL_ACK_FAILED');
      }
      return response.data;
    },
    onSuccess: (payload) => {
      if (!matchId) {
        return;
      }
      queryClient.setQueryData<MatchRevealPayload>(
        ['match-reveal', matchId],
        payload,
      );
    },
  });
}
