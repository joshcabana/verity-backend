import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';

type ThemedCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
};

export default function ThemedCard({
  children,
  style,
  padding,
}: ThemedCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, padding !== undefined && { padding }, style]}>
      {children}
    </View>
  );
}

const createStyles = (colors: { card: string; border: string }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
