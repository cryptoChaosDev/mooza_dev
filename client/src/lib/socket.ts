import { useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Подписчики на смену экземпляра сокета (создан/отключён). Эффекты дочерних
// страниц выполняются раньше эффекта App, который создаёт сокет, — без этого
// MessagesPage/ChatPage при прямом открытии по URL получали getSocket() === null
// и вообще не вешали слушателей (список/чат не обновлялись вживую).
const listeners = new Set<() => void>();
function emitChange() {
  for (const l of listeners) l();
}

export function connectSocket(token: string): Socket {
  // Reuse existing connected socket
  if (socket?.connected) return socket;

  // Disconnect stale socket before creating a new one
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(import.meta.env.VITE_API_URL || 'http://localhost:4000', {
    auth: { token },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.3,
  });

  emitChange();
  return socket;
}

export function disconnectSocket() {
  const had = !!socket;
  socket?.disconnect();
  socket = null;
  if (had) emitChange();
}

export function getSocket(): Socket | null {
  return socket;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Текущий сокет; компонент перерисуется, когда сокет появится/сменится. */
export function useSocket(): Socket | null {
  return useSyncExternalStore(subscribe, getSocket, getSocket);
}
