import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      // Иконки манифеста (app-icons: ярлыки, maskable) не кладём в precache — офлайн не нужны.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Moooza — Музыкальная социальная сеть',
        short_name: 'Moooza',
        description: 'Социальная сеть для музыкантов',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#6366f1',
        lang: 'ru',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          // Отдельная иконка под маску Android (круг/сквикл): символ в безопасной
          // зоне 80% — надпись MOOOZA во всю ширину маска обрезала бы.
          {
            src: 'app-icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'app-icons/monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
        // Ярлыки по долгому нажатию на иконку (PWA и Android-приложение).
        shortcuts: [
          { name: 'Сообщения', url: '/messages', icons: [{ src: 'app-icons/shortcut-messages.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Ищу музыканта', url: '/find', icons: [{ src: 'app-icons/shortcut-find.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Каталог', url: '/search', icons: [{ src: 'app-icons/shortcut-search.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Лайнапы', url: '/lineups', icons: [{ src: 'app-icons/shortcut-lineups.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      injectManifest: {
        // НЕ кэшируем index.html — иначе после деплоя SW отдаёт старый HTML со старыми хешами JS
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        // app-icons — иконки ярлыков/лаунчера, офлайн они не нужны.
        globIgnores: ['**/index.html', '**/app-icons/**'],
      },
    }),
  ],
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['mooza.ru', 'www.mooza.ru', 'moooza.ru', 'www.moooza.ru'],
    watch: {
      usePolling: true,
    },
  },
  preview: {
    host: true,
    port: 3000,
    allowedHosts: ['mooza.ru', 'www.mooza.ru', 'moooza.ru', 'www.moooza.ru'],
  },
});
