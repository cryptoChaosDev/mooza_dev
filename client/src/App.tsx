import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { connectSocket, disconnectSocket, getSocket } from './lib/socket';
import Layout from './components/Layout';

const LandingPage    = lazy(() => import('./pages/LandingPage'));
const LoginPage      = lazy(() => import('./pages/LoginPage'));
const RegisterPage   = lazy(() => import('./pages/RegisterPage'));
const FeedPage       = lazy(() => import('./pages/FeedPage'));
const ProfilePage    = lazy(() => import('./pages/ProfilePage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const SearchPage     = lazy(() => import('./pages/SearchPage'));
const FriendsPage    = lazy(() => import('./pages/FriendsPage'));
const MessagesPage   = lazy(() => import('./pages/MessagesPage'));
const ChatPage       = lazy(() => import('./pages/ChatPage'));
const AdminPage      = lazy(() => import('./pages/AdminPage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

function showNotification(title: string, body: string, icon?: string) {
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: icon || '/vite.svg' });
}

function App() {
  const { token, user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(token);

    socket.on('new_message', (message: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const senderName = message.sender
        ? `${message.sender.firstName} ${message.sender.lastName}`
        : 'Новое сообщение';
      showNotification(senderName, message.content, message.sender?.avatar);
    });

    socket.on('friend_request', ({ requester }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      if (!requester) return;
      showNotification(
        'Заявка в друзья',
        `${requester.firstName} ${requester.lastName} хочет добавить вас в друзья`,
        requester.avatar,
      );
    });

    socket.on('friend_accepted', ({ friendship }: any) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-sent'] });
      const accepter = friendship?.requester;
      if (!accepter) return;
      showNotification(
        'Вас добавили в друзья',
        `${accepter.firstName} ${accepter.lastName} принял(а) вашу заявку`,
        accepter.avatar,
      );
    });

    socket.on('post_reply', ({ comment }: any) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      const commenter = comment?.author;
      if (!commenter) return;
      showNotification(
        'Новый комментарий',
        `${commenter.firstName} ${commenter.lastName} прокомментировал(а) вашу запись`,
        commenter.avatar,
      );
    });

    return () => {
      const s = getSocket();
      if (s) {
        s.off('new_message');
        s.off('friend_request');
        s.off('friend_accepted');
        s.off('post_reply');
      }
    };
  }, [token, queryClient]);

  if (!token) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<UserProfilePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:userId" element={<ChatPage />} />
          <Route path="/chat/:userId" element={<ChatPage />} />
          {user?.isAdmin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default App;
