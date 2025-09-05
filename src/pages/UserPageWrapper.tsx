import React from "react";
import { useParams } from "react-router-dom";
import { UserPage } from "./UserPage";
import { Post } from "../types";
import { UserProfile } from "../types";

interface UserPageWrapperProps {
  allUsers: UserProfile[];
  allPosts: Post[];
  onBack: () => void;
  friends: string[];
  favorites: string[];
  onAddFriend: (userId: string) => void;
  onRemoveFriend: (userId: string) => void;
  onToggleFavorite: (userId: string) => void;
  onLikeUserPost: (id: number) => void;
  currentUserName: string;
}

export function UserPageWrapper({ allUsers, allPosts, onBack, friends, favorites, onAddFriend, onRemoveFriend, onToggleFavorite, onLikeUserPost, currentUserName }: UserPageWrapperProps) {
  const { userName: userId } = useParams<{ userName: string }>();
  const user = allUsers.find(u => u.userId === userId);
  const posts = user ? allPosts.filter(p => p.userId === user.userId) : [];
  if (!user) return <div className="text-center text-dark-muted pt-24">Пользователь не найден</div>;
  const isFriend = friends.includes(user.userId);
  const isFavorite = favorites.includes(user.userId);
  const handleAdd = () => onAddFriend(user.userId);
  const handleRemove = () => onRemoveFriend(user.userId);
  const handleToggleFav = () => onToggleFavorite(user.userId);
  const handleLike = (id: number) => onLikeUserPost(id);
  return <UserPage 
    user={user} 
    posts={posts} 
    onBack={onBack} 
    isFriend={isFriend} 
    isFavorite={isFavorite} 
    onAddFriend={handleAdd} 
    onRemoveFriend={handleRemove} 
    onToggleFavorite={handleToggleFav} 
    onLikePost={handleLike} 
    currentUserName={currentUserName} 
  />;
}