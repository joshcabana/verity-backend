import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  danger: string;
  dangerSoft: string;
};

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const THEME_KEY = 'theme_preference';

const darkColors: ThemeColors = {
  background: '#000000',
  card: '#151515',
  text: '#FFFFFF',
  muted: '#D9D9D9',
  border: '#262626',
  primary: '#D4AF37',
  danger: '#C74A4A',
  dangerSoft: '#F4C2C2',
};

const lightColors: ThemeColors = {
  background: '#0B0B0B',
  card: '#151515',
  text: '#FFFFFF',
  muted: '#D9D9D9',
  border: '#262626',
  primary: '#D4AF37',
  danger: '#C74A4A',
  dangerSoft: '#F4C2C2',
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((value) => {
      if (value === 'light' || value === 'dark') {
        setModeState(value);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const colors = useMemo(
    () => (mode === 'dark' ? darkColors : lightColors),
    [mode],
  );

  const value = useMemo(
    () => ({
      mode,
      colors,
      setMode,
      toggleMode,
    }),
    [mode, colors, setMode, toggleMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
