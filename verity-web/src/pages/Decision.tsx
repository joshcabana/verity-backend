import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { SparkBurst } from '../components/SparkBurst';
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
  const [showSpark, setShowSpark] = useState(false);

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
      setShowSpark(true);
      setMessage('It’s a match! Opening chat…');
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
      setShowSpark(false);
      setMessage('No mutual match this round.');
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
        setShowSpark(true);
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
        setShowSpark(false);
        navigate('/home');
      }
    } else {
      setMessage('Choice saved. Waiting for the other person.');
    }
  };

  return (
    <section className="two relative">
      <SparkBurst active={showSpark} />

      <div className="card">
        <h2 className="section-title">How did that feel?</h2>
        <p className="subtle mt-xs">
          Choose once. Mutual match reveals profile + opens chat.
        </p>

        <div className="inline mt-md" style={{ gap: '12px' }}>
          <button
            className="button"
            onClick={() => void submitChoice('MATCH')}
            disabled={submitting}
          >
            Match
          </button>
          <button
            className="button secondary"
            onClick={() => void submitChoice('PASS')}
            disabled={submitting}
          >
            Pass
          </button>
        </div>

        {message && (
          <p className="subtle mt-md" role="status">
            {message}
          </p>
        )}
      </div>

      <div className="card soft">
        <h3 className="section-title section-title-sm">Decision guide</h3>
        <ul className="list subtle mt-xs">
          <li>Match if you’d genuinely like another conversation.</li>
          <li>Pass if the chemistry wasn’t there — no hard feelings.</li>
          <li>Your choice remains private unless both say match.</li>
        </ul>
      </div>
    </section>
  );
};
