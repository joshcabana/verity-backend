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
  const [error, setError] = useState<string | null>(null);

  const privacyVersion = '2026-02-04';
  const tosVersion = '2026-02-04';

  const ready = useMemo(
    () => Boolean(dateOfBirth && ageConfirmed && videoConsent && aiConsent && termsAccepted),
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
      setError('Unable to create your account right now.');
    }
  };

  return (
    <section className="mx-auto grid max-w-3xl gap-6">
      <div className="text-center space-y-3">
        <span className="pill">Welcome to Verity</span>
        <h1 className="text-4xl font-bold tracking-tight">No profiles. Just chemistry.</h1>
        <p className="text-mist">Start anonymous, then meet in a {flags.sessionDurationSeconds}-second live video date.</p>
      </div>

      <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); void handleStart(); }}>
        <label className="block space-y-2 text-sm">
          <span>Date of Birth (18+)</span>
          <input className="input" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </label>

        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />I am 18 years or older</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={videoConsent} onChange={(e) => setVideoConsent(e.target.checked)} />I consent to 45s video calls (unrecorded)</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />I consent to real-time AI moderation</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />I agree to the <Link className="text-gold" to="/legal/terms">Terms</Link> & <Link className="text-gold" to="/legal/privacy">Privacy</Link></label>

        <button className="btn-primary w-full" disabled={!ready || loading} type="submit">{loading ? 'Creating profile…' : 'Go live'}</button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </section>
  );
};
