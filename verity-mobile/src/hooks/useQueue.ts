import { useEffect } from 'react';
import { create } from 'zustand';
import { apiJson } from '../services/api';
import { useWebSocket } from './useWebSocket';

const DEFAULT_QUEUE_REGION =
  process.env.EXPO_PUBLIC_QUEUE_REGION ??
  process.env.QUEUE_REGION ??
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
  channelToken?: string;
  agoraChannel?: string;
};

type QueueStatus = 'idle' | 'joining' | 'waiting' | 'matched';

type QueueState = {
  status: QueueStatus;
  estimatedSeconds: number | null;
  match: MatchPayload | null;
  tokenSpent: boolean;
  setEstimated: (seconds: number | null) => void;
  setMatch: (payload: MatchPayload) => void;
  joinQueue: (region?: string) => Promise<void>;
  leaveQueue: () => Promise<boolean>;
  reset: () => void;
  markTokenSpent: (spent: boolean) => void;
};

const useQueueStore = create<QueueState>((set, get) => ({
  status: 'idle',
  estimatedSeconds: null,
  match: null,
  tokenSpent: false,
  setEstimated: (seconds) => set({ estimatedSeconds: seconds }),
  setMatch: (payload) => set({ match: payload, status: 'matched', estimatedSeconds: null }),
  markTokenSpent: (spent) => set({ tokenSpent: spent }),
  reset: () => set({ status: 'idle', estimatedSeconds: null, match: null, tokenSpent: false }),
  joinQueue: async (region?: string) => {
    const { status } = get();
    if (status === 'joining' || status === 'waiting') {
      return;
    }
    set({ status: 'joining' });
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
    set({ status: 'waiting' });
  },
  leaveQueue: async () => {
    const { status, tokenSpent } = get();
    if (status === 'idle') {
      return false;
    }
    const response = await apiJson<{ status?: string; refunded?: boolean }>(
      '/queue/leave',
      { method: 'DELETE' },
    );
    set({ status: 'idle', estimatedSeconds: null, match: null, tokenSpent: false });
    // Trust back-end refund decision when available (GAP-008).
    // Fallback to local heuristic only if field is missing.
    if (response.ok && typeof response.data?.refunded === 'boolean') {
      return response.data.refunded;
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

    const handleEstimate = (payload?: { estimatedSeconds?: number; etaSeconds?: number }) => {
      const seconds = payload?.estimatedSeconds ?? payload?.etaSeconds ?? null;
      queue.setEstimated(typeof seconds === 'number' ? seconds : null);
    };

    queueSocket.on('match', handleMatch);
    queueSocket.on('match:found', handleMatch);
    queueSocket.on('queue:estimate', handleEstimate);

    return () => {
      queueSocket.off('match', handleMatch);
      queueSocket.off('match:found', handleMatch);
      queueSocket.off('queue:estimate', handleEstimate);
    };
  }, [queueSocket, queue.setEstimated, queue.setMatch]);

  return queue;
}
