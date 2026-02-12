import React, { useEffect } from 'react';
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

export const Waiting: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const socket = useSocket('/queue', token);
  const lastNavigatedSessionRef = React.useRef<string | null>(null);

  const [stats, setStats] = React.useState<{ usersSearching: number } | null>(
    null,
  );
  const [seconds, setSeconds] = React.useState(0);

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
      trackEvent('queue_match_found', {
        sessionId: payload.sessionId,
        queueKey: payload.queueKey,
      });
      navigate(`/session/${payload.sessionId}`, { state: payload });
    };

    const handleStatus = (payload: { usersSearching: number }) => {
      setStats(payload);
    };

    socket.on('match', handleMatch);
    socket.on('queue:status', handleStatus);

    return () => {
      socket.off('match', handleMatch);
      socket.off('queue:status', handleStatus);
    };
  }, [socket, navigate]);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = async () => {
    const response = await apiJson<{ refunded?: boolean }>('/queue/leave', {
      method: 'DELETE',
    });

    if (response.ok && response.data?.refunded) {
      trackEvent('queue_leave_refunded', { refunded: true });
    }

    navigate('/home');
  };

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
            {stats && (
              <span className="subtle ml-sm">
                • {stats.usersSearching} users currently searching
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="callout safety mt-md">
        <strong>Keep it safe</strong>
        <p className="subtle">
          Sessions are 45 seconds and never recorded. You can leave the queue at
          any time.
        </p>
      </div>
      <button
        className="button secondary mt-md"
        onClick={() => void handleCancel()}
      >
        Leave queue
      </button>
    </section>
  );
};
