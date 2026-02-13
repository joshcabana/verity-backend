import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette } from './tokens';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'light' | 'dark';

import { colors as tokens } from './tokens';

export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  danger: string;
  dangerSoft: string;
  success: string;
};

/* Enforce luxury dark theme for both modes */
const luxuryTheme: ThemeColors = {
  background: tokens.voidBlack,
  card: tokens.darkGrey,
  text: tokens.pureWhite,
  muted: tokens.midGrey,
  border: tokens.border,
  primary: tokens.luxGold,
  danger: tokens.danger,
  dangerSoft: '#3E1F1F', // Darker soft danger for dark mode
  success: tokens.success,
};

const darkColors = luxuryTheme;
const lightColors = luxuryTheme;

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const THEME_KEY = 'theme_preference';

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
