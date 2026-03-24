/**
 * RED Intelfon — Paleta cromática (manual de marca).
 * Primarios: rojo #c8151b · azul marino #145478 · plata #afacb2
 * Secundarios: rojo vivo, burdeos, azul medio, grises, negro, azules apoyo.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Barlow"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          /** Primario — rojo corporativo */
          red: '#c8151b',
          /** Secundario — rojo vivo */
          redHi: '#f52938',
          /** Secundario — burdeos */
          maroon: '#700306',
          /** Primario — azul marino */
          navy: '#145478',
          /** Secundario — azul medio */
          blue: '#107ab4',
          /** Secundario — azul cielo claro #7bb9cb */
          sky: '#7bb9cb',
          /** Secundario — azul / teal apagado #409abb */
          teal: '#409abb',
          /** Primario — plata */
          grey: '#afacb2',
          /** Secundario — gris medio */
          greyMid: '#989797',
          /** Secundario — gris muy claro (fondos) */
          surface: '#e4e4e4',
          black: '#000000',
        },
        ink: {
          50: '#f2f2f2',
          100: '#e4e4e4',
          200: '#cfcfd2',
          300: '#afacb2',
          400: '#989797',
          500: '#989797',
          600: '#5c5c5c',
          700: '#404040',
          800: '#1f1f1f',
          900: '#000000',
        },
        accent: { DEFAULT: '#c8151b', soft: '#e4e4e4', dark: '#700306' },
      },
      boxShadow: {
        card: '2px 2px 0 0 rgba(0, 0, 0, 0.12)',
        hard: '4px 4px 0 0 #000000',
      },
    },
  },
  plugins: [],
};
