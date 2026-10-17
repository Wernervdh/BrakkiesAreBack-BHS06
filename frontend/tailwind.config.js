/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        brakke: {
          navy: '#0a192f',
          deep: '#070f1e',
          surface: '#112240',
          card: '#1b2d4f',
          gold: '#e2b357',
          goldLight: '#f3d687',
          goldDark: '#b58b34',
          accent: '#20c997'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
