import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_TOKEN_KEY } from '../hooks/useAuth';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';

type ApiFetchOptions = RequestInit & {
  tokenOverride?: string | null;
};

export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const { tokenOverride, headers, ...rest } = options;
  const token = tokenOverride ?? (await AsyncStorage.getItem(AUTH_TOKEN_KEY));
  const resolvedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (token) {
    resolvedHeaders.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers: resolvedHeaders,
  });
}

export async function apiJson<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const response = await apiFetch(path, options);
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}
