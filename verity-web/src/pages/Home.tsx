import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';

const CITY_OPTIONS = [
  { value: 'canberra', label: 'Canberra' },
  { value: 'sydney', label: 'Sydney' },
  { value: 'melbourne', label: 'Melbourne' },
  { value: 'brisbane', label: 'Brisbane' },
  { value: 'perth', label: 'Perth' },
  { value: 'adelaide', label: 'Adelaide' },
] as const;

type BalanceResponse = { tokenBalance: number };
type PurchaseResponse = { url?: string };

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [city, setCity] = useState('canberra');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balanceQuery = useQuery({
    queryKey: ['token-balance'],
    queryFn: async () => {
      const response = await apiJson<BalanceResponse>('/tokens/balance');
      if (!response.ok || !response.data) throw new Error('Failed to load balance');
      return response.data.tokenBalance;
    },
  });

  const tokenBalance = balanceQuery.data ?? 0;

  const handleJoin = async () => {
    if (tokenBalance <= 0 || joining) return;
    setError(null);
    setJoining(true);
    trackEvent('queue_join_requested', { city });
    const response = await apiJson<{ queueKey?: string; position?: number }>('/queue/join', {
      method: 'POST',
      body: { city, preferences: {} },
    });
    setJoining(false);

    if (!response.ok) {
      setError('Unable to join queue right now. Please try again.');
      return;
    }

    trackEvent('queue_joined', {
      city,
      queueKey: response.data?.queueKey ?? '',
      position: response.data?.position ?? -1,
    });
    navigate('/waiting');
  };

  const handlePurchase = async (packId: string) => {
    const response = await apiJson<PurchaseResponse>('/tokens/purchase', {
      method: 'POST',
      body: { packId },
    });
    if (response.ok && response.data?.url) window.location.href = response.data.url;
    else setError('Token checkout is unavailable right now.');
  };

  return (
    <section className="grid gap-6 lg:grid-cols-2 lg:items-center">
      <div className="space-y-5">
        <span className="pill">Live • Private • Romantic</span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">No profiles. Just chemistry.</h1>
        <p className="max-w-xl text-mist">Meet on a real 45-second video date. Mutual match unlocks reveal and chat.</p>

        <div className="card max-w-xl space-y-4" id="home-primary-live">
          <div className="flex items-center justify-between text-sm text-mist">
            <span>Choose your city</span>
            <span className="font-semibold text-gold">{tokenBalance} tokens available</span>
          </div>
          <select className="input" value={city} onChange={(event) => setCity(event.target.value)} aria-label="Select city">
            {CITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <button className="btn-primary w-full" disabled={joining || tokenBalance <= 0} onClick={() => void handleJoin()}>
            {joining ? 'Joining queue…' : 'Go live'}
          </button>
          {tokenBalance <= 0 && <button className="btn-ghost w-full" onClick={() => void handlePurchase('starter')}>Get tokens</button>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="text-xs text-mist">By continuing, you agree to Verity’s safety standards and legal terms.</div>
      </div>

      <div className="card space-y-6" id="home-how-it-works">
        <h2 className="section-title">How it works</h2>
        <ol className="space-y-3 text-sm text-mist">
          <li><strong className="text-paper">1. Join queue:</strong> Spend one token and get matched by city.</li>
          <li><strong className="text-paper">2. 45s call:</strong> Camera + mic live via Agora in real-time.</li>
          <li><strong className="text-paper">3. Decide:</strong> Match or pass privately; mutual unlocks reveal + chat.</li>
        </ol>
        <div id="home-safety" className="rounded-2xl border border-rose/25 bg-rose/10 p-4 text-sm text-mist">
          Calls are unrecorded. AI moderation + reporting tools are always active.
        </div>
        <div className="pt-2 text-sm">
          <Link className="nav-link" to="/matches">Open matches</Link>
        </div>
      </div>
    </section>
  );
};
