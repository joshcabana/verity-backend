import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ThemedCard from './ThemedCard';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type TokenBalanceDisplayProps = {
  balance: number;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshTestID?: string;
  compact?: boolean;
  onPress?: () => void;
};

export default function TokenBalanceDisplay({
  balance,
  subtitle,
  onRefresh,
  refreshing = false,
  refreshTestID = 'token-balance-refresh',
  compact = false,
  onPress,
}: TokenBalanceDisplayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (compact) {
    return (
      <TouchableOpacity onPress={onPress} disabled={!onPress} style={styles.compactContainer}>
        <Text style={styles.compactValue}>{balance}</Text>
        <Text style={styles.compactUnit}>TOKENS</Text>
      </TouchableOpacity>
    );
  }

  return (
    <ThemedCard>
      <Text style={styles.label}>Token balance</Text>
      <View style={styles.row}>
        <Text style={styles.value}>{balance}</Text>
        <Text style={styles.unit}>tokens</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {onRefresh ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onRefresh}
          disabled={refreshing}
          style={styles.refreshRow}
          testID={refreshTestID}
        >
          <Text style={styles.refreshText}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ThemedCard>
  );
}

const createStyles = (colors: { text: string; muted: string; primary: string }) =>
  StyleSheet.create({
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: spacing.xs,
    },
    value: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginRight: spacing.xs,
    },
    unit: {
      fontSize: typography.sm,
      color: colors.muted,
    },
    subtitle: {
      fontSize: typography.xs,
      color: colors.muted,
    },
    refreshRow: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    refreshText: {
      fontSize: typography.xs,
      color: colors.primary,
      fontWeight: '600',
    },
    compactContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      gap: 6,
    },
    compactValue: {
      fontSize: typography.sm,
      fontWeight: '700',
      color: colors.primary, // Gold
    },
    compactUnit: {
      fontSize: 10,
      color: colors.muted,
      letterSpacing: 1,
    },
  });
