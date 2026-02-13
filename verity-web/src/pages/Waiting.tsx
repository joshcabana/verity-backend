import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type MatchPayload = { sessionId: string; queueKey: string };

const WAIT_TIMEOUT_SECONDS = 45;

export const Waiting: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const socket = useSocket('/queue', token);

  const initialQueueKey = typeof (location.state as { queueKey?: unknown } | null)?.queueKey === 'string' ? (location.state as { queueKey: string }).queueKey : null;

  const [stats, setStats] = React.useState<{ usersSearching: number } | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = React.useState<number | null>(null);
  const [queueKey, setQueueKey] = React.useState<string | null>(initialQueueKey);
  const [seconds, setSeconds] = React.useState(0);
  const [showTimeoutPrompt, setShowTimeoutPrompt] = React.useState(false);
  const lastNavigatedSessionRef = React.useRef<string | null>(null);
  const timeoutPromptTrackedRef = React.useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleMatch = (payload: MatchPayload) => {
      if (lastNavigatedSessionRef.current === payload.sessionId) return;
      lastNavigatedSessionRef.current = payload.sessionId;
      setQueueKey(payload.queueKey ?? null);
      trackEvent('queue_match_found', { sessionId: payload.sessionId, queueKey: payload.queueKey ?? '' });
      navigate(`/session/${payload.sessionId}`, { state: payload });
    };
    const handleStatus = (payload: { usersSearching: number }) => setStats(payload);
    const handleEstimate = (payload?: { estimatedSeconds?: number; etaSeconds?: number }) => {
      const value = payload?.estimatedSeconds ?? payload?.etaSeconds ?? null;
      setEstimatedSeconds(typeof value === 'number' ? value : null);
    };

    socket.on('match', handleMatch);
    socket.on('queue:status', handleStatus);
    socket.on('queue:estimate', handleEstimate);
    return () => {
      socket.off('match', handleMatch);
      socket.off('queue:status', handleStatus);
      socket.off('queue:estimate', handleEstimate);
    };
  }, [navigate, socket]);

  useEffect(() => {
    if (showTimeoutPrompt || timeoutPromptTrackedRef.current || seconds < WAIT_TIMEOUT_SECONDS || lastNavigatedSessionRef.current) return;
    timeoutPromptTrackedRef.current = true;
    setShowTimeoutPrompt(true);
    trackEvent('queue_timeout_shown', { queueKey: queueKey ?? '', elapsedSeconds: seconds });
  }, [queueKey, seconds, showTimeoutPrompt]);

  const statusCopy = typeof stats?.usersSearching === 'number' ? `${stats.usersSearching} online` : typeof estimatedSeconds === 'number' ? `< ${estimatedSeconds}s wait` : 'Matching fast...';

  const handleCancel = async (origin: 'manual' | 'timeout') => {
    const response = await apiJson<{ refunded?: boolean; queueKey?: string }>('/queue/leave', { method: 'DELETE' });
    const resolvedQueueKey = response.data?.queueKey ?? queueKey ?? '';
    if (origin === 'timeout') trackEvent('queue_timeout_leave', { queueKey: resolvedQueueKey, elapsedSeconds: seconds, refunded: Boolean(response.data?.refunded) });
    navigate('/home');
  };

  return (
    <section className="mx-auto max-w-xl text-center">
      <div className="card space-y-4">
        <span className="pill">Searching… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
        <h1 className="section-title">Finding partner...</h1>
        <p className="text-mist">{statusCopy}</p>

        {showTimeoutPrompt ? (
          <div className="rounded-2xl border border-rose/30 bg-rose/10 p-4 space-y-3">
            <h3 className="font-semibold">Still looking...</h3>
            <p className="subtle">Top tier matches are worth the wait.</p>
            <div className="flex justify-center gap-3">
              <button className="btn-primary" onClick={() => {
                setShowTimeoutPrompt(false);
                trackEvent('queue_timeout_continue', { queueKey: queueKey ?? '', elapsedSeconds: seconds });
              }}>Wait</button>
              <button className="btn-ghost" onClick={() => void handleCancel('timeout')}>Leave</button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost" onClick={() => void handleCancel('manual')}>Cancel</button>
        )}
      </div>
    </section>
  );
};
