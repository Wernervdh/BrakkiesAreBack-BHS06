/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Taken from the school crest: red, gold and navy.
        brakke: {
          deep: '#071226',
          navy: '#0b1a36',
          surface: '#10234a',
          card: '#132a56',
          line: '#22396a',
          blue: '#1f3b73',
          gold: '#f0c75e',
          goldLight: '#f7dc8f',
          goldDark: '#c99a2e',
          red: '#d42a2a',
          redDark: '#a81d22'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};
