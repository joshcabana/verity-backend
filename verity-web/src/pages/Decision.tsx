import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type DecisionResponse = {
  status: 'pending' | 'resolved';
  outcome?: 'mutual' | 'non_mutual';
  matchId?: string;
};

type MatchPayload = { sessionId: string; matchId: string };

type NonMutualPayload = { sessionId: string; outcome: 'pass' };

export const Decision: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const socket = useSocket('/video', token);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMutual = (payload: MatchPayload) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      setMessage('It’s a match! Redirecting to chat.');
      setTimeout(() => navigate(`/chat/${payload.matchId}`), 1200);
    };

    const handleNonMutual = (payload: NonMutualPayload) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      setMessage('No mutual match this time.');
      setTimeout(() => navigate('/home'), 1200);
    };

    socket.on('match:mutual', handleMutual);
    socket.on('match:non_mutual', handleNonMutual);

    return () => {
      socket.off('match:mutual', handleMutual);
      socket.off('match:non_mutual', handleNonMutual);
    };
  }, [socket, sessionId, navigate]);

  const submitChoice = async (choice: 'MATCH' | 'PASS') => {
    if (!sessionId || submitting) {
      return;
    }
    setSubmitting(true);
    const response = await apiJson<DecisionResponse>(
      `/sessions/${sessionId}/choice`,
      {
        method: 'POST',
        body: { choice },
      },
    );

    setSubmitting(false);
    if (!response.ok) {
      setMessage('Unable to submit choice. Try again.');
      return;
    }

    if (response.data?.status === 'resolved') {
      if (response.data.outcome === 'mutual' && response.data.matchId) {
        navigate(`/chat/${response.data.matchId}`);
      } else {
        navigate('/home');
      }
    } else {
      setMessage('Choice saved. Waiting for the other user.');
    }
  };

  return (
    <section className="card">
      <h2 className="section-title">Decision time</h2>
      <p className="subtle">Choose MATCH or PASS once the call ends.</p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <button
          className="button"
          onClick={() => submitChoice('MATCH')}
          disabled={submitting}
        >
          Match
        </button>
        <button
          className="button secondary"
          onClick={() => submitChoice('PASS')}
          disabled={submitting}
        >
          Pass
        </button>
      </div>
      {message && <p className="subtle" style={{ marginTop: '12px' }}>{message}</p>}
    </section>
  );
};
