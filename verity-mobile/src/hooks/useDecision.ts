import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiJson } from '../services/api';
import { useAuth } from './useAuth';
import { useWebSocket } from './useWebSocket';

type DecisionChoice = 'MATCH' | 'PASS';

type UseDecisionState = {
  choice: DecisionChoice | null;
  status: 'idle' | 'submitting' | 'waiting' | 'resolved';
  result: { outcome: 'mutual' | 'rejected'; matchId?: string } | null;
  submitChoice: (next: DecisionChoice) => Promise<void>;
  startAutoPass: () => void;
};

export function useDecision(sessionId?: string): UseDecisionState {
  const { logout } = useAuth();
  const { socket } = useWebSocket();
  const [choice, setChoice] = useState<DecisionChoice | null>(null);
  const [status, setStatus] = useState<UseDecisionState['status']>('idle');
  const [result, setResult] = useState<{ outcome: 'mutual' | 'rejected'; matchId?: string } | null>(
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
    if (!socket) {
      return;
    }

    const handleMutual = (payload?: { matchId?: string }) => {
      setResult({ outcome: 'mutual', matchId: payload?.matchId });
      setStatus('resolved');
    };

    const handleRejected = () => {
      setResult({ outcome: 'rejected' });
      setStatus('resolved');
    };

    socket.on('match:mutual', handleMutual);
    socket.on('match:non_mutual', handleRejected);
    socket.on('match:rejected', handleRejected);

    return () => {
      socket.off('match:mutual', handleMutual);
      socket.off('match:non_mutual', handleRejected);
      socket.off('match:rejected', handleRejected);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { choice, status, result, submitChoice, startAutoPass };
}
