import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFlags } from '../hooks/useFlags';

export const Onboarding: React.FC = () => {
  const { signUp, loading } = useAuth();
  const { flags } = useFlags();
  const navigate = useNavigate();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [videoConsent, setVideoConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const privacyVersion = '2026-02-04';
  const tosVersion = '2026-02-04';

  const ready = useMemo(
    () =>
      Boolean(
        dateOfBirth &&
        ageConfirmed &&
        videoConsent &&
        aiConsent &&
        termsAccepted,
      ),
    [dateOfBirth, ageConfirmed, videoConsent, aiConsent, termsAccepted],
  );

  const handleStart = async () => {
    await signUp({
      dateOfBirth,
      privacyNoticeVersion: privacyVersion,
      tosVersion,
      consents: {
        ageConfirmed,
        videoConsent,
        aiModerationConsent: aiConsent,
        termsAccepted,
        privacyNoticeVersion: privacyVersion,
        tosVersion,
      },
    });
    navigate('/home');
  };

  return (
    <>
      <section className="hero-split">
        <div className="hero-content">
          <h1 className="hero-title">
            No Profiles.<br />
            Just Chemistry.
          </h1>
          <p className="body-large">
            Verity eliminates swipe fatigue. Meet in a live, 45-second video call. 
            Mutual reveal only. Instant connection.
          </p>

          <div className="card auth-card-wide">
            <h2 className="section-title section-title-sm">Start Anonymously</h2>
            
            <div className="grid-gap-sm">
              <label className="body-standard flex-between">
                <span className="caption">Date of Birth (18+)</span>
                <input
                  className="input w-auto"
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                />
              </label>

              <label className="body-standard flex-center checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
                />
                I am 18 years or older
              </label>

              <label className="body-standard flex-center checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={videoConsent}
                  onChange={(event) => setVideoConsent(event.target.checked)}
                />
                I consent to 45s video calls (unrecorded)
              </label>

              <label className="body-standard flex-center checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={aiConsent}
                  onChange={(event) => setAiConsent(event.target.checked)}
                />
                I consent to real-time AI moderation
              </label>
              
              <label className="body-standard flex-center checkbox-label">
                <input
                  type="checkbox"
                  className="checkbox-input"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                />
                <span>I agree to the <Link to="/legal/terms" className="text-gold">Terms</Link> & <Link to="/legal/privacy" className="text-gold">Privacy</Link></span>
              </label>
            </div>

            <button
              className="btn btn-primary animate-pulse mt-lg w-full"
              onClick={() => void handleStart()}
              disabled={loading || !ready}
            >
              {loading ? 'Creating Profile...' : 'Go Live'}
            </button>
          </div>
          
           <p className="caption mt-md">
            By continuing you acknowledge our <Link to="/legal/cookies" style={{ color: 'var(--silver)', textDecoration: 'underline' }}>Cookie Notice</Link> and <Link to="/legal/community" style={{ color: 'var(--silver)', textDecoration: 'underline' }}>Community Guidelines</Link>.
          </p>
        </div>

        <div className="hero-visual">
          <svg width="300" height="300" viewBox="0 0 300 300" fill="none">
             <defs>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--lux-gold)" />
                <stop offset="100%" stopColor="#F2D06B" />
              </linearGradient>
            </defs>
            <circle cx="150" cy="150" r="120" stroke="url(#goldGrad)" strokeWidth="1" opacity="0.3">
               <animate attributeName="r" values="120;130;120" dur="6s" repeatCount="indefinite" />
            </circle>
            <circle cx="150" cy="150" r="90" stroke="var(--paper-white)" strokeWidth="0.5" opacity="0.6">
               <animate attributeName="r" values="90;100;90" dur="4s" repeatCount="indefinite" />
            </circle>
             <path d="M150 100 L150 200" stroke="var(--lux-gold)" strokeWidth="2" strokeLinecap="round">
               <animate attributeName="d" values="M150 100 L150 200; M150 120 L150 180; M150 100 L150 200" dur="3s" repeatCount="indefinite" />
             </path>
             <path d="M100 150 L200 150" stroke="var(--lux-gold)" strokeWidth="2" strokeLinecap="round">
                <animate attributeName="d" values="M100 150 L200 150; M120 150 L180 150; M100 150 L200 150" dur="3s" repeatCount="indefinite" />
             </path>
          </svg>
        </div>
      </section>

      {/* How It Works */}
      <section className="mt-lg mb-md">
        <h2 className="section-title text-center">How It Works</h2>
        <div className="grid-3">
          <div className="card text-center">
             <h3 className="body-large text-white-bold">1. Join The Queue</h3>
             <p className="body-standard mt-md">Enter the live waiting room. No browsing, just join.</p>
          </div>
          <div className="card text-center">
             <h3 className="body-large text-white-bold">2. {flags.sessionDurationSeconds}s Date</h3>
             <p className="body-standard mt-md">Connect instantly via video. Audio on. No filters.</p>
          </div>
           <div className="card text-center">
             <h3 className="body-large text-white-bold">3. Decide</h3>
             <p className="body-standard mt-md">Private decision. Mutual match reveals identities.</p>
          </div>
        </div>
      </section>

      {/* Safety */}
       <section className="card mb-md mt-lg">
        <div className="grid-3 items-center">
          <div>
            <h2 className="section-title">Safety by Design</h2>
          </div>
          <div className="span-2">
            <p className="body-large mb-md">
              Calls are never recorded. Real-time AI moderation detects and blocks unsafe behavior instantly.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};
