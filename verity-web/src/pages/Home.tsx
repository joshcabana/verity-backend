import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Fetch token balance
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

  // Handle joining queue
  const handleJoin = async () => {
    if (!canJoin) return;
    
    trackEvent('queue_join_requested', { city });
    setJoining(true);
    
    const response = await apiJson<{ queueKey?: string; position?: number }>(
      '/queue/join',
      {
        method: 'POST',
        body: { city, preferences: {} },
      },
    );
    
    setJoining(false);
    
    if (!response.ok) {
      alert('Unable to join queue. Check your token balance.');
      return;
    }
    
    trackEvent('queue_joined', {
      city,
      queueKey: response.data?.queueKey ?? '',
      position: response.data?.position ?? -1,
    });
    
    navigate('/waiting');
  };

  // Handle purchasing tokens
  const handlePurchase = async (packId: string) => {
    trackEvent('token_purchase_started', { packId });
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

  return (
    <>
      {/* Hero Section */}
      <section className="hero-split home-hero">
        <div className="hero-content">
          <span className="pill">Live. Private. Human.</span>
          <h1 className="hero-title">
            No Profiles.<br />
            Just Chemistry.
          </h1>
          <p className="body-large home-subtitle">
            45-second live video dates. Mutual reveal only.<br />
            Instant connection, zero swipe fatigue.
          </p>

          <div className="card queue-card">
            <div className="queue-card-top">
              <span className="caption">Select City</span>
              <span className="caption token-count">{tokenBalance} Tokens Available</span>
            </div>

            <select
              className="input mb-md"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {CITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              className="btn btn-primary animate-pulse queue-cta"
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {joining ? 'Connecting...' : 'Go Live'}
            </button>

            {tokenBalance === 0 && (
              <div className="text-center mt-lg">
                <button className="btn btn-ghost" onClick={() => handlePurchase('starter')}>
                  Get Tokens
                </button>
              </div>
            )}
          </div>

          <div className="social-proof">
            <span className="status-dot" aria-hidden="true" />
            <span className="caption">10k+ matches today</span>
          </div>
        </div>

        <div className="hero-visual">
          {/* Abstract Connection Visual */}
          <svg width="300" height="300" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="150" cy="150" r="100" stroke="var(--lux-gold)" strokeWidth="2" opacity="0.5">
              <animate attributeName="r" values="100;120;100" dur="4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0.2;0.5" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="150" cy="150" r="70" stroke="var(--paper-white)" strokeWidth="1" opacity="0.8">
              <animate attributeName="r" values="70;80;70" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="150" cy="150" r="10" fill="var(--lux-gold)">
              <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <path d="M150 50 L150 250" stroke="var(--charcoal)" strokeDasharray="4 4" />
            <path d="M50 150 L250 150" stroke="var(--charcoal)" strokeDasharray="4 4" />
          </svg>
        </div>
      </section>

      {/* How It Works */}
      <section className="mt-lg mb-md home-how">
        <h2 className="section-title text-center">How It Works</h2>
        <div className="grid-3">
          <div className="card text-center home-feature-card">
            <div className="flex-center mb-md">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lux-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 22h14" />
                <path d="M5 2h14" />
                <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
                <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
              </svg>
            </div>
            <h3 className="body-large" style={{ fontWeight: 600, color: 'var(--paper-white)' }}>Join The Queue</h3>
            <p className="body-standard mt-md">
              Enter the live waiting room for your city. No browsing, just join.
            </p>
          </div>
          
          <div className="card text-center home-feature-card">
             <div className="flex-center mb-md">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lux-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h3 className="body-large" style={{ fontWeight: 600, color: 'var(--paper-white)' }}>45s Date</h3>
            <p className="body-standard mt-md">
              Connect instantly via video. Audio on. No filters. Pure chemistry.
            </p>
          </div>
          
          <div className="card text-center home-feature-card">
             <div className="flex-center mb-md">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--lux-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h3 className="body-large" style={{ fontWeight: 600, color: 'var(--paper-white)' }}>Decide</h3>
            <p className="body-standard mt-md">
              Private decision. Only a mutual match reveals identities and unlocks chat.
            </p>
          </div>
        </div>
      </section>

      {/* Safety Section */}
      <section className="card mb-md mt-lg home-safety" style={{ background: 'var(--charcoal)', border: '1px solid var(--asphalt)' }}>
        <div className="grid-3" style={{ alignItems: 'center' }}>
          <div>
            <h2 className="section-title">Unrecorded.<br/>Private.<br/>Safe.</h2>
            <div className="flex-center" style={{ justifyContent: 'flex-start', marginTop: '16px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--lux-gold)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <p className="body-large mb-md">
              Safety is built into the core. Video calls are never recorded.
              Real-time AI moderation detects and blocks unsafe behavior instantly.
            </p>
            <p className="body-standard">
              You are always in control. Report or block any user with a single tap.
              Your location is never shared.
            </p>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="text-center mt-lg mb-md home-footer">
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '16px' }}>
          <a href="#" className="caption" style={{ textDecoration: 'none' }}>Support</a>
          <a href="#" className="caption" style={{ textDecoration: 'none' }}>Privacy</a>
          <a href="#" className="caption" style={{ textDecoration: 'none' }}>Terms</a>
        </div>
        <div className="caption" style={{ color: 'var(--asphalt)' }}>
          © 2026 Verity Inc.
        </div>
      </footer>
    </>
  );
};
