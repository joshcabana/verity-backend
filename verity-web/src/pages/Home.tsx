import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';

/* Replaced existing types with minimal necessary ones for the new design */
type BalanceResponse = { tokenBalance: number };
type PurchaseResponse = { url?: string };
type JoinResponse = { queueKey?: string; position?: number };

const CITY_OPTIONS = [
  { value: 'sydney', label: 'Sydney' },
  { value: 'melbourne', label: 'Melbourne' },
  { value: 'brisbane', label: 'Brisbane' },
  { value: 'perth', label: 'Perth' },
  { value: 'adelaide', label: 'Adelaide' },
  { value: 'canberra', label: 'Canberra' },
] as const;

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [city, setCity] = useState('sydney');
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
    if (!canJoin) return;
    setJoining(true);
    trackEvent('queue_join_requested', { city });
    
    try {
      const response = await apiJson<JoinResponse>('/queue/join', {
        method: 'POST',
        body: { city, preferences: {} },
      });

      if (!response.ok) {
        alert('Unable to join queue. Please check your connection.');
        return;
      }

      trackEvent('queue_joined', {
        city,
        queueKey: response.data?.queueKey ?? '',
        position: response.data?.position ?? -1,
      });
      navigate('/waiting');
    } catch {
      alert('Error joining queue.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="home-layout">
      {/* 1. Sidebar Navigation (Left) */}
      <aside className="sidebar">
        <div className="logo">Verity</div>
        <nav className="nav-menu">
          <a href="#" className="nav-item active">Home</a>
          <a href="#" className="nav-item">Matches</a>
          <a href="#" className="nav-item">Shop</a>
          <a href="#" className="nav-item">Settings</a>
        </nav>
        <div className="user-profile">
          <div className="avatar-placeholder" />
          <div className="user-info">
            <span className="username">You</span>
            <span className="tokens text-gold">{tokenBalance} Tokens</span>
          </div>
        </div>
      </aside>

      {/* 2. Hero Stage (Right / Main) */}
      <main className="hero-stage">
        {/* Abstract Portal Visual */}
        <div className="portal-visual">
          <div className="pulse-ring"></div>
          <div className="core-glow"></div>
        </div>

        <div className="hero-content fade-in">
          <h1 className="hero-title">
            No profiles.<br />
            Just chemistry.
          </h1>
          <p className="hero-subhead text-secondary">
            45 seconds to decide.
          </p>

          <div className="action-area">
            <div className="city-picker">
              <span className="text-secondary">Live in </span>
              <select 
                className="minimal-select"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {CITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button 
              className="btn btn-primary btn-large"
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {joining ? 'Connecting...' : 'Go Live'}
            </button>
            
            {!canJoin && (
              <p className="error-text text-secondary mt-2">
                {tokenBalance === 0 ? 'Top up tokens to join.' : ''}
              </p>
            )}
          </div>
        </div>

        {/* 3. Queue Ticker */}
        <div className="queue-ticker">
          <div className="ticker-track">
            • 124 Online • Matching in ~10s • Sydney • 85 Online • Matching in ~5s • Melbourne • 40 Online •
          </div>
        </div>
      </main>

      {/* Scoped Styles for Home Layout */}
      <style>{`
        .home-layout {
          display: flex;
          min-height: 100vh;
          background: #000;
          color: #fff;
          overflow: hidden;
        }

        /* Sidebar */
        .sidebar {
          width: 260px;
          border-right: 1px solid #222;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #000;
          z-index: 10;
        }

        .logo {
          font-family: 'Playfair Display', serif;
          font-size: 32px;
          color: #fff;
          margin-bottom: 60px;
        }

        .nav-menu {
          display: flex;
          flex-direction: column;
          gap: 24px;
          flex: 1;
        }

        .nav-item {
          color: #666;
          font-size: 18px;
          transition: color 0.2s;
        }

        .nav-item:hover, .nav-item.active {
          color: #fff;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-top: 24px;
          border-top: 1px solid #222;
        }

        .avatar-placeholder {
          width: 40px;
          height: 40px;
          background: #1A1A1A;
          border-radius: 50%;
          border: 1px solid #333;
        }

        .user-info {
          display: flex;
          flex-direction: column;
          font-size: 14px;
        }

        /* Hero Stage */
        .hero-stage {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at center, #111 0%, #000 70%);
        }

        .hero-content {
          text-align: center;
          z-index: 5;
          margin-top: -60px;
        }

        .hero-title {
          font-size: 72px;
          line-height: 1.1;
          margin-bottom: 16px;
          font-weight: 300;
        }

        .hero-subhead {
          font-size: 20px;
          margin-bottom: 48px;
          font-weight: 300;
        }

        .action-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        
        .minimal-select {
          background: transparent;
          border: none;
          color: #fff;
          font-family: inherit;
          font-size: 16px;
          border-bottom: 1px solid #333;
          padding-bottom: 2px;
          cursor: pointer;
        }

        .btn-large {
          padding: 18px 60px;
          font-size: 20px;
          letter-spacing: 0.5px;
        }

        /* Portal Visual (Abstract) */
        .portal-visual {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 600px;
          pointer-events: none;
        }

        .core-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(212, 175, 55, 0.05) 0%, transparent 60%);
          animation: pulse 4s ease-in-out infinite;
        }

        .pulse-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          height: 300px;
          border: 1px solid rgba(212, 175, 55, 0.1);
          border-radius: 50%;
          animation: ripple 3s linear infinite;
        }

        /* Queue Ticker */
        .queue-ticker {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: #111;
          display: flex;
          align-items: center;
          overflow: hidden;
          border-top: 1px solid #222;
        }

        .ticker-track {
          white-space: nowrap;
          color: #666;
          font-size: 14px;
          font-family: 'Space Mono', monospace; /* Fallback to monospace for digital feel */
          animation: marquee 20s linear infinite;
          padding-left: 100%;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        @keyframes ripple {
          0% { width: 300px; height: 300px; opacity: 0.5; border-width: 1px; }
          100% { width: 500px; height: 500px; opacity: 0; border-width: 0px; }
        }

        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }

        @media (max-width: 768px) {
          .home-layout { flex-direction: column; }
          .sidebar { display: none; } /* Hide sidebar on mobile for now - simplified */
          .hero-title { font-size: 40px; }
          .hero-subhead { font-size: 18px; }
          .portal-visual { width: 300px; height: 300px; }
          .btn-large { width: 100%; max-width: 300px; }
        }
      `}</style>
    </div>
  );
};
