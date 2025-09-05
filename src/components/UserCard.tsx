import React from "react";
import { formatPostDate, getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";

// --- UserCard ---
export function UserCard({ user, posts, isFriend, isFavorite, onAddFriend, onRemoveFriend, onToggleFavorite, onClose }: {
  user: UserProfile;
  posts: Post[];
  isFriend: boolean;
  isFavorite: boolean;
  onAddFriend: () => void;
  onRemoveFriend: () => void;
  onToggleFavorite: () => void;
  onClose: () => void;
}) {
  // Получаем интересы текущего пользователя для подсветки совпадений
  const currentUserInterests = (window as any).moozaCurrentUserInterests || [];
  // Соцсети-иконки (заглушка)
  const getSocialIcon = (url: string) => {
    if (url.includes('vk.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2787F5"/><text x="7" y="16" fontSize="10" fill="#fff">VK</text></svg>;
    if (url.includes('t.me')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><text x="5" y="16" fontSize="10" fill="#fff">TG</text></svg>;
    if (url.includes('instagram.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E1306C"/><text x="3" y="16" fontSize="10" fill="#fff">IG</text></svg>;
    if (url.includes('youtube.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF0000"/><text x="3" y="16" fontSize="10" fill="#fff">YT</text></svg>;
    return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#888"/></svg>;
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" tabIndex={-1} onClick={onClose}>
      <div
        className="bg-dark-card rounded-3xl shadow-2xl p-6 sm:p-10 w-[95vw] max-w-md flex flex-col gap-8 relative animate-fade-in scale-95 animate-scale-in border border-dark-bg/40 font-sans transition-all duration-300 outline-none"
        style={{fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif'}}
        tabIndex={0}
        onClick={e => e.stopPropagation()}
      >
        <button className="absolute top-4 right-4 text-dark-muted hover:text-dark-text text-3xl transition-colors focus:outline-none" onClick={onClose} aria-label="Закрыть" tabIndex={0}>&times;</button>
        <div className="flex flex-col items-center gap-4">
          <div className="avatar-gradient mx-auto mt-2 mb-2" style={{background: isFriend ? 'linear-gradient(135deg,#4F8CFF,#38BDF8)' : isFavorite ? 'linear-gradient(135deg,#fbbf24,#fde68a)' : 'linear-gradient(135deg,#888,#222)'}}>
            <div className="avatar-inner w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg flex items-center justify-center">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span role="img" aria-label="avatar" className="text-5xl">👤</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="font-bold text-2xl sm:text-3xl text-dark-text text-center break-words">{user.name}</div>
            {(user.country || user.city) && <div className="text-blue-700 text-xs font-medium">{[user.country, user.city].filter(Boolean).join(', ')}</div>}
            <div className="text-dark-muted text-base text-center max-w-xs whitespace-pre-line break-words">{user.bio}</div>
          </div>
          {/* Кнопки действий */}
          <div className="flex gap-3 mt-2">
            {isFriend ? (
              <button className="p-3 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors shadow focus:outline-none" title="Удалить из друзей" onClick={onRemoveFriend} tabIndex={0}>
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
              </button>
            ) : (
              <button className="p-3 rounded-full bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white transition-colors shadow focus:outline-none" title="Добавить в друзья" onClick={onAddFriend} tabIndex={0}>
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            )}
            <button
              className={`p-3 rounded-full shadow transition-colors focus:outline-none ${isFavorite ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`}
              title={isFavorite ? "Убрать из избранного" : "В избранное"}
              onClick={onToggleFavorite}
              tabIndex={0}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={isFavorite ? '#fbbf24' : 'none'} /></svg>
            </button>
          </div>
          {/* Соцсети */}
          {user.socials && user.socials.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {user.socials.filter(Boolean).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-text" title={link} tabIndex={0}>
                  {getSocialIcon(link)}
                </a>
              ))}
            </div>
          )}
          {/* Интересы */}
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {user.interests.map((interest, i) => (
              <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none ${currentUserInterests.includes(interest) ? 'bg-dark-accent text-white' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white'}`}>{getInterestPath(interest)}{currentUserInterests.includes(interest) && <span className="ml-1">★</span>}</span>
            ))}
          </div>
        </div>
        {/* Посты пользователя */}
        <div className="mt-2">
          <div className="font-semibold text-lg mb-2 text-dark-text pl-2">Посты пользователя</div>
          <div className="flex flex-col gap-4 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {posts.length === 0 && <div className="text-dark-muted text-center">Нет постов</div>}
            {posts.map((post) => (
              <div key={post.id} className="relative bg-dark-card rounded-2xl shadow p-4 flex flex-col gap-2 animate-fade-in animate-scale-in">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden">
                    {post.avatarUrl ? (
                      <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline">{post.author}</div>
                  <div className="text-xs text-dark-muted ml-auto">{formatPostDate(post.createdAt)}</div>
                </div>
                <div className="text-dark-text text-base mb-1 whitespace-pre-line">{post.content}</div>
                {post.attachmentUrl && (
                  <img src={post.attachmentUrl} alt="attachment" className="max-h-60 rounded-xl object-contain mb-2" />
                )}
                <div className="flex flex-wrap gap-2 mb-1">
                  {post.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-dark-bg/60 text-blue-700 rounded-full text-xs font-medium">{getInterestPath(tag)}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}