import React from "react";
import { useNavigate } from "react-router-dom";
import { ProfileView } from "../components/ProfileView";
import { Post } from "../types";
import { UserProfile } from "../types";
import { formatPostDate, getInterestPath } from "../utils";
import { UnifiedCard } from "../components/UnifiedCard";

interface UserPageProps {
  user: UserProfile;
  posts: Post[];
  onBack: () => void;
  isFriend: boolean;
  isFavorite: boolean;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
  onToggleFavorite: () => void;
  onLikePost: (id: number) => void;
  currentUserName: string;
}

export function UserPage({ user, posts, onBack, isFriend, isFavorite, onAddFriend, onRemoveFriend, onToggleFavorite, onLikePost, currentUserName }: UserPageProps) {
  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6 overflow-x-hidden px-4 sm:px-0">
        <button className="mb-4 flex items-center gap-2 text-dark-accent hover:underline text-base font-semibold sm:text-lg" onClick={onBack}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Назад
        </button>
        <ProfileView profile={user} />
        {/* Посты пользователя */}
        <div className="font-semibold text-lg mb-2 text-dark-text pl-2 sm:text-xl">Посты пользователя</div>
        <div className="flex flex-col gap-4 max-h-56 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar sm:max-h-64">
          {posts.length === 0 && <div className="text-dark-muted text-center">Нет постов</div>}
          {posts.map((post) => (
            <UnifiedCard key={post.id}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden sm:w-12 sm:h-12">
                  {post.avatarUrl ? (
                    <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span role="img" aria-label="avatar">👤</span>
                  )}
                </div>
                <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline sm:text-base">{post.author}</div>
                <div className="text-xs text-dark-muted ml-auto sm:text-sm">{formatPostDate(post.createdAt)}</div>
              </div>
              <div className="text-dark-text text-base mb-1 whitespace-pre-line sm:text-lg">{post.content}</div>
              {post.attachmentUrl && (
                <img src={post.attachmentUrl} alt="attachment" className="max-h-60 rounded-xl object-contain mb-2 sm:max-h-72" />
              )}
              <div className="flex flex-wrap gap-2 mb-1">
                {post.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-dark-bg/60 text-blue-700 rounded-full text-xs font-medium sm:text-sm">{getInterestPath(tag)}</span>
                ))}
              </div>
            </UnifiedCard>
          ))}
        </div>
      </section>
    </main>
  );
}