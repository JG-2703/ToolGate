/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"Inter Tight"', '"Inter"', 'sans-serif'],
      },
      colors: {
        surface: {
          base:    'var(--bg-base)',
          DEFAULT: 'var(--bg-surface)',
          2:       'var(--bg-surface-2)',
          elevated:'var(--bg-elevated)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        txt: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
        accent:  'var(--accent)',
        ok:      'var(--ok)',
        warn:    'var(--warn)',
        danger:  'var(--danger)',
        info:    'var(--info)',
      },
    },
  },
  plugins: [],
}
