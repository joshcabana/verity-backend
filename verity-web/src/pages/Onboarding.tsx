import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Onboarding: React.FC = () => {
  const { signUp, loading } = useAuth();
  const navigate = useNavigate();

  const handleStart = async () => {
    await signUp();
    navigate('/home');
  };

  return (
    <section className="grid two">
      <div className="card">
        <div className="badge">Australia-first</div>
        <h1 className="section-title" style={{ fontSize: '32px' }}>
          Real-time matches, 45-second video, and instant decisions.
        </h1>
        <p className="subtle">
          Verity pairs you in a live queue, drops you into a short video call,
          and reveals identities only after a mutual match.
        </p>
        <button className="button" onClick={handleStart} disabled={loading}>
          {loading ? 'Creating profile...' : 'Start anonymously'}
        </button>
      </div>
      <div className="card">
        <h2 className="section-title">What happens next</h2>
        <ol className="subtle">
          <li>Join the queue with a token.</li>
          <li>Complete a 45-second Agora session.</li>
          <li>Choose MATCH or PASS.</li>
          <li>Chat instantly on mutual match.</li>
        </ol>
      </div>
    </section>
  );
};
