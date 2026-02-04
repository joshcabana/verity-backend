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
import { spacing } from '../theme/tokens';

export type ThemedButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'outline'
  | 'dangerOutline';

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
  const styles = useMemo(() => createBaseStyles(colors), [colors]);
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

const createBaseStyles = (colors: { border: string }) =>
  StyleSheet.create({
    base: {
      paddingVertical: spacing.md,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textBase: {
      fontWeight: '600',
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
    },
    text: {
      color: '#FFFFFF',
    },
  },
  secondary: {
    container: {
      backgroundColor: colors.border,
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
});
