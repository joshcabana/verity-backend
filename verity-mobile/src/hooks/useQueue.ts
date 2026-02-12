import { useEffect } from 'react';
import { create } from 'zustand';
import { apiJson } from '../services/api';
import { useWebSocket } from './useWebSocket';

const DEFAULT_QUEUE_REGION =
  (process.env.EXPO_PUBLIC_QUEUE_REGION as string | undefined) ??
  (process.env.QUEUE_REGION as string | undefined) ??
  'au';

const resolveQueueRegion = (region?: string) => {
  const candidate = (region ?? DEFAULT_QUEUE_REGION).trim().toLowerCase();
  return candidate.length > 0 ? candidate : 'au';
};

type MatchPayload = {
  sessionId?: string;
  partnerId?: string;
  partnerAnonymousId?: string;
  queueKey?: string;
  matchedAt?: string;
};

type QueueStatus = 'idle' | 'joining' | 'waiting' | 'matched';

type QueueState = {
  status: QueueStatus;
  estimatedSeconds: number | null;
  match: MatchPayload | null;
  tokenSpent: boolean;
  usersSearching: number | null;
  queueKey: string | null;
  setEstimated: (seconds: number | null) => void;
  setMatch: (payload: MatchPayload) => void;
  setUsersSearching: (count: number | null) => void;
  joinQueue: (region?: string) => Promise<void>;
  leaveQueue: () => Promise<boolean>;
  reset: () => void;
  markTokenSpent: (spent: boolean) => void;
};

export const useQueueStore = create<QueueState>((set, get) => ({
  status: 'idle',
  estimatedSeconds: null,
  match: null,
  tokenSpent: false,
  usersSearching: null,
  queueKey: null,
  setEstimated: (seconds) => set({ estimatedSeconds: seconds }),
  setMatch: (payload) =>
    set({
      match: payload,
      status: 'matched',
      estimatedSeconds: null,
      usersSearching: null,
      queueKey: payload.queueKey ?? null,
    }),
  setUsersSearching: (count) => set({ usersSearching: count }),
  markTokenSpent: (spent) => set({ tokenSpent: spent }),
  reset: () =>
    set({
      status: 'idle',
      estimatedSeconds: null,
      match: null,
      tokenSpent: false,
      usersSearching: null,
      queueKey: null,
    }),
  joinQueue: async (region?: string) => {
    const { status } = get();
    if (status === 'joining' || status === 'waiting') {
      return;
    }

    set({ status: 'joining', usersSearching: null });
    const response = await apiJson<{
      status: 'queued' | 'already_queued';
      queueKey: string;
      position: number | null;
    }>('/queue/join', {
      method: 'POST',
      body: JSON.stringify({
        region: resolveQueueRegion(region),
        preferences: {},
      }),
    });

    if (!response.ok) {
      set({ status: 'idle' });
      throw new Error('Queue join failed');
    }

    set({ status: 'waiting', queueKey: response.data?.queueKey ?? null });
  },
  leaveQueue: async () => {
    const { status, tokenSpent } = get();
    if (status === 'idle') {
      return false;
    }

    const response = await apiJson<{
      status?: string;
      refunded?: boolean;
      queueKey?: string;
    }>('/queue/leave', {
      method: 'DELETE',
    });

    set({
      status: 'idle',
      estimatedSeconds: null,
      match: null,
      tokenSpent: false,
      usersSearching: null,
      queueKey: null,
    });

    if (response.ok && typeof response.data?.refunded === 'boolean') {
      return tokenSpent && status !== 'matched' && response.data.refunded;
    }

    return response.ok && tokenSpent && status !== 'matched';
  },
}));

export function useQueue() {
  const queue = useQueueStore();
  const { queueSocket } = useWebSocket();

  useEffect(() => {
    if (!queueSocket) {
      return;
    }

    const handleMatch = (payload: MatchPayload) => {
      queue.setMatch({
        ...payload,
        partnerAnonymousId: payload.partnerAnonymousId ?? payload.partnerId,
      });
    };

    const handleEstimate = (payload?: {
      estimatedSeconds?: number;
      etaSeconds?: number;
    }) => {
      const seconds = payload?.estimatedSeconds ?? payload?.etaSeconds ?? null;
      queue.setEstimated(typeof seconds === 'number' ? seconds : null);
    };

    const handleStatus = (payload?: { usersSearching?: number }) => {
      const count =
        typeof payload?.usersSearching === 'number'
          ? payload.usersSearching
          : null;
      queue.setUsersSearching(count);
    };

    const handleQueueDisconnect = () => {
      queue.setEstimated(null);
      queue.setUsersSearching(null);
    };

    queueSocket.on('match', handleMatch);
    // Compatibility path for one release while legacy clients/events drain.
    queueSocket.on('match:found', handleMatch);
    queueSocket.on('queue:estimate', handleEstimate);
    queueSocket.on('queue:status', handleStatus);
    queueSocket.on('disconnect', handleQueueDisconnect);

    return () => {
      queueSocket.off('match', handleMatch);
      queueSocket.off('match:found', handleMatch);
      queueSocket.off('queue:estimate', handleEstimate);
      queueSocket.off('queue:status', handleStatus);
      queueSocket.off('disconnect', handleQueueDisconnect);
    };
  }, [queueSocket, queue.setEstimated, queue.setMatch, queue.setUsersSearching]);

  return queue;
}
