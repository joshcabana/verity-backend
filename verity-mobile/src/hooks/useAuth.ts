import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type UserProfile = {
  id: string;
  displayName?: string | null;
  age?: number | null;
  gender?: string | null;
  interests?: string[] | null;
  bio?: string | null;
  photos?: string[] | null;
  email?: string | null;
  phone?: string | null;
  tokenBalance?: number | null;
};

export type PendingRoute = {
  name: string;
  params?: Record<string, unknown>;
};

type AuthState = {
  token: string | null;
  user: UserProfile | null;
  pendingRoute: PendingRoute | null;
  hydrated: boolean;
  setToken: (token: string | null) => Promise<void>;
  setUser: (user: UserProfile | null) => Promise<void>;
  setPendingRoute: (route: PendingRoute | null) => Promise<void>;
  clearPendingRoute: () => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AUTH_TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const PENDING_ROUTE_KEY = 'auth_pending_route';

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  pendingRoute: null,
  hydrated: false,
  setToken: async (token) => {
    if (token) {
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    }
    set({ token });
  },
  setUser: async (user) => {
    if (user) {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(USER_KEY);
    }
    set({ user });
  },
  setPendingRoute: async (route) => {
    set({ pendingRoute: route });
    if (route) {
      await AsyncStorage.setItem(PENDING_ROUTE_KEY, JSON.stringify(route));
    } else {
      await AsyncStorage.removeItem(PENDING_ROUTE_KEY);
    }
  },
  clearPendingRoute: async () => {
    set({ pendingRoute: null });
    await AsyncStorage.removeItem(PENDING_ROUTE_KEY);
  },
  hydrate: async () => {
    const [token, userRaw, pendingRaw] = await Promise.all([
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
      AsyncStorage.getItem(PENDING_ROUTE_KEY),
    ]);
    const user = userRaw ? (JSON.parse(userRaw) as UserProfile) : null;
    let pendingRoute: PendingRoute | null = null;
    if (pendingRaw) {
      try {
        pendingRoute = JSON.parse(pendingRaw) as PendingRoute;
      } catch {
        pendingRoute = null;
      }
    }
    set({ token, user, pendingRoute, hydrated: true });
  },
  logout: async () => {
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(PENDING_ROUTE_KEY),
    ]);
    set({ token: null, user: null, pendingRoute: null });
  },
}));
