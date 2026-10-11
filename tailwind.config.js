/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gallery: {
          50: '#FDFCFB',
          100: '#FBFBF9',
          150: '#F6F5F2',
          200: '#F1EFEA',
          300: '#E6E3DA',
          400: '#D1CCC0',
          500: '#9E988A',
          800: '#2A2825',
          900: '#1A1918',
        },
        crimson: {
          DEFAULT: '#8B1528',
          hover: '#9E1B30',
          light: '#FBF0F2',
          subtle: 'rgba(139, 21, 40, 0.08)',
          glow: 'rgba(139, 21, 40, 0.16)',
        },
        gold: {
          DEFAULT: '#B8860B',
          light: '#D4AF37',
          subtle: '#FAF6EB',
          glow: 'rgba(184, 134, 11, 0.18)',
        },
        charcoal: {
          DEFAULT: '#1C1917',
          muted: '#57534E',
          faint: '#A8A29E',
        }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['"Albert Sans"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        albert: ['"Albert Sans"', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'hairline': '0 0 0 1px rgba(0, 0, 0, 0.06)',
        'placard': '0 1px 3px rgba(0, 0, 0, 0.02), 0 8px 24px -4px rgba(0, 0, 0, 0.04)',
        'pedestal': '0 2px 4px rgba(0, 0, 0, 0.02), 0 12px 32px -4px rgba(0, 0, 0, 0.05)',
        'modal': '0 20px 60px -12px rgba(0, 0, 0, 0.15)',
        'spotlight': '0 0 40px rgba(184, 134, 11, 0.25)',
      },
      borderRadius: {
        'mac': '10px',
        'card': '14px',
        'sheet': '18px',
      }
    },
  },
  plugins: [],
}
