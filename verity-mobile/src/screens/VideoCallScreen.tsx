import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import CountdownTimer from '../components/CountdownTimer';
import LocalVideoView from '../components/LocalVideoView';
import RemoteVideoView from '../components/RemoteVideoView';
import { leaveAgoraChannel, setupAgoraEngine } from '../services/agora';
import { useWebSocket } from '../hooks/useWebSocket';
import ThemedButton from '../components/ThemedButton';
import { useTheme } from '../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../theme/tokens';

const LEGACY_BOOTSTRAP_FALLBACK_DELAY_MS = 1500;
const DEFAULT_CALL_DURATION_SECONDS = 45;

type VideoCallParams = {
  sessionId?: string;
  partnerId?: string;
  partnerAnonymousId?: string;
  queueKey?: string;
  matchedAt?: string;
  channelToken?: string;
  agoraChannel?: string;
};

export default function VideoCallScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as VideoCallParams | undefined;
  const routeSessionId = params?.sessionId;

  const { colors } = useTheme();
  const { videoSocket, lastSessionStart } = useWebSocket();
  const [legacyBootstrapEnabled, setLegacyBootstrapEnabled] = useState(false);
  const sessionStart =
    lastSessionStart &&
    (!routeSessionId || lastSessionStart.sessionId === routeSessionId)
      ? lastSessionStart
      : null;
  const sessionId = routeSessionId ?? sessionStart?.sessionId;
  const channelToken =
    sessionStart?.rtc.token ??
    (legacyBootstrapEnabled ? params?.channelToken : undefined);
  const agoraChannel =
    sessionStart?.channelName ??
    (legacyBootstrapEnabled ? params?.agoraChannel : undefined);
  const rtcUid = sessionStart?.rtc.uid;
  const durationSeconds =
    sessionStart?.durationSeconds ?? DEFAULT_CALL_DURATION_SECONDS;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [muted, setMuted] = useState(false);
  const [cameraFront, setCameraFront] = useState(true);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [statusText, setStatusText] = useState(
    'Waiting for session to start...',
  );

  const endSession = useCallback(() => {
    leaveAgoraChannel();
    if (!sessionId) {
      navigation.reset({
        index: 0,
        routes: [
          { name: 'Main' as never, params: { screen: 'Home' } as never },
        ],
      });
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Decision' as never, params: { sessionId } as never }],
    });
  }, [navigation, sessionId]);

  useEffect(() => {
    if (sessionStart) {
      setLegacyBootstrapEnabled(false);
      return;
    }
    const timer = setTimeout(() => {
      setLegacyBootstrapEnabled(true);
    }, LEGACY_BOOTSTRAP_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessionStart, routeSessionId]);

  useEffect(() => {
    if (!agoraChannel || !channelToken) {
      setStatusText('Waiting for session to start...');
      return;
    }

    let isMounted = true;
    setupAgoraEngine({
      channel: agoraChannel,
      token: channelToken,
      uid: rtcUid,
      onJoinSuccess: () => {
        if (!isMounted) return;
        setJoined(true);
        setStatusText('Live now');
      },
      onUserJoined: (uid) => {
        if (!isMounted) return;
        setRemoteUid(uid);
      },
      onUserOffline: () => {
        if (!isMounted) return;
        setRemoteUid(null);
        setStatusText('Partner disconnected');
      },
      onTokenWillExpire: () => {
        if (!isMounted) return;
        setStatusText('Session ending soon...');
      },
    }).catch(() => {
      if (!isMounted) return;
      setStatusText('Unable to start video.');
    });

    return () => {
      isMounted = false;
      leaveAgoraChannel();
    };
  }, [agoraChannel, channelToken, rtcUid]);

  useEffect(() => {
    if (!videoSocket) {
      return;
    }
    const handleSessionEnd = (payload: { sessionId?: string }) => {
      if (!payload?.sessionId || payload.sessionId === sessionId) {
        endSession();
      }
    };
    videoSocket.on('session:end', handleSessionEnd);
    return () => {
      videoSocket.off('session:end', handleSessionEnd);
    };
  }, [videoSocket, sessionId, endSession]);

  const handleToggleMute = async () => {
    try {
      const engine = await setupAgoraEngine();
      const next = !muted;
      engine?.muteLocalAudioStream(next);
      setMuted(next);
    } catch {
      setStatusText('Audio controls unavailable');
    }
  };

  const handleFlipCamera = async () => {
    try {
      const engine = await setupAgoraEngine();
      engine?.switchCamera();
      setCameraFront((prev) => !prev);
    } catch {
      setStatusText('Camera switch unavailable');
    }
  };

  if (!sessionId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Unable to start call</Text>
        <Text style={styles.subtitle}>Missing session details.</Text>
        <ThemedButton
          label="Back to Home"
          onPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoGrid}>
        <RemoteVideoView uid={remoteUid} />
        <View style={styles.localWrapper}>
          <LocalVideoView />
        </View>
      </View>

      <View style={styles.overlay}>
        <CountdownTimer
          durationSeconds={durationSeconds}
          isActive={joined}
          onComplete={endSession}
          testID="call-countdown"
        />
        <Text style={styles.status}>{statusText}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleToggleMute}
        >
          <Text style={styles.controlText}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleFlipCamera}
        >
          <Text style={styles.controlText}>
            {cameraFront ? 'Rear cam' : 'Front cam'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, styles.hangup]}
          onPress={endSession}
        >
          <Text style={styles.controlText}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  background: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    videoGrid: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    localWrapper: {
      position: 'absolute',
      bottom: spacing.lg,
      right: spacing.lg,
      width: 120,
      height: 160,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    overlay: {
      position: 'absolute',
      top: spacing.xl,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    status: {
      marginTop: spacing.sm,
      fontSize: typography.sm,
      color: colors.muted,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    controlButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    controlText: {
      color: '#FFFFFF',
      fontSize: typography.sm,
      lineHeight: lineHeights.base,
    },
    hangup: {
      backgroundColor: '#D63A3A',
    },
    title: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
  });
