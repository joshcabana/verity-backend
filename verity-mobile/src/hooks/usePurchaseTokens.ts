import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { apiJson } from '../services/api';
import { openCheckoutSession, resolveCheckoutUrl } from '../services/stripe';
import { useAuth } from './useAuth';

type BalanceResponse = {
  tokenBalance?: number | null;
};

type PurchaseResponse = {
  checkoutUrl?: string | null;
  url?: string | null;
  sessionUrl?: string | null;
  sessionId?: string | null;
};

export type PurchaseResult =
  | { ok: true; checkoutUrl: string; sessionId?: string | null }
  | { ok: false; error: string };

export function useTokenBalance() {
  const { token, user, setUser, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = useMemo(() => user?.tokenBalance ?? 0, [user?.tokenBalance]);

  const refreshBalance = useCallback(async () => {
    if (!token) {
      return null;
    }
    setRefreshing(true);
    setError(null);
    const response = await apiJson<BalanceResponse>('/tokens/balance', {
      method: 'GET',
      tokenOverride: token,
    });
    if (response.status === 401 || response.status === 403) {
      setError('Session expired. Please log in again.');
      await logout();
      setRefreshing(false);
      return null;
    }
    if (!response.ok || !response.data) {
      setError('Unable to refresh token balance.');
      setRefreshing(false);
      return null;
    }
    const nextBalance = response.data.tokenBalance ?? 0;
    await setUser({ ...(user ?? { id: '' }), tokenBalance: nextBalance });
    setRefreshing(false);
    return nextBalance;
  }, [logout, setUser, token, user]);

  return { balance, refreshing, refreshBalance, error };
}

export function usePurchaseTokens() {
  const { token, logout } = useAuth();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { balance, refreshing, refreshBalance } = useTokenBalance();

  const purchasePack = useCallback(
    async (packId: string): Promise<PurchaseResult> => {
      if (!token) {
        const message = 'Please sign in to purchase tokens.';
        setError(message);
        Alert.alert('Sign in required', message);
        return { ok: false, error: message };
      }
      setIsPurchasing(true);
      setError(null);
      try {
        const response = await apiJson<PurchaseResponse>('/tokens/purchase', {
          method: 'POST',
          tokenOverride: token,
          body: JSON.stringify({ packId }),
        });
        if (response.status === 401 || response.status === 403) {
          const message = 'Session expired. Please log in again.';
          setError(message);
          Alert.alert('Session expired', message);
          await logout();
          return { ok: false, error: message };
        }
        if (!response.ok || !response.data) {
          const message = 'Unable to start checkout right now.';
          setError(message);
          Alert.alert('Checkout failed', message);
          return { ok: false, error: message };
        }

        const checkoutUrl = resolveCheckoutUrl(response.data);
        if (!checkoutUrl) {
          const message = 'Checkout URL missing from the server.';
          setError(message);
          Alert.alert('Checkout failed', message);
          return { ok: false, error: message };
        }

        await openCheckoutSession(checkoutUrl);
        return {
          ok: true,
          checkoutUrl,
          sessionId: response.data.sessionId ?? null,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to start checkout.';
        setError(message);
        Alert.alert('Checkout failed', message);
        return { ok: false, error: message };
      } finally {
        setIsPurchasing(false);
      }
    },
    [logout, token],
  );

  return {
    purchasePack,
    isPurchasing,
    error,
    balance,
    refreshingBalance: refreshing,
    refreshBalance,
  };
}
