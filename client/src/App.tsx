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
import { subscribePush } from './lib/push';
import { RequireAuth, PublicRoute, GuestOnly } from './components/RouteGuards';
import { AuthGateHost } from './components/AuthGateModal';
import { takeReturnToast } from './lib/authReturn';
import { reachGoal, setVisitParams } from './lib/metrika';
import { toast } from './stores/toastStore';
import NotFoundPage from './pages/NotFoundPage';


const LandingPage        = lazy(() => import('./pages/LandingPage'));
const LoginPage          = lazy(() => import('./pages/LoginPage'));
const RegisterPage       = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const FeedPage           = lazy(() => import('./pages/FeedPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));
const PrivacySettingsPage = lazy(() => import('./pages/PrivacySettingsPage'));
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

// Локальный системный баннер — ТОЛЬКО когда вкладка видима (пользователь в
// приложении, но на другой странице). Свёрнутую вкладку/PWA покрывает push с
// сервера: сервер шлёт его, только если видимое окно не подтвердило событие,
// поэтому двух баннеров на одно событие не бывает. tag совпадает с tag push.
async function showNotification(title: string, body: string, icon?: string, link?: string, tag?: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState !== 'visible') return;
  const iconUrl = resolveIcon(icon);
  const notifTag = tag || link || title;
  // Use service worker notification — works on mobile (new Notification() does not)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: iconUrl,
        badge: '/badge-96.png',
        tag: notifTag,
        data: { link: link || '/' },
      });
      return;
    } catch { /* fall through to legacy */ }
  }
  const n = new Notification(title, { body, icon: iconUrl, badge: '/badge-96.png', tag: notifTag });
  n.onclick = () => { window.focus(); n.close(); if (link) window.location.href = link; };
}

// Ответ на emit с подтверждением (см. server/src/socket.ts): видимое окно
// сообщает, что событие показано в приложении — тогда сервер не шлёт push.
function ackVisible(ack: unknown) {
  if (typeof ack !== 'function') return;
  try { (ack as (r: unknown) => void)({ visible: document.visibilityState === 'visible' }); } catch { /* ignore */ }
}

// Открыта ли сейчас эта беседа. ChatPage публикует id беседы в badgeStore
// (после /messages/:userId URL ещё может содержать userId).
function isViewingConversation(convId: string | undefined | null): boolean {
  if (!convId) return false;
  if (useBadgeStore.getState().activeConversationId === convId) return true;
  const path = window.location.pathname;
  return path === `/messages/${convId}` || path === `/chat/${convId}`;
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

// ─── Sync badge counts with the server when user navigates to relevant pages ─
// Раньше бейджи просто обнулялись на /messages и /friends, даже когда
// непрочитанные/заявки оставались. Теперь — сверка с серверным счётчиком.
function BadgeClearer() {
  const location = useLocation();
  const refreshMessages = useBadgeStore((s) => s.refreshMessages);

  useEffect(() => {
    if (location.pathname === '/messages') {
      void refreshMessages();
    }
  }, [location.pathname, refreshMessages]);

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

// ─── Тост «Теперь можно …» после возврата с экрана входа ──────────────────────
// Возврат на страницу действия — consumeReturnTo() (lib/authReturn); само
// действие повторно не выполняется, пользователь видит подсказку.
function ReturnToast() {
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) return;
    const msg = takeReturnToast(location.pathname);
    if (msg) toast.success(msg);
  }, [location.pathname, token]);
  return null;
}

// /admin — только администратору; остальным — как несуществующая страница.
function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (!user?.isAdmin) return <NotFoundPage />;
  return <AdminPage />;
}

// /register у вошедшего — только экран принятия приглашения в артиста.
const registerAllowedWhenAuthed = (sp: URLSearchParams) => sp.has('artistInvite');

/**
 * Единое дерево маршрутов для гостя и вошедшего (план, раздел A). Уровень
 * доступа задаётся обёрткой маршрута: PublicRoute (гостю — урезанный вид, если
 * включён guestBrowsingEnabled), RequireAuth (экран «Войдите, чтобы…» с
 * возвратом после входа), GuestOnly (вход/регистрация/сброс пароля).
 *
 * Раньше было два дерева (`if (!token)` + AppRoutes), и Register/Login, вызывая
 * setAuth() + navigate() синхронно, попадали в гонку: роутер разрешал адрес
 * раньше, чем React перерисовывал дерево с новым токеном, и /onboarding или
 * /vk-setup проваливались в catch-all на ленту — поэтому их дублировали в
 * гостевом дереве. Теперь дерево одно: маршрут существует при любом токене,
 * а RequireAuth читает тот же стор, обновлённый в том же батче рендера.
 */
