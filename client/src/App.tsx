import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FeedPage from './pages/FeedPage';
import ProfilePage from './pages/ProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import SearchPage from './pages/SearchPage';
import FriendsPage from './pages/FriendsPage';
import MessagesPage from './pages/MessagesPage';
import ChatPage from './pages/ChatPage';
import Layout from './components/Layout';

function App() {
  const { token } = useAuthStore();

  if (!token) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<UserProfilePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:userId" element={<ChatPage />} />
        <Route path="/chat/:userId" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
