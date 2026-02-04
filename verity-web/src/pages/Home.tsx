import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';

const PACKS = [
  { id: 'starter', label: 'Starter', tokens: 5 },
  { id: 'plus', label: 'Plus', tokens: 15 },
  { id: 'pro', label: 'Pro', tokens: 30 },
] as const;

type BalanceResponse = { tokenBalance: number };

type PurchaseResponse = { url?: string };

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [region, setRegion] = useState('au');
  const [joining, setJoining] = useState(false);

  const balanceQuery = useQuery({
    queryKey: ['token-balance'],
    queryFn: async () => {
      const response = await apiJson<BalanceResponse>('/tokens/balance');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load balance');
      }
      return response.data.tokenBalance;
    },
  });

  const tokenBalance = balanceQuery.data ?? 0;
  const canJoin = tokenBalance > 0 && !joining;

  const handleJoin = async () => {
    if (!canJoin) {
      return;
    }
    setJoining(true);
    const response = await apiJson('/queue/join', {
      method: 'POST',
      body: { region, preferences: {} },
    });
    setJoining(false);
    if (!response.ok) {
      alert('Unable to join queue. Check your token balance.');
      return;
    }
    navigate('/waiting');
  };

  const handlePurchase = async (packId: string) => {
    const response = await apiJson<PurchaseResponse>('/tokens/purchase', {
      method: 'POST',
      body: { packId },
    });
    if (response.ok && response.data?.url) {
      window.location.href = response.data.url;
      return;
    }
    alert('Stripe checkout is not configured yet.');
  };

  const balanceLabel = useMemo(() => {
    if (balanceQuery.isLoading) {
      return 'Loading balance...';
    }
    if (balanceQuery.isError) {
      return 'Unable to load balance';
    }
    return `${tokenBalance} tokens`;
  }, [balanceQuery.isLoading, balanceQuery.isError, tokenBalance]);

  return (
    <section className="grid two">
      <div className="card">
        <h2 className="section-title">Queue status</h2>
        <p className="subtle">Token balance: {balanceLabel}</p>
        <label className="subtle">Region</label>
        <input
          className="input"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        />
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <button className="button" onClick={handleJoin} disabled={!canJoin}>
            {joining ? 'Joining...' : 'Join queue'}
          </button>
          <button
            className="button secondary"
            onClick={() => balanceQuery.refetch()}
          >
            Refresh balance
          </button>
        </div>
        {tokenBalance === 0 && (
          <p className="subtle" style={{ marginTop: '16px' }}>
            You need at least 1 token to join the queue.
          </p>
        )}
      </div>
      <div className="card">
        <h2 className="section-title">Buy tokens</h2>
        <p className="subtle">
          Stripe checkout opens in a new tab when configured.
        </p>
        <div style={{ display: 'grid', gap: '12px' }}>
          {PACKS.map((pack) => (
            <button
              key={pack.id}
              className="button secondary"
              onClick={() => handlePurchase(pack.id)}
            >
              {pack.label} · {pack.tokens} tokens
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
