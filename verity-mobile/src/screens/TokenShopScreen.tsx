import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import ThemedScreen from '../components/ThemedScreen';
import TokenBalanceDisplay from '../components/TokenBalanceDisplay';
import TokenPackCard, { type TokenPack } from '../components/TokenPackCard';
import { usePurchaseTokens } from '../hooks/usePurchaseTokens';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { useStripeRedirectHandler, type StripeRedirectResult } from '../services/stripe';
import type { RootStackParamList } from '../navigation/AppNavigator';

const TOKEN_PACKS: TokenPack[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    tokens: 5,
    price: '$4.99',
    description: 'Perfect for a quick matching session.',
  },
  {
    id: 'core',
    name: 'Core Pack',
    tokens: 15,
    price: '$9.99',
    description: 'Most popular option for multiple matches.',
    highlight: 'Popular',
  },
  {
    id: 'max',
    name: 'Max Pack',
    tokens: 40,
    price: '$19.99',
    description: 'Best value for frequent matches.',
    highlight: 'Best value',
  },
];

type TokenShopRoute = RouteProp<RootStackParamList, 'TokenShop'>;

export default function TokenShopScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<TokenShopRoute>();
  const {
    purchasePack,
    isPurchasing,
    balance,
    refreshBalance,
    refreshingBalance,
    error,
  } = usePurchaseTokens();

  const [polling, setPolling] = useState(false);
  const lastBalanceRef = useRef(balance);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    lastBalanceRef.current = balance;
  }, [balance]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback(
    (baseline: number) => {
      if (pollTimerRef.current) {
        return;
      }
      setPolling(true);
      const startedAt = Date.now();
      pollTimerRef.current = setInterval(async () => {
        const nextBalance = await refreshBalance();
        if (typeof nextBalance === 'number' && nextBalance > baseline) {
          stopPolling();
          Alert.alert('Tokens added', 'Your token balance has been updated.');
          return;
        }
        if (Date.now() - startedAt > 30000) {
          stopPolling();
        }
      }, 3000);
    },
    [refreshBalance, stopPolling],
  );

  const handleRedirectResult = useCallback(
    async (result: StripeRedirectResult) => {
      if (result.status === 'success') {
        stopPolling();
        await refreshBalance();
        Alert.alert('Purchase complete', 'Your tokens are ready.');
      }
      if (result.status === 'cancel') {
        stopPolling();
        Alert.alert('Checkout canceled', 'You can try another pack anytime.');
      }
    },
    [refreshBalance, stopPolling],
  );

  useStripeRedirectHandler(handleRedirectResult);

  useEffect(() => {
    void refreshBalance();
    return () => stopPolling();
  }, [refreshBalance, stopPolling]);

  useEffect(() => {
    if (route.params?.status === 'success') {
      void handleRedirectResult({ status: 'success' });
    }
    if (route.params?.status === 'cancel') {
      void handleRedirectResult({ status: 'cancel' });
    }
  }, [route.params?.status, handleRedirectResult]);

  const handlePurchase = useCallback(
    async (pack: TokenPack) => {
      const baseline = lastBalanceRef.current ?? 0;
      const result = await purchasePack(pack.id);
      if (result.ok) {
        startPolling(baseline);
      }
    },
    [purchasePack, startPolling],
  );

  return (
    <ThemedScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Token Shop</Text>
        <Text style={styles.subtitle}>
          Choose a pack and keep matching without interruptions.
        </Text>

        <View style={styles.section}>
          <TokenBalanceDisplay
            balance={balance}
            subtitle="Your balance updates after successful payment."
            onRefresh={refreshBalance}
            refreshing={refreshingBalance}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {polling ? (
            <Text style={styles.pollingText}>
              Waiting for payment confirmation...
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          {TOKEN_PACKS.map((pack) => (
            <TokenPackCard
              key={pack.id}
              pack={pack}
              onPurchase={handlePurchase}
              disabled={isPurchasing}
              loading={isPurchasing}
            />
          ))}
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  background: string;
  primary: string;
  danger: string;
}) =>
  StyleSheet.create({
    content: {
      paddingBottom: spacing.xl,
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
      marginBottom: spacing.lg,
    },
    section: {
      marginBottom: spacing.lg,
    },
    error: {
      marginTop: spacing.sm,
      color: colors.danger,
      fontSize: typography.xs,
    },
    pollingText: {
      marginTop: spacing.sm,
      color: colors.primary,
      fontSize: typography.xs,
      fontWeight: '600',
    },
  });
