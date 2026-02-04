import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../api/client';
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
    await apiJson('/queue/leave', { method: 'DELETE' });
    navigate('/home');
  };

  return (
    <section className="card">
      <h2 className="section-title">Finding your match</h2>
      <p className="subtle">
        Stay on this screen. We will drop you into a session as soon as a
        compatible partner is available.
      </p>
      <button className="button secondary" onClick={handleCancel}>
        Leave queue
      </button>
    </section>
  );
};
