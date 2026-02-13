import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IAgoraRTCClient, ILocalTrack } from 'agora-rtc-sdk-ng';
import { trackEvent } from '../analytics/events';
import { useFlags } from '../hooks/useFlags';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { ReportDialog } from '../components/ReportDialog';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID as string | undefined;
type SessionStartPayload = { sessionId: string; channelName: string; rtc: { token: string; uid: number }; endAt: string; durationSeconds: number };
type SessionEndPayload = { sessionId: string; reason: 'timeout' | 'ended' | 'token_error' };

export const Session: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (!socket) return;

    const handleStart = (payload: SessionStartPayload) => {
      if (sessionId && payload.sessionId !== sessionId) return;
      setSession(payload);
      setStatus('live');
      trackEvent('session_started', { sessionId: payload.sessionId, durationSeconds: payload.durationSeconds });
    };

    const handleEnd = (payload: SessionEndPayload) => {
      if (sessionId && payload.sessionId !== sessionId) return;
      setStatus('ended');
      trackEvent('session_ended', { sessionId: payload.sessionId, endReason: payload.reason });
    };

    socket.on('session:start', handleStart);
    socket.on('session:end', handleEnd);
    return () => {
      socket.off('session:start', handleStart);
      socket.off('session:end', handleEnd);
    };
  }, [sessionId, socket]);

  useEffect(() => {
    if (!session) return;
    const endTime = new Date(session.endAt).getTime();
    const timer = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((endTime - Date.now()) / 1000))), 500);
    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session || !AGORA_APP_ID) return;
    let mounted = true;

    const startAgora = async () => {
      try {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', (user, mediaType) => {
          void (async () => {
            await client.subscribe(user, mediaType);
            if (mediaType === 'video' && remoteVideoRef.current) user.videoTrack?.play(remoteVideoRef.current);
            if (mediaType === 'audio') user.audioTrack?.play();
          })();
        });

        await client.join(AGORA_APP_ID, session.channelName, session.rtc.token, session.rtc.uid);
        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = tracks;
        tracks[1].play(localVideoRef.current!);
        await client.publish(tracks);
      } catch {
        if (mounted) setError('Unable to connect camera/audio. Check permissions and try again.');
      }
    };

    void startAgora();
    return () => {
      mounted = false;
      localTracksRef.current.forEach((track) => { track.stop(); track.close(); });
      localTracksRef.current = [];
      if (clientRef.current) void clientRef.current.leave();
    };
  }, [session]);

  const callStatus = useMemo(() => {
    if (status === 'waiting') return 'Waiting for session start…';
    if (status === 'ended') return 'Session ended';
    if (secondsLeft !== null) return `Session live · ${secondsLeft}s remaining`;
    return `Session live · ${flags.sessionDurationSeconds}s`;
  }, [flags.sessionDurationSeconds, secondsLeft, status]);

  return (
    <section className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Live date</h2>
          <span className="pill">{status === 'live' ? 'Live' : status === 'ended' ? 'Ended' : 'Connecting'}</span>
        </div>
        <p className="subtle">{callStatus}</p>
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="video-grid">
          <div className="video-tile" ref={localVideoRef}><span className="video-label">You</span></div>
          <div className="video-tile" ref={remoteVideoRef}><span className="video-label">Match</span></div>
        </div>

        <div className="rounded-2xl border border-violet/30 bg-violet/10 p-3 text-sm text-mist">Unrecorded call. Use report if anything feels unsafe.</div>

        {status === 'ended' && sessionId && <button className="btn-primary" onClick={() => navigate(`/decision/${sessionId}`)}>Continue to decision</button>}
        {flags.reportDialogEnabled && <ReportDialog reportedUserId={null} contextLabel="Reports are reviewed by our safety team." />}
      </div>
    </section>
  );
};
