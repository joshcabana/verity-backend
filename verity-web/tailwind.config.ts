import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07090f',
        charcoal: '#121622',
        mist: '#b9c4de',
        paper: '#f4f7ff',
        rose: '#ff6b9d',
        blush: '#ff9ec1',
        gold: '#d4af37',
        violet: '#7c89ff',
        cream: '#fef6ee',
        success: '#10b981',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 14px 48px rgba(0, 0, 0, 0.35)',
        glow: '0 10px 36px rgba(255, 158, 193, 0.28)',
      },
      backgroundImage: {
        romantic:
          'radial-gradient(1200px 600px at -10% -10%, rgba(124,137,255,.24), transparent 65%), radial-gradient(900px 500px at 110% -20%, rgba(255,107,157,.24), transparent 65%), radial-gradient(700px 400px at 50% 120%, rgba(212,175,55,.16), transparent 65%), linear-gradient(180deg, #0b0d18 0%, #080a12 55%, #06070d 100%)',
      },
      keyframes: {
        'heart-float': {
          '0%': { transform: 'translateY(0) scale(0.9)', opacity: '0' },
          '15%': { opacity: '1' },
          '100%': { transform: 'translateY(-120px) scale(1.15)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 50%' },
          '100%': { backgroundPosition: '-200% 50%' },
        },
      },
      animation: {
        'heart-float': 'heart-float 1.8s ease-out forwards',
        shimmer: 'shimmer 4s linear infinite',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
} satisfies Config;
