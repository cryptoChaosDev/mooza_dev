import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import { WelcomePage } from "./Welcome";
import { UserProfile, Post } from "./types";
import { ToastProvider } from './contexts/ToastContext';
import { getTelegramUser, MOCK_POSTS } from "./utils";
import { getAllUsers, addFriend, removeFriend, getFriends, createPost, getAllPosts, updatePost, deletePost, togglePostLike, updateProfile } from "./api";
import { AppBar } from "./components/AppBar";
import { TabBar } from "./components/TabBar";
import { Layout } from "./components/Layout";
import { HomeFeed } from "./pages/HomeFeed";
import { Search } from "./pages/Search";
import { Friends } from "./pages/Friends";
import { Profile } from "./pages/Profile";
import { SkillsInterests } from "./pages/SkillsInterests";
import { UserPageWrapper } from "./pages/UserPageWrapper";
import { useProfile } from "./hooks/useProfile";

function App() {
  // Получаем пользователя Telegram (или дефолт)
  const tgUser = getTelegramUser();
  const [showWelcome, setShowWelcome] = useState(true);
  const { profile, setProfile, refreshProfile } = useProfile();
  const navigate = useNavigate(); // Add navigate hook

  // Update showWelcome based on profile state
  React.useEffect(() => {
    if (profile) {
      setShowWelcome(false);
      // Navigate to home page when profile is set
      navigate('/');
    }
  }, [profile, navigate]);

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
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Fetch all users and posts from the database
  useEffect(() => {
    const fetchData = async () => {
      if (profile) {
        try {
          const token = localStorage.getItem('token');
          if (token) {
            // Fetch all users
            try {
              const usersResponse = await getAllUsers(token);
              setAllUsers(usersResponse.users || []);
            } catch (error) {
              console.error('Failed to fetch users:', error);
              // Fallback to empty array if API fails
              setAllUsers([]);
            }
            
            // Fetch all posts
            try {
              const postsResponse = await getAllPosts(token);
              setAllPosts(postsResponse.posts || []);
            } catch (error) {
              console.error('Failed to fetch posts:', error);
              // Fallback to mock posts if API fails
              setAllPosts(MOCK_POSTS);
            }
            
            // Fetch actual friends from the database
            try {
              const friendsResponse = await getFriends(token);
              setFriends(friendsResponse.friends || []);
            } catch (error) {
              console.error('Failed to fetch friends:', error);
              // Fallback to demo friends if API fails
              if (allUsers && allUsers.length > 0) {
                setFriends([
                  allUsers[0]?.userId,
                  allUsers[1]?.userId
                ].filter(Boolean));
              }
            }
            
            // For now, we'll keep favorites as demo data
            // In a real app, this would also come from the database
            if (allUsers && allUsers.length > 0) {
              setFavorites([
                allUsers[2]?.userId
              ].filter(Boolean));
            }
          }
        } catch (error) {
          console.error('Failed to fetch data:', error);
          // Fallback to mock data if API fails
          // setAllUsers(MOCK_USERS);
          setAllPosts(MOCK_POSTS);
        }
      }
    };

    fetchData();
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
      // For now, we're just adding the user ID to the friends list
      // In a real app, we might want to fetch the updated friends list from the server
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
      // For now, we're just removing the user ID from the friends list
      // In a real app, we might want to fetch the updated friends list from the server
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
  const handleCreateUserPost = async (content: string, tags: string[], attachmentUrl?: string) => {
    if (!profile) return;
    
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await createPost(token, content, tags, attachmentUrl);
      const newPost = response.post;
      
      // Transform the post to match frontend expectations
      const transformedPost: Post = {
        id: newPost.id,
        userId: profile.userId,
        author: profile.name,
        avatarUrl: profile.avatarUrl,
        content: newPost.content,
        tags: newPost.tagsCsv ? newPost.tagsCsv.split(',').filter(Boolean) : [],
        liked: newPost.liked,
        favorite: false,
        attachmentUrl: newPost.attachmentUrl || undefined,
        createdAt: newPost.createdAt,
        updatedAt: newPost.updatedAt,
      };
      
      setAllPosts(prev => [transformedPost, ...prev]);
    } catch (error) {
      console.error('Failed to create post:', error);
      // Handle error (show toast, etc.)
    }
  };

  // Handle post update
  const handleUpdateUserPost = async (id: number, content: string, tags: string[]) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await updatePost(token, id, content, tags);
      const updatedPost = response.post;
      
      setAllPosts(prev => prev.map(post => 
        post.id === id ? { 
          ...post, 
          content: updatedPost.content,
          tags: updatedPost.tagsCsv ? updatedPost.tagsCsv.split(',').filter(Boolean) : [],
          updatedAt: updatedPost.updatedAt
        } : post
      ));
    } catch (error) {
      console.error('Failed to update post:', error);
      // Handle error (show toast, etc.)
    }
  };

  // Handle post deletion
  const handleDeleteUserPost = async (id: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      await deletePost(token, id);
      setAllPosts(prev => prev.filter(post => post.id !== id));
    } catch (error) {
      console.error('Failed to delete post:', error);
      // Handle error (show toast, etc.)
    }
  };

  // Handle post like
  const handleLikeUserPost = async (id: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await togglePostLike(token, id);
      const liked = response.liked;
      
      setAllPosts(prev => prev.map(post => 
        post.id === id ? { ...post, liked } : post
      ));
    } catch (error) {
      console.error('Failed to like post:', error);
      // Handle error (show toast, etc.)
    }
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
          skills: Array.isArray(p.skills) ? p.skills.join(',') : p.skills || '',
          interests: Array.isArray(p.interests) ? p.interests.join(',') : p.interests || '',
          portfolio: p.portfolio || null,
          city: p.city || '',
          country: p.country || '',
        }).then((result: any) => {
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