export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 80,
  xxxl: 120, // Compatibility
} as const;

export const typography = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40, // Compatibility
  hero: 48,
} as const;

export const lineHeights = {
  hero: 1.1,
  tight: 1.2,
  base: 1.5,
  relaxed: 1.6,
} as const;

/* Fallback to system fonts for Inter-like appearance if custom fonts aren't loaded yet */
export const fontFamilies = {
  display: 'System', 
  displaySemibold: 'System', 
  body: 'System',
  bodyMedium: 'System',
  bodySemibold: 'System',
  bodyBold: 'System',
  mono: 'Menlo',
  monoBold: 'Menlo',
} as const;

/* Midnight Mirror - Black / White / Gold Palette */
export const colors = {
  voidBlack: '#000000',
  paperWhite: '#FFFFFF',
  
  luxGold: '#D4AF37',
  luxGoldHover: '#C5A532',
  goldDim: 'rgba(212, 175, 55, 0.15)',
  
  charcoal: '#1A1A1A',
  asphalt: '#333333',
  silver: '#A0A0A0',
  
  danger: '#EF4444',
  success: '#10B981',
} as const;

export const palette = {
  black: '#000000',
  white: '#FFFFFF',
  gold: '#D4AF37',
  offBlack: '#1A1A1A',
  grey: '#A0A0A0',
} as const;
