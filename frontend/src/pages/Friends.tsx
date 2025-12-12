import React, { useState } from "react";
import { UserProfile } from "../types";
import { getInterestPath } from "../utils";
import { ConsistentUserCard } from "../components/ConsistentUserCard";
import { ConsistentActionButton } from "../components/ConsistentActionButton";

export function Friends({ profile, friends, users, onAddFriend, onRemoveFriend, onUserClick }: {
  profile: UserProfile,
  friends: string[] | UserProfile[],  // Accept both string[] and UserProfile[]
  users: UserProfile[],
  onAddFriend: (userId: string) => void,
  onRemoveFriend: (userId: string) => void,
  onUserClick: (user: UserProfile) => void,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'name' | 'city' | 'country'>('name');
  
  // Get friend users
  const friendUsers = Array.isArray(friends) && friends.length > 0 && typeof friends[0] === 'string'
    ? users.filter(user => (friends as string[]).includes(user.userId))
    : friends as UserProfile[];
  
  // Filter by search query
  const filteredFriends = friendUsers.filter(user => 
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.interests.some(interest => interest.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // Sort friends
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ru');
    if (sortBy === 'city') return (a.city || '').localeCompare(b.city || '', 'ru');
    if (sortBy === 'country') return (a.country || '').localeCompare(b.country || '', 'ru');
    return 0;
  });
  
  // Get all users who are not friends
  const nonFriends = users.filter(user => 
    Array.isArray(friends) && friends.length > 0 && typeof friends[0] === 'string'
      ? !(friends as string[]).includes(user.userId)
      : !friendUsers.some(friend => friend.userId === user.userId) && 
    user.userId !== profile.userId
  );
  
  // Filter non-friends by search query
  const filteredNonFriends = nonFriends.filter(user => 
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.interests.some(interest => interest.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <main className="p-3 sm:p-4 md:p-6 pt-4 sm:pt-5 md:pt-6 text-center text-dark-text min-h-[100dvh] bg-dark-bg flex flex-col items-center text-sm sm:text-base md:text-lg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col gap-6 container-responsive max-width-md">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-dark-text">Мои друзья</h1>
          
          {/* Search and sort controls */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск друзей..."
                className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-muted">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-xs text-dark-muted font-semibold uppercase tracking-wider">Сортировать:</span>
              <select 
                className="px-3 py-2 rounded-2xl bg-dark-bg/60 text-dark-text text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={sortBy} 
                onChange={e => setSortBy(e.target.value as any)}
              >
                <option value="name">По имени</option>
                <option value="city">По городу</option>
                <option value="country">По стране</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Friends count */}
        <div className="bg-dark-card rounded-3xl shadow-card p-5 flex items-center justify-between">
          <div className="text-left">
            <div className="text-2xl font-bold text-dark-text">{sortedFriends.length}</div>
            <div className="text-dark-muted text-sm">друзей</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-dark-text">{filteredNonFriends.length}</div>
            <div className="text-dark-muted text-sm">потенциальных друзей</div>
          </div>
        </div>
        
        {/* Friends list */}
        {sortedFriends.length > 0 ? (
          <div className="flex flex-col gap-5">
            <h2 className="text-xl font-bold text-dark-text text-left">Ваши друзья</h2>
            <div className="grid grid-cols-1 gap-4">
              {sortedFriends.map(user => (
                <div key={user.userId} className="relative">
                  <ConsistentUserCard 
                    user={user} 
                    onClick={() => onUserClick(user)}
                  />
                  <div className="absolute top-3 right-3">
                    <ConsistentActionButton
                      variant="danger"
                      size="small"
                      onClick={() => onRemoveFriend(user.userId)}
                    >
                      Удалить
                    </ConsistentActionButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-dark-card rounded-3xl shadow-card p-8 flex flex-col items-center justify-center gap-4">
            <div className="text-5xl opacity-50">👥</div>
            <div className="text-center text-dark-muted">
              <div className="font-semibold text-xl">У вас пока нет друзей</div>
              <div className="text-base mt-2">Найдите единомышленников в разделе "Поиск"</div>
            </div>
          </div>
        )}
        
        {/* Suggestions */}
        {filteredNonFriends.length > 0 && (
          <div className="flex flex-col gap-5 pt-4">
            <h2 className="text-xl font-bold text-dark-text text-left">Рекомендации</h2>
            <div className="grid grid-cols-1 gap-4">
              {filteredNonFriends.slice(0, 5).map(user => (
                <div key={user.userId} className="relative">
                  <ConsistentUserCard 
                    user={user} 
                    onClick={() => onUserClick(user)}
                    showMatchScore={true}
                    profile={profile}
                  />
                  <div className="absolute top-3 right-3">
                    <ConsistentActionButton
                      variant="primary"
                      size="small"
                      onClick={() => onAddFriend(user.userId)}
                    >
                      Добавить
                    </ConsistentActionButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}