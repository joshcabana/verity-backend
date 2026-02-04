import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiJson, decodeToken, getAccessToken, setAccessToken } from '../api/client';

type AuthContextValue = {
  token: string | null;
  userId: string | null;
  loading: boolean;
  signUp: () => Promise<void>;
  signOut: () => void;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setTokenState] = useState<string | null>(() => getAccessToken());
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

  const signUp = useCallback(async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    const response = await apiJson<{ accessToken?: string }>(
      '/auth/signup-anonymous',
      {
        method: 'POST',
      },
    );
    if (response.ok && response.data?.accessToken) {
      setToken(response.data.accessToken);
    } else {
      throw new Error('Signup failed');
    }
    setLoading(false);
  }, [loading, setToken]);

  const signOut = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const value = useMemo(
    () => ({ token, userId, loading, signUp, signOut, setToken }),
    [token, userId, loading, signUp, signOut, setToken],
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
