import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';

type PartnerReveal = { id: string; displayName: string | null; primaryPhotoUrl: string | null; age: number | null; bio: string | null };
type Match = { matchId: string; revealAcknowledged: boolean; partnerReveal: PartnerReveal | null };

export const Matches: React.FC = () => {
  const navigate = useNavigate();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const matchesQuery = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const response = await apiJson<Match[]>('/matches');
      if (!response.ok || !response.data) throw new Error('Failed to load matches');
      return response.data;
    },
  });

  if (matchesQuery.isLoading) return <section className="card">Loading matches…</section>;
  if (matchesQuery.isError) {
    return (
      <section className="card space-y-3">
        <h2 className="section-title">Your matches</h2>
        <p className="subtle">{offline ? 'You appear to be offline. Reconnect and try again.' : 'Unable to load matches.'}</p>
        <button className="btn-ghost" onClick={() => void matchesQuery.refetch()}>Retry</button>
      </section>
    );
  }

  const matches = matchesQuery.data ?? [];

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between"><h2 className="section-title">Your matches</h2><span className="pill">{matches.length} total</span></div>
      {matches.length === 0 ? (
        <p className="subtle">No matches yet</p>
      ) : (
        <div className="grid gap-3">
          {matches.map((match) => (
            <article key={match.matchId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="font-semibold">{match.partnerReveal?.displayName ?? 'New match'}</h3>
              {match.partnerReveal?.bio && match.revealAcknowledged && <p className="subtle mt-1">{match.partnerReveal.bio}</p>}
              {!match.revealAcknowledged && <p className="subtle mt-1">Open this match to view the profile reveal.</p>}
              <div className="mt-3 flex items-center justify-between">
                <span className="subtle">{match.revealAcknowledged ? 'Reveal complete' : 'Reveal required'}</span>
                <button className="btn-ghost px-4 py-2" onClick={() => navigate(`/chat/${match.matchId}`)}>Open chat</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
