import { StyleSheet } from 'react-native';
import { ThemeColors } from '../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../theme/tokens';

export const createThemedTextStyles = (colors: ThemeColors) =>
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
    },
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.xs + 2,
    },
    body: {
      fontSize: typography.md,
      color: colors.text,
    },
  });

export const createThemedInputStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      color: colors.text,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: 'top',
      lineHeight: lineHeights.base,
    },
  });
