import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { IAgoraRTCClient, ILocalTrack } from 'agora-rtc-sdk-ng';
import { trackEvent } from '../analytics/events';
import { useFlags } from '../hooks/useFlags';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { ReportDialog } from '../components/ReportDialog';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID as string | undefined;

type SessionStartPayload = {
  sessionId: string;
  channelName: string;
  rtc: { token: string; uid: number };
  rtm: { token: string; userId: string };
  startAt: string;
  endAt: string;
  expiresAt: string;
  durationSeconds: number;
};

type SessionEndPayload = {
  sessionId: string;
  reason: 'timeout' | 'ended' | 'token_error';
  endedAt: string;
};

export const Session: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { flags } = useFlags();
  const { token } = useAuth();
  const socket = useSocket('/video', token);
  const [session, setSession] = useState<SessionStartPayload | null>(null);
  const [status, setStatus] = useState<'waiting' | 'live' | 'ended'>('waiting');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<ILocalTrack[]>([]);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);

  const matchPayload = location.state as { partnerId?: string } | null;
  const partnerId = matchPayload?.partnerId ?? null;

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleStart = (payload: SessionStartPayload) => {
      if (sessionId && payload.sessionId !== sessionId) {
        return;
      }
      setSession(payload);
      setStatus('live');
      trackEvent('session_started', {
        sessionId: payload.sessionId,
        durationSeconds: payload.durationSeconds,
      });
    };

    const handleEnd = (payload: SessionEndPayload) => {
      if (sessionId && payload.sessionId !== sessionId) {
        return;
      }
      setStatus('ended');
      trackEvent('session_ended', {
        sessionId: payload.sessionId,
        endReason: payload.reason,
      });
    };

    socket.on('session:start', handleStart);
    socket.on('session:end', handleEnd);

    return () => {
      socket.off('session:start', handleStart);
      socket.off('session:end', handleEnd);
    };
  }, [socket, sessionId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const endTime = new Date(session.endAt).getTime();
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }, 500);

    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session || !AGORA_APP_ID) {
      return;
    }

    let mounted = true;

    const startAgora = async () => {
      try {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        if (!mounted) {
          return;
        }
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video' && remoteVideoRef.current) {
            user.videoTrack?.play(remoteVideoRef.current);
          }
          if (mediaType === 'audio') {
            user.audioTrack?.play();
          }
        });

        client.on('user-unpublished', () => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.innerHTML = '';
          }
        });

        await client.join(
          AGORA_APP_ID,
          session.channelName,
          session.rtc.token,
          session.rtc.uid,
        );

        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = tracks;

        if (localVideoRef.current) {
          tracks[1].play(localVideoRef.current);
        }

        await client.publish(tracks);
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError('Unable to connect to Agora. Check your app ID and tokens.');
      }
    };

    void startAgora();

    return () => {
      mounted = false;
      const client = clientRef.current;
      localTracksRef.current.forEach((track) => {
        track.stop();
        track.close();
      });
      localTracksRef.current = [];
      if (client) {
        client.removeAllListeners();
        void client.leave();
      }
    };
  }, [session]);

  const callStatus = useMemo(() => {
    if (status === 'waiting') {
      return 'Waiting for session start…';
    }
    if (status === 'ended') {
      return 'Session ended';
    }
    if (secondsLeft !== null) {
      return `Session live · ${secondsLeft}s remaining`;
    }
    return 'Session live';
  }, [status, secondsLeft]);

  return (
    <section className="grid" style={{ gap: '24px' }}>
      <div className="card">
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Video session</h2>
          <span className={`pill ${status === 'ended' ? 'warning' : 'success'}`}>
            {status === 'waiting' ? 'Connecting' : status === 'ended' ? 'Ended' : 'Live'}
          </span>
        </div>
        <p className="subtle">{callStatus}</p>
        {matchPayload?.partnerId && (
          <p className="subtle">Partner ID: {matchPayload.partnerId}</p>
        )}
        {error && <p className="subtle">{error}</p>}
        <div className="video-grid" style={{ marginTop: '20px' }}>
          <div className="video-tile" ref={localVideoRef}>
            <span className="video-label">You</span>
          </div>
          <div className="video-tile" ref={remoteVideoRef}>
            <span className="video-label">Match</span>
          </div>
        </div>
        <div className="callout safety" style={{ marginTop: '20px' }}>
          <strong>Safety reminder</strong>
          <p className="subtle">
            This session is not recorded. You can report any unsafe behavior at any time.
          </p>
        </div>
        {status === 'ended' && sessionId && (
          <button
            className="button"
            style={{ marginTop: '20px' }}
            onClick={() => navigate(`/decision/${sessionId}`)}
          >
            Continue to decision
          </button>
        )}
        {flags.reportDialogEnabled && (
          <div style={{ marginTop: '16px' }}>
            <ReportDialog
              reportedUserId={partnerId}
              contextLabel="Reports are reviewed by our safety team."
            />
          </div>
        )}
      </div>
    </section>
  );
};
