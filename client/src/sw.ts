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
    (async () => {
      // If a window is focused/visible, the user is actively in the app and the live
      // socket update already surfaces this — skip the redundant banner. Backgrounded
      // and offline users (no visible window) still get the push.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const active = wins.some((c) => (c as WindowClient).focused || c.visibilityState === 'visible');
      if (active) return;
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { link: payload.link || '/' },
      });
    })(),
  );
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// The browser rotated the push subscription — re-subscribe and tell the server so
// push keeps working even for users who don't reopen the app (identified by the old
// endpoint via the no-auth /resubscribe route).
self.addEventListener('pushsubscriptionchange' as any, (event: any) => {
  event.waitUntil(
    (async () => {
      try {
        const oldEndpoint: string | undefined = event.oldSubscription?.endpoint;
        const keyRes = await fetch('/api/push/vapid-public-key');
        if (!keyRes.ok) return;
        const { key } = await keyRes.json();
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
        });
        await fetch('/api/push/resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
        });
      } catch {
        // best-effort
      }
    })(),
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
