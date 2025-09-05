import React, { useState, useEffect, useRef } from "react";
import { getInterestPath } from "../utils";
import { UserProfile } from "../types";

export function Friends({ profile, friends, users, onAddFriend, onRemoveFriend, onUserClick }: {
  profile: UserProfile,
  friends: string[],
  users: UserProfile[],
  onAddFriend: (userId: string) => void,
  onRemoveFriend: (userId: string) => void,
  onUserClick: (user: UserProfile) => void,
}) {
  // Кандидаты в друзья по совпадению интересов (не в друзьях)
  const candidates = users
    .filter(u => u.userId !== profile.userId && !friends.includes(u.userId))
    .map(u => ({ ...u, matchCount: u.interests.filter(tag => profile.interests.includes(tag)).length }))
    .filter(u => u.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);
  
  const [hidden, setHidden] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const autoScrollRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  
  // Filter out hidden candidates
  const visibleCandidates = candidates.filter(u => !hidden.includes(u.userId));
  
  // Reset index when candidates change
  useEffect(() => {
    setCurrentIndex(0);
  }, [candidates.length]);
  
  // Auto-scroll functionality
  useEffect(() => {
    if (visibleCandidates.length > 1) {
      autoScrollRef.current = setInterval(() => {
        setIsAutoScrolling(true);
        setCurrentIndex(prev => (prev + 1) % visibleCandidates.length);
        setTimeout(() => setIsAutoScrolling(false), 500);
      }, 5000);
    }
    
    return () => {
      if (autoScrollRef.current) {
        clearInterval(autoScrollRef.current);
      }
    };
  }, [visibleCandidates.length]);
  
  // Carousel navigation
  const nextCandidate = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
    }
    setIsAutoScrolling(true);
    setCurrentIndex(prev => (prev + 1) % visibleCandidates.length);
    setTimeout(() => setIsAutoScrolling(false), 500);
  };
  
  const prevCandidate = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
    }
    setIsAutoScrolling(true);
    setCurrentIndex(prev => (prev - 1 + visibleCandidates.length) % visibleCandidates.length);
    setTimeout(() => setIsAutoScrolling(false), 500);
  };
  
  const goToCandidate = (index: number) => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
    }
    setIsAutoScrolling(true);
    setCurrentIndex(index);
    setTimeout(() => setIsAutoScrolling(false), 500);
  };
  
  const currentCandidate = visibleCandidates[currentIndex];

  // Список друзей
  const friendList = users.filter(u => friends.includes(u.userId));

  return (
    <main className="p-4 sm:p-6 pt-6 min-h-[100dvh] bg-dark-bg flex flex-col items-center font-sans animate-fade-in transition-all duration-300 w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6">
        {/* Верхний блок — рекомендация друга с новым дизайном */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="text-2xl font-bold text-dark-text">Рекомендации</div>
            <div className="text-sm text-dark-muted">
              {visibleCandidates.length > 0 ? `${currentIndex + 1} из ${visibleCandidates.length}` : '0'}
            </div>
          </div>
          
          {visibleCandidates.length > 0 ? (
            <div className="relative">
              {/* Carousel controls on the sides */}
              {visibleCandidates.length > 1 && (
                <>
                  <button 
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-20 p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all shadow-lg"
                    onClick={(e) => { e.stopPropagation(); prevCandidate(); }}
                    title="Предыдущий"
                  >
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2"/></svg>
                  </button>
                  
                  <button 
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 z-20 p-2 rounded-full bg-dark-bg/60 text-dark-text hover:bg-dark-accent/10 active:scale-95 transition-all shadow-lg"
                    onClick={(e) => { e.stopPropagation(); nextCandidate(); }}
                    title="Следующий"
                  >
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2"/></svg>
                  </button>
                </>
              )}
              
              {/* Carousel card */}
              <div className="bg-dark-card rounded-3xl shadow-card border border-dark-bg/40 overflow-hidden ml-8 mr-8">
                <div className="relative h-60 overflow-hidden rounded-3xl">
                  {visibleCandidates.map((candidate, index) => (
                    <div 
                      key={candidate.userId}
                      className={`absolute inset-0 p-5 transition-all duration-500 ease-in-out ${
                        index === currentIndex 
                          ? 'opacity-100 translate-x-0 z-10' 
                          : index < currentIndex 
                            ? 'opacity-0 -translate-x-full z-0' 
                            : 'opacity-0 translate-x-full z-0'
                      }`}
                    >
                      <div className="h-full flex flex-col">
                        {/* User info section */}
                        <div className="flex items-center gap-4 mb-4">
                          <div 
                            className="relative flex-shrink-0 cursor-pointer group"
                            onClick={e => {
                              if (!(e.target as HTMLElement).closest('button')) {
                                onUserClick(candidate);
                              }
                            }}
                          >
                            <div className="w-14 h-14 rounded-2xl overflow-hidden border-3 border-white shadow-lg">
                              {candidate.avatarUrl ? (
                                <img src={candidate.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                                  <span className="text-white text-xl font-bold">
                                    {candidate.name.charAt(0)}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Online indicator */}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-dark-card"></div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div 
                              className="font-bold text-dark-text text-base truncate cursor-pointer hover:text-blue-400 transition-colors"
                              onClick={e => {
                                if (!(e.target as HTMLElement).closest('button')) {
                                  onUserClick(candidate);
                                }
                              }}
                            >
                              {candidate.name}
                            </div>
                            
                            {candidate.city && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" className="text-dark-muted">
                                  <path d="M12 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-8c-4.4 0-8 3.6-8 8 0 1.4.4 2.7 1 3.8l-1 1 3-1.5 1.5 3 1.5-1c1.1.6 2.4 1 3.8 1 4.4 0 8-3.6 8-8s-3.6-8-8-8z" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                                <span className="text-xs text-dark-muted truncate">
                                  {candidate.city}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Match info and interests */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs px-2 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 text-blue-300 rounded-full font-medium">
                              {candidate.matchCount} совпадений
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {candidate.interests.filter(tag => profile.interests.includes(tag)).slice(0, 3).map(tag => (
                              <span key={tag} className="text-xs px-2 py-1 bg-dark-bg/60 text-dark-accent rounded-full truncate">
                                {getInterestPath(tag)}
                              </span>
                            ))}
                            {candidate.interests.filter(tag => profile.interests.includes(tag)).length > 3 && (
                              <span className="text-xs px-2 py-1 bg-dark-bg/40 text-dark-muted rounded-full">
                                +{candidate.interests.filter(tag => profile.interests.includes(tag)).length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex gap-2 pt-3">
                          <button 
                            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold text-xs shadow-md hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            title="Добавить в друзья"
                            onClick={e => { e.stopPropagation(); onAddFriend(candidate.userId); }}
                          >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="2"/></svg>
                            Добавить
                          </button>
                          <button 
                            className="px-2.5 py-2 rounded-lg bg-dark-bg/60 text-dark-muted shadow-md hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all"
                            title="Скрыть"
                            onClick={e => { e.stopPropagation(); setHidden(h => [...h, candidate.userId]); }}
                          >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Progress dots at the bottom */}
                {visibleCandidates.length > 1 && (
                  <div className="flex items-center justify-center py-3 bg-dark-bg/20 border-t border-dark-bg/30">
                    <div className="flex gap-1">
                      {visibleCandidates.map((_, index) => (
                        <div
                          key={index}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${index === currentIndex ? 'bg-gradient-to-r from-blue-500 to-cyan-400 scale-125' : 'bg-dark-bg/40'}`}
                          title={`Слайд ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-dark-card rounded-3xl shadow-card p-8 flex flex-col items-center justify-center gap-4">
              <div className="text-4xl opacity-50">👥</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-lg">Нет рекомендаций</div>
                <div className="text-sm mt-1">Попробуйте добавить интересы в профиль</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Нижний блок — список друзей */}
        <div className="flex flex-col gap-4">
          <div className="text-2xl font-bold text-dark-text">Мои друзья</div>
          {friendList.length === 0 ? (
            <div className="bg-dark-card rounded-3xl shadow-card p-12 flex flex-col items-center justify-center gap-5">
              <div className="text-6xl opacity-50">🎵</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-xl">У вас пока нет друзей</div>
                <div className="text-base mt-2">Найдите единомышленников по интересам!</div>
              </div>
            </div>
          ) : (
            friendList.map(user => (
              <div key={user.userId} className="bg-dark-card rounded-3xl shadow-card p-5 flex items-center gap-4 border border-dark-bg/40 animate-fade-in animate-scale-in cursor-pointer hover:bg-dark-bg/80 transition shadow-lg" onClick={() => onUserClick(user)}>
                <div className="w-16 h-16 rounded-2xl bg-dark-bg/80 flex items-center justify-center text-2xl border-2 border-white overflow-hidden shadow-lg">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <span role="img" aria-label="avatar">👤</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-dark-text text-lg truncate">{user.name}</div>
                  {user.city && <div className="text-sm text-blue-400 truncate">{user.city}</div>}
                </div>
                <div className="flex gap-3 items-center ml-2">
                  <button className="p-3 rounded-2xl bg-dark-bg/60 text-dark-accent shadow-lg hover:bg-blue-500/10 hover:text-blue-500 active:scale-95 transition-all hover:scale-105" title="Написать" onClick={e => e.stopPropagation()}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 20l16-8-16-8v6h12v4H4v6z" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </button>
                  <button className="p-3 rounded-2xl bg-dark-bg/60 text-red-500 shadow-lg hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all hover:scale-105" title="Удалить" onClick={e => { e.stopPropagation(); onRemoveFriend(user.userId); }}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}