import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useFlags } from '../hooks/useFlags';
import { legalDocs } from '../legal/generated';

function toLegalVersion(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return value;
}

export const Onboarding: React.FC = () => {
  const { signUp, loading } = useAuth();
  const { flags } = useFlags();
  const navigate = useNavigate();

  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [videoConsent, setVideoConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const privacyVersion = toLegalVersion(legalDocs.privacy.updated);
  const tosVersion = toLegalVersion(legalDocs.terms.updated);

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
    setError(null);
    try {
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
    } catch {
      setError('Unable to create your account right now. Please try again.');
    }
  };

  return (
    <section className="hero-split">
      <div className="hero-content">
        <span className="pill">Video-first dating</span>
        <h1 className="hero-title">
          No Profiles.
          <br />
          Just Chemistry.
        </h1>
        <p className="body-large">
          Begin anonymous. Meet in a {flags.sessionDurationSeconds}-second live
          video call. Reveal only happens when both people say yes.
        </p>
        <div className="callout safety">
          <strong>About sign-in</strong>
          <p className="subtle mt-xs">
            Verity currently uses secure anonymous auth + optional phone/email
            verification after signup.
          </p>
        </div>
      </div>

      <form
        className="card auth-card-wide grid-gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void handleStart();
        }}
      >
        <h2 className="section-title section-title-sm">Start Anonymously</h2>

        <label className="body-standard stack tight" htmlFor="dob-input">
          <span className="caption">Date of Birth (18+)</span>
          <input
            id="dob-input"
            className="input"
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={ageConfirmed}
            onChange={(event) => setAgeConfirmed(event.target.checked)}
          />
          I am 18 years or older
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={videoConsent}
            onChange={(event) => setVideoConsent(event.target.checked)}
          />
          I consent to 45s video calls (unrecorded)
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={aiConsent}
            onChange={(event) => setAiConsent(event.target.checked)}
          />
          I consent to real-time AI moderation
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            className="checkbox-input"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
          />
          <span>
            I agree to the <Link to="/legal/terms">Terms</Link> &{' '}
            <Link to="/legal/privacy">Privacy</Link>
          </span>
        </label>

        <button
          className="button w-full"
          disabled={loading || !ready}
          type="submit"
        >
          {loading ? 'Creating Profile...' : 'Go Live'}
        </button>

        {error && (
          <p className="subtle text-danger" role="alert">
            {error}
          </p>
        )}

        <p className="subtle">
          By continuing you acknowledge our{' '}
          <Link to="/legal/cookies">Cookie Notice</Link> and{' '}
          <Link to="/legal/community">Community Guidelines</Link>.
        </p>
      </form>
    </section>
  );
};
