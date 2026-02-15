import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { getDailyIntention } from '../content/prompts';
import { useFlags } from '../hooks/useFlags';

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
type CurrentUser = {
  id: string;
  displayName?: string | null;
  age?: number | null;
  bio?: string | null;
  interests?: string[] | null;
  photos?: string[] | null;
  phone?: string | null;
  email?: string | null;
};

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { flags } = useFlags();

  const [city, setCity] = useState('canberra');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [interestsText, setInterestsText] = useState('');
  const [photosText, setPhotosText] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationBusy, setVerificationBusy] = useState<'phone' | 'email' | null>(null);

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

  const profileQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const response = await apiJson<CurrentUser>('/users/me');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load profile');
      }
      return response.data;
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) {
      return;
    }
    setDisplayName(profile.displayName ?? '');
    setAge(profile.age ? String(profile.age) : '');
    setBio(profile.bio ?? '');
    setInterestsText((profile.interests ?? []).join(', '));
    setPhotosText((profile.photos ?? []).join('\n'));
    setPhone(profile.phone ?? '');
    setEmail(profile.email ?? '');
  }, [profileQuery.data]);

  const tokenBalance = balanceQuery.data ?? 0;
  const canJoin = tokenBalance > 0 && !joining;

  const dailyIntention = useMemo(() => getDailyIntention(), []);

  const handleJoin = async () => {
    if (!canJoin) {
      return;
    }

    setJoinError(null);
    trackEvent('queue_join_requested', { city });
    setJoining(true);

    try {
      const response = await apiJson<{ queueKey?: string; position?: number }>(
        '/queue/join',
        {
          method: 'POST',
          body: { city, preferences: {} },
        },
      );

      if (!response.ok) {
        setJoinError('Unable to join queue. Check your token balance and try again.');
        return;
      }

      trackEvent('queue_joined', {
        city,
        queueKey: response.data?.queueKey ?? '',
        position: response.data?.position ?? -1,
      });

      navigate('/waiting');
    } catch {
      setJoinError('Unable to join queue. Check your network and try again.');
    } finally {
      setJoining(false);
    }
  };

  const handlePurchase = async (packId: 'starter' | 'plus' | 'pro') => {
    setCheckoutError(null);
    trackEvent('token_purchase_started', { packId });

    try {
      const response = await apiJson<PurchaseResponse>('/tokens/purchase', {
        method: 'POST',
        body: { packId },
      });

      if (response.ok && response.data?.url) {
        window.location.href = response.data.url;
        return;
      }

      setCheckoutError('Stripe checkout is not configured right now.');
    } catch {
      setCheckoutError('Unable to start checkout right now. Try again.');
    }
  };

  const handleProfileSave = async () => {
    setProfileNotice(null);
    setProfileSaving(true);

    const interests = interestsText
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 12);

    const photos = photosText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 6);

    const normalizedAge = Number.parseInt(age.trim(), 10);
    const hasAgeInput = age.trim().length > 0;
    const ageIsValid =
      Number.isFinite(normalizedAge) && normalizedAge >= 18 && normalizedAge <= 120;

    if (hasAgeInput && !ageIsValid) {
      setProfileNotice('Please enter a valid age between 18 and 120.');
      setProfileSaving(false);
      return;
    }

    try {
      const response = await apiJson('/users/me', {
        method: 'PATCH',
        body: {
          displayName: displayName.trim() || undefined,
          age: ageIsValid ? normalizedAge : undefined,
          bio: bio.trim() || undefined,
          interests,
          photos,
        },
      });

      if (!response.ok) {
        setProfileNotice('Could not save profile details.');
        return;
      }

      setProfileNotice('Profile updated.');
      await profileQuery.refetch();
    } catch {
      setProfileNotice('Could not save profile details. Check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const verifyPhone = async () => {
    if (!phone.trim() || !phoneCode.trim()) {
      setVerificationNotice('Enter phone number and code first.');
      return;
    }
    setVerificationNotice(null);
    setVerificationBusy('phone');
    try {
      const response = await apiJson('/auth/verify-phone', {
        method: 'POST',
        body: {
          phone: phone.trim(),
          code: phoneCode.trim(),
        },
      });
      setVerificationNotice(
        response.ok
          ? 'Phone verification submitted.'
          : 'Phone verification failed. Check format/code.',
      );
    } catch {
      setVerificationNotice('Phone verification failed. Check your connection and try again.');
    } finally {
      setVerificationBusy(null);
    }
  };

  const verifyEmail = async () => {
    if (!email.trim() || !emailCode.trim()) {
      setVerificationNotice('Enter email and code first.');
      return;
    }
    setVerificationNotice(null);
    setVerificationBusy('email');
    try {
      const response = await apiJson('/auth/verify-email', {
        method: 'POST',
        body: {
          email: email.trim(),
          code: emailCode.trim(),
        },
      });
      setVerificationNotice(
        response.ok
          ? 'Email verification submitted.'
          : 'Email verification failed. Check address/code.',
      );
    } catch {
      setVerificationNotice('Email verification failed. Check your connection and try again.');
    } finally {
      setVerificationBusy(null);
    }
  };

  return (
    <section className="grid gap-6">
      <div className="hero-split">
        <div className="hero-content">
          <span className="pill">No swiping. Real presence.</span>
          <h1 className="hero-title">
            No Profiles.
            <br />
            Just Chemistry.
          </h1>
          <p className="body-large">
            Enter a live queue, meet for {flags.sessionDurationSeconds} seconds,
            and decide privately. Mutual match unlocks reveal and chat.
          </p>

          <div className="callout" id="home-primary-live">
            <div className="flex-between mb-md">
              <span className="caption">Select City</span>
              <span className="caption text-gold">{tokenBalance} tokens available</span>
            </div>

            <select
              className="input mb-md"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              aria-label="Select City"
            >
              {CITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button className="button w-full" onClick={() => void handleJoin()} disabled={!canJoin}>
              {joining ? 'Connecting...' : 'Go Live'}
            </button>

            {joinError && (
              <p className="subtle text-danger mt-xs" role="alert">
                {joinError}
              </p>
            )}
          </div>
        </div>

        <div className="card" id="home-how-it-works">
          <h2 className="section-title section-title-sm">How Verity works</h2>
          <ol className="list subtle mt-xs">
            <li>Spend one token to join the live city queue.</li>
            <li>Meet on an anonymous 45s real-time video date.</li>
            <li>Both privately choose match or pass.</li>
            <li>Mutual match reveals identities and unlocks chat.</li>
          </ol>
          <div className="callout safety mt-md" id="home-safety">
            <strong>Daily intention</strong>
            <p className="subtle mt-xs">“{dailyIntention}”</p>
          </div>
        </div>
      </div>

      <div className="grid-3" id="home-pricing">
        <div className="card text-center">
          <p className="caption">Starter</p>
          <h3 className="section-title section-title-sm">3 Tokens</h3>
          <button className="button w-full" onClick={() => void handlePurchase('starter')}>
            Buy Starter
          </button>
        </div>
        <div className="card text-center soft">
          <p className="caption">Plus</p>
          <h3 className="section-title section-title-sm">10 Tokens</h3>
          <button className="button w-full" onClick={() => void handlePurchase('plus')}>
            Buy Plus
          </button>
        </div>
        <div className="card text-center">
          <p className="caption">Pro</p>
          <h3 className="section-title section-title-sm">30 Tokens</h3>
          <button className="button w-full" onClick={() => void handlePurchase('pro')}>
            Buy Pro
          </button>
        </div>
      </div>

      {checkoutError && (
        <p className="subtle text-danger" role="alert">
          {checkoutError}
        </p>
      )}

      <div className="two" id="home-profile">
        <div className="card stack">
          <h2 className="section-title section-title-sm">Your profile</h2>
          <label className="subtle">
            Display name
            <input className="input mt-xs" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="subtle">
            Age
            <input className="input mt-xs" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} />
          </label>
          <label className="subtle">
            Bio
            <textarea className="textarea mt-xs" value={bio} onChange={(event) => setBio(event.target.value)} />
          </label>
          <label className="subtle">
            Interests (comma separated)
            <input className="input mt-xs" value={interestsText} onChange={(event) => setInterestsText(event.target.value)} />
          </label>
          <label className="subtle">
            Photo URLs (one per line)
            <textarea className="textarea mt-xs" value={photosText} onChange={(event) => setPhotosText(event.target.value)} />
          </label>
          <button className="button" onClick={() => void handleProfileSave()} disabled={profileSaving}>
            {profileSaving ? 'Saving...' : 'Save profile'}
          </button>
          {profileNotice && <p className="subtle">{profileNotice}</p>}
          {profileQuery.isError && (
            <p className="subtle text-danger">Unable to load current profile. You can still save updates.</p>
          )}
        </div>

        <div className="card stack">
          <h2 className="section-title section-title-sm">Verification</h2>
          <p className="subtle">
            Optional: verify phone/email to strengthen trust signals.
          </p>

          <label className="subtle">
            Phone (E.164)
            <input className="input mt-xs" placeholder="+61400 000 000" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="subtle">
            Phone code
            <input className="input mt-xs" value={phoneCode} onChange={(event) => setPhoneCode(event.target.value)} />
          </label>
          <button className="button secondary" onClick={() => void verifyPhone()} disabled={verificationBusy !== null}>
            {verificationBusy === 'phone' ? 'Verifying phone…' : 'Verify phone'}
          </button>

          <label className="subtle">
            Email
            <input className="input mt-xs" placeholder="spark@moonlight.mail" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="subtle">
            Email code
            <input className="input mt-xs" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} />
          </label>
          <button className="button secondary" onClick={() => void verifyEmail()} disabled={verificationBusy !== null}>
            {verificationBusy === 'email' ? 'Verifying email…' : 'Verify email'}
          </button>

          {verificationNotice && <p className="subtle">{verificationNotice}</p>}

          <p className="subtle">
            Need policy details? <Link to="/legal/privacy">Privacy</Link> ·{' '}
            <Link to="/legal/terms">Terms</Link>
          </p>
        </div>
      </div>
    </section>
  );
};
