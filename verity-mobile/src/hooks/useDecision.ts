import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiJson } from '../services/api';
import { useAuth } from './useAuth';
import { useWebSocket } from './useWebSocket';
import type { PartnerReveal } from '../types/reveal';

type DecisionChoice = 'MATCH' | 'PASS';

export type DecisionResult = {
  outcome: 'mutual' | 'rejected';
  matchId?: string;
  partnerRevealVersion?: number;
  partnerReveal?: PartnerReveal;
};

type UseDecisionState = {
  choice: DecisionChoice | null;
  status: 'idle' | 'submitting' | 'waiting' | 'resolved';
  result: DecisionResult | null;
  submitChoice: (next: DecisionChoice) => Promise<void>;
  startAutoPass: () => void;
};

export function useDecision(sessionId?: string): UseDecisionState {
  const { logout } = useAuth();
  const { videoSocket } = useWebSocket();
  const [choice, setChoice] = useState<DecisionChoice | null>(null);
  const [status, setStatus] = useState<UseDecisionState['status']>('idle');
  const [result, setResult] = useState<DecisionResult | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const submitChoice = useCallback(
    async (next: DecisionChoice) => {
      if (!sessionId) {
        Alert.alert('Session missing', 'Unable to submit your choice.');
        return;
      }
      if (submittedRef.current) {
        return;
      }
      submittedRef.current = true;
      setStatus('submitting');
      setChoice(next);

      const response = await apiJson(`/sessions/${sessionId}/choice`, {
        method: 'POST',
        body: JSON.stringify({ choice: next }),
      });

      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return;
      }

      if (!response.ok) {
        Alert.alert('Submission failed', 'Unable to submit your choice.');
        submittedRef.current = false;
        setStatus('idle');
        return;
      }

      const data = response.data as
        | { status?: 'pending' }
        | {
            status?: 'resolved';
            outcome?: 'mutual' | 'non_mutual';
            matchId?: string;
            partnerRevealVersion?: number;
            partnerReveal?: PartnerReveal;
          }
        | null;

      if (data?.status === 'resolved') {
        setResult({
          outcome: data.outcome === 'mutual' ? 'mutual' : 'rejected',
          matchId: data.outcome === 'mutual' ? data.matchId : undefined,
          partnerRevealVersion:
            data.outcome === 'mutual' ? data.partnerRevealVersion : undefined,
          partnerReveal:
            data.outcome === 'mutual' ? data.partnerReveal : undefined,
        });
        setStatus('resolved');
        return;
      }

      setStatus('waiting');
    },
    [sessionId, logout],
  );

  const startAutoPass = useCallback(() => {
    if (timerRef.current) {
      return;
    }
    timerRef.current = setTimeout(() => {
      if (!submittedRef.current) {
        void submitChoice('PASS');
      }
    }, 60_000);
  }, [submitChoice]);

  useEffect(() => {
    if (!videoSocket) {
      return;
    }

    const handleMutual = (payload?: {
      sessionId?: string;
      matchId?: string;
      partnerRevealVersion?: number;
      partnerReveal?: PartnerReveal;
    }) => {
      if (sessionId && payload?.sessionId && payload.sessionId !== sessionId) {
        return;
      }
      setResult({
        outcome: 'mutual',
        matchId: payload?.matchId,
        partnerRevealVersion: payload?.partnerRevealVersion,
        partnerReveal: payload?.partnerReveal,
      });
      setStatus('resolved');
    };

    const handleRejected = (payload?: { sessionId?: string }) => {
      if (sessionId && payload?.sessionId && payload.sessionId !== sessionId) {
        return;
      }
      setResult({ outcome: 'rejected' });
      setStatus('resolved');
    };

    videoSocket.on('match:mutual', handleMutual);
    videoSocket.on('match:non_mutual', handleRejected);
    // Compatibility fallback for one release while old event names are phased out.
    videoSocket.on('match:rejected', handleRejected);

    return () => {
      videoSocket.off('match:mutual', handleMutual);
      videoSocket.off('match:non_mutual', handleRejected);
      videoSocket.off('match:rejected', handleRejected);
    };
  }, [sessionId, videoSocket]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { choice, status, result, submitChoice, startAutoPass };
}
