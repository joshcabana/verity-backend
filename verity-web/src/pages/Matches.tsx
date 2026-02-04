import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';

type Partner = {
  id: string;
  displayName?: string | null;
  photos?: unknown;
  bio?: string | null;
  age?: number | null;
  gender?: string | null;
  interests?: string[];
};

type Match = {
  id: string;
  createdAt: string;
  partner: Partner;
};

export const Matches: React.FC = () => {
  const navigate = useNavigate();

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
    return <section className="card">Loading matches…</section>;
  }

  if (matchesQuery.isError) {
    return <section className="card">Unable to load matches.</section>;
  }

  const matches = matchesQuery.data ?? [];

  return (
    <section className="grid">
      <div className="card">
        <h2 className="section-title">Your matches</h2>
        {matches.length === 0 ? (
          <p className="subtle">No matches yet. Keep queueing.</p>
        ) : (
          <div className="grid" style={{ gap: '12px' }}>
            {matches.map((match) => (
              <div
                key={match.id}
                className="card"
                style={{ boxShadow: 'none' }}
              >
                <h3 style={{ margin: '0 0 8px' }}>
                  {match.partner.displayName ?? 'Anonymous match'}
                </h3>
                {match.partner.bio && (
                  <p className="subtle">{match.partner.bio}</p>
                )}
                <button
                  className="button secondary"
                  onClick={() => navigate(`/chat/${match.id}`)}
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
