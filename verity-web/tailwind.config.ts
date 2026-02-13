import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07090f',
        charcoal: '#121622',
        mist: '#aeb8d0',
        paper: '#f3f6ff',
        rose: '#ff6b9d',
        blush: '#ff9ec1',
        gold: '#d4af37',
        violet: '#7c89ff',
        success: '#10b981',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 16px 60px rgba(0, 0, 0, 0.35)',
        glow: '0 14px 36px rgba(212, 175, 55, 0.28)',
      },
      backgroundImage: {
        romantic:
          'radial-gradient(900px 500px at 10% -10%, rgba(124, 137, 255, 0.2), transparent 65%), radial-gradient(800px 500px at 110% 0%, rgba(255, 107, 157, 0.18), transparent 65%), linear-gradient(180deg, #090c14 0%, #07090f 60%, #06070c 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
