/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f4', 100: '#fce7ea', 200: '#f9ccd4', 300: '#f2a3b1',
          400: '#e96e85', 500: '#dc405e', 600: '#CC1F3A', 700: '#a81830',
          800: '#8c172d', 900: '#78172b', 950: '#420812',
        },
        ink: {
          50: '#f7f8f9', 100: '#eef0f3', 200: '#dde1e7', 300: '#c2c9d3',
          400: '#8e99a8', 500: '#697687', 600: '#4f5b6b', 700: '#3d4756',
          800: '#2a323d', 900: '#1a2029', 950: '#0f141a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 20 26 / 0.05), 0 1px 3px 0 rgb(15 20 26 / 0.06)',
        pop: '0 10px 30px -8px rgb(15 20 26 / 0.22), 0 2px 8px -2px rgb(15 20 26 / 0.10)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'slide-in-right': 'slide-in-right .2s cubic-bezier(.22,1,.36,1)',
        'scale-in': 'scale-in .13s ease-out',
      },
    },
  },
  plugins: [],
}
