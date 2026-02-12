import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type MatchPayload = {
  sessionId: string;
  partnerId: string;
  queueKey: string;
  matchedAt: string;
};

export const Waiting: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const socket = useSocket('/queue', token);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMatch = (payload: MatchPayload) => {
      trackEvent('queue_match_found', {
        sessionId: payload.sessionId,
        queueKey: payload.queueKey,
      });
      navigate(`/session/${payload.sessionId}`, { state: payload });
    };

    socket.on('match', handleMatch);
    socket.on('match:found', handleMatch);

    return () => {
      socket.off('match', handleMatch);
      socket.off('match:found', handleMatch);
    };
  }, [socket, navigate]);

  const handleCancel = async () => {
    const response = await apiJson<{ refunded?: boolean }>('/queue/leave', {
      method: 'DELETE',
    });
    if (response.ok && response.data?.refunded) {
      alert('Your token has been refunded.');
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
        <p className="subtle">
          Stay on this screen. We will drop you into a session as soon as a
          compatible partner is available.
        </p>
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
