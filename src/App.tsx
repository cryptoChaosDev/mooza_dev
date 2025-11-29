import React, { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { WelcomePage } from "./Welcome";
import { UserProfile, Post } from "./types";
import { getTelegramUser, MOCK_POSTS } from "./utils";
import { AppBar } from "./components/AppBar";
import { TabBar } from "./components/TabBar";
import { Layout } from "./components/Layout";
import { HomeFeed } from "./pages/HomeFeed";
import { Search } from "./pages/Search";
import { Friends } from "./pages/Friends";
import { Profile } from "./pages/Profile";
import { SkillsInterests } from "./pages/SkillsInterests";
import { ToastProvider } from "./contexts/ToastContext";
import { UserPageWrapper } from "./pages/UserPageWrapper";
import { useProfile } from "./hooks/useProfile";
import { updateProfile, getAllUsers, getFriends, addFriend, removeFriend } from "./api";


const navItems = [
  {
    to: "/",
    label: "Главная",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><path d="M3 10.75L12 4l9 6.75V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    ),
  },
  {
    to: "/search",
    label: "Поиск",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    ),
  },
  {
    to: "/friends",
    label: "Друзья",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><circle cx="16" cy="17" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M12 12c2.5 0 4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    to: "/profile",
    label: "Профиль",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-2.5 3.5-4 8-4s8 1.5 8 4" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
];

function App() {
  // Получаем пользователя Telegram (или дефолт)
  const tgUser = getTelegramUser();
  const [showWelcome, setShowWelcome] = useState(true);
  const { profile, setProfile, refreshProfile } = useProfile();

  // Update showWelcome based on profile state
  React.useEffect(() => {
    if (profile) {
      setShowWelcome(false);
    }
  }, [profile]);

  // Listen for profile updates from child components
  React.useEffect(() => {
    const handleProfileUpdate = () => {
      refreshProfile();
    };
    
    window.addEventListener('profileUpdated', handleProfileUpdate);
    
    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, [refreshProfile]);

  // ВСЕ остальные хуки — сюда, до любого return!
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>(MOCK_POSTS);
  const [friends, setFriends] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [userCard, setUserCard] = useState<{ user: UserProfile, posts: Post[] } | null>(null);
  const navigate = useNavigate();

  // Fetch all users from the database
  useEffect(() => {
    const fetchAllUsers = async () => {
      if (profile) {
        try {
          const token = localStorage.getItem('token');
          if (token) {
            const response = await getAllUsers(token);
            setAllUsers(response.users || []);
            
            // Fetch actual friends from the database
            try {
              const friendsResponse = await getFriends(token);
              setFriends(friendsResponse.friendIds || []);
            } catch (error) {
              console.error('Failed to fetch friends:', error);
              // Fallback to demo friends if API fails
              if (response.users && response.users.length > 0) {
                setFriends([response.users[0]?.userId, response.users[1]?.userId].filter(Boolean));
              }
            }
            
            // For now, we'll keep favorites as demo data
            // In a real app, this would also come from the database
            if (response.users && response.users.length > 0) {
              setFavorites([response.users[2]?.userId].filter(Boolean));
            }
          }
        } catch (error) {
          console.error('Failed to fetch users:', error);
          // Fallback to mock users if API fails
          // setAllUsers(MOCK_USERS);
        }
      }
    };

    fetchAllUsers();
  }, [profile]);

  // AppBar search handler
  const handleAppBarSearch = (query: string) => {
    // This will be handled by the Search page
  };

  // Handle user click
  const handleUserClick = (user: UserProfile) => {
    navigate(`/user/${encodeURIComponent(user.userId)}`);
  };

  // Handle add/remove friend with API calls
  const handleAddFriend = async (userId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      await addFriend(token, userId);
      setFriends((prev) => [...prev, userId]);
    } catch (error) {
      console.error('Failed to add friend:', error);
      // Handle error (show toast, etc.)
    }
  };
  
  const handleRemoveFriend = async (userId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      await removeFriend(token, userId);
      setFriends((prev) => prev.filter((id) => id !== userId));
    } catch (error) {
      console.error('Failed to remove friend:', error);
      // Handle error (show toast, etc.)
    }
  };
  
  const handleToggleFavorite = (userId: string) => {
    setFavorites((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  };

  // Handle post creation
  const handleCreateUserPost = (content: string, tags: string[], attachmentUrl?: string) => {
    if (!profile) return;
    const newPost: Post = {
      id: allPosts.length + 1,
      userId: profile.userId,
      author: profile.name,
      avatarUrl: profile.avatarUrl,
      content,
      tags,
      liked: false,
      favorite: false,
      attachmentUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAllPosts(prev => [newPost, ...prev]);
  };

  // Handle post update
  const handleUpdateUserPost = (id: number, content: string, tags: string[]) => {
    setAllPosts(prev => prev.map(post => 
      post.id === id ? { ...post, content, tags, updatedAt: new Date().toISOString() } : post
    ));
  };

  // Handle post deletion
  const handleDeleteUserPost = (id: number) => {
    setAllPosts(prev => prev.filter(post => post.id !== id));
  };

  // Handle post like
  const handleLikeUserPost = (id: number) => {
    setAllPosts(prev => prev.map(post => 
      post.id === id ? { ...post, liked: !post.liked } : post
    ));
  };

  if (showWelcome) {
    return <WelcomePage onFinish={(p) => {
      setProfile(p);
      
      // Also save to server
      const token = localStorage.getItem('token');
      if (!token) return;
      
      try {
        // Save profile data to server
        updateProfile(token, {
          firstName: p.firstName,
          lastName: p.lastName,
          avatarUrl: p.avatarUrl,
          bio: p.bio || '',
          workPlace: p.workPlace || '',
          skills: p.skills || [],
          interests: p.interests || [],
          portfolio: p.portfolio || null,
          city: p.city || '',
          country: p.country || '',
        }).then(result => {
          if (result && result.profile) {
            // Refresh profile data from server
            refreshProfile();
          }
        });
      } catch (error) {
        console.error('Failed to save profile:', error);
        // Could show error toast here
      }
    }} />;
  }

  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen bg-dark-bg">
        <AppBar onSearch={handleAppBarSearch} />
        <div className="flex-1 pt-[var(--header-height)] pb-[var(--tabbar-height)] w-full overflow-x-hidden">
          <Layout>
            <Routes>
              <Route path="/" element={<HomeFeed profile={profile!} allPosts={allPosts} friends={friends} onUserClick={handleUserClick} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} users={allUsers} />} />
              <Route path="/search" element={<Search profile={profile!} users={allUsers} friends={friends} favorites={favorites} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onToggleFavorite={handleToggleFavorite} onUserClick={handleUserClick} />} />
              <Route path="/friends" element={<Friends profile={profile!} friends={friends} users={allUsers} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onUserClick={handleUserClick} />} />
              <Route path="/profile" element={<Profile key={profile?.userId} profile={profile!} setProfile={setProfile} allPosts={allPosts} setAllPosts={setAllPosts} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} users={allUsers} setAllUsers={setAllUsers} friends={friends} favorites={favorites} onUserClick={handleUserClick} />} />
              <Route path="/skills" element={<SkillsInterests profile={profile!} setProfile={setProfile} />} />
              <Route path="/user/:userName" element={<UserPageWrapper 
                allUsers={allUsers} 
                allPosts={allPosts} 
                onBack={() => navigate(-1)}
                friends={friends}
                favorites={favorites}
                onAddFriend={handleAddFriend}
                onRemoveFriend={handleRemoveFriend}
                onToggleFavorite={handleToggleFavorite}
                onLikeUserPost={handleLikeUserPost}
                currentUserName={profile!.name}
              />} />
            </Routes>
          </Layout>
        </div>
        <TabBar />
      </div>
    </ToastProvider>
  );
}

export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}