import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type DecisionResponse = {
  status: 'pending' | 'resolved';
  outcome?: 'mutual' | 'non_mutual';
  matchId?: string;
  partnerRevealVersion?: number;
  partnerReveal?: PartnerReveal;
};

type PartnerReveal = {
  id: string;
  displayName: string | null;
  primaryPhotoUrl: string | null;
  age: number | null;
  bio: string | null;
};

type MatchPayload = {
  sessionId: string;
  matchId: string;
  partnerRevealVersion?: number;
  partnerReveal?: PartnerReveal;
};

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
      trackEvent('session_choice_resolved', {
        sessionId: payload.sessionId,
        outcome: 'mutual',
      });
      setMessage('It’s a match! Redirecting to chat.');
      setTimeout(
        () =>
          navigate(`/chat/${payload.matchId}`, {
            state: {
              partnerRevealVersion: payload.partnerRevealVersion,
              partnerReveal: payload.partnerReveal,
            },
          }),
        1200,
      );
    };

    const handleNonMutual = (payload: NonMutualPayload) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      trackEvent('session_choice_resolved', {
        sessionId: payload.sessionId,
        outcome: 'non_mutual',
      });
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
    trackEvent('session_choice_submitted', {
      sessionId,
      choice,
    });
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
        trackEvent('session_choice_resolved', {
          sessionId,
          outcome: 'mutual',
        });
        navigate(`/chat/${response.data.matchId}`, {
          state: {
            partnerRevealVersion: response.data.partnerRevealVersion,
            partnerReveal: response.data.partnerReveal,
          },
        });
      } else {
        trackEvent('session_choice_resolved', {
          sessionId,
          outcome: 'non_mutual',
        });
        navigate('/home');
      }
    } else {
      setMessage('Choice saved. Waiting for the other user.');
    }
  };

  return (
    <section className="grid two">
      <div className="card">
        <h2 className="section-title">Decision time</h2>
        <p className="subtle">Choose MATCH or PASS once the call ends.</p>
        <div className="inline" style={{ marginTop: '16px' }}>
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
        {message && (
          <p className="subtle" style={{ marginTop: '12px' }}>
            {message}
          </p>
        )}
      </div>
      <div className="card soft">
        <h3 className="section-title">What happens next</h3>
        <ul className="list subtle">
          <li>Mutual MATCH unlocks profiles and chat.</li>
          <li>PASS keeps your details private.</li>
          <li>You can rejoin the queue anytime.</li>
        </ul>
        <div className="callout safety" style={{ marginTop: '16px' }}>
          <strong>Safety matters</strong>
          <p className="subtle">
            If anything felt off, report the user from the session or chat
            screen.
          </p>
        </div>
      </div>
    </section>
  );
};
