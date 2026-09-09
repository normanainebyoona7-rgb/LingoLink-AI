/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f2ff',
          100: '#e0e5ff',
          200: '#c7ceff',
          300: '#a5adff',
          400: '#8b8ffc',
          500: '#667eea',
          600: '#5a67d8',
          700: '#4c51bf',
          800: '#434190',
          900: '#3c366b',
        },
        secondary: {
          500: '#764ba2',
          600: '#6b4292',
          700: '#5a387a',
        },
        dark: {
          900: '#0f0c29',
          800: '#1a1a2e',
          700: '#302b63',
          600: '#24243e',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(102, 126, 234, 0.4)',
        'glow-lg': '0 0 40px rgba(102, 126, 234, 0.5)',
      },
    },
  },
  plugins: [],
};