import React, { useState } from "react";
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
  const nextCandidate = candidates.find(u => !hidden.includes(u.userId));

  // Список друзей
  const friendList = users.filter(u => friends.includes(u.userId));

  return (
    <main className="p-4 sm:p-6 pt-20 min-h-[100dvh] bg-dark-bg flex flex-col items-center font-sans animate-fade-in transition-all duration-300 w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6">
        {/* Верхний блок — рекомендация друга */}
        {nextCandidate && (
          <div className="bg-dark-card rounded-2xl shadow-card p-4 flex items-center gap-4 animate-fade-in animate-scale-in border border-dark-bg/40 cursor-pointer hover:bg-dark-bg/80 transition group" onClick={e => {
            if ((e.target as HTMLElement).closest('button')) return;
            onUserClick(nextCandidate);
          }}>
            <div className="w-14 h-14 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden">
              {nextCandidate.avatarUrl ? (
                <img src={nextCandidate.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span role="img" aria-label="avatar">👤</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-dark-text text-base truncate">{nextCandidate.name}</div>
              <div className="text-xs text-dark-muted truncate">Совпадений: {nextCandidate.matchCount}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {nextCandidate.interests.filter(tag => profile.interests.includes(tag)).map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm animate-fade-in">
                    {getInterestPath(tag)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end ml-2">
              <button className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:opacity-90 active:scale-95 transition-all" title="Добавить в друзья" onClick={e => { e.stopPropagation(); onAddFriend(nextCandidate.userId); }}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
              <button className="p-2 rounded-full bg-dark-bg/60 text-dark-muted shadow hover:bg-dark-accent/10 hover:text-dark-accent active:scale-95 transition-all" title="Скрыть" onClick={e => { e.stopPropagation(); setHidden(h => [...h, nextCandidate.userId]); }}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
              <button className="p-2 rounded-full bg-dark-bg/60 text-dark-accent shadow hover:bg-blue-500/10 hover:text-blue-500 active:scale-95 transition-all" title="Написать" onClick={e => e.stopPropagation()}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 20l16-8-16-8v6h12v4H4v6z" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>
          </div>
        )}
        {/* Нижний блок — список друзей */}
        <div className="flex flex-col gap-3">
          <div className="text-lg font-bold text-dark-text mb-2">Мои друзья</div>
          {friendList.length === 0 && <div className="text-dark-muted text-center py-8">У вас пока нет друзей</div>}
          {friendList.map(user => (
            <div key={user.userId} className="bg-dark-card rounded-2xl shadow-card p-3 flex items-center gap-4 border border-dark-bg/40 animate-fade-in animate-scale-in cursor-pointer hover:bg-dark-bg/80 transition" onClick={() => onUserClick(user)}>
              <div className="w-12 h-12 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span role="img" aria-label="avatar">👤</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-dark-text text-base truncate">{user.name}</div>
              </div>
              <div className="flex gap-2 items-center ml-2">
                <button className="p-2 rounded-full bg-dark-bg/60 text-dark-accent shadow hover:bg-blue-500/10 hover:text-blue-500 active:scale-95 transition-all" title="Написать" onClick={e => e.stopPropagation()}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 20l16-8-16-8v6h12v4H4v6z" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
                <button className="p-2 rounded-full bg-dark-bg/60 text-red-400 shadow hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all" title="Удалить" onClick={e => { e.stopPropagation(); onRemoveFriend(user.userId); }}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}