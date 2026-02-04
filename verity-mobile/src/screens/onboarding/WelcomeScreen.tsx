import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedScreen from '../../components/ThemedScreen';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

export default function WelcomeScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ThemedScreen>
      <View style={styles.hero}>
        <Text style={styles.title}>Welcome to Verity</Text>
        <Text style={styles.subtitle}>
          Meet someone through short, honest video conversations before you ever see a profile.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.bullet}>• Blind video dating, no profiles first</Text>
        <Text style={styles.bullet}>• Mutual reveal only after both match</Text>
        <Text style={styles.bullet}>• Use tokens to go live instantly</Text>
      </View>

      <View style={styles.footer}>
        <ThemedButton
          label="Get Started"
          onPress={() => navigation.navigate('ExplainOne' as never)}
          testID="onboarding-start"
        />
      </View>
    </ThemedScreen>
  );
}

const createStyles = (colors: { text: string; muted: string; border: string; card: string }) =>
  StyleSheet.create({
    hero: {
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: typography.xxl,
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
    footer: {
      marginTop: spacing.xl,
    },
  });
