/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: 'class', // Включаем поддержку dark mode через класс
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#181A20', // фон приложения
          card: '#23262F', // фон карточек/модалок
          text: '#F4F4F7', // основной текст
          muted: '#A1A1AA', // вторичный текст
          accent: '#4F8CFF', // акцент
        },
      },
    },
  },
  plugins: [],
}

