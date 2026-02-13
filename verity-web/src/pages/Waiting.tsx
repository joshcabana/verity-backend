import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
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
    typeof (location.state as { queueKey?: unknown } | null)?.queueKey ===
    'string'
      ? ((location.state as { queueKey: string }).queueKey ?? null)
      : null;

  const [stats, setStats] = React.useState<{ usersSearching: number } | null>(
    null,
  );
  const [estimatedSeconds, setEstimatedSeconds] = React.useState<number | null>(
    null,
  );
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

  const statusCopy =
    typeof stats?.usersSearching === 'number'
      ? `${stats.usersSearching} users currently searching`
      : typeof estimatedSeconds === 'number'
        ? `Estimated wait: ${estimatedSeconds}s`
        : 'Hang tight - matching fast.';

  return (
    <section className="card">
      <div className="inline spread">
        <h2 className="section-title">Finding your match</h2>
        <span className="pill warning">In queue</span>
      </div>
      <div className="inline mt-md">
        <div className="spinner" />
        <div className="column">
          <p className="subtle">
            Stay on this screen. We will drop you into a session as soon as a
            compatible partner is available.
          </p>
          <div className="inline mt-sm">
            <span className="text-bold">{formatTimer(seconds)}</span>
            <span className="subtle ml-sm">• {statusCopy}</span>
          </div>
        </div>
      </div>
      {showTimeoutPrompt && (
        <div className="callout warning mt-md">
          <strong>No one nearby yet.</strong>
          <p className="subtle">
            Keep searching or leave now. If you leave before a match is made,
            your token is refunded.
          </p>
          <div className="inline mt-sm">
            <button
              className="button secondary"
              onClick={handleKeepSearching}
              type="button"
            >
              Keep searching
            </button>
            <button
              className="button ghost"
              onClick={() => void handleCancel('timeout')}
              type="button"
            >
              Leave queue
            </button>
          </div>
        </div>
      )}
      <div className="callout safety mt-md">
        <strong>Keep it safe</strong>
        <p className="subtle">
          Sessions are 45 seconds and never recorded. You can leave the queue at
          any time.
        </p>
      </div>
      <button
        className="button secondary mt-md"
        onClick={() => void handleCancel('manual')}
      >
        Leave queue
      </button>
    </section>
  );
};
