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
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
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
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        // НЕ кэшируем index.html — иначе после деплоя SW отдаёт старый HTML со старыми хешами JS
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        globIgnores: ['**/index.html'],
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
