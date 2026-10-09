// Web Push: подписка/отписка устройства.
//
// Разрешение на уведомления запрашивается ТОЛЬКО из обработчика жеста
// пользователя (кнопка баннера «Разрешить», см. Layout) — iOS/Safari/Firefox
// отклоняют Notification.requestPermission() вне жеста. Автоматически (в
// эффекте после входа) подписка делается лишь при уже выданном разрешении.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window;
}

/**
 * Подписать устройство на push и сохранить подписку на сервере. Разрешение
 * НЕ запрашивает — только если оно уже выдано. Никогда не бросает.
 */
export async function subscribePush(token: string): Promise<boolean> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Get VAPID public key from server
      const keyRes = await fetch(`${API_URL}/api/push/vapid-public-key`);
      if (!keyRes.ok) return false;
      const { key } = await keyRes.json();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
      });
    }

    // Send subscription to server (upsert — привязывает endpoint к текущему аккаунту)
    const res = await fetch(`${API_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok;
  } catch {
    // Push not supported or blocked — silent fail
    return false;
  }
}

/**
 * Вызывать ИЗ ОБРАБОТЧИКА КЛИКА: запросить разрешение (если ещё не решено)
 * и сразу подписаться. Возвращает итоговое состояние разрешения.
 */
export async function enablePush(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  let perm: NotificationPermission = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
  }
  if (perm === 'granted') {
    const token = localStorage.getItem('token');
    if (token) await subscribePush(token);
  }
  return perm;
}

/**
 * Logout: удалить подписку этого устройства на сервере и отписаться в браузере,
 * чтобы push предыдущего аккаунта не приходили следующему пользователю.
 */
export async function unsubscribePush(token: string | null): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    if (token) {
      await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        keepalive: true,
      }).catch(() => {});
    }
    await sub.unsubscribe().catch(() => false);
  } catch {
    // best-effort
  }
}
