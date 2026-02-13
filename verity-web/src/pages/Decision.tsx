import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type DecisionResponse = { status: 'pending' | 'resolved'; outcome?: 'mutual' | 'non_mutual'; matchId?: string };

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
    if (!socket) return;
    const handleMutual = (payload: MatchPayload) => {
      if (payload.sessionId !== sessionId) return;
      setMessage('It’s a match! Redirecting to chat.');
      setTimeout(() => navigate(`/chat/${payload.matchId}`), 1000);
    };
    const handleNonMutual = (payload: NonMutualPayload) => {
      if (payload.sessionId !== sessionId) return;
      setMessage('No mutual match this time.');
      setTimeout(() => navigate('/home'), 1000);
    };

    socket.on('match:mutual', handleMutual);
    socket.on('match:non_mutual', handleNonMutual);
    return () => {
      socket.off('match:mutual', handleMutual);
      socket.off('match:non_mutual', handleNonMutual);
    };
  }, [navigate, sessionId, socket]);

  const submitChoice = async (choice: 'MATCH' | 'PASS') => {
    if (!sessionId || submitting) return;
    setSubmitting(true);
    trackEvent('session_choice_submitted', { sessionId, choice });
    const response = await apiJson<DecisionResponse>(`/sessions/${sessionId}/choice`, { method: 'POST', body: { choice } });
    setSubmitting(false);

    if (!response.ok) return setMessage('Unable to submit choice. Try again.');
    if (response.data?.status === 'resolved') {
      if (response.data.outcome === 'mutual' && response.data.matchId) navigate(`/chat/${response.data.matchId}`);
      else navigate('/home');
    } else {
      setMessage('Choice saved. Waiting for the other user.');
    }
  };

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="section-title">Decision time</h2>
        <p className="subtle">Choose MATCH or PASS once the call ends.</p>
        <div className="flex gap-3">
          <button className="btn-primary" disabled={submitting} onClick={() => void submitChoice('MATCH')}>Match</button>
          <button className="btn-ghost" disabled={submitting} onClick={() => void submitChoice('PASS')}>Pass</button>
        </div>
        {message && <p className="subtle">{message}</p>}
      </div>
      <div className="card space-y-2 text-sm text-mist">
        <h3 className="text-lg font-semibold text-paper">What happens next</h3>
        <p>Mutual MATCH unlocks profiles and chat.</p>
        <p>PASS keeps your details private.</p>
        <p>You can always rejoin queue.</p>
      </div>
    </section>
  );
};
