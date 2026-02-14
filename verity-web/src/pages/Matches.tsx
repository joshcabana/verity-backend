import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';

type PartnerReveal = {
  id: string;
  displayName: string | null;
  primaryPhotoUrl: string | null;
  age: number | null;
  bio: string | null;
};

type Match = {
  matchId: string;
  partnerRevealVersion: number;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
  partnerReveal: PartnerReveal | null;
};

export const Matches: React.FC = () => {
  const navigate = useNavigate();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const matchesQuery = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const response = await apiJson<Match[]>('/matches');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load matches');
      }
      return response.data;
    },
  });

  if (matchesQuery.isLoading) {
    return (
      <section className="card inline">
        <div className="spinner" />
        <p className="subtle">Loading matches…</p>
      </section>
    );
  }

  if (matchesQuery.isError) {
    return (
      <section className="card">
        <h2 className="section-title">Your matches</h2>
        <div className="callout mt-md">
          <strong>Unable to load matches</strong>
          <p className="subtle mt-xs">
            {offline
              ? 'You appear to be offline. Reconnect and try again.'
              : 'Check your connection and try again.'}
          </p>
        </div>
        <button className="button secondary mt-md" onClick={() => matchesQuery.refetch()}>
          Retry
        </button>
      </section>
    );
  }

  const matches = matchesQuery.data ?? [];

  return (
    <section className="grid gap-4">
      <div className="card">
        <div className="inline flex-between">
          <h2 className="section-title">Your matches</h2>
          <span className="pill">{matches.length} total</span>
        </div>

        {matches.length === 0 ? (
          <div className="callout mt-md">
            <strong>No matches yet</strong>
            <p className="subtle mt-xs">Join the queue to get paired.</p>
          </div>
        ) : (
          <div className="grid mt-md" style={{ gap: '12px' }}>
            {matches.map((match) => (
              <div key={match.matchId} className="card soft">
                <div className="inline flex-between">
                  <h3 style={{ margin: 0 }}>
                    {match.partnerReveal?.displayName ?? 'New match'}
                  </h3>
                  <span className="pill">
                    {match.revealAcknowledged ? 'Reveal complete' : 'Reveal required'}
                  </span>
                </div>

                {match.partnerReveal?.bio && match.revealAcknowledged && (
                  <p className="subtle mt-xs">{match.partnerReveal.bio}</p>
                )}

                {!match.revealAcknowledged && (
                  <p className="subtle mt-xs">
                    Open this match to view the profile reveal.
                  </p>
                )}

                <button
                  className="button secondary mt-md"
                  onClick={() => navigate(`/chat/${match.matchId}`)}
                >
                  Open chat
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
