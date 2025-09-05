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
    <main className="p-4 sm:p-6 pt-6 text-center text-dark-text min-h-[100dvh] bg-dark-bg flex flex-col items-center text-base sm:text-lg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Filter Section */}
        <div className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-5 animate-fade-in">
          <h2 className="text-2xl font-bold text-dark-text">Поиск музыкантов</h2>
          
          <div className="flex flex-col gap-4">
            <InterestSelector
              selected={selectedTags}
              onChange={setSelectedTags}
            />
            
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-3 cursor-pointer text-base">
                <input 
                  type="checkbox" 
                  checked={showOnlyMatches} 
                  onChange={e => setShowOnlyMatches(e.target.checked)} 
                  className="w-5 h-5 rounded accent-blue-500"
                />
                <span>Только совпадающие</span>
              </label>
              
              <div className="flex flex-col gap-2">
                <span className="text-sm text-dark-muted font-semibold">Сортировать:</span>
                <select 
                  className="px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text text-base shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={sortBy} 
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="match">По совпадению интересов</option>
                  <option value="name">По имени</option>
                  <option value="city">По городу</option>
                  <option value="country">По стране</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Results Section */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-dark-text">Результаты поиска</div>
            <div className="text-base text-dark-muted font-medium">{sortedUsers.length} пользователей</div>
          </div>
          
          {sortedUsers.length === 0 ? (
            <div className="bg-dark-card rounded-3xl shadow-card p-12 flex flex-col items-center justify-center gap-5">
              <div className="text-6xl opacity-50">🎵</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-xl">Нет подходящих пользователей</div>
                <div className="text-base mt-2">Попробуйте изменить критерии поиска</div>
              </div>
            </div>
          ) : (
            sortedUsers.map(user => (
              <div 
                key={user.userId} 
                className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-5 animate-fade-in animate-scale-in cursor-pointer hover:bg-dark-bg/80 transition shadow-lg"
                onClick={() => onUserClick(user)}
              >
                <div className="flex flex-col items-center gap-2 w-full relative">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-white shadow-xl bg-dark-bg/80 flex items-center justify-center">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        <span role="img" aria-label="avatar" className="text-4xl">👤</span>
                      )}
                    </div>
                  </div>
                  <div className="font-bold text-xl text-dark-text text-center break-words leading-tight">
                    {user.firstName} {user.lastName}
                  </div>
                  {(user.city || user.country) && (
                    <div className="text-blue-400 text-sm font-medium flex items-center gap-2 bg-blue-500/10 px-3 py-1 rounded-full">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
                      </svg>
                      {[user.country, user.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                
                {user.bio && (
                  <div className="w-full text-center">
                    <div className="text-sm font-semibold text-dark-muted mb-2 uppercase tracking-wider">О себе</div>
                    <div className="text-dark-text text-base whitespace-pre-line font-normal bg-dark-bg/30 rounded-2xl p-4 shadow-inner">{user.bio}</div>
                  </div>
                )}
                
                {user.workPlace && (
                  <div className="w-full">
                    <div className="text-sm font-semibold text-dark-muted mb-2 uppercase tracking-wider">Место работы</div>
                    <div className="text-dark-text text-sm bg-dark-bg/40 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                        <path d="M3 21h18v-2H3v2zM19 9h-2V7h2v2zm0-4h-2V3h2v2zm-4 8h-2v-2h2v2zm0-4h-2V7h2v2zm0-4h-2V3h2v2zm-8 8H5v-2h2v2zm0-4H5V7h2v2zm0-4H5V3h2v2zm-4 8h2v2H3v-2h2v-2H3v2h2v-2H3v2zm16 0h2v2h-2v-2zm0-2v-2h2v2h-2z" fill="currentColor"/>
                      </svg>
                      <span>{user.workPlace}</span>
                    </div>
                  </div>
                )}
                
                {user.skills?.length > 0 && (
                  <div className="w-full">
                    <div className="text-sm font-semibold text-dark-muted mb-3 uppercase tracking-wider">Навыки</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {user.skills.map((skill, i) => (
                        <span key={i} className="px-4 py-2 rounded-2xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-md">{getInterestPath(skill)}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                {user.interests?.length > 0 && (
                  <div className="w-full">
                    <div className="text-sm font-semibold text-dark-muted mb-3 uppercase tracking-wider">Интересы</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {user.interests.map((interest, i) => (
                        <span key={i} className="px-4 py-2 rounded-2xl text-sm font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-400/30 shadow-sm">{getInterestPath(interest)}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                {user.portfolio && (user.portfolio.text || user.portfolio.fileUrl) && (
                  <div className="w-full flex flex-col items-center gap-3 bg-dark-bg/30 rounded-2xl p-4 shadow-inner">
                    <div className="text-sm font-semibold text-dark-muted uppercase tracking-wider">Портфолио</div>
                    {user.portfolio.text && <div className="text-dark-text text-sm text-center whitespace-pre-line">{user.portfolio.text}</div>}
                    {user.portfolio.fileUrl && (
                      <a 
                        href={user.portfolio.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M16 13H8" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M16 17H8" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M10 9H8" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        Скачать вложение
                      </a>
                    )}
                  </div>
                )}
                
                {(user.phone || user.email) && (
                  <div className="w-full flex flex-col items-center gap-3 bg-dark-bg/30 rounded-2xl p-4 shadow-inner">
                    <div className="text-sm font-semibold text-dark-muted uppercase tracking-wider">Контакты</div>
                    <div className="flex flex-col items-center gap-2">
                      {user.phone && (
                        <a 
                          href={`tel:${user.phone}`} 
                          className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                            <path d="M3 7c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7z" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                          {user.phone}
                        </a>
                      )}
                      {user.email && (
                        <a 
                          href={`mailto:${user.email}`} 
                          className="text-blue-400 underline text-sm flex items-center gap-2 hover:text-blue-300 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                            <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                          {user.email}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3 mt-2 justify-center">
                  {friends.includes(user.userId) ? (
                    <button 
                      title="Удалить из друзей" 
                      className="p-3 rounded-2xl bg-dark-bg/60 text-red-500 shadow-lg hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all hover:scale-105"
                      onClick={e => { e.stopPropagation(); onRemoveFriend(user.userId); }}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </button>
                  ) : (
                    <button 
                      title="Добавить в друзья" 
                      className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg hover:opacity-90 active:scale-95 transition-all hover:scale-105"
                      onClick={e => { e.stopPropagation(); onAddFriend(user.userId); }}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </button>
                  )}
                  <button
                    title={favorites.includes(user.userId) ? "Убрать из избранного" : "В избранное"}
                    className={`p-3 rounded-2xl shadow-lg active:scale-95 transition-all hover:scale-105 ${favorites.includes(user.userId) 
                      ? 'bg-yellow-400 text-white hover:bg-yellow-500' 
                      : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300'}`}
                    onClick={e => { e.stopPropagation(); onToggleFavorite(user.userId); }}
                  >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}