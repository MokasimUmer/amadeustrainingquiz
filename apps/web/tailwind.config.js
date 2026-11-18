/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        brand: 'var(--brand)',
        accent: 'var(--accent)',
        ok: 'var(--ok)',
        bad: 'var(--bad)',
        'opt-a': 'var(--opt-a)',
        'opt-b': 'var(--opt-b)',
        'opt-c': 'var(--opt-c)',
        'opt-d': 'var(--opt-d)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        arena: 'var(--radius)',
      },
    },
  },
  plugins: [],
};
