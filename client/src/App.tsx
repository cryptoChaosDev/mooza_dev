import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useBadgeStore } from './stores/badgeStore';
import { usePresenceStore } from './stores/presenceStore';
import { connectSocket, disconnectSocket, getSocket } from './lib/socket';
import Layout from './components/Layout';

const LandingPage        = lazy(() => import('./pages/LandingPage'));
const LoginPage          = lazy(() => import('./pages/LoginPage'));
const RegisterPage       = lazy(() => import('./pages/RegisterPage'));
const FeedPage           = lazy(() => import('./pages/FeedPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));
const UserProfilePage    = lazy(() => import('./pages/UserProfilePage'));
const SearchPage         = lazy(() => import('./pages/SearchPage'));
const FriendsPage        = lazy(() => import('./pages/FriendsPage'));
const MessagesPage       = lazy(() => import('./pages/MessagesPage'));
const ChatPage           = lazy(() => import('./pages/ChatPage'));
const AdminPage          = lazy(() => import('./pages/AdminPage'));
const PrivacyPolicyPage  = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage          = lazy(() => import('./pages/TermsPage'));
const PublicProfilePage  = lazy(() => import('./pages/PublicProfilePage'));

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

function showBrowserNotification(title: string, body: string, icon?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: icon ? `${API_URL}${icon}` : '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: title,
  });
  n.onclick = () => { window.focus(); n.close(); };
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} failed`);
  return res.json();
}

// ─── Clears badge counts when user navigates to relevant pages ───────────────
function BadgeClearer() {
  const location = useLocation();
  const { clearMessages, clearFriendRequests } = useBadgeStore();

  useEffect(() => {
    if (location.pathname.startsWith('/messages') || location.pathname.startsWith('/chat')) {
      clearMessages();
    }
    if (location.pathname === '/friends') {
      clearFriendRequests();
    }
  }, [location.pathname, clearMessages, clearFriendRequests]);

  return null;
}

function AppRoutes() {
  const { user } = useAuthStore();
  return (
    <Layout>
      <BadgeClearer />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                 element={<FeedPage />} />
            <Route path="/profile"          element={<ProfilePage />} />
            <Route path="/profile/:userId"  element={<UserProfilePage />} />
            <Route path="/@:handle"         element={<PublicProfilePage />} />
            <Route path="/search"           element={<SearchPage />} />
            <Route path="/friends"          element={<FriendsPage />} />
            <Route path="/messages"         element={<MessagesPage />} />
            <Route path="/messages/:id"     element={<ChatPage />} />
            <Route path="/chat/:id"         element={<ChatPage />} />
            <Route path="/privacy"          element={<PrivacyPolicyPage />} />
            <Route path="/terms"            element={<TermsPage />} />
            {user?.isAdmin && <Route path="/admin" element={<AdminPage />} />}
            <Route path="*"                 element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
    </Layout>
  );
}

function App() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  // useBadgeStore.getState() is called inside callbacks — no subscription, no re-renders
  const bs = () => useBadgeStore.getState();
  const presence = () => usePresenceStore.getState();

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    // Request push permission and subscribe
    if (typeof Notification !== 'undefined' && 'serviceWorker' in navigator) {
      const setupPush = async () => {
        try {
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }
          if (Notification.permission !== 'granted') return;

          const reg = await navigator.serviceWorker.ready;
          if (!reg.pushManager) return;

          // Get VAPID public key from server
          const keyRes = await fetch(`${API_URL}/api/push/vapid-public-key`);
          if (!keyRes.ok) return;
          const { key } = await keyRes.json();

          // Subscribe to push
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
          });

          // Send subscription to server
          await fetch(`${API_URL}/api/push/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(sub.toJSON()),
          });
        } catch {
          // Push not supported or blocked — silent fail
        }
      };
      setupPush();
    }

    // ── Connect socket ──────────────────────────────────────────────────────
    const socket = connectSocket(token);

    // ── Initial badge counts ────────────────────────────────────────────────
    const fetchCounts = () => {
      Promise.allSettled([
        apiFetch('/api/messages/unread/count', token),
        apiFetch('/api/notifications/unread/count', token),
        apiFetch('/api/friendships/requests', token),
      ]).then(([msgs, notifs, reqs]) => {
        if (msgs.status    === 'fulfilled') bs().setUnreadMessages(msgs.value.count ?? 0);
        if (notifs.status  === 'fulfilled') bs().setUnreadNotifications(notifs.value.count ?? 0);
        if (reqs.status    === 'fulfilled') {
          const arr = Array.isArray(reqs.value) ? reqs.value : [];
          bs().setPendingFriendRequests(arr.length);
        }
      });
    };
    fetchCounts();

    // ── Socket handlers ─────────────────────────────────────────────────────

    socket.on('new_notification', (notif: any) => {
      // Instant prepend to cached list — no waiting for server round-trip
      queryClient.setQueryData<any[]>(['notifications'], (prev) =>
        prev ? [notif, ...prev] : [notif]
      );
      bs().incrementNotifications();
    });

    socket.on('new_message', (message: any) => {
      const inChat = window.location.pathname.startsWith('/messages') ||
                     window.location.pathname.startsWith('/chat');
      if (!inChat) {
        bs().incrementMessages();
      }
      const senderName = message.sender
        ? `${message.sender.firstName} ${message.sender.lastName}`
        : 'Новое сообщение';
      showBrowserNotification(senderName, message.content, message.sender?.avatar);
    });

    socket.on('message_edited', () => {
      // handled locally in ChatPage
    });

    socket.on('message_deleted', () => {
      // handled locally in ChatPage
    });

    socket.on('friend_request', ({ requester }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      bs().incrementFriendRequests();
      if (!requester) return;
      showBrowserNotification(
        'Заявка в друзья',
        `${requester.firstName} ${requester.lastName} хочет добавить вас в друзья`,
        requester.avatar,
      );
    });

    socket.on('friend_accepted', ({ friendship }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] });
      const other = friendship?.receiver ?? friendship?.requester;
      if (!other) return;
      showBrowserNotification(
        'Заявка принята',
        `${other.firstName} ${other.lastName} принял(а) вашу заявку в друзья`,
        other.avatar,
      );
    });

    socket.on('user:online_list', (userIds: string[]) => {
      presence().setOnlineUsers(userIds);
    });

    socket.on('user:online', ({ userId }: { userId: string }) => {
      presence().addOnline(userId);
    });

    socket.on('user:offline', ({ userId }: { userId: string }) => {
      presence().removeOnline(userId);
    });

    socket.on('post_reply', ({ comment }: any) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      const commenter = comment?.author;
      if (!commenter) return;
      showBrowserNotification(
        'Новый комментарий',
        `${commenter.firstName} ${commenter.lastName} прокомментировал(а) вашу запись`,
        commenter.avatar,
      );
    });

    // Re-sync counts when tab regains focus (catches missed events)
    const handleFocus = () => {
      fetchCounts();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      const s = getSocket();
      if (s) {
        s.off('new_notification');
        s.off('new_message');
        s.off('message_edited');
        s.off('message_deleted');
        s.off('friend_request');
        s.off('friend_accepted');
        s.off('post_reply');
        s.off('user:online_list');
        s.off('user:online');
        s.off('user:offline');
      }
      window.removeEventListener('focus', handleFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queryClient]);

  if (!token) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"         element={<LandingPage />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy"  element={<PrivacyPolicyPage />} />
          <Route path="/terms"    element={<TermsPage />} />
          <Route path="/@:handle" element={<PublicProfilePage />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return <AppRoutes />;
}

export default App;
