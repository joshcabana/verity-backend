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
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Your matches</h2>
          <span className="pill">{matches.length} total</span>
        </div>
        {matches.length === 0 ? (
          <div className="callout" style={{ marginTop: '12px' }}>
            <strong>No matches yet</strong>
            <p className="subtle">Join the queue to get paired.</p>
          </div>
        ) : (
          <div className="grid" style={{ gap: '12px', marginTop: '12px' }}>
            {matches.map((match) => (
              <div key={match.id} className="card soft">
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>
                    {match.partner.displayName ?? 'Anonymous match'}
                  </h3>
                  <span className="pill">
                    {new Date(match.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {match.partner.bio && (
                  <p className="subtle" style={{ marginTop: '8px' }}>
                    {match.partner.bio}
                  </p>
                )}
                <button
                  className="button secondary"
                  style={{ marginTop: '12px' }}
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
