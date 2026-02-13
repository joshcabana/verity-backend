import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  apiJson,
  decodeToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../api/client';
import { trackEvent } from '../analytics/events';

type AuthContextValue = {
  token: string | null;
  userId: string | null;
  loading: boolean;
  signUp: (input?: SignUpInput) => Promise<void>;
  signOut: () => void;
  deleteAccount: () => Promise<void>;
  setToken: (token: string | null) => void;
};

export type SignUpInput = {
  dateOfBirth?: string;
  consents?: Record<string, unknown>;
  privacyNoticeVersion?: string;
  tosVersion?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PUSH_TOKEN_KEY = 'verity_web_push_token';

function getStoredPushToken(): string | null {
  return localStorage.getItem(PUSH_TOKEN_KEY);
}

function getOrCreatePushToken(): string {
  const existing = getStoredPushToken();
  if (existing) {
    return existing;
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const token = `web-${randomPart}`;
  localStorage.setItem(PUSH_TOKEN_KEY, token);
  return token;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setTokenState] = useState<string | null>(() =>
    getAccessToken(),
  );
  const [loading, setLoading] = useState(false);

  const userId = useMemo(() => {
    if (!token) {
      return null;
    }
    const payload = decodeToken(token);
    return payload.sub ?? null;
  }, [token]);

  const setToken = useCallback((next: string | null) => {
    setAccessToken(next);
    setTokenState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (token || import.meta.env.MODE === 'test') {
      return;
    }

    void (async () => {
      try {
        const nextToken = await refreshAccessToken();
        if (!cancelled && nextToken) {
          setToken(nextToken);
        }
      } catch {
        // no-op: bootstrap refresh is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setToken, token]);

  const signUp = useCallback(
    async (input?: SignUpInput) => {
      if (loading) {
        return;
      }
      setLoading(true);
      try {
        const response = await apiJson<{ accessToken?: string }>(
          '/auth/signup-anonymous',
          {
            method: 'POST',
            body: input,
          },
        );
        if (response.ok && response.data?.accessToken) {
          setToken(response.data.accessToken);
          trackEvent('auth_signup_completed', {
            hasDob: Boolean(input?.dateOfBirth),
          });
        } else {
          throw new Error('Signup failed');
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, setToken],
  );

  const signOut = useCallback(() => {
    const pushToken = getStoredPushToken();
    if (token) {
      void apiJson('/auth/logout-all', { method: 'POST' });
      if (pushToken) {
        void apiJson('/notifications/tokens', {
          method: 'DELETE',
          body: { token: pushToken },
        });
      }
    }
    setToken(null);
  }, [setToken, token]);

  const deleteAccount = useCallback(async () => {
    if (!token) {
      return;
    }
    const response = await apiJson('/users/me', { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Delete account failed');
    }
    setToken(null);
  }, [token, setToken]);

  useEffect(() => {
    if (!token || !userId) {
      return;
    }
    const pushToken = getOrCreatePushToken();
    const deviceId =
      typeof navigator !== 'undefined'
        ? navigator.userAgent.slice(0, 120)
        : undefined;
    void apiJson('/notifications/tokens', {
      method: 'POST',
      body: {
        token: pushToken,
        platform: 'WEB',
        deviceId,
      },
    });
  }, [token, userId]);

  const value = useMemo(
    () => ({
      token,
      userId,
      loading,
      signUp,
      signOut,
      deleteAccount,
      setToken,
    }),
    [token, userId, loading, signUp, signOut, deleteAccount, setToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
