import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary — Honey Gold
        honey: {
          DEFAULT: '#FFC500',
          50: '#FFF9E6',
          100: '#FFF0BF',
          200: '#FFE699',
          300: '#FFDB66',
          400: '#FFD033',
          500: '#FFC500',
          600: '#E6A800',
          700: '#CC8C00',
          800: '#996600',
          900: '#664400',
        },
        // Hive Dark — warm charcoal
        hive: {
          DEFAULT: '#2A251F',
          50: '#F7F5F2',
          100: '#EBE7E0',
          200: '#D4CEC3',
          300: '#B8AFA0',
          400: '#8C8070',
          500: '#5C5347',
          600: '#3D362E',
          700: '#2A251F',
          800: '#1C1915',
          900: '#0E0D0B',
        },
        // Warm neutrals
        warm: {
          white: '#FFFDF7',
          50: '#FAF8F4',
          100: '#F2EFE8',
          200: '#E8E4DB',
          300: '#D5D0C5',
          400: '#B5AFA3',
          500: '#8A847A',
        },
        // Semantic colours (from the design system reference).
        success: { DEFAULT: '#4CAF50', 50: '#EDF7ED', 500: '#4CAF50', 600: '#43A047', 700: '#388E3C' },
        warning: { DEFAULT: '#FF9800', 50: '#FFF4E5', 500: '#FF9800', 600: '#FB8C00', 700: '#F57C00' },
        error: { DEFAULT: '#F44336', 50: '#FEEBEE', 500: '#F44336', 600: '#E53935', 700: '#D32F2F' },
        info: { DEFAULT: '#2196F3', 50: '#E8F3FE', 500: '#2196F3', 600: '#1E88E5', 700: '#1976D2' },
        propolis: { DEFAULT: '#F77F00', 400: '#FF9F1C', 500: '#F77F00', 600: '#D96B00' },
        royal: { DEFAULT: '#A855C7', 400: '#C17BDB', 500: '#A855C7', 600: '#8E3FB0' },
        pollen: { DEFAULT: '#6FA332', 400: '#8BC34A', 500: '#6FA332', 600: '#558B2F' },
        // Accents reused by the game canvas / status
        green: { DEFAULT: '#6FA332', 400: '#8BC34A', 500: '#6FA332' },
        blue: { DEFAULT: '#56b8ff', 400: '#56b8ff', 500: '#3da8f5' },
        red: { DEFAULT: '#F44336', 400: '#ff6b6b', 500: '#F44336' },
        yellow: { DEFAULT: '#ffd556', 400: '#ffd556', 500: '#f5c842' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        // Back-compat alias: old `font-pixel` now renders as the display font.
        pixel: ['Outfit', 'system-ui', 'sans-serif'],
      },
      // Design-system radii. Added under named keys so existing rounded-*
      // classes keep their Tailwind defaults — opt in with rounded-da-*.
      borderRadius: {
        'da-sm': '8px',
        'da-md': '12px',
        'da-lg': '16px',
        'da-xl': '24px',
        'da-2xl': '32px',
      },
      boxShadow: {
        honey: '0 4px 24px rgba(255, 197, 0, 0.2)',
        'honey-lg': '0 8px 40px rgba(255, 197, 0, 0.3)',
        // Warm, tinted elevation scale (rgba(92,83,71,…)). Named to avoid
        // overriding Tailwind's default shadow-sm/md/lg/xl globally.
        'warm-sm': '0 1px 2px rgba(92, 83, 71, 0.08)',
        'warm-md': '0 4px 12px rgba(92, 83, 71, 0.12)',
        'warm-lg': '0 8px 24px rgba(92, 83, 71, 0.16)',
        'warm-xl': '0 16px 48px rgba(92, 83, 71, 0.22)',
      },
    },
  },
  plugins: [],
};

export default config;
