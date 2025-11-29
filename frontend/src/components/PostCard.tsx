import React from "react";
import { formatPostDate, getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";
import { UnifiedCard } from "./UnifiedCard";
import { ConsistentActionButton } from "./ConsistentActionButton";

// --- PostCard ---
export function PostCard({ post, users, isOwn, onEdit, onDelete, onLike, onUserClick }: {
  post: Post,
  users: UserProfile[],
  isOwn?: boolean,
  onEdit?: () => void,
  onDelete?: () => void,
  onLike?: () => void,
  onUserClick?: (user: UserProfile) => void,
}) {
  const user = users.find(u => u.userId === post.userId);
  return (
    <UnifiedCard>
      <div className="flex items-center gap-3 sm:gap-4 mb-2">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-dark-bg/80 flex items-center justify-center text-xl sm:text-2xl border border-dark-bg/40 overflow-hidden">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span role="img" aria-label="avatar">👤</span>
          )}
        </div>
        <div className="font-semibold text-dark-text text-sm sm:text-base cursor-pointer hover:underline truncate" onClick={() => user && onUserClick && onUserClick(user)}>{user?.name || post.author}</div>
        <div className="flex gap-1 sm:gap-2 ml-auto">
          {isOwn && onEdit && (
            <ConsistentActionButton variant="primary" size="small" onClick={onEdit}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="sm:w-16 sm:h-16"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg> 
              <span className="hidden sm:inline">Редактировать</span>
              <span className="sm:hidden">✏️</span>
            </ConsistentActionButton>
          )}
          {isOwn && onDelete && (
            <ConsistentActionButton variant="danger" size="small" onClick={onDelete}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" className="sm:w-16 sm:h-16"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="#fff" strokeWidth="1.5"/></svg>
              <span className="hidden sm:inline">Удалить</span>
              <span className="sm:hidden">🗑️</span>
            </ConsistentActionButton>
          )}
        </div>
      </div>
      <div className="text-dark-text text-base sm:text-lg mb-1 whitespace-pre-line leading-relaxed font-normal">{post.content}</div>
      <div style={{position: 'absolute', right: 12, bottom: 8}} className="flex gap-2 text-xs text-dark-muted sm:right-16 sm:bottom-12">
        <span><span role="img" aria-label="created">🕒</span> {formatPostDate(post.createdAt)}</span>
        {post.updatedAt !== post.createdAt && <span><span role="img" aria-label="edited">✏️</span> {formatPostDate(post.updatedAt)}</span>}
      </div>
      {post.attachmentUrl && (
        <img src={post.attachmentUrl} alt="attachment" className="max-h-40 sm:max-h-60 rounded-xl object-contain mb-2 animate-fade-in animate-scale-in" />
      )}
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-1">
        {post.tags.map((tag, i) => (
          <span key={i} className="px-2 py-0.5 sm:px-3 sm:py-0.5 bg-dark-bg/60 text-dark-accent rounded-full text-xs font-medium animate-fade-in">{tag}</span>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-4 mt-2 justify-end">
        {onLike && (
          <ConsistentActionButton 
            variant={post.liked ? "primary" : "secondary"} 
            size="small" 
            onClick={onLike}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="sm:w-20 sm:h-20"><path d="M12 21s-6.5-5.5-9-9.5C1.5 8.5 3.5 5 7 5c2.5 0 3.5 2 5 2s2.5-2 5-2c3.5 0 5.5 3.5 4 6.5C18.5 15.5 12 21 12 21Z" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
            <span className="hidden sm:inline">{post.liked ? "Лайк" : "Лайкнуть"}</span>
            <span className="sm:hidden">❤️</span>
          </ConsistentActionButton>
        )}
      </div>
    </UnifiedCard>
  );
}