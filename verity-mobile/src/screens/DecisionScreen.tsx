import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MatchPassButtons from '../components/MatchPassButtons';
import ThemedButton from '../components/ThemedButton';
import ThemedScreen from '../components/ThemedScreen';
import { useDecision } from '../hooks/useDecision';
import { useTheme } from '../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../theme/tokens';

type DecisionRouteParams = {
  sessionId?: string;
};

export default function DecisionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as DecisionRouteParams | undefined;
  const sessionId = params?.sessionId;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { status, result, submitChoice, startAutoPass } = useDecision(sessionId);

  useEffect(() => {
    startAutoPass();
  }, [startAutoPass]);

  useEffect(() => {
    if (!result) {
      return;
    }

    if (result.outcome === 'mutual') {
      Alert.alert('It’s a match!', 'You can start chatting now.');
      if (result.matchId) {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'Chat' as never,
              params: { matchId: result.matchId } as never,
            },
          ],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'Main' as never,
              params: { screen: 'Matches' } as never,
            },
          ],
        });
      }
      return;
    }

    Alert.alert('Not a match this time', 'We’ll get you back in the queue.');
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Main' as never,
          params: { screen: 'Home' } as never,
        },
      ],
    });
  }, [result, navigation]);

  if (!sessionId) {
    return (
      <ThemedScreen center>
        <Text style={styles.title}>Session unavailable</Text>
        <Text style={styles.subtitle}>We couldn’t find this session.</Text>
        <View style={styles.buttonRow}>
          <ThemedButton
            label="Back to Home"
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' as never, params: { screen: 'Home' } as never }],
              })
            }
          />
        </View>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen>
      <Text style={styles.title}>Would you like to match?</Text>
      <Text style={styles.subtitle}>
        Choose within 60 seconds. If only one person chooses Match, nothing is revealed.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          {status === 'waiting' ? 'Waiting for their choice...' : 'Make your choice'}
        </Text>
      </View>

      <MatchPassButtons
        onMatch={() => submitChoice('MATCH')}
        onPass={() => submitChoice('PASS')}
        disabled={status === 'waiting' || status === 'submitting'}
        loading={status === 'submitting'}
      />
    </ThemedScreen>
  );
}

const createStyles = (colors: { text: string; muted: string; card: string; border: string }) =>
  StyleSheet.create({
    title: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: lineHeights.base,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: typography.sm,
      color: colors.text,
      fontWeight: '600',
    },
    buttonRow: {
      marginTop: spacing.lg,
      width: '70%',
    },
  });
