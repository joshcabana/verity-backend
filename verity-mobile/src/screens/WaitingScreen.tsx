import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../components/ThemedButton';
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
  const {
    status,
    estimatedSeconds,
    leaveQueue,
    match,
    usersSearching,
    queueKey,
  } = useQueue();
  
  const statusRef = useRef(status);
  const lastNavigatedSessionRef = useRef<string | null>(null);
  const timeoutPromptTrackedRef = useRef(false);
  const [seconds, setSeconds] = useState(0);
  const [showTimeoutPrompt, setShowTimeoutPrompt] = useState(false);

  /* Animation Refs */
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse Animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotate Animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
      ? `${usersSearching} Online`
      : estimatedSeconds
        ? `< ${estimatedSeconds}s Wait`
        : 'Matching fast...';

  // Timer string
  const timerStr = `${Math.floor(seconds / 60)}:${(seconds % 60)
    .toString()
    .padStart(2, '0')}`;

  return (
    <View style={styles.screen}>
      {/* Portal Visual Component Inline */}
      <View style={styles.visualContainer}>
        <View style={styles.coreGlow} />
        <Animated.View 
          style={[
            styles.pulseRing, 
            { transform: [{ scale: pulseAnim }] }
          ]} 
        />
        <Animated.View 
          style={[
            styles.orbitRing, 
            { transform: [{ rotate: spin }] }
          ]} 
        />
        <View style={styles.timerContainer}>
           <Text style={styles.timerText}>{timerStr}</Text>
        </View>
      </View>

      <Text style={styles.title}>
        {status === 'joining' ? 'Joining Queue...' : 'Finding Partner...'}
      </Text>
      <Text style={styles.subtitle}>{statusCopy}</Text>

      {showTimeoutPrompt ? (
        <View style={styles.timeoutCard}>
          <Text style={styles.timeoutTitle}>Still looking...</Text>
          <Text style={styles.timeoutBody}>
            Top matches are worth the wait.
            Refund on exit.
          </Text>
          <View style={styles.timeoutActions}>
            <ThemedButton
              label="Wait"
              onPress={handleKeepSearching}
            />
            <ThemedButton
              label="Leave"
              variant="outline"
              onPress={() => void handleCancel('timeout')}
            />
          </View>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <ThemedButton
            label="Cancel"
            variant="ghost"
            onPress={() => void handleCancel('manual')}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background || '#000',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    visualContainer: {
      width: 300,
      height: 300,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xxl,
      position: 'relative',
    },
    coreGlow: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
      opacity: 0.8,
      shadowColor: colors.primary,
      shadowOpacity: 0.8,
      shadowRadius: 20,
    },
    pulseRing: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 1,
      borderColor: colors.primary,
      opacity: 0.6,
    },
    orbitRing: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: 1,
      borderColor: '#333',
      borderStyle: 'dotted',
    },
    timerContainer: {
        position: 'absolute',
        bottom: 80,
    },
    timerText: {
        color: colors.primary,
        fontSize: typography.xs,
        fontFamily: 'SpaceGrotesk_500Medium',
        letterSpacing: 1,
    },
    title: {
      fontSize: 32,
      fontFamily: 'SpaceGrotesk_700Bold',
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.md,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    buttonRow: {
      marginTop: spacing.xl,
      width: '50%',
      opacity: 0.6,
    },
    timeoutCard: {
      marginTop: spacing.lg,
      width: '100%',
      maxWidth: 340,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 16,
      padding: spacing.lg,
      gap: spacing.md,
      backgroundColor: 'rgba(20, 0, 0, 0.3)',
    },
    timeoutTitle: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
    },
    timeoutBody: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: 20,
    },
    timeoutActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xs,
    },
  });
