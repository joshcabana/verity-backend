export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const typography = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  hero: 40,
} as const;

export const lineHeights = {
  tight: 18,
  base: 24,
  relaxed: 28,
} as const;

/* Fallback to system fonts for Inter-like appearance */
export const fontFamilies = {
  display: 'SpaceGrotesk_700Bold',
  displaySemibold: 'SpaceGrotesk_500Medium',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemibold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: 'SpaceGrotesk_500Medium',
  monoBold: 'SpaceGrotesk_700Bold',
} as const;

export const palette = {
  black: '#000000',
  offBlack: '#121212',
  white: '#FFFFFF',
  gold: '#D4AF37',
  goldDim: '#AA8C2C',
  goldSoft: 'rgba(212, 175, 55, 0.15)',
  grey: '#888888',
  red: '#CF6679',
  green: '#1B9A5A',
} as const;

export const colors = {
  voidBlack: '#000000',
  pureWhite: '#FFFFFF',
  luxGold: '#D4AF37',
  darkGrey: '#1A1A1A',
  midGrey: '#666666',
  border: '#333333',
  borderGold: 'rgba(212, 175, 55, 0.3)',
  danger: '#C74A4A',
  success: '#4CAF50',
} as const;
