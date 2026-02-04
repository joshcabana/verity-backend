import { useEffect } from 'react';
import { create } from 'zustand';
import { apiJson } from '../services/api';
import { useWebSocket } from './useWebSocket';

type MatchPayload = {
  sessionId?: string;
  channelToken?: string;
  agoraChannel?: string;
  partnerAnonymousId?: string;
};

type QueueStatus = 'idle' | 'joining' | 'waiting' | 'matched';

type QueueState = {
  status: QueueStatus;
  estimatedSeconds: number | null;
  match: MatchPayload | null;
  tokenSpent: boolean;
  setEstimated: (seconds: number | null) => void;
  setMatch: (payload: MatchPayload) => void;
  joinQueue: () => Promise<void>;
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
  joinQueue: async () => {
    const { status } = get();
    if (status === 'joining' || status === 'waiting') {
      return;
    }
    set({ status: 'joining' });
    const response = await apiJson<{ ok: boolean }>('/queue/join', { method: 'POST' });
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
    const response = await apiJson('/queue/leave', { method: 'DELETE' });
    set({ status: 'idle', estimatedSeconds: null, match: null, tokenSpent: false });
    return response.ok && tokenSpent && status !== 'matched';
  },
}));

export function useQueue() {
  const queue = useQueueStore();
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleEstimate = (payload: { seconds?: number }) => {
      queue.setEstimated(typeof payload?.seconds === 'number' ? payload.seconds : null);
    };

    const handleMatch = (payload: MatchPayload) => {
      queue.setMatch(payload);
    };

    socket.on('queue:estimate', handleEstimate);
    socket.on('match:found', handleMatch);

    return () => {
      socket.off('queue:estimate', handleEstimate);
      socket.off('match:found', handleMatch);
    };
  }, [socket, queue.setEstimated, queue.setMatch]);

  return queue;
}
