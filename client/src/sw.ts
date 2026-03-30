/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Workbox инжектирует список файлов для precache сюда
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: { title: string; body: string; icon?: string; link?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Moooza', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { link: payload.link || '/' },
      vibrate: [100, 50, 100],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link: string = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open — focus and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) (client as WindowClient).navigate(link);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(link);
    }),
  );
});
