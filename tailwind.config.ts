import type { Config } from 'tailwindcss'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ESM에서 __dirname 대체 (Windows 호환)
const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
  content: [
    resolve(__dirname, 'apps/demo/src/**/*.{ts,tsx}'),
    resolve(__dirname, 'packages/react/src/**/*.{ts,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 뷰어 배경
        viewer: {
          bg: '#0b1a42',
          surface: '#1a1a2e',
          'surface-alt': '#1a1a1a',
          panel: '#2a2a4a',
        },
        // 액센트
        accent: {
          primary: '#4a9eff',
          secondary: '#4cf',
          success: '#4c4',
          warning: '#fa8',
          error: '#c44',
          info: '#8cf',
        },
        // 텍스트
        text: {
          primary: '#ffffff',
          secondary: '#aaaaaa',
          muted: '#888888',
          disabled: '#555555',
        },
        // 테두리
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.15)',
          active: '#5a8aba',
          selected: '#4cf',
          hover: 'rgba(100, 200, 255, 0.7)',
        },
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
      },
      fontSize: {
        'xxs': ['10px', '14px'],
        'xs': ['11px', '15px'],
        'sm': ['12px', '16px'],
        'base': ['13px', '18px'],
        'lg': ['14px', '20px'],
      },
      borderRadius: {
        'sm': '2px',
        'DEFAULT': '3px',
        'md': '4px',
      },
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
} satisfies Config
