/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './model-review.html',
    './src/model-review.ts',
    './src/editor/**/*.ts',
  ],
  theme: { extend: {} },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['night'],
    logs: false,
  },
}
