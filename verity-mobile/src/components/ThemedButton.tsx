import React, { useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '../theme/tokens';

export type ThemedButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'outline'
  | 'dangerOutline'
  | 'ghost';

type ThemedButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ThemedButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function ThemedButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  testID,
}: ThemedButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createBaseStyles(), []);
  const variants = useMemo(() => createVariantStyles(colors), [colors]);
  const variantStyles = variants[variant];

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, variantStyles.container, disabled && styles.disabled, style]}
      testID={testID}
    >
      <Text style={[styles.textBase, variantStyles.text, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const createBaseStyles = () =>
  StyleSheet.create({
    base: {
      minHeight: 56,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textBase: {
      fontFamily: fontFamilies.bodyBold,
      fontSize: typography.md,
      letterSpacing: 0.2,
    },
    disabled: {
      opacity: 0.6,
    },
  });

const createVariantStyles = (colors: {
  border: string;
  text: string;
  primary: string;
  danger: string;
  dangerSoft: string;
}) => ({
  primary: {
    container: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
      elevation: 6,
    },
    text: {
      color: '#000000',
    },
  },
  secondary: {
    container: {
      backgroundColor: '#0B0B0B',
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: {
      color: colors.text,
    },
  },
  danger: {
    container: {
      backgroundColor: colors.danger,
    },
    text: {
      color: '#FFFFFF',
    },
  },
  outline: {
    container: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    text: {
      color: colors.text,
      fontFamily: fontFamilies.bodySemibold,
    },
  },
  dangerOutline: {
    container: {
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: 'transparent',
    },
    text: {
      color: colors.dangerSoft,
    },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      elevation: 0,
    },
    text: {
      color: colors.text,
      fontFamily: fontFamilies.bodySemibold,
      opacity: 0.6,
    },
  },
});
