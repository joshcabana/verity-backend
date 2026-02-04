import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Onboarding: React.FC = () => {
  const { signUp, loading } = useAuth();
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
        dateOfBirth && ageConfirmed && videoConsent && aiConsent && termsAccepted,
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
        <div className="input-stack">
          <label className="subtle">
            Date of birth (18+)
            <input
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </label>
          <label className="subtle">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(event) => setAgeConfirmed(event.target.checked)}
            />
            I confirm I am 18 or older.
          </label>
          <label className="subtle">
            <input
              type="checkbox"
              checked={videoConsent}
              onChange={(event) => setVideoConsent(event.target.checked)}
            />
            I consent to 45-second video calls (not recorded).
          </label>
          <label className="subtle">
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(event) => setAiConsent(event.target.checked)}
            />
            I consent to real-time AI moderation for safety.
          </label>
          <label className="subtle">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
            />
            I agree to the{' '}
            <Link to="/legal/terms">Terms</Link> and{' '}
            <Link to="/legal/privacy">Privacy Policy</Link>.
          </label>
        </div>
        <button className="button" onClick={handleStart} disabled={loading || !ready}>
          {loading ? 'Creating profile...' : 'Start anonymously'}
        </button>
        <p className="subtle">
          By continuing you acknowledge our{' '}
          <Link to="/legal/cookies">Cookie Notice</Link> and{' '}
          <Link to="/legal/community">Community Guidelines</Link>.
        </p>
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
