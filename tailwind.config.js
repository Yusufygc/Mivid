/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0d0e12',
        surface: '#181a20',
        'surface-light': '#242731',
        'surface-border': '#2d313d',
        primary: {
          DEFAULT: '#00f2fe',
          hover: '#4facfe',
          dark: '#00c4cf',
        },
        accent: '#fe2c55',
        timeline: {
          bg: '#12141a',
          track: '#1c1f28',
          trackHover: '#252936',
          clip: '#2d3748',
          clipVideo: '#1e3a5f',
          clipAudio: '#1b4332',
          clipText: '#581c87',
          playhead: '#ff0055',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
