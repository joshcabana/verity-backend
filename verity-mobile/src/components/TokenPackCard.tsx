import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ThemedButton from './ThemedButton';
import ThemedCard from './ThemedCard';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

export type TokenPack = {
  id: string;
  name: string;
  tokens: number;
  price: string;
  description?: string;
  highlight?: string;
};

type TokenPackCardProps = {
  pack: TokenPack;
  onPurchase: (pack: TokenPack) => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function TokenPackCard({
  pack,
  onPurchase,
  disabled = false,
  loading = false,
}: TokenPackCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ThemedCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{pack.name}</Text>
        {pack.highlight ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pack.highlight}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.tokens}>{pack.tokens} tokens</Text>
      <Text style={styles.price}>{pack.price}</Text>
      {pack.description ? <Text style={styles.description}>{pack.description}</Text> : null}
      <ThemedButton
        label={loading ? 'Starting checkout...' : `Buy ${pack.tokens} tokens`}
        onPress={() => onPurchase(pack)}
        disabled={disabled || loading}
        style={styles.button}
        testID={`token-pack-buy-${pack.id}`}
      />
    </ThemedCard>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  border: string;
  primary: string;
}) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: typography.md,
      fontWeight: '700',
      color: colors.text,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    badgeText: {
      fontSize: typography.xs,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    tokens: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    price: {
      fontSize: typography.md,
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    description: {
      fontSize: typography.sm,
      color: colors.muted,
      marginBottom: spacing.md,
    },
    button: {
      marginTop: spacing.xs,
    },
  });
