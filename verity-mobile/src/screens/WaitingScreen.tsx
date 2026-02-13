import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../components/ThemedButton';
import ThemedScreen from '../components/ThemedScreen';
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import { trackEvent } from '../services/analytics';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

const WAIT_TIMEOUT_SECONDS = 45;

export default function WaitingScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, estimatedSeconds, leaveQueue, match, usersSearching, queueKey } =
    useQueue();
  const statusRef = useRef(status);
  const lastNavigatedSessionRef = useRef<string | null>(null);
  const timeoutPromptTrackedRef = useRef(false);
  const [seconds, setSeconds] = useState(0);
  const [showTimeoutPrompt, setShowTimeoutPrompt] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!match) {
      return;
    }

    const sessionKey = match.sessionId ?? '__unknown_session__';
    if (lastNavigatedSessionRef.current === sessionKey) {
      return;
    }

    lastNavigatedSessionRef.current = sessionKey;
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'VideoCall' as never,
          params: match as never,
        },
      ],
    });
  }, [match, navigation]);

  useEffect(() => {
    if (status !== 'waiting') {
      return;
    }
    if (showTimeoutPrompt || timeoutPromptTrackedRef.current) {
      return;
    }
    if (seconds < WAIT_TIMEOUT_SECONDS) {
      return;
    }
    timeoutPromptTrackedRef.current = true;
    setShowTimeoutPrompt(true);
    trackEvent('queue_timeout_shown', {
      queueKey: queueKey ?? '',
      elapsedSeconds: seconds,
    });
  }, [queueKey, seconds, showTimeoutPrompt, status]);

  useEffect(() => {
    return () => {
      if (statusRef.current === 'matched' || statusRef.current === 'idle') {
        return;
      }
      void leaveQueue().then((refund) => {
        if (refund) {
          const balance = user?.tokenBalance ?? 0;
          void setUser({ ...(user ?? { id: '' }), tokenBalance: balance + 1 });
        }
      });
    };
  }, [leaveQueue, setUser, user]);

  const handleCancel = async (origin: 'manual' | 'timeout') => {
    const refund = await leaveQueue();
    if (origin === 'timeout') {
      trackEvent('queue_timeout_leave', {
        queueKey: queueKey ?? '',
        elapsedSeconds: seconds,
        refunded: refund,
      });
    }
    if (refund) {
      const balance = user?.tokenBalance ?? 0;
      await setUser({ ...(user ?? { id: '' }), tokenBalance: balance + 1 });
    }
    navigation.goBack();
  };

  const handleKeepSearching = () => {
    setShowTimeoutPrompt(false);
    trackEvent('queue_timeout_continue', {
      queueKey: queueKey ?? '',
      elapsedSeconds: seconds,
    });
  };

  const statusCopy =
    typeof usersSearching === 'number'
      ? `${usersSearching} users currently searching`
      : estimatedSeconds
        ? `Estimated wait: ${estimatedSeconds}s`
        : 'Hang tight - matching fast.';

  return (
    <ThemedScreen center>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.title}>
        {status === 'joining' ? 'Joining queue...' : 'Finding match...'}
      </Text>
      <Text style={styles.subtitle}>{statusCopy}</Text>
      <Text style={styles.timer}>{`${Math.floor(seconds / 60)}:${(seconds % 60)
        .toString()
        .padStart(2, '0')}`}</Text>
      {showTimeoutPrompt && (
        <View style={styles.timeoutCard}>
          <Text style={styles.timeoutTitle}>No one nearby yet.</Text>
          <Text style={styles.timeoutBody}>
            Keep searching or leave now. If you leave before a match is made,
            your token is refunded.
          </Text>
          <View style={styles.timeoutActions}>
            <ThemedButton
              label="Keep searching"
              variant="outline"
              onPress={handleKeepSearching}
            />
            <ThemedButton
              label="Leave queue"
              variant="dangerOutline"
              onPress={() => void handleCancel('timeout')}
            />
          </View>
        </View>
      )}
      <View style={styles.buttonRow}>
        <ThemedButton
          label="Leave queue"
          variant="outline"
          onPress={() => void handleCancel('manual')}
        />
      </View>
    </ThemedScreen>
  );
}

const createStyles = (colors: { text: string; muted: string }) =>
  StyleSheet.create({
    title: {
      fontSize: typography.md,
      fontWeight: '600',
      color: colors.text,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      textAlign: 'center',
    },
    timer: {
      marginTop: spacing.md,
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
    },
    buttonRow: {
      marginTop: spacing.xl,
      width: '70%',
    },
    timeoutCard: {
      marginTop: spacing.lg,
      width: '88%',
      borderWidth: 1,
      borderColor: colors.muted,
      borderRadius: 16,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.02)',
    },
    timeoutTitle: {
      fontSize: typography.md,
      fontWeight: '700',
      color: colors.text,
    },
    timeoutBody: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: 20,
    },
    timeoutActions: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
  });
