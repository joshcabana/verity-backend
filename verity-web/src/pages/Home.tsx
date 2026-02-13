import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';

const PACKS = [
  { id: 'starter', label: 'Starter', tokens: 5 },
  { id: 'plus', label: 'Plus', tokens: 15 },
  { id: 'pro', label: 'Pro', tokens: 30 },
] as const;

const DEFAULT_CITY = 'canberra';

type BalanceResponse = { tokenBalance: number };

type PurchaseResponse = { url?: string };

const TRUST_ITEMS = [
  'Unrecorded Calls',
  'Mutual Reveal Only',
  'Report in One Tap',
  'Avg wait in Canberra: < 30s',
] as const;

const HOW_IT_WORKS = [
  {
    title: '1 — Go Live',
    body: 'Join instantly. No browsing profiles.',
  },
  {
    title: '2 — 45-Second Call',
    body: 'Talk face-to-face in a timed live intro.',
  },
  {
    title: '3 — Match or Pass',
    body: 'Only mutual matches reveal identity and unlock chat.',
  },
] as const;

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);

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
    trackEvent('queue_join_requested', {
      city: DEFAULT_CITY,
    });
    setJoining(true);
    const response = await apiJson<{ queueKey?: string; position?: number }>(
      '/queue/join',
      {
        method: 'POST',
        body: { city: DEFAULT_CITY, preferences: {} },
      },
    );
    setJoining(false);
    if (!response.ok) {
      alert('Unable to join queue. Check your token balance.');
      return;
    }
    trackEvent('queue_joined', {
      city: DEFAULT_CITY,
      queueKey: response.data?.queueKey ?? '',
      position: response.data?.position ?? -1,
    });
    navigate('/waiting', {
      state: {
        queueKey: response.data?.queueKey ?? null,
      },
    });
  };

  const handlePurchase = async (packId: string) => {
    setBuyingPackId(packId);
    trackEvent('token_purchase_started', { packId });
    const response = await apiJson<PurchaseResponse>('/tokens/purchase', {
      method: 'POST',
      body: { packId },
    });
    setBuyingPackId(null);
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

  const scrollToHow = () => {
    document.getElementById('home-how-it-works')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <section className="home-shell">
      <div className="home-top-rail">
        <span className="home-wordmark">VERITY</span>
        <button
          className="home-rail-action"
          onClick={() => (canJoin ? handleJoin() : scrollToHow())}
          type="button"
        >
          {balanceQuery.isLoading ? 'How it works' : `Tokens: ${tokenBalance}`}
        </button>
      </div>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">LIVE INTROS. ZERO SWIPE FATIGUE.</p>
          <h1 className="home-hero-title">Meet first. Reveal later.</h1>
          <p className="home-hero-subtitle">
            Verity matches you into a 45-second live video intro. Mutual match
            unlocks identity and chat.
          </p>
          <div className="home-hero-actions">
            <button
              className="button home-primary-cta"
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {joining ? 'Joining...' : 'Go Live Now'}
            </button>
            <button
              className="button secondary"
              onClick={scrollToHow}
              type="button"
            >
              See How It Works
            </button>
          </div>
        </div>
        <div className="home-hero-visual" aria-hidden="true">
          <div className="signal-ring ring-1" />
          <div className="signal-ring ring-2" />
          <div className="signal-pulse" />
        </div>
      </section>

      <section className="home-card-grid">
        <article className="card home-primary-card" id="home-primary-live">
          <div className="inline spread">
            <h2 className="section-title">Ready for your next 45 seconds?</h2>
            <span className="pill">Live in Canberra</span>
          </div>
          <p className="subtle">
            1 token starts a live intro. If no match forms, your token is
            returned.
          </p>
          <div className="home-balance-line">
            <span className="subtle">Current balance</span>
            <strong>{balanceLabel}</strong>
          </div>
          <div className="home-card-actions">
            <button
              className="button home-primary-cta"
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {joining ? 'Joining...' : 'Go Live Now'}
            </button>
            <button
              className="button ghost"
              onClick={scrollToHow}
              type="button"
            >
              How Matching Works
            </button>
          </div>
          {tokenBalance === 0 && (
            <p className="subtle">
              You need at least 1 token to start a live intro.
            </p>
          )}
        </article>

        <article className="card home-token-card">
          <h3 className="section-title">Stay in the flow.</h3>
          <p className="subtle">
            Top up tokens anytime. Start calls in one tap.
          </p>
          <div className="stack tight">
            {PACKS.map((pack) => (
              <button
                key={pack.id}
                className="button secondary"
                onClick={() => handlePurchase(pack.id)}
                disabled={Boolean(buyingPackId)}
              >
                {buyingPackId === pack.id
                  ? 'Starting checkout...'
                  : `View ${pack.label} · ${pack.tokens} tokens`}
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="home-trust-strip">
        {TRUST_ITEMS.map((item) => (
          <div key={item} className="home-trust-chip">
            <span className="home-chip-dot" aria-hidden="true" />
            {item}
          </div>
        ))}
      </section>

      <section className="card home-how-it-works" id="home-how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="home-step-grid">
          {HOW_IT_WORKS.map((step) => (
            <article key={step.title} className="home-step-card">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-duo-grid" id="home-safety">
        <article className="card">
          <h2 className="section-title">Built for confident conversations.</h2>
          <ul className="list subtle">
            <li>Block instantly</li>
            <li>Report in one tap</li>
            <li>No profile reveal before mutual match.</li>
          </ul>
          <p className="subtle home-support-link">Safety Standards</p>
        </article>
        <article className="card">
          <h2 className="section-title">Private by design.</h2>
          <p className="subtle">
            No profile reveal before the call. No replay culture.
          </p>
          <div className="home-quick-actions">
            <button className="button ghost" type="button">
              Block
            </button>
            <button className="button ghost" type="button">
              Report
            </button>
          </div>
        </article>
      </section>

      <section className="home-footer-band" id="home-pricing">
        <h2>Your next real intro is 45 seconds away.</h2>
        <div className="inline">
          <button
            className="button home-primary-cta"
            onClick={handleJoin}
            disabled={!canJoin}
          >
            {joining ? 'Joining...' : 'Get Started'}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={scrollToHow}
          >
            Learn More
          </button>
        </div>
      </section>

      <div className="home-sticky-dock">
        <button
          className="button home-primary-cta"
          onClick={handleJoin}
          disabled={!canJoin}
        >
          {joining ? 'Joining...' : 'Go Live Now'}
        </button>
        <button
          className="button ghost home-sticky-link"
          type="button"
          onClick={scrollToHow}
        >
          How it works
        </button>
      </div>
    </section>
  );
};
