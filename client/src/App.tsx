import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useBadgeStore } from './stores/badgeStore';
import { usePresenceStore } from './stores/presenceStore';
import { connectSocket, disconnectSocket, getSocket } from './lib/socket';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import CookieConsent from './components/CookieConsent';
import Toaster from './components/Toaster';
import { IS_TMA, initTelegramApp, twa } from './lib/telegram';
import { authAPI, messageAPI, userAPI } from './lib/api';


const LandingPage        = lazy(() => import('./pages/LandingPage'));
const LoginPage          = lazy(() => import('./pages/LoginPage'));
const RegisterPage       = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const FeedPage           = lazy(() => import('./pages/FeedPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));
const UserProfilePage    = lazy(() => import('./pages/UserProfilePage'));
const SearchPage         = lazy(() => import('./pages/SearchPage'));
const FriendsPage        = lazy(() => import('./pages/FriendsPage'));
const MessagesPage       = lazy(() => import('./pages/MessagesPage'));
const ChatPage           = lazy(() => import('./pages/ChatPage'));
const AdminPage          = lazy(() => import('./pages/AdminPage'));
const ArtistPage         = lazy(() => import('./pages/ArtistPage'));
const ArtistCreatePage   = lazy(() => import('./pages/ArtistCreatePage'));
const ArtistEditPage     = lazy(() => import('./pages/ArtistEditPage'));
const ArtistMediaFormPage  = lazy(() => import('./pages/ArtistMediaFormPage'));
const ArtistVacancyNewPage = lazy(() => import('./pages/ArtistVacancyNewPage'));
const ArtistMemberAddPage  = lazy(() => import('./pages/ArtistMemberAddPage'));
const ArtistInvitePage     = lazy(() => import('./pages/ArtistInvitePage'));
const ArtistContactsPage   = lazy(() => import('./pages/ArtistContactsPage'));
const ArtistGenresPage     = lazy(() => import('./pages/ArtistGenresPage'));
const ReleasePage        = lazy(() => import('./pages/ReleasePage'));
const ClipPage           = lazy(() => import('./pages/ClipPage'));
const PrivacyPolicyPage  = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage          = lazy(() => import('./pages/TermsPage'));
const FlowSettingsPage   = lazy(() => import('./pages/FlowSettingsPage'));
const CreatePostPage     = lazy(() => import('./pages/CreatePostPage'));
const InvitePage         = lazy(() => import('./pages/InvitePage'));
const ProPage            = lazy(() => import('./pages/ProPage'));
const ServicePage        = lazy(() => import('./pages/ServicePage'));
const ServicesPage       = lazy(() => import('./pages/ServicesPage'));
const ProfessionPage     = lazy(() => import('./pages/ProfessionPage'));
const UserProfessionsPage = lazy(() => import('./pages/UserProfessionsPage'));
const OrderFormPage      = lazy(() => import('./pages/OrderFormPage'));
const ProfessionFormPage = lazy(() => import('./pages/ProfessionFormPage'));
const ServiceFormPage    = lazy(() => import('./pages/ServiceFormPage'));
const ConnectionsPage    = lazy(() => import('./pages/ConnectionsPage'));
const ReviewsPage              = lazy(() => import('./pages/ReviewsPage'));
const FriendRequestsPage       = lazy(() => import('./pages/FriendRequestsPage'));
const ConnectionRequestsPage   = lazy(() => import('./pages/ConnectionRequestsPage'));
const ConnectionPage           = lazy(() => import('./pages/ConnectionPage'));
const DealPage                 = lazy(() => import('./pages/DealPage'));
const DealsPage                = lazy(() => import('./pages/DealsPage'));
const OrdersPage               = lazy(() => import('./pages/OrdersPage'));
const OrderDetailPage          = lazy(() => import('./pages/OrderDetailPage'));
const VacanciesPage            = lazy(() => import('./pages/VacanciesPage'));
const VacancyDetailPage        = lazy(() => import('./pages/VacancyDetailPage'));
const OnboardingPage     = lazy(() => import('./pages/OnboardingPage'));
const VkSetupPage        = lazy(() => import('./pages/VkSetupPage'));

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
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-900">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

function resolveIcon(icon?: string): string {
  if (!icon) return '/pwa-192x192.png';
  return icon.startsWith('http') ? icon : `${API_URL}${icon}`;
}

async function showNotification(title: string, body: string, icon?: string, link?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const iconUrl = resolveIcon(icon);
  // Use service worker notification — works on mobile (new Notification() does not)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: iconUrl,
        badge: '/pwa-192x192.png',
        tag: link || title,
        data: { link: link || '/' },
      });
      return;
    } catch { /* fall through to legacy */ }
  }
  const n = new Notification(title, { body, icon: iconUrl, badge: '/pwa-192x192.png', tag: link || title });
  n.onclick = () => { window.focus(); n.close(); if (link) window.location.href = link; };
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} failed`);
  return res.json();
}

// Legacy /groups/:id → unified /artist/:id (Artist and Group are one entity).
function GroupRedirect() {
  const { id } = useParams();
  return <Navigate to={`/artist/${id}`} replace />;
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

function TelegramBackButton() {
  const location = useLocation();
  useEffect(() => {
    const app = twa();
    if (!app) return;
    if (location.pathname === '/') {
      app.BackButton.hide();
    } else {
      app.BackButton.show();
      const handler = () => window.history.back();
      app.BackButton.onClick(handler);
      return () => app.BackButton.offClick(handler);
    }
  }, [location.pathname]);
  return null;
}

function AppRoutes() {
  const { user } = useAuthStore();
  return (
    <Layout>
      <BadgeClearer />
      {IS_TMA && <TelegramBackButton />}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                 element={<FeedPage />} />
            <Route path="/profile"          element={<ProfilePage />} />
            <Route path="/profile/:userId"  element={<UserProfilePage />} />
            <Route path="/artist/create"     element={<ArtistCreatePage />} />
            <Route path="/artist/:id"       element={<ArtistPage />} />
            <Route path="/artist/:id/edit"  element={<ArtistEditPage />} />
            <Route path="/artist/:id/releases/new" element={<ArtistMediaFormPage kind="release" />} />
            <Route path="/artist/:id/clips/new"    element={<ArtistMediaFormPage kind="clip" />} />
            <Route path="/artist/:id/vacancies/new" element={<ArtistVacancyNewPage />} />
            <Route path="/artist/:id/members/add"  element={<ArtistMemberAddPage />} />
            <Route path="/artist/:id/invite"       element={<ArtistInvitePage />} />
            <Route path="/artist/:id/contacts"     element={<ArtistContactsPage />} />
            <Route path="/artist/:id/genres"       element={<ArtistGenresPage />} />
            <Route path="/releases/:id"     element={<ReleasePage />} />
            <Route path="/clips/:id"        element={<ClipPage />} />
            {/* Legacy «Группы» routes — collapsed into the unified Artist page */}
            <Route path="/groups/create"    element={<Navigate to="/artist/create" replace />} />
            <Route path="/groups/invites"   element={<Navigate to="/" replace />} />
            <Route path="/groups/:id"       element={<GroupRedirect />} />
            <Route path="/search"           element={<SearchPage />} />
            <Route path="/friends"          element={<FriendsPage />} />
            <Route path="/messages"         element={<MessagesPage />} />
            <Route path="/messages/:id"     element={<ChatPage />} />
            <Route path="/chat/:id"         element={<ChatPage />} />
            <Route path="/flow-settings"    element={<FlowSettingsPage />} />
            <Route path="/create-post"      element={<CreatePostPage />} />
            <Route path="/invite"           element={<InvitePage />} />
            <Route path="/pro"              element={<ProPage />} />
            <Route path="/onboarding"       element={<OnboardingPage />} />
            <Route path="/vk-setup"         element={<VkSetupPage />} />
            {/* Logged-in visitors who open an artist invite link land here too;
                RegisterPage shows an accept screen (or bounces home if no invite). */}
            <Route path="/register"         element={<RegisterPage />} />
            <Route path="/services/new" element={<ServiceFormPage />} />
            <Route path="/services/edit/:serviceId" element={<ServiceFormPage />} />
            <Route path="/services/:serviceId" element={<ServicePage />} />
            <Route path="/professions/new" element={<ProfessionFormPage />} />
            <Route path="/professions/edit/:professionId" element={<ProfessionFormPage />} />
            <Route path="/professions/:userId/:professionId" element={<ProfessionPage />} />
            <Route path="/profile/:userId/professions" element={<UserProfessionsPage />} />
            <Route path="/profile/:userId/services" element={<ServicesPage />} />
            <Route path="/profile/:userId/connections" element={<ConnectionsPage />} />
            <Route path="/profile/:userId/reviews" element={<ReviewsPage />} />
            <Route path="/friends/requests" element={<FriendRequestsPage />} />
            <Route path="/connections/requests" element={<ConnectionRequestsPage />} />
            <Route path="/connection/:partnerId" element={<ConnectionPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/deals/:dealId" element={<DealPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderFormPage />} />
            <Route path="/orders/edit/:orderId" element={<OrderFormPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/artists/:artistId/vacancies" element={<VacanciesPage />} />
            <Route path="/vacancies/:vacancyId" element={<VacancyDetailPage />} />
            <Route path="/privacy"          element={<PrivacyPolicyPage />} />
            <Route path="/terms"            element={<TermsPage />} />
            {user?.isAdmin && <Route path="/admin" element={<AdminPage />} />}
            <Route path="*"                 element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
    </Layout>
  );
}

// ─── Telegram Mini App auto-login screen ─────────────────────────────────────
function TelegramAutoLogin({ onDone }: { onDone: () => void }) {
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    initTelegramApp();
    const initData = twa()?.initData || '';
    authAPI.telegramMiniApp(initData)
      .then(({ data }) => { setAuth(data.user, data.token); onDone(); })
      .catch(() => setError('Не удалось войти через Telegram'));
  }, []);

  if (error) return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-red-400 text-sm">{error}</p>
      <button onClick={onDone} className="text-primary-400 text-sm underline">Открыть в браузере</button>
    </div>
  );

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

function App() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [tmaLoading, setTmaLoading] = useState(() => IS_TMA && !token);
  // useBadgeStore.getState() is called inside callbacks — no subscription, no re-renders
  const bs = () => useBadgeStore.getState();
  const presence = () => usePresenceStore.getState();

  // Initialize TG SDK for already-authenticated users
  useEffect(() => {
    if (IS_TMA && token) initTelegramApp();
  }, [token]);

  // Refresh the cached user from the server on load, so changes made elsewhere
  // (admin rights, role, block status, profile) propagate without re-login.
  // A 401 here is handled by the axios interceptor (auto-logout).
  useEffect(() => {
    if (!token) return;
    userAPI.getMe()
      .then(({ data }) => useAuthStore.getState().setUser(data))
      .catch(() => { /* network error — keep cached user; 401 handled by interceptor */ });
  }, [token]);

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

    // ── Socket error → logout on auth failure ───────────────────────────────
    socket.on('connect_error', (err: any) => {
      const msg: string = err?.message ?? '';
      if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('TOKEN')) {
        useAuthStore.getState().logout();
      }
    });

    // ── Socket handlers ─────────────────────────────────────────────────────

    socket.on('new_notification', (notif: any) => {
      // If this is a message notification for the chat we're already viewing,
      // we're reading it live — mark it read and don't badge or list it.
      if (notif?.type === 'message' && typeof notif.link === 'string') {
        const path = window.location.pathname;
        const chatPath = notif.link.replace('/messages/', '/chat/');
        if (path === notif.link || path === chatPath) {
          const convId = notif.link.split('/').pop();
          if (convId) messageAPI.markRead(convId).catch(() => {});
          return;
        }
      }
      // Instant prepend to cached list — no waiting for server round-trip
      queryClient.setQueryData<any[]>(['notifications'], (prev) =>
        prev ? [notif, ...prev] : [notif]
      );
      bs().incrementNotifications();
    });

    // When notifications were marked read elsewhere (e.g. reading a chat),
    // refresh the badge count and the cached list so they stop showing on top.
    socket.on('notifications_read', () => {
      fetchCounts();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('new_message', (message: any) => {
      const convId = message.conversationId;
      const inThisChat = window.location.pathname === `/messages/${convId}` ||
                         window.location.pathname === `/chat/${convId}`;
      if (!inThisChat) {
        bs().incrementMessages();
        const senderName = message.sender
          ? `${message.sender.firstName} ${message.sender.lastName}`
          : 'Новое сообщение';
        const preview = message.content?.trim() ||
          (message.attachmentName ? `📎 ${message.attachmentName}` : '📎 Вложение');
        showNotification(senderName, preview, message.sender?.avatar, `/messages/${convId}`);
      }
    });

    socket.on('message_edited', () => {
      // handled locally in ChatPage
    });

    socket.on('message_deleted', () => {
      // handled locally in ChatPage
    });

    socket.on('connection_request', () => {
      queryClient.invalidateQueries({ queryKey: ['connections-requests'] });
    });

    socket.on('connection_rejected', () => {
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      queryClient.invalidateQueries({ queryKey: ['connections-rejected'] });
    });

    socket.on('friend_request', ({ requester }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      bs().incrementFriendRequests();
      if (!requester) return;
      showNotification(
        'Заявка в друзья',
        `${requester.firstName} ${requester.lastName} хочет добавить вас в друзья`,
        requester.avatar,
        '/friends',
      );
    });

    socket.on('friend_accepted', ({ friendship }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] });
      const other = friendship?.receiver ?? friendship?.requester;
      if (!other) return;
      showNotification(
        'Заявка принята',
        `${other.firstName} ${other.lastName} принял(а) вашу заявку в друзья`,
        other.avatar,
        '/friends',
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

    // Heartbeat every 30s to keep lastSeenAt fresh
    const heartbeat = setInterval(() => {
      const s = getSocket();
      if (s?.connected) s.emit('ping');
    }, 30_000);

    socket.on('post_reply', ({ comment }: any) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      const commenter = comment?.author;
      if (!commenter) return;
      showNotification(
        'Новый комментарий',
        `${commenter.firstName} ${commenter.lastName} прокомментировал(а) вашу запись`,
        commenter.avatar,
        '/',
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
        s.off('connect_error');
        s.off('new_notification');
        s.off('notifications_read');
        s.off('new_message');
        s.off('message_edited');
        s.off('message_deleted');
        s.off('connection_request');
        s.off('connection_rejected');
        s.off('friend_request');
        s.off('friend_accepted');
        s.off('post_reply');
        s.off('user:online_list');
        s.off('user:online');
        s.off('user:offline');
      }
      clearInterval(heartbeat);
      window.removeEventListener('focus', handleFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queryClient]);

  // Telegram Mini App: auto-login before anything else
  if (tmaLoading) {
    return <TelegramAutoLogin onDone={() => setTmaLoading(false)} />;
  }

  if (!token) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"         element={<LandingPage />} />
            <Route path="/feed"     element={<FeedPage />} />
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register"        element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/privacy"  element={<PrivacyPolicyPage />} />
            <Route path="/terms"    element={<TermsPage />} />
            {/* /onboarding and /vk-setup must be available in the unauthenticated tree too:
                Register/Login call setAuth() + navigate() synchronously, and the router
                resolves the route before React re-renders with the new token. Without these
                entries the navigation falls through to the catch-all and lands on the feed. */}
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/vk-setup"   element={<VkSetupPage />} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <CookieConsent />
        <Toaster />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppRoutes />
      <CookieConsent />
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
