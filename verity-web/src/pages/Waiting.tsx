import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { ICEBREAKER_PROMPTS } from '../content/prompts';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type MatchPayload = {
  sessionId: string;
  partnerAnonymousId?: string;
  queueKey: string;
  matchedAt: string;
};

const WAIT_TIMEOUT_SECONDS = 45;

export const Waiting: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const socket = useSocket('/queue', token);

  const lastNavigatedSessionRef = React.useRef<string | null>(null);
  const timeoutPromptTrackedRef = React.useRef(false);

  const initialQueueKey =
    typeof (location.state as { queueKey?: unknown } | null)?.queueKey === 'string'
      ? ((location.state as { queueKey: string }).queueKey ?? null)
      : null;

  const [stats, setStats] = React.useState<{ usersSearching: number } | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = React.useState<number | null>(null);
  const [queueKey, setQueueKey] = React.useState<string | null>(initialQueueKey);
  const [seconds, setSeconds] = React.useState(0);
  const [showTimeoutPrompt, setShowTimeoutPrompt] = React.useState(false);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMatch = (payload: MatchPayload) => {
      if (lastNavigatedSessionRef.current === payload.sessionId) {
        return;
      }
      lastNavigatedSessionRef.current = payload.sessionId;
      setQueueKey(payload.queueKey ?? null);
      trackEvent('queue_match_found', {
        sessionId: payload.sessionId,
        queueKey: payload.queueKey,
      });
      navigate(`/session/${payload.sessionId}`, { state: payload });
    };

    const handleStatus = (payload: { usersSearching: number }) => {
      setStats(payload);
    };

    const handleEstimate = (payload?: {
      estimatedSeconds?: number;
      etaSeconds?: number;
    }) => {
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
  }, [socket, navigate]);

  useEffect(() => {
    if (showTimeoutPrompt || timeoutPromptTrackedRef.current) {
      return;
    }
    if (seconds < WAIT_TIMEOUT_SECONDS) {
      return;
    }
    if (lastNavigatedSessionRef.current) {
      return;
    }

    timeoutPromptTrackedRef.current = true;
    setShowTimeoutPrompt(true);
    trackEvent('queue_timeout_shown', {
      queueKey: queueKey ?? '',
      elapsedSeconds: seconds,
    });
  }, [queueKey, seconds, showTimeoutPrompt]);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const statusCopy =
    typeof stats?.usersSearching === 'number'
      ? `${stats.usersSearching} online`
      : typeof estimatedSeconds === 'number'
        ? `< ${estimatedSeconds}s wait`
        : 'Matching fast...';

  const activePrompt = useMemo(() => {
    const index = Math.floor(seconds / 8) % ICEBREAKER_PROMPTS.length;
    return ICEBREAKER_PROMPTS[index] ?? ICEBREAKER_PROMPTS[0];
  }, [seconds]);

  const handleCancel = async (origin: 'manual' | 'timeout') => {
    const response = await apiJson<{
      refunded?: boolean;
      status?: string;
      queueKey?: string;
    }>('/queue/leave', {
      method: 'DELETE',
    });
    const resolvedQueueKey = response.data?.queueKey ?? queueKey ?? '';

    if (origin === 'timeout') {
      trackEvent('queue_timeout_leave', {
        queueKey: resolvedQueueKey,
        elapsedSeconds: seconds,
        refunded: Boolean(response.data?.refunded),
      });
    }

    navigate('/home');
  };

  const handleKeepSearching = () => {
    setShowTimeoutPrompt(false);
    trackEvent('queue_timeout_continue', {
      queueKey: queueKey ?? '',
      elapsedSeconds: seconds,
    });
  };

  return (
    <section className="grid gap-5 text-center">
      <div className="card">
        <div className="visual-container">
          <svg width="300" height="300" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="150" cy="150" r="80" stroke="var(--lux-gold, #d4af37)" strokeWidth="1" opacity="0.6">
              <animate attributeName="r" values="80;120;80" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="150" cy="150" r="112" stroke="rgba(255,255,255,.22)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6">
              <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="20s" repeatCount="indefinite" />
            </circle>
            <circle cx="150" cy="150" r="58" stroke="rgba(255,255,255,.95)" strokeWidth="1" opacity="0.85" />
            <circle cx="150" cy="150" r="8" fill="var(--lux-gold, #d4af37)">
              <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </svg>
          <div className="timer-overlay">
            <span className="timer-text">{formatTimer(seconds)}</span>
          </div>
        </div>

        <h1 className="section-title">Finding Partner...</h1>
        <p className="body-large waiting-title">{statusCopy}</p>

        <div className="callout mt-md">
          <strong>While you wait</strong>
          <p className="subtle mt-xs">Icebreaker: {activePrompt}</p>
        </div>

        {showTimeoutPrompt ? (
          <div className="card timeout-card mt-md">
            <h3 className="timeout-title">Still looking...</h3>
            <p className="body-standard mb-md">Top tier matches are worth the wait.</p>
            <div className="flex-center" style={{ gap: '12px' }}>
              <button className="button" onClick={handleKeepSearching}>
                Wait
              </button>
              <button className="button secondary" onClick={() => void handleCancel('timeout')}>
                Leave
              </button>
            </div>
          </div>
        ) : (
          <button className="button secondary cancel-btn mt-md" onClick={() => void handleCancel('manual')}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
};