function AppRoutes() {
  const token = useAuthStore((s) => s.token);
  return (
    <Layout>
      {token && <BadgeClearer />}
      {IS_TMA && <TelegramBackButton />}
      <ReturnToast />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Публичные */}
            <Route path="/"                 element={token ? <FeedPage /> : <LandingPage />} />
            <Route path="/feed"             element={<FeedPage />} />
            <Route path="/privacy"          element={<PrivacyPolicyPage />} />
            <Route path="/terms"            element={<TermsPage />} />

            {/* Публичные с урезанным гостевым видом (гейт guestBrowsingEnabled) */}
            <Route path="/flow-settings"    element={<PublicRoute><FlowSettingsPage /></PublicRoute>} />
            <Route path="/search"           element={<PublicRoute><SearchPage /></PublicRoute>} />
            <Route path="/profile/:userId"  element={<PublicRoute><UserProfilePage /></PublicRoute>} />
            <Route path="/profile/:userId/professions" element={<PublicRoute><UserProfessionsPage /></PublicRoute>} />
            <Route path="/profile/:userId/services" element={<PublicRoute><ServicesPage /></PublicRoute>} />
            <Route path="/profile/:userId/reviews" element={<PublicRoute><ReviewsPage /></PublicRoute>} />
            <Route path="/professions/:userId/:professionId" element={<PublicRoute><ProfessionPage /></PublicRoute>} />
            {/* /artist/<slug> — канонический адрес; /artist/<uuid> и прежние слаги страница сама заменяет на слаг */}
            <Route path="/artist/:idOrSlug" element={<PublicRoute><ArtistPage /></PublicRoute>} />
            <Route path="/releases/:id"     element={<PublicRoute><ReleasePage /></PublicRoute>} />
            <Route path="/clips/:id"        element={<PublicRoute><ClipPage /></PublicRoute>} />
            <Route path="/services/:serviceId" element={<PublicRoute><ServicePage /></PublicRoute>} />
            <Route path="/orders/:orderId" element={<PublicRoute><OrderDetailPage /></PublicRoute>} />
            <Route path="/vacancies/:vacancyId" element={<PublicRoute><VacancyDetailPage /></PublicRoute>} />
            {/* Legacy «Группы» routes — collapsed into the unified Artist page */}
            <Route path="/groups/create"    element={<Navigate to="/artist/create" replace />} />
            <Route path="/groups/invites"   element={<Navigate to="/" replace />} />
            <Route path="/groups/:id"       element={<GroupRedirect />} />

            {/* Только для гостя */}
            <Route path="/login"            element={<GuestOnly><LoginPage /></GuestOnly>} />
            {/* Вошедший, открывший ссылку-приглашение в артиста, попадает сюда же:
                RegisterPage показывает экран принятия приглашения. */}
            <Route path="/register"         element={<GuestOnly allowAuthed={registerAllowedWhenAuthed}><RegisterPage /></GuestOnly>} />
            <Route path="/forgot-password"  element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />

            {/* Приватные */}
            <Route path="/profile"          element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/settings/privacy" element={<RequireAuth><PrivacySettingsPage /></RequireAuth>} />
            <Route path="/artist/create"     element={<RequireAuth reason="create"><ArtistCreatePage /></RequireAuth>} />
            <Route path="/artist/:id/edit"  element={<RequireAuth><ArtistEditPage /></RequireAuth>} />
            <Route path="/artist/:id/releases/new" element={<RequireAuth><ArtistMediaFormPage kind="release" /></RequireAuth>} />
            <Route path="/artist/:id/clips/new"    element={<RequireAuth><ArtistMediaFormPage kind="clip" /></RequireAuth>} />
            <Route path="/artist/:id/vacancies/new" element={<RequireAuth><ArtistVacancyNewPage /></RequireAuth>} />
            <Route path="/artist/:id/members/add"  element={<RequireAuth><ArtistMemberAddPage /></RequireAuth>} />
            <Route path="/artist/:id/invite"       element={<RequireAuth><ArtistInvitePage /></RequireAuth>} />
            <Route path="/artist/:id/contacts"     element={<RequireAuth><ArtistContactsPage /></RequireAuth>} />
            <Route path="/artist/:id/genres"       element={<RequireAuth><ArtistGenresPage /></RequireAuth>} />
            <Route path="/artists/:artistId/vacancies" element={<RequireAuth><VacanciesPage /></RequireAuth>} />
            <Route path="/friends"          element={<RequireAuth><FriendsPage /></RequireAuth>} />
            <Route path="/friends/requests" element={<RequireAuth><FriendRequestsPage /></RequireAuth>} />
            <Route path="/messages"         element={<RequireAuth reason="message"><MessagesPage /></RequireAuth>} />
            <Route path="/messages/:id"     element={<RequireAuth reason="message"><ChatPage /></RequireAuth>} />
            <Route path="/chat/:id"         element={<RequireAuth reason="message"><ChatPage /></RequireAuth>} />
            <Route path="/create-post"      element={<RequireAuth reason="create"><CreatePostPage /></RequireAuth>} />
            <Route path="/invite"           element={<RequireAuth><InvitePage /></RequireAuth>} />
            <Route path="/pro"              element={<RequireAuth><ProPage /></RequireAuth>} />
            <Route path="/onboarding"       element={<RequireAuth><OnboardingPage /></RequireAuth>} />
            <Route path="/vk-setup"         element={<RequireAuth><VkSetupPage /></RequireAuth>} />
            <Route path="/services/new" element={<RequireAuth reason="create"><ServiceFormPage /></RequireAuth>} />
            <Route path="/services/edit/:serviceId" element={<RequireAuth><ServiceFormPage /></RequireAuth>} />
            <Route path="/professions/new" element={<RequireAuth><ProfessionFormPage /></RequireAuth>} />
            <Route path="/professions/edit/:professionId" element={<RequireAuth><ProfessionFormPage /></RequireAuth>} />
            <Route path="/profile/:userId/connections" element={<RequireAuth><ConnectionsPage /></RequireAuth>} />
            <Route path="/connections/requests" element={<RequireAuth><ConnectionRequestsPage /></RequireAuth>} />
            <Route path="/connection/:partnerId" element={<RequireAuth reason="connect"><ConnectionPage /></RequireAuth>} />
            <Route path="/deals" element={<RequireAuth reason="deal"><DealsPage /></RequireAuth>} />
            <Route path="/deals/:dealId" element={<RequireAuth reason="deal"><DealPage /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="/orders/new" element={<RequireAuth reason="create"><OrderFormPage /></RequireAuth>} />
            <Route path="/orders/edit/:orderId" element={<RequireAuth><OrderFormPage /></RequireAuth>} />
            <Route path="/admin"            element={<RequireAuth><AdminRoute /></RequireAuth>} />

            <Route path="*"                 element={<NotFoundPage />} />
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
      // Автологин Mini App остаётся на открытом адресе (диплинк) — возврат не нужен.
      .then(({ data }) => { setAuth(data.user, data.token); reachGoal('login_success', { source: 'telegram_miniapp' }); onDone(); })
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

  // Метрика: параметр визита guest:true/false (план, раздел B).
  useEffect(() => {
    setVisitParams({ guest: !token });
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

  // Бейдж заявок в друзья = реальное число входящих заявок: как только любой
  // экран (Отношения, Запросы дружбы) загрузил список ['friend-requests'] —
  // в том числе после принятия/отклонения — бейдж берёт его длину.
  useEffect(() => {
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const q = event.query;
      if (q.queryKey.length === 1 && q.queryKey[0] === 'friend-requests' && Array.isArray(q.state.data)) {
        useBadgeStore.getState().setPendingFriendRequests(q.state.data.length);
      }
    });
    return unsub;
  }, [queryClient]);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    // Push: разрешение здесь НЕ запрашиваем (вне жеста iOS/Safari/Firefox его
    // отклоняют) — это делает кнопка баннера в Layout. Если разрешение уже
    // выдано — молча (пере)подписываем устройство на текущий аккаунт.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void subscribePush(token);
    }

    // ── Connect socket ──────────────────────────────────────────────────────
    const socket = connectSocket(token);

    // ── Badge counts — только серверные счётчики ────────────────────────────
    const fetchCounts = () => {
      void bs().refreshMessages();
      void bs().refreshNotifications();
      apiFetch('/api/friendships/requests', token)
        .then((reqs) => bs().setPendingFriendRequests(Array.isArray(reqs) ? reqs.length : 0))
        .catch(() => {});
    };
    fetchCounts();

    let notifCountTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNotifCount = () => {
      if (notifCountTimer) clearTimeout(notifCountTimer);
      notifCountTimer = setTimeout(() => { void bs().refreshNotifications(); }, 300);
    };

    // Пересинхронизация после реконнекта сокета / возврата из фона: события,
    // пришедшие пока сокет был отключён, иначе теряются.
    let lastResync = Date.now(); // fetchCounts() только что выполнен
    const resync = () => {
      const now = Date.now();
      if (now - lastResync < 1000) return;
      lastResync = now;
      fetchCounts();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const invalidateConnections = () => {
      for (const key of [
        'connections-requests', 'connections-sent', 'connections-rejected', 'connections-accepted',
        'connections-break-requests', 'connections-my-break-requests', 'connections-history',
        'connections-all', 'connection-with', 'user-connections',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };

    // ── Socket handlers (с явными ссылками — cleanup снимает только свои) ────
    const handlers: Record<string, (...args: any[]) => void> = {
      // Socket error → logout on auth failure. Сервер отвечает 'Unauthorized: …'
      // (старый сервер — 'Invalid token'/'No token'); сбой сети/БД — другой текст,
      // тогда socket.io просто переподключается.
      connect_error: (err: any) => {
        const msg: string = err?.message ?? '';
        if (/unauthori|401|token/i.test(msg)) {
          useAuthStore.getState().logout();
        }
      },

      connect: () => resync(),

      // Сессия отозвана сервером (блокировка, смена пароля)
      session_revoked: () => {
        useAuthStore.getState().logout();
      },

      new_notification: (notif: any, ack?: unknown) => {
        ackVisible(ack);
        // If this is a message notification for the chat we're already viewing,
        // we're reading it live — mark it read (only if the tab is visible) and
        // don't badge or list it.
        if (notif?.type === 'message' && typeof notif.link === 'string') {
          const convId = notif.link.split('/').pop();
          if (isViewingConversation(convId)) {
            if (convId && document.visibilityState === 'visible') messageAPI.markRead(convId).catch(() => {});
            return;
          }
        }
        // Instant prepend to cached list (одна запись на беседу может прийти
        // повторно с тем же id — заменяем, а не дублируем)
        queryClient.setQueryData<any[]>(['notifications'], (prev) =>
          prev ? [notif, ...prev.filter((n) => n?.id !== notif?.id)] : [notif]
        );
        // Бейдж — серверный счётчик (повторное обновление той же записи не
        // должно его увеличивать)
        scheduleNotifCount();
      },

      // When notifications were marked read elsewhere (e.g. reading a chat),
      // refresh the badge count and the cached list so they stop showing on top.
      notifications_read: () => {
        void bs().refreshNotifications();
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      },

      new_message: (message: any, ack?: unknown) => {
        ackVisible(ack);
        const convId = message?.conversationId;
        if (isViewingConversation(convId)) return;
        bs().incrementMessages();
        const senderName = message.sender
          ? `${message.sender.firstName} ${message.sender.lastName}`
          : 'Новое сообщение';
        const preview = message.content?.trim() ||
          (message.attachmentName ? `📎 ${message.attachmentName}` : '📎 Вложение');
        showNotification(senderName, preview, message.sender?.avatar, `/messages/${convId}`, `conv-${convId}`);
      },

      connection_request: () => invalidateConnections(),
      connection_rejected: () => invalidateConnections(),
      connection_updated: () => invalidateConnections(),

      friend_request: ({ requester }: any = {}) => {
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        bs().incrementFriendRequests();
        if (!requester) return;
        showNotification(
          'Заявка в друзья',
          `${requester.firstName} ${requester.lastName} хочет добавить вас в друзья`,
          requester.avatar,
          '/friends/requests',
        );
      },

      friend_accepted: ({ friendship }: any = {}) => {
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
      },

      // Заявку отозвали / из друзей удалили — обновить списки и бейдж
      friendship_removed: () => {
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        apiFetch('/api/friendships/requests', token)
          .then((reqs) => bs().setPendingFriendRequests(Array.isArray(reqs) ? reqs.length : 0))
          .catch(() => {});
      },

      'user:online_list': (userIds: string[]) => {
        presence().setOnlineUsers(userIds);
      },

      'user:online': ({ userId }: { userId: string }) => {
        presence().addOnline(userId);
      },

      'user:offline': ({ userId }: { userId: string }) => {
        presence().removeOnline(userId);
      },

      post_reply: ({ comment }: any = {}) => {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        const commenter = comment?.author;
        if (!commenter) return;
        showNotification(
          'Новый комментарий',
          `${commenter.firstName} ${commenter.lastName} прокомментировал(а) вашу запись`,
          commenter.avatar,
          '/',
        );
      },
    };

    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);

    // Heartbeat every 30s to keep lastSeenAt fresh
    const heartbeat = setInterval(() => {
      const s = getSocket();
      if (s?.connected) s.emit('ping');
    }, 30_000);

    // Re-sync counts when tab regains focus / returns from background
    // (iOS PWA при возврате из фона не всегда шлёт focus).
    const handleFocus = () => resync();
    const handleVisibility = () => { if (document.visibilityState === 'visible') resync(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      clearInterval(heartbeat);
      if (notifCountTimer) clearTimeout(notifCountTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queryClient]);

  // Telegram Mini App: auto-login before anything else
  if (tmaLoading) {
    return <TelegramAutoLogin onDone={() => setTmaLoading(false)} />;
  }

  return (
    <ErrorBoundary>
      <AppRoutes />
      <AuthGateHost />
      <CookieConsent />
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
