import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { InterestSelector } from "../InterestSelector";
import { getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";
import { ConsistentUserCard } from "../components/ConsistentUserCard";
import { ConsistentActionButton } from "../components/ConsistentActionButton";

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
  const location = useLocation();
  const [showOnlyMatches, setShowOnlyMatches] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'city' | 'country' | 'match'>('match');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  // Handle search query from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const query = searchParams.get('q');
    if (query) {
      // Split query into tags if it contains commas, otherwise treat as single tag
      const tags = query.includes(',') 
        ? query.split(',').map(tag => tag.trim()).filter(tag => tag)
        : [query.trim()];
      
      setSelectedTags(tags);
    }
  }, [location.search]);

  const getProfileMatchCount = (user: UserProfile) => user.interests.filter(tag => profile.interests.includes(tag)).length;
  let matchedUsers: (UserProfile & { matchCount: number })[] = [];
  matchedUsers = users
    .map(u => ({ ...u, matchCount: getProfileMatchCount(u) }))
    .filter(u => {
      // Ensure the current user doesn't appear in search results
      if (u.userId === profile.userId) return false;
      
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

  const toggleUserExpansion = (userId: string) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  return (
    <main className="p-3 sm:p-4 md:p-6 pt-4 sm:pt-5 md:pt-6 text-center text-dark-text min-h-[100dvh] bg-dark-bg flex flex-col items-center text-sm sm:text-base md:text-lg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col gap-6 container-responsive max-width-md">
        {/* Filter Section */}
        <div className="bg-dark-card rounded-3xl shadow-card p-4 sm:p-5 md:p-6 flex flex-col gap-4 sm:gap-5 animate-fade-in lg:p-7">
          <h2 className="text-xl font-bold text-dark-text sm:text-2xl md:text-3xl">Поиск музыкантов</h2>
          
          <div className="flex flex-col gap-4">
            <InterestSelector
              selected={selectedTags}
              onChange={setSelectedTags}
            />
            
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 sm:gap-3 cursor-pointer text-sm sm:text-base md:text-lg">
                <input 
                  type="checkbox" 
                  checked={showOnlyMatches} 
                  onChange={e => setShowOnlyMatches(e.target.checked)} 
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded accent-blue-500 md:w-6 md:h-6"
                />
                <span>Только совпадающие</span>
              </label>
              
              <div className="flex flex-col gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm text-dark-muted font-semibold md:text-base">Сортировать:</span>
                <select 
                  className="px-3 py-2 sm:px-4 sm:py-3 rounded-2xl bg-dark-bg/60 text-dark-text text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400 sm:text-base md:px-5 md:py-4 md:text-lg"
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
            <div className="text-xl font-bold text-dark-text sm:text-2xl md:text-3xl">Результаты поиска</div>
            <div className="text-sm text-dark-muted font-medium sm:text-base md:text-lg">{sortedUsers.length} пользователей</div>
          </div>
          
          {sortedUsers.length === 0 ? (
            <div className="bg-dark-card rounded-3xl shadow-card p-12 flex flex-col items-center justify-center gap-5">
              <div className="text-6xl opacity-50">🎵</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-xl sm:text-2xl">Нет подходящих пользователей</div>
                <div className="text-base mt-2 sm:text-lg">Попробуйте изменить критерии поиска</div>
              </div>
            </div>
          ) : (
            sortedUsers.map(user => (
              <ConsistentUserCard
                key={user.userId}
                user={user}
                profile={profile}
                showMatchScore={true}
                onClick={() => onUserClick(user)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
