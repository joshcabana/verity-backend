import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../components/ThemedButton';
import ThemedScreen from '../components/ThemedScreen';
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

export default function WaitingScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, estimatedSeconds, leaveQueue, match, usersSearching } =
    useQueue();
  const statusRef = useRef(status);
  const lastNavigatedSessionRef = useRef<string | null>(null);

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

  const handleCancel = async () => {
    const refund = await leaveQueue();
    if (refund) {
      const balance = user?.tokenBalance ?? 0;
      await setUser({ ...(user ?? { id: '' }), tokenBalance: balance + 1 });
    }
    navigation.goBack();
  };

  return (
    <ThemedScreen center>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.title}>
        {status === 'joining' ? 'Joining queue...' : 'Finding match...'}
      </Text>
      <Text style={styles.subtitle}>
        {typeof usersSearching === 'number'
          ? `${usersSearching} users currently searching`
          : estimatedSeconds
            ? `Estimated wait: ${estimatedSeconds}s`
            : 'Hang tight — matching fast.'}
      </Text>
      <View style={styles.buttonRow}>
        <ThemedButton
          label="Cancel"
          variant="outline"
          onPress={() => void handleCancel()}
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
    buttonRow: {
      marginTop: spacing.xl,
      width: '70%',
    },
  });
