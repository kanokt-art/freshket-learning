import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green:         '#27AE60',
          'green-light': '#2ECC71',
          'green-dark':  '#1E8449',
          'green-50':    '#F0FDF4',
          'green-100':   '#DCFCE7',
          orange:        '#F39C12',
          'orange-light':'#F5A623',
          dark:          '#1A202C',
          muted:         '#718096',
          surface:       '#F8FAF9',
        },
        freshket: {
          100: '#d6fdf0',
          200: '#a7f3d0',
          300: '#6ee7b7',
          500: '#00ce7c',
          600: '#00a862',
          700: '#00804c',
        },
      },
      fontFamily: {
        sans: ['Noto Sans Thai', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card:              '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover':      '0 4px 12px 0 rgba(0,0,0,0.10)',
        'green-glow':      '0 0 24px rgba(0,206,124,0.35)',
        'green-ring':      '0 0 0 4px rgba(0,206,124,0.20)',
        /* DS 2026 tokens */
        'ds-hover':        '0 8px 24px rgba(38,41,44,.08)',
        'ds-ambient':      '0 6px 20px rgba(190,190,190,.20)',
        'ds-ambient-tint': '0 0 8px rgba(0,128,101,.06), 0 6px 16px rgba(0,128,101,.11)',
        'ds-ambient-pure': '0 0 16px rgba(0,128,101,.10)',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,206,124,0.45)' },
          '50%':       { boxShadow: '0 0 0 14px rgba(0,206,124,0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-9px)' },
        },
        'scan-line': {
          '0%':   { top: '-4px', opacity: '0.8' },
          '80%':  { opacity: '0.8' },
          '100%': { top: '100%', opacity: '0' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'count-pop': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        'green-pulse': {
          '0%':   { opacity: '0.55' },
          '100%': { opacity: '1' },
        },
        'green-glow': {
          '0%':   { boxShadow: '0 0 12px rgba(0,206,124,0.25)' },
          '100%': { boxShadow: '0 0 32px rgba(0,206,124,0.55)' },
        },
        'grain': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%':      { transform: 'translate(-1px, 1px)' },
          '20%':      { transform: 'translate(1px, -1px)' },
          '30%':      { transform: 'translate(-1px, -1px)' },
          '40%':      { transform: 'translate(1px, 1px)' },
          '50%':      { transform: 'translate(-1px, 0)' },
          '60%':      { transform: 'translate(0, 1px)' },
          '70%':      { transform: 'translate(1px, 0)' },
          '80%':      { transform: 'translate(0, -1px)' },
          '90%':      { transform: 'translate(-1px, 1px)' },
        },
        'pop-in': {
          '0%':   { opacity: '0', transform: 'scale(0.88)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'check-in-icon': {
          '0%':   { transform: 'scale(0)' },
          '60%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-ring':     'pulse-ring 3s ease-in-out infinite',
        'float':          'float 4s ease-in-out infinite',
        'scan-line':      'scan-line 2.5s linear infinite',
        'shimmer':        'shimmer 3.5s linear infinite',
        'fade-in':        'fade-in 0.8s ease forwards',
        'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
        'count-pop':      'count-pop 0.3s ease',
        'green-pulse':    'green-pulse 2s ease-in-out alternate infinite',
        'green-glow':     'green-glow 3s ease-in-out alternate infinite',
        'grain':          'grain 0.8s steps(1) infinite',
        'pop-in':         'pop-in 0.35s cubic-bezier(0.34,1.4,0.64,1) forwards',
        'check-in-icon':  'check-in-icon 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
      },
    },
  },
  plugins: [],
}

export default config
