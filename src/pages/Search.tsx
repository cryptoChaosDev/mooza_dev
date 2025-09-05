import React, { useState } from "react";
import { InterestSelector } from "../InterestSelector";
import { getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";

export function Search({ profile, users, friends, favorites, onAddFriend, onRemoveFriend, onToggleFavorite, onUserClick }: {
  profile: UserProfile,
  users: UserProfile[],
  friends: string[],
  favorites: string[],
  onAddFriend: (name: string) => void,
  onRemoveFriend: (name: string) => void,
  onToggleFavorite: (name: string) => void,
  onUserClick: (user: UserProfile) => void,
}) {
  const [showOnlyMatches, setShowOnlyMatches] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'city' | 'country' | 'match'>('match');

  const getProfileMatchCount = (user: UserProfile) => user.interests.filter(tag => profile.interests.includes(tag)).length;
  let matchedUsers: (UserProfile & { matchCount: number })[] = [];
  matchedUsers = users
    .map(u => ({ ...u, matchCount: getProfileMatchCount(u) }))
    .filter(u => {
      if (selectedTags.length > 0) {
        if (showOnlyMatches) {
          return selectedTags.every(tag => u.interests.includes(tag));
        } else {
          return u.interests.some(tag => selectedTags.includes(tag));
        }
      } else {
        return !showOnlyMatches || u.matchCount > 0;
      }
    })
    .sort((a, b) => b.matchCount - a.matchCount);
  const sortedUsers = [...matchedUsers].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ru');
    if (sortBy === 'city') return (a.city || '').localeCompare(b.city || '', 'ru');
    if (sortBy === 'country') return (a.country || '').localeCompare(b.country || '', 'ru');
    if (sortBy === 'match') return b.matchCount - a.matchCount;
    return 0;
  });

  return (
    <main className="p-4 sm:p-6 pt-20 text-center text-dark-text min-h-[100dvh] bg-dark-bg flex flex-col items-center text-base sm:text-lg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex flex-col gap-2 mb-2 animate-fade-in">
          <InterestSelector
            selected={selectedTags}
            onChange={setSelectedTags}
          />
          <label className="flex items-center gap-2 cursor-pointer text-sm mt-2">
            <input type="checkbox" checked={showOnlyMatches} onChange={e => setShowOnlyMatches(e.target.checked)} />
            Только совпадающие
          </label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-dark-muted">Сортировать:</span>
            <select className="px-2 py-1 rounded bg-dark-bg/60 text-dark-text text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="match">По совпадению интересов</option>
              <option value="name">По имени</option>
              <option value="city">По городу</option>
              <option value="country">По стране</option>
            </select>
          </div>
        </div>
        {sortedUsers.length === 0 && <div className="text-dark-muted empty-state">Нет подходящих пользователей</div>}
        {sortedUsers.map(user => (
          <div key={user.userId} className="bg-dark-card rounded-2xl shadow-card p-4 flex flex-col gap-4 mb-3 animate-fade-in animate-scale-in">
            <div className="flex flex-col items-center gap-1 w-full relative">
              <div className="relative w-20 h-20 mb-2 mx-auto">
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-lg bg-dark-bg/80 flex items-center justify-center">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span role="img" aria-label="avatar" className="text-4xl">👤</span>
                  )}
                </div>
              </div>
              <div className="font-bold text-xl text-dark-text text-center break-words leading-tight flex-1">{user.firstName} {user.lastName}</div>
              {(user.city || user.country) && (
                <div className="text-blue-700 text-xs">{[user.city, user.country].filter(Boolean).join(', ')}</div>
              )}
            </div>
            {user.bio && (
              <div className="w-full mt-2">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">О себе</div>
                <div className="text-base text-dark-text text-center whitespace-pre-line font-normal mb-2">{user.bio}</div>
              </div>
            )}
            {user.workPlace && (
              <div className="w-full mt-1">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Место работы</div>
                <div className="text-dark-muted text-sm text-center mb-2">{user.workPlace}</div>
              </div>
            )}
            {user.skills?.length > 0 && (
              <div className="w-full mt-1">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Навыки</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {user.skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-blue-500 to-cyan-400 text-white">{getInterestPath(skill)}</span>
                  ))}
                </div>
              </div>
            )}
            {user.interests?.length > 0 && (
              <div className="w-full mt-1">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Интересы</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {user.interests.map((interest, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-cyan-100 text-cyan-800">{getInterestPath(interest)}</span>
                  ))}
                </div>
              </div>
            )}
            {user.portfolio && (user.portfolio.text || user.portfolio.fileUrl) && (
              <div className="w-full mt-1 flex flex-col items-center">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Портфолио</div>
                {user.portfolio.text && <div className="text-dark-text text-sm text-center whitespace-pre-line mb-1">{user.portfolio.text}</div>}
                {user.portfolio.fileUrl && (
                  <a href={user.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs">Скачать вложение</a>
                )}
              </div>
            )}
            {(user.phone || user.email) && (
              <div className="w-full mt-1 flex flex-col items-center">
                <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Контакты</div>
                {user.phone && <div className="text-dark-text text-sm">📞 <a href={`tel:${user.phone}`} className="text-blue-500 underline">{user.phone}</a></div>}
                {user.email && <div className="text-dark-text text-sm">✉️ <a href={`mailto:${user.email}`} className="text-blue-500 underline">{user.email}</a></div>}
              </div>
            )}
            <div className="flex gap-2 mt-2 justify-center">
              {friends.includes(user.userId) ? (
                <button title="Удалить из друзей" className="p-2 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors" onClick={() => onRemoveFriend(user.userId)}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                </button>
              ) : (
                <button title="Добавить в друзья" className="p-2 rounded-full bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white transition-colors" onClick={() => onAddFriend(user.userId)}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
              )}
              <button
                title={favorites.includes(user.userId) ? "Убрать из избранного" : "В избранное"}
                className={`p-2 rounded-full transition-colors ${favorites.includes(user.userId) ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`}
                onClick={() => onToggleFavorite(user.userId)}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}