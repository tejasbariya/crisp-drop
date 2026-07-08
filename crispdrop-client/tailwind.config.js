/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      // ── Brand Colors ─────────────────────────────────────────────────────
      colors: {
        indigo: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5', // Primary brand color
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
        },
        // Status colors — HSL-tuned to avoid generic defaults
        success: {
          light: '#ECFDF5',
          DEFAULT: '#10B981',
          dark: '#065F46',
        },
        warning: {
          light: '#FFFBEB',
          DEFAULT: '#F59E0B',
          dark: '#92400E',
        },
        danger: {
          light: '#FEF2F2',
          DEFAULT: '#EF4444',
          dark: '#991B1B',
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },

      // ── Shadows (premium soft shadows) ───────────────────────────────────
      boxShadow: {
        'sm-soft': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'md-soft': '0 4px 16px -2px rgb(0 0 0 / 0.08), 0 2px 8px -2px rgb(0 0 0 / 0.04)',
        'lg-soft': '0 10px 40px -4px rgb(0 0 0 / 0.10), 0 4px 16px -4px rgb(0 0 0 / 0.06)',
        'xl-soft': '0 20px 60px -8px rgb(0 0 0 / 0.12), 0 8px 24px -4px rgb(0 0 0 / 0.08)',
        'indigo': '0 4px 24px -4px rgb(79 70 229 / 0.4)',
        'indigo-lg': '0 8px 40px -4px rgb(79 70 229 / 0.5)',
        'glow': '0 0 0 3px rgb(79 70 229 / 0.2)',
        'inner-soft': 'inset 0 1px 3px 0 rgb(0 0 0 / 0.05)',
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ── Transitions ───────────────────────────────────────────────────────
      transitionTimingFunction: {
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-in-out-soft': 'cubic-bezier(0.45, 0, 0.55, 1)',
      },
      transitionDuration: {
        250: '250ms',
        350: '350ms',
      },

      // ── Animation ─────────────────────────────────────────────────────────
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(-4px)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
          '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out both',
        'slide-in-up': 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-down': 'slideInDown 0.3s ease-out both',
        'scale-in': 'scaleIn 0.2s ease-out both',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 2s linear infinite',
        'pulse-soft': 'pulse 2s ease-in-out infinite',
        'bounce-dot': 'bounce 1.2s ease-in-out infinite',
      },

      // ── Backdrop Blur ──────────────────────────────────────────────────────
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '12px',
        lg: '20px',
        xl: '40px',
      },
    },
  },
  plugins: [],
};
