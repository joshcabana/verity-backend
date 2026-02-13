import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedScreen from '../../components/ThemedScreen';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

export default function ExplainScreenOne() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ThemedScreen>
      <View style={styles.hero}>
        <Text style={styles.title}>Blind, honest first impressions</Text>
        <Text style={styles.subtitle}>
          You start with a short video conversation. Profiles stay hidden so the
          vibe comes first.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.bullet}>• 45-second live video session</Text>
        <Text style={styles.bullet}>• Focus on conversation, not swipes</Text>
        <Text style={styles.bullet}>• Mutual opt-in unlocks profiles</Text>
      </View>

      <View style={styles.buttonRow}>
        <ThemedButton
          label="Back"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={[styles.button, styles.buttonSpacing]}
        />
        <ThemedButton
          label="Next"
          onPress={() => navigation.navigate('ExplainTwo' as never)}
          style={styles.button}
          testID="onboarding-next-1"
        />
      </View>
    </ThemedScreen>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  border: string;
  card: string;
}) =>
  StyleSheet.create({
    hero: {
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    bullet: {
      color: colors.text,
      fontSize: typography.sm,
      marginBottom: spacing.sm,
    },
    buttonRow: {
      flexDirection: 'row',
      marginTop: spacing.xl,
    },
    button: {
      flex: 1,
    },
    buttonSpacing: {
      marginRight: spacing.sm,
    },
  });
