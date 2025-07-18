import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { InterestSelector } from "./InterestSelector";
import { INTEREST_CATEGORIES } from "./categories";
import { WelcomePage } from "./Welcome";

// Тип профиля пользователя
interface UserProfile {
  userId: string;
  avatarUrl?: string;
  firstName: string;
  lastName: string;
  name: string; // для обратной совместимости, можно склеивать firstName + lastName
  bio: string;
  workPlace?: string;
  skills: string[];
  interests: string[];
  portfolio?: { text: string; fileUrl?: string };
  phone?: string;
  email?: string;
  socials?: string[];
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
  city?: string;
  country?: string;
}

// Получение пользователя из Telegram WebApp API (заглушка)
function getTelegramUser(): Partial<UserProfile> {
  // @ts-ignore
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const user = tg.initDataUnsafe.user;
    return {
      name: user.first_name + (user.last_name ? ` ${user.last_name}` : ""),
      avatarUrl: user.photo_url,
    };
  }
  return {};
}

const navItems = [
  {
    to: "/",
    label: "Главная",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><path d="M3 10.75L12 4l9 6.75V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    ),
  },
  {
    to: "/search",
    label: "Поиск",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    ),
  },
  {
    to: "/friends",
    label: "Друзья",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><circle cx="16" cy="17" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M12 12c2.5 0 4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
  {
    to: "/profile",
    label: "Профиль",
    icon: (
      <svg width="26" height="26" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-2.5 3.5-4 8-4s8 1.5 8 4" stroke="currentColor" strokeWidth="1.5"/></svg>
    ),
  },
];

// --- Theme Context ---
const ThemeContext = createContext<{ theme: string; toggle: () => void }>({ theme: "light", toggle: () => {} });
function useTheme() { return useContext(ThemeContext); }

// --- SectionContainer ---
function SectionContainer({ children }: { children: React.ReactNode }) {
  return (
    <section className="w-full max-w-md mx-auto flex flex-col gap-8 px-4 sm:px-0 bg-dark-card dark:bg-dark-card py-2 font-sans" style={{fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif'}}>
      {children}
    </section>
  );
}

// --- PostCard ---
function PostCard({ post, users, isOwn, onEdit, onDelete, onLike, onUserClick }: {
  post: Post,
  users: UserProfile[],
  isOwn?: boolean,
  onEdit?: () => void,
  onDelete?: () => void,
  onLike?: () => void,
  onUserClick?: () => void,
}) {
  const user = users.find(u => u.userId === post.userId);
  return (
    <div className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-6 relative border border-dark-bg/40 font-sans animate-fade-in animate-scale-in mb-4">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span role="img" aria-label="avatar">👤</span>
          )}
        </div>
        <div className="font-semibold text-dark-text text-base cursor-pointer hover:underline truncate" onClick={onUserClick}>{user?.name || post.author}</div>
        <div className="flex gap-2 ml-auto">
          {isOwn && onEdit && (
            <button className="flex items-center gap-1 text-xs bg-accent-gradient text-white shadow-btn px-3 py-1 font-medium hover:opacity-90 active:scale-95 transition-all" onClick={onEdit}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg> Редактировать
            </button>
          )}
          {isOwn && onDelete && (
            <button className="flex items-center gap-1 text-xs bg-red-500 text-white shadow-btn px-3 py-1 font-medium hover:bg-red-600 active:scale-95 transition-all" onClick={onDelete}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="#fff" strokeWidth="1.5"/></svg> Удалить
            </button>
          )}
        </div>
      </div>
      <div className="text-dark-text text-lg mb-1 whitespace-pre-line leading-relaxed font-normal">{post.content}</div>
      <div style={{position: 'absolute', right: 16, bottom: 12}} className="flex gap-2 text-xs text-dark-muted">
        <span><span role="img" aria-label="created">🕒</span> {new Date(post.createdAt).toLocaleString()}</span>
        {post.updatedAt !== post.createdAt && <span><span role="img" aria-label="edited">✏️</span> {new Date(post.updatedAt).toLocaleString()}</span>}
      </div>
      {post.attachmentUrl && (
        <img src={post.attachmentUrl} alt="attachment" className="max-h-60 rounded-xl object-contain mb-2 animate-fade-in animate-scale-in" />
      )}
      <div className="flex flex-wrap gap-2 mb-1">
        {post.tags.map((tag, i) => (
          <span key={i} className="px-3 py-0.5 bg-dark-bg/60 text-dark-accent rounded-full text-xs font-medium animate-fade-in">{tag}</span>
        ))}
      </div>
      <div className="flex gap-4 mt-2 justify-end">
        {onLike && (
          <button
            className={`flex items-center gap-1 text-base px-4 py-2 rounded-xl border border-dark-bg/40 transition-all font-medium shadow-sm hover:shadow-md active:scale-95 ${post.liked ? "bg-dark-accent/10 text-dark-accent" : "bg-dark-bg/40 text-dark-muted hover:bg-dark-accent/10 hover:text-dark-accent"}`}
            onClick={onLike}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.5-9-9.5C1.5 8.5 3.5 5 7 5c2.5 0 3.5 2 5 2s2.5-2 5-2c3.5 0 5.5 3.5 4 6.5C18.5 15.5 12 21 12 21Z" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
            {post.liked ? "Лайк" : "Лайкнуть"}
          </button>
        )}
      </div>
    </div>
  );
}

// --- AppBar ---
function AppBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);
  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-dark-card border-b border-dark-bg/40 flex items-center justify-center px-4 shadow-none">
      <div className="absolute left-0 top-0 h-full flex items-center pl-4" style={{width: 48}}></div>
      <div className="flex-1 flex justify-center items-center">
        <span className="text-2xl font-bold text-dark-text select-none cursor-pointer hover:text-dark-accent transition-colors" style={{fontFamily: 'Pacifico, cursive', letterSpacing: '0.04em'}} onClick={() => navigate("/")}>Mooza</span>
      </div>
      <div className="absolute right-0 top-0 h-full flex items-center pr-2">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-dark-bg/40 transition-colors text-dark-text"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        {menuOpen && (
          <div ref={menuRef} className="absolute top-full right-0 mt-2 w-64 bg-dark-card rounded-2xl shadow-2xl py-4 px-2 flex flex-col gap-2 animate-fade-in scale-95 animate-scale-in z-50 border border-dark-bg/40 transition-all duration-300 max-h-[60vh] overflow-y-auto pointer-events-auto">
            <button
              className="w-full flex items-center gap-3 text-left px-6 py-3 text-lg text-dark-text hover:bg-dark-bg/40 rounded-xl transition-all font-semibold"
              onClick={() => { setMenuOpen(false); navigate('/profile'); }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="#4F8CFF" strokeWidth="1.5"/><path d="M4 20c0-2.21 3.582-4 8-4s8 1.79 8 4" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
              Профиль
            </button>
            <button
              className="w-full flex items-center gap-3 text-left px-6 py-3 text-lg text-red-400 hover:bg-red-500/10 rounded-xl transition-all font-semibold"
              onClick={() => {
                setMenuOpen(false);
                // @ts-ignore
                if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
                else alert('Закрытие доступно только в Telegram WebApp');
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 bg-dark-card border-t border-dark-bg/40 w-screen h-16 flex items-center justify-around px-0 sm:px-2"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: 'none',
      }}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }: { isActive: boolean }) =>
            `flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative w-1/4 min-w-0 py-1 ${isActive ? 'text-dark-accent' : 'text-dark-muted'}`
          }
        >
          {({ isActive }: { isActive: boolean }) => (
            <span className="flex flex-col items-center w-full">
              <span className={`tabbar-icon ${isActive ? 'tabbar-icon-active' : ''} flex items-center justify-center rounded-full`} style={{padding: isActive ? 8 : 0}}>
                {item.icon}
              </span>
              <span className="text-[11px] mt-0.5 font-medium tracking-wide select-none w-full text-center">
                {item.label}
              </span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 pt-4 pb-16 w-full max-w-md mx-auto px-2 sm:px-4 flex flex-col">
      {children}
    </div>
  );
}

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] pt-24 bg-dark-bg w-full px-2 sm:px-4 flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="text-3xl font-bold text-dark-text mb-2 w-full text-center" style={{fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif'}}>MOOZA</div>
      <div className="text-base text-dark-muted mb-6 w-full text-center">Социальная сеть для музыкантов</div>
      <div className="w-full max-w-md bg-dark-card rounded-3xl shadow-lg p-4 sm:p-6 flex flex-col items-center">
        <div className="text-lg text-dark-text font-medium mb-2 w-full text-center">Добро пожаловать!</div>
        <div className="text-dark-muted text-center w-full">Здесь вы можете найти друзей по интересам, общаться и развиваться вместе.</div>
      </div>
    </div>
  );
}
function Search({ profile, users, friends, favorites, onAddFriend, onRemoveFriend, onToggleFavorite, onUserClick }: {
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
function Friends({ profile, friends, users, onAddFriend, onRemoveFriend, onUserClick }: {
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

const POPULAR_TAGS = [
  "Гитара", "Бас", "Барабаны", "Вокал", "Клавиши", "Скрипка", "Саксофон", "Флейта", "Рок", "Поп", "Джаз", "Блюз", "Электроника", "Импровизация", "Каверы", "Авторская музыка", "Сведение", "Продюсирование"
];

interface Post {
  id: number;
  userId: string;
  author: string;
  avatarUrl?: string;
  content: string;
  tags: string[];
  liked: boolean;
  favorite: boolean;
  attachmentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// --- UserCard ---
function UserCard({ user, posts, isFriend, isFavorite, onAddFriend, onRemoveFriend, onToggleFavorite, onClose }: {
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
                  <div className="text-xs text-dark-muted ml-auto">{new Date(post.createdAt).toLocaleDateString()}</div>
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

// --- ConfirmModal ---
function ConfirmModal({ text, onConfirm, onCancel }: { text: string, onConfirm: () => void, onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-card dark:bg-dark-card rounded-3xl shadow-2xl p-8 w-[90vw] max-w-xs flex flex-col gap-8 animate-fade-in scale-95 animate-scale-in border border-dark-bg/40 font-sans transition-all duration-300">
        <div className="text-lg text-dark-text mb-2 text-center font-semibold">{text}</div>
        <div className="flex gap-4 mt-2 justify-end">
          <button className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all text-base flex items-center justify-center gap-2" onClick={onConfirm}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" stroke="#fff" strokeWidth="1.5"/></svg>
            Удалить
          </button>
          <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all text-base flex items-center justify-center gap-2" onClick={onCancel}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#6b7280" strokeWidth="1.5"/></svg>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// --- HomeFeed ---
function HomeFeed({ profile, allPosts, friends, onUserClick, onDeletePost, onLikePost, onCreatePost, onUpdatePost, users }: {
  profile: UserProfile,
  allPosts: Post[],
  friends: string[],
  onUserClick: (user: UserProfile) => void,
  onDeletePost: (id: number) => void,
  onLikePost: (id: number) => void,
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void,
  onUpdatePost: (id: number, content: string, tags: string[]) => void,
  users: UserProfile[],
}) {
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState<{ content: string; tags: string[]; attachment: File | null }>({ content: "", tags: [], attachment: null });
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'author'>('date');
  const filteredPosts = allPosts.filter((post) => friends.includes(post.userId) || post.userId === profile.userId);
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'author') {
      const userA = users.find(u => u.userId === a.userId);
      const userB = users.find(u => u.userId === b.userId);
      return (userA?.name || '').localeCompare(userB?.name || '', 'ru');
    }
    return 0;
  });

  const toast = useToast();
  const handleCreatePost = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
    toast("Пост опубликован!");
  };

  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState<{ content: string; tags: string[] }>({ content: "", tags: [] });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="text-lg font-bold text-dark-text">Лента друзей</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-muted">Сортировать:</span>
            <select className="px-2 py-1 rounded bg-dark-bg/60 text-dark-text text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="date">Сначала новые</option>
              <option value="author">По автору</option>
            </select>
          </div>
          <button
            className={`p-2 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors shadow focus:outline-none ml-2 ${showCreate ? 'rotate-45' : ''}`}
            title={showCreate ? 'Скрыть создание поста' : 'Создать пост'}
            onClick={() => setShowCreate(v => !v)}
            aria-label={showCreate ? 'Скрыть создание поста' : 'Создать пост'}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <rect x="5" y="3" width="14" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7h8M8 11h8M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {showCreate && (
          <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-lg p-4 mb-4 flex flex-col gap-4 animate-fade-in animate-scale-in">
            <textarea
              className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner mb-2"
              rows={2}
              placeholder="Что нового? Поделитесь с друзьями..."
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
            />
            <InterestSelector
              selected={newPost.tags}
              onChange={tags => setNewPost(prev => ({ ...prev, tags }))}
            />
            <div className="flex items-center gap-3 mt-2">
              <label className="cursor-pointer p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-accent" title="Прикрепить изображение">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewPost(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  className="hidden"
                />
              </label>
              {newPost.attachment && (
                <img src={URL.createObjectURL(newPost.attachment)} alt="attachment" className="max-h-20 rounded-xl object-contain ml-2" />
              )}
              <button
                className="ml-auto p-3 rounded-full bg-dark-accent text-white shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                onClick={handleCreatePost}
                disabled={!newPost.content.trim() || newPost.tags.length === 0}
                title="Опубликовать пост"
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 12h16M12 4l8 8-8 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {sortedPosts.length === 0 && (
            <div className="text-center text-dark-muted py-8">Нет постов по вашим интересам</div>
          )}
          {sortedPosts.map((post) => {
            const user = users.find(u => u.userId === post.userId);
            return (
              <div key={post.id} className="relative bg-dark-card rounded-2xl shadow p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden">
                    {user?.avatarUrl || post.avatarUrl ? (
                      <img src={user?.avatarUrl || post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline">{post.author}</div>
                  <div className="text-xs text-dark-muted ml-auto">{new Date(post.createdAt).toLocaleDateString()}</div>
                  {/* Кнопки редактирования/удаления только для своих постов */}
                  {post.userId === profile.userId && (
                    <>
                      <button title="Редактировать пост" className="p-2 rounded-full bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors ml-2" onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
                      </button>
                      <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => onDeletePost(post.id)}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="text-dark-text text-base mb-1 whitespace-pre-line">{post.content}</div>
                <div style={{position: 'absolute', right: 16, bottom: 12}} className="flex gap-2 text-xs text-dark-muted">
                  <span><span role="img" aria-label="created">🕒</span> {new Date(post.createdAt).toLocaleString()}</span>
                  {post.updatedAt !== post.createdAt && <span><span role="img" aria-label="edited">✏️</span> {new Date(post.updatedAt).toLocaleString()}</span>}
                </div>
                {post.attachmentUrl && (
                  <img src={post.attachmentUrl} alt="attachment" className="max-h-60 rounded-xl object-contain mb-2" />
                )}
                <div className="flex flex-wrap gap-2 mb-1">
                  {post.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-dark-bg/60 text-blue-700 rounded-full text-xs font-medium">{getInterestPath(tag)}</span>
                  ))}
                </div>
                <div className="flex gap-4 mt-1">
                  <button title={post.liked ? "Убрать лайк" : "Лайкнуть"} className={`p-2 rounded-full transition-colors ${post.liked ? 'bg-red-500 text-white' : 'bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white'}`} onClick={() => onLikePost(post.id)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.5-9-9.5C1.5 8.5 3.5 5 7 5c2.5 0 3.5 2 5 2s2.5-2 5-2c3.5 0 5.5 3.5 4 6.5C18.5 15.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" fill={post.liked ? '#ef4444' : 'none'} /></svg>
                  </button>
                  <button title={post.favorite ? "Убрать из избранного" : "В избранное"} className={`p-2 rounded-full transition-colors ${post.favorite ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`} onClick={() => onLikePost(post.id)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={post.favorite ? '#fbbf24' : 'none'} /></svg>
                  </button>
                  {post.userId === profile.userId && (
                    <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => setDeletePostId(post.id)}>
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {deletePostId !== null && (
        <ConfirmModal
          text="Вы уверены, что хотите удалить этот пост?"
          onConfirm={() => { onDeletePost(deletePostId); setDeletePostId(null); }}
          onCancel={() => setDeletePostId(null)}
        />
      )}
      {editPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-2xl p-6 w-[90vw] max-w-md flex flex-col gap-4 animate-fade-in animate-scale-in">
            <div className="text-lg font-bold mb-2 text-dark-text">Редактировать пост</div>
            <textarea
              className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
              rows={2}
              placeholder="Текст поста"
              value={editPostData.content}
              onChange={e => setEditPostData({ ...editPostData, content: e.target.value })}
            />
            <div>
              <div className="text-sm text-dark-muted mb-1">Теги:</div>
              <InterestSelector
                selected={editPostData.tags}
                onChange={tags => setEditPostData(prev => ({ ...prev, tags }))}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                className="flex-1 py-2 rounded-xl bg-dark-accent text-white font-semibold shadow active:scale-95 transition-transform"
                onClick={() => { onUpdatePost(editPost.id, editPostData.content, editPostData.tags); setEditPost(null); }}
                disabled={!editPostData.content.trim() || editPostData.tags.length === 0}
              >
                Сохранить
              </button>
              <button
                className="flex-1 py-2 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform"
                onClick={() => setEditPost(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Profile({ profile, setProfile, allPosts, setAllPosts, onCreatePost, onUpdatePost, onDeletePost, onLikePost, users, setAllUsers, friends, favorites }: {
  profile: UserProfile,
  setProfile: (p: UserProfile) => void,
  allPosts: Post[],
  setAllPosts: React.Dispatch<React.SetStateAction<Post[]>>,
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void,
  onUpdatePost: (id: number, content: string, tags: string[]) => void,
  onDeletePost: (id: number) => void,
  onLikePost: (id: number) => void,
  users: UserProfile[],
  setAllUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>,
  friends: string[],
  favorites: string[],
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<UserProfile>({
    ...profile,
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    name: profile.name || '',
    bio: profile.bio || '',
    workPlace: profile.workPlace || '',
    skills: profile.skills || [],
    interests: profile.interests || [],
    portfolio: profile.portfolio ? { text: profile.portfolio.text || '', fileUrl: profile.portfolio.fileUrl } : { text: '', fileUrl: undefined },
    phone: profile.phone || '',
    email: profile.email || '',
    socials: profile.socials || [],
    vkId: profile.vkId || '',
    youtubeId: profile.youtubeId || '',
    telegramId: profile.telegramId || '',
    city: profile.city || '',
    country: profile.country || '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newPost, setNewPost] = useState<{ content: string; tags: string[]; attachment: File | null }>({ content: "", tags: [], attachment: null });
  const [showCreate, setShowCreate] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState<{ content: string; tags: string[] }>({ content: '', tags: [] });
  const toast = useToast();
  const userPosts = allPosts.filter((p) => p.userId === profile.userId);
  const [errors, setErrors] = useState<any>({});
  // --- Соцсети: локальные состояния для input ---
  const [vkInput, setVkInput] = useState(editData.vkId || '');
  const [ytInput, setYtInput] = useState(editData.youtubeId || '');
  const [tgInput, setTgInput] = useState(editData.telegramId || '');
  React.useEffect(() => {
    if (editOpen) {
      setVkInput(editData.vkId || '');
      setYtInput(editData.youtubeId || '');
      setTgInput(editData.telegramId || '');
    }
  }, [editOpen]);

  // Счетчики друзей и избранных
  const friendsCount = friends.length;
  const favoritesCount = favorites.length;

  // Сохранение профиля (редактирование)
  const handleSave = () => {
    let avatarUrl = editData.avatarUrl;
    if (avatarFile) {
      avatarUrl = URL.createObjectURL(avatarFile);
    }
    const newData = {
      ...editData,
      avatarUrl,
      vkId: vkInput.trim(),
      youtubeId: ytInput.trim(),
      telegramId: tgInput.trim(),
    };
    setAllPosts(prev => prev.map(post =>
      post.userId === profile.userId
        ? { ...post, avatarUrl, author: newData.name }
        : post
    ));
    setProfile(newData);
    setAllUsers(prev => prev.map(u =>
      u.userId === profile.userId
        ? newData
        : u
    ));
    setEditOpen(false);
    toast("Профиль обновлён!");
  };

  // Создание поста
  const handleCreatePost = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
    setShowCreate(false);
  };

  // Section-компонент для Mooza-профиля с возможностью сворачивания
  const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="w-full flex flex-col gap-2 border-t border-dark-bg/20 pt-4">
        <button
          className="flex items-center justify-between w-full text-base font-semibold text-dark-text mb-1 pl-1 focus:outline-none select-none"
          onClick={() => setOpen(o => !o)}
          type="button"
          aria-expanded={open}
        >
          <span>{title}</span>
          <span className={`ml-2 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
        {open && <div>{children}</div>}
      </div>
    );
  };

  // Функция для Mooza-иконок соцсетей
  const getSocialIcon = (url: string) => {
    if (url.includes('vk.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2787F5"/><text x="7" y="16" fontSize="10" fill="#fff">VK</text></svg>;
    if (url.includes('t.me')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><text x="5" y="16" fontSize="10" fill="#fff">TG</text></svg>;
    if (url.includes('instagram.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E1306C"/><text x="3" y="16" fontSize="10" fill="#fff">IG</text></svg>;
    if (url.includes('youtube.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF0000"/><text x="3" y="16" fontSize="10" fill="#fff">YT</text></svg>;
    return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#888"/></svg>;
  };

  // Собираем массив соцсетей: сначала из socials, если пусто — из vkId/youtubeId/telegramId
  let socialLinks: { url: string; label: string }[] = [];
  if (profile.socials && profile.socials.length > 0) {
    socialLinks = profile.socials.filter(Boolean).map(url => ({ url, label: url }));
  }
  if (profile.vkId) socialLinks.push({ url: profile.vkId.startsWith('http') ? profile.vkId : `https://vk.com/${profile.vkId}`, label: 'VK' });
  if (profile.youtubeId) socialLinks.push({ url: profile.youtubeId.startsWith('http') ? profile.youtubeId : `https://youtube.com/@${profile.youtubeId}`, label: 'YouTube' });
  if (profile.telegramId) socialLinks.push({ url: profile.telegramId.startsWith('http') ? profile.telegramId : `https://t.me/${profile.telegramId}`, label: 'Telegram' });

  // --- Валидация полей ---
  function validateField(field: string, value: any) {
    switch (field) {
      case 'firstName':
      case 'lastName':
        if (!value) return 'Обязательное поле';
        if (!/^[А-Яа-яA-Za-z\- ]{2,}$/.test(value)) return 'Только буквы, минимум 2 символа';
        return '';
      case 'country':
      case 'city':
        if (!value) return 'Обязательное поле';
        if (value.length < 2) return 'Минимум 2 символа';
        return '';
      case 'skills':
        if (!value || value.length < 1) return 'Выберите хотя бы 1 навык';
        return '';
      case 'interests':
        if (!value || value.length < 3) return 'Выберите хотя бы 3 интереса';
        return '';
      case 'portfolioText':
        if (value.length > 500) return 'Максимум 500 символов';
        return '';
      case 'phone':
        if (!value) return 'Обязательное поле';
        if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value)) return 'Формат: +7 (XXX) XXX-XX-XX';
        return '';
      case 'email':
        if (!value) return 'Обязательное поле';
        if (!/^\S+@\S+\.\S+$/.test(value)) return 'Некорректный email';
        return '';
      case 'vkId':
      case 'youtubeId':
      case 'telegramId':
        if (value && !/^https?:\/\//.test(value)) return 'Введите ссылку, начиная с https://';
        return '';
      default:
        return '';
    }
  }

  // --- Прогресс заполнения ---
  const fieldsToCheck = [
    { key: 'firstName', value: editData.firstName },
    { key: 'lastName', value: editData.lastName },
    { key: 'country', value: editData.country },
    { key: 'city', value: editData.city },
    { key: 'skills', value: editData.skills },
    { key: 'interests', value: editData.interests },
    { key: 'portfolioText', value: editData.portfolio?.text || '' },
    { key: 'phone', value: editData.phone },
    { key: 'email', value: editData.email },
  ];
  let validCount = 0;
  fieldsToCheck.forEach(f => {
    if (!validateField(f.key, f.value)) validCount++;
  });
  const progress = Math.round((validCount / fieldsToCheck.length) * 100);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-4 animate-fade-in">
        {/* Минималистичный профиль Mooza */}
        <div className="flex flex-col items-center gap-4 w-full max-w-md px-2 py-6">
          {/* Аватар и имя + кнопка редактирования */}
          <div className="flex flex-col items-center gap-1 w-full relative">
            <div className="relative w-28 h-28 mb-2 mx-auto">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-dark-bg/80 flex items-center justify-center">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span role="img" aria-label="avatar" className="text-5xl">👤</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center w-full mt-2">
              <div className="font-bold text-2xl sm:text-3xl text-dark-text text-center break-words leading-tight flex-1">{profile.firstName} {profile.lastName}</div>
              <button
                className="ml-2 p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 text-dark-accent transition-colors shadow focus:outline-none"
                title="Редактировать профиль"
                onClick={() => setEditOpen(true)}
                style={{height: 40, width: 40, minWidth: 40, minHeight: 40}}
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
              </button>
            </div>
            {(profile.city || profile.country) && (
              <div className="text-blue-700 text-sm">{[profile.city, profile.country].filter(Boolean).join(', ')}</div>
            )}
          </div>

          {/* О себе */}
          {profile.bio && (
            <div className="w-full mt-4">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">О себе</div>
              <div className="text-base text-dark-text text-center whitespace-pre-line font-normal mb-2">{profile.bio}</div>
            </div>
          )}

          {/* Место работы */}
          {profile.workPlace && (
            <div className="w-full mt-2">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Место работы</div>
              <div className="text-dark-muted text-sm text-center mb-2">{profile.workPlace}</div>
            </div>
          )}

          {/* Навыки */}
          {profile.skills?.length > 0 && (
            <div className="w-full mt-2">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Навыки</div>
              <div className="flex flex-wrap gap-2 justify-center">
                {profile.skills.map((skill, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-gradient-to-r from-blue-500 to-cyan-400 text-white">{getInterestPath(skill)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Интересы */}
          {profile.interests?.length > 0 && (
            <div className="w-full mt-2">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Интересы</div>
              <div className="flex flex-wrap gap-2 justify-center">
                {profile.interests.map((interest, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none shadow-sm bg-cyan-100 text-cyan-800">{getInterestPath(interest)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Портфолио */}
          {profile.portfolio && (profile.portfolio.text || profile.portfolio.fileUrl) && (
            <div className="w-full mt-2 flex flex-col items-center">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Портфолио</div>
              {profile.portfolio.text && <div className="text-dark-text text-sm text-center whitespace-pre-line mb-1">{profile.portfolio.text}</div>}
              {profile.portfolio.fileUrl && (
                <a href={profile.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs">Скачать вложение</a>
              )}
            </div>
          )}

          {/* Контакты */}
          {(profile.phone || profile.email) && (
            <div className="w-full mt-2 flex flex-col items-center">
              <div className="text-xs font-semibold text-dark-muted mb-1 uppercase tracking-wider">Контакты</div>
              {profile.phone && <div className="text-dark-text text-sm">📞 <a href={`tel:${profile.phone}`} className="text-blue-500 underline">{profile.phone}</a></div>}
              {profile.email && <div className="text-dark-text text-sm">✉️ <a href={`mailto:${profile.email}`} className="text-blue-500 underline">{profile.email}</a></div>}
            </div>
          )}
        </div>
        {/* Кнопка создать пост */}
        <div className="flex justify-end mt-4">
          <button className="p-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:opacity-90 active:scale-95 transition-all" title="Создать пост" onClick={() => setShowCreate(v => !v)}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="#fff" strokeWidth="1.5"/></svg>
          </button>
        </div>
        {/* Форма создания поста */}
        {showCreate && (
          <div className="bg-dark-card rounded-2xl shadow-lg p-4 mb-4 flex flex-col gap-4 animate-fade-in animate-scale-in">
            <textarea
              className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner mb-2"
              rows={2}
              placeholder="Что нового? Поделитесь с друзьями..."
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
            />
            <InterestSelector
              selected={newPost.tags}
              onChange={tags => setNewPost(prev => ({ ...prev, tags }))}
            />
            <div className="flex items-center gap-3 mt-2">
              <label className="cursor-pointer p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-accent" title="Прикрепить изображение">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewPost(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  className="hidden"
                />
              </label>
              {newPost.attachment && (
                <img src={URL.createObjectURL(newPost.attachment)} alt="attachment" className="max-h-20 rounded-xl object-contain ml-2" />
              )}
              <button
                className="ml-auto p-3 rounded-full bg-dark-accent text-white shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                onClick={handleCreatePost}
                disabled={!newPost.content.trim() || newPost.tags.length === 0}
                title="Опубликовать пост"
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 12h16M12 4l8 8-8 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {/* Лента постов */}
        <div className="mt-6">
          <div className="text-lg font-bold text-dark-text mb-2">Посты</div>
          <div className="flex flex-col gap-4">
            {userPosts.length === 0 && <div className="text-dark-muted text-center">У вас пока нет постов</div>}
            {userPosts.map((post) => (
              <div key={post.id} className="bg-dark-card rounded-2xl shadow p-4 flex flex-col gap-2 animate-fade-in animate-scale-in">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden">
                    {post.avatarUrl ? (
                      <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline">{post.author}</div>
                  <div className="text-xs text-dark-muted ml-auto">{new Date(post.createdAt).toLocaleDateString()}</div>
                  {/* Кнопки редактирования/удаления только для своих постов */}
                  {post.userId === profile.userId && (
                    <>
                      <button title="Редактировать пост" className="p-2 rounded-full bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors ml-2" onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
                      </button>
                      <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => onDeletePost(post.id)}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                      </button>
                    </>
                  )}
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
        {/* Модальное окно редактирования поста */}
        {editPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-2xl p-6 w-[90vw] max-w-md flex flex-col gap-4 animate-fade-in animate-scale-in">
              <div className="text-lg font-bold mb-2 text-dark-text">Редактировать пост</div>
              <textarea
                className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
                rows={2}
                placeholder="Текст поста"
                value={editPostData.content}
                onChange={e => setEditPostData({ ...editPostData, content: e.target.value })}
              />
              <div>
                <div className="text-sm text-dark-muted mb-1">Теги:</div>
                <InterestSelector
                  selected={editPostData.tags}
                  onChange={tags => setEditPostData(prev => ({ ...prev, tags }))}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 py-2 rounded-xl bg-dark-accent text-white font-semibold shadow active:scale-95 transition-transform"
                  onClick={() => { onUpdatePost(editPost.id, editPostData.content, editPostData.tags); setEditPost(null); }}
                  disabled={!editPostData.content.trim() || editPostData.tags.length === 0}
                >
                  Сохранить
                </button>
                <button
                  className="flex-1 py-2 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform"
                  onClick={() => setEditPost(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Модальное окно редактирования профиля */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-bg/80">
            <div className="w-full max-w-md bg-dark-card rounded-2xl shadow-2xl p-8 flex flex-col gap-8 animate-fade-in animate-scale-in relative overflow-y-auto max-h-[90vh]">
              {/* Прогресс-бар */}
              <div className="w-full flex flex-col items-center gap-2 mb-2">
                <div className="w-full h-3 bg-dark-bg/30 rounded-full overflow-hidden">
                  <div className="h-3 bg-gradient-to-r from-blue-400 to-pink-400 transition-all" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="text-xs text-dark-muted mt-1">Профиль заполнен на {progress}%</div>
              </div>
              {/* Аватар и кнопка смены */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="relative w-28 h-28 mb-2">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-dark-bg/80 flex items-center justify-center">
                    {avatarFile ? (
                      <img src={URL.createObjectURL(avatarFile)} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : editData.avatarUrl ? (
                      <img src={editData.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar" className="text-5xl">👤</span>
                    )}
                  </div>
                  <label className="absolute bottom-2 right-2 bg-dark-accent p-2 rounded-full shadow hover:scale-110 transition cursor-pointer" title="Сменить аватар">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg>
                    <input type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" onChange={e => {
                      const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                      if (file && file.size > 3 * 1024 * 1024) {
                        alert('Максимальный размер файла 3 МБ');
                        return;
                      }
                      if (file && !['image/jpeg','image/png','image/jpg'].includes(file.type)) {
                        alert('Только JPG, JPEG или PNG');
                        return;
                      }
                      setAvatarFile(file);
                    }} />
                  </label>
                </div>
                <div className="text-xs text-dark-muted">JPG, PNG, до 3 МБ</div>
              </div>
              {/* Форма профиля */}
              <div className="w-full flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-firstName">Имя</label>
                  <input id="profile-firstName" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.firstName ? 'border border-red-500' : ''}`} value={editData.firstName} onChange={e => {
                    setEditData({ ...editData, firstName: e.target.value });
                    setErrors((err: any) => ({ ...err, firstName: validateField('firstName', e.target.value) }));
                  }} placeholder="Имя" maxLength={40} autoComplete="given-name" />
                  {errors.firstName && <div className="text-xs text-red-500 -mt-2">{errors.firstName}</div>}
                  <div className="text-dark-muted text-xs">Только буквы, минимум 2 символа</div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-lastName">Фамилия</label>
                  <input id="profile-lastName" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.lastName ? 'border border-red-500' : ''}`} value={editData.lastName} onChange={e => {
                    setEditData({ ...editData, lastName: e.target.value });
                    setErrors((err: any) => ({ ...err, lastName: validateField('lastName', e.target.value) }));
                  }} placeholder="Фамилия" maxLength={40} autoComplete="family-name" />
                  {errors.lastName && <div className="text-xs text-red-500 -mt-2">{errors.lastName}</div>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-country">Страна</label>
                  <input id="profile-country" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.country ? 'border border-red-500' : ''}`} value={editData.country || ''} disabled placeholder="Страна (авто)" maxLength={40} autoComplete="country" />
                  {errors.country && <div className="text-xs text-red-500 -mt-2">{errors.country}</div>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-city">Город</label>
                  <input id="profile-city" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.city ? 'border border-red-500' : ''}`} value={editData.city || ''} disabled placeholder="Город (авто)" maxLength={40} autoComplete="address-level2" />
                  {errors.city && <div className="text-xs text-red-500 -mt-2">{errors.city}</div>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-workPlace">Место работы</label>
                  <input id="profile-workPlace" className="flex-1 bg-transparent outline-none text-base text-dark-text" value={editData.workPlace || ''} onChange={e => setEditData({ ...editData, workPlace: e.target.value })} placeholder="Место работы" maxLength={60} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1">Навыки</label>
                  <InterestSelector selected={editData.skills || []} onChange={skills => {
                    setEditData(prev => ({ ...prev, skills }));
                    setErrors((err: any) => ({ ...err, skills: validateField('skills', skills) }));
                  }} />
                  {errors.skills && <div className="text-xs text-red-500 -mt-2">{errors.skills}</div>}
                  <div className="text-dark-muted text-xs">Выберите хотя бы 1 навык</div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1">Интересы</label>
                  <InterestSelector selected={editData.interests || []} onChange={interests => {
                    setEditData(prev => ({ ...prev, interests }));
                    setErrors((err: any) => ({ ...err, interests: validateField('interests', interests) }));
                  }} />
                  {errors.interests && <div className="text-xs text-red-500 -mt-2">{errors.interests}</div>}
                  <div className="text-dark-muted text-xs">Выберите хотя бы 3 интереса</div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-portfolio">Резюме / портфолио</label>
                  <textarea id="profile-portfolio" className={`flex-1 bg-transparent outline-none text-base text-dark-text resize-none ${errors.portfolioText ? 'border border-red-500' : ''}`} value={editData.portfolio?.text || ''} onChange={e => {
                    setEditData({ ...editData, portfolio: { ...editData.portfolio, text: e.target.value } });
                    setErrors((err: any) => ({ ...err, portfolioText: validateField('portfolioText', e.target.value) }));
                  }} placeholder="Резюме, достижения, ссылки..." rows={3} maxLength={500} />
                  {errors.portfolioText && <div className="text-xs text-red-500 -mt-2">{errors.portfolioText}</div>}
                  <div className="text-dark-muted text-xs">Максимум 500 символов. Можно прикрепить файл (JPG, PNG, PDF, до 3 МБ).</div>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:opacity-90 transition-colors" title="Добавить вложение">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                        <path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/>
                        <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
                      </svg>
                      <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
                        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        if (file && file.size > 3 * 1024 * 1024) {
                          alert('Максимальный размер файла 3 МБ');
                          return;
                        }
                        if (file && !['image/jpeg','image/png','application/pdf'].includes(file.type)) {
                          alert('Только JPG, PNG или PDF');
                          return;
                        }
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setEditData(prev => ({
                            ...prev,
                            portfolio: { fileUrl: url, text: prev.portfolio?.text || '' }
                          }));
                        }
                      }} className="hidden" />
                    </label>
                    {editData.portfolio?.fileUrl && (
                      <a href={editData.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs mt-1">Скачать вложение</a>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-phone">Телефон</label>
                  <input id="profile-phone" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.phone ? 'border border-red-500' : ''}`} value={editData.phone || ''} onChange={e => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 11) val = val.slice(0, 11);
                    let formatted = '+7';
                    if (val.length > 1) formatted += ' (' + val.slice(1, 4);
                    if (val.length >= 4) formatted += ') ' + val.slice(4, 7);
                    if (val.length >= 7) formatted += '-' + val.slice(7, 9);
                    if (val.length >= 9) formatted += '-' + val.slice(9, 11);
                    setEditData({ ...editData, phone: formatted });
                    setErrors((err: any) => ({ ...err, phone: validateField('phone', formatted) }));
                  }} placeholder="+7 (___) ___-__-__" maxLength={18} />
                  {errors.phone && <div className="text-xs text-red-500 -mt-2">{errors.phone}</div>}
                  <div className="text-dark-muted text-xs">Формат: +7 (XXX) XXX-XX-XX</div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1" htmlFor="profile-email">Email</label>
                  <input id="profile-email" className={`flex-1 bg-transparent outline-none text-base text-dark-text ${errors.email ? 'border border-red-500' : ''}`} value={editData.email || ''} onChange={e => {
                    setEditData({ ...editData, email: e.target.value });
                    setErrors((err: any) => ({ ...err, email: validateField('email', e.target.value) }));
                  }} placeholder="Email" maxLength={60} type="email" autoComplete="email" />
                  {errors.email && <div className="text-xs text-red-500 -mt-2">{errors.email}</div>}
                  <div className="text-dark-muted text-xs">Введите корректный email</div>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs text-dark-muted font-semibold mb-1">Соцсети</label>
                  {/* VK */}
                  <SocialLinkEdit
                    label="VK"
                    icon="🟦"
                    value={vkInput}
                    onChange={setVkInput}
                    placeholder="https://vk.com/username"
                    statusText="Введите ссылку на профиль, начиная с https://"
                  />
                  {errors.vkId && <div className="text-xs text-red-500 -mt-2">{errors.vkId}</div>}
                  <div className="text-dark-muted text-xs">Введите ссылку на профиль, начиная с https://</div>
                  {/* YouTube */}
                  <SocialLinkEdit
                    label="YouTube"
                    icon="🔴"
                    value={ytInput}
                    onChange={setYtInput}
                    placeholder="https://youtube.com/@username"
                    statusText="Введите ссылку на профиль, начиная с https://"
                  />
                  {errors.youtubeId && <div className="text-xs text-red-500 -mt-2">{errors.youtubeId}</div>}
                  <div className="text-dark-muted text-xs">Введите ссылку на профиль, начиная с https://</div>
                  {/* Telegram */}
                  <SocialLinkEdit
                    label="Telegram"
                    icon="💬"
                    value={tgInput}
                    onChange={setTgInput}
                    placeholder="https://t.me/username"
                    statusText="Введите ссылку на профиль, начиная с https://"
                  />
                  {errors.telegramId && <div className="text-xs text-red-500 -mt-2">{errors.telegramId}</div>}
                  <div className="text-dark-muted text-xs">Введите ссылку на профиль, начиная с https://</div>
                </div>
              </div>
              <div className="flex gap-4 mt-4 w-full">
                <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform text-lg" onClick={handleSave}>Сохранить</button>
                <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform text-lg" onClick={() => setEditOpen(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// --- Генерация моковых пользователей ---
const MOCK_WORKPLACES = [
  "Mooza Studio", "SoundLab", "MusicHub", "JamSpace", "BeatFactory", "GrooveRoom", "HarmonyWorks", "StudioX", "LiveSound", "CreativeLab"
];
const MOCK_PORTFOLIO_FILES = [
  undefined,
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"
];
const MOCK_NAMES = [
  "Алексей Иванов", "Мария Петрова", "Денис Смирнов", "Ольга Сидорова", "Иван Кузнецов", "Екатерина Орлова", "Павел Волков", "Светлана Морозова", "Дмитрий Фёдоров", "Анна Васильева", "Владимир Попов", "Елена Соколова", "Сергей Лебедев", "Татьяна Козлова", "Артём Новиков", "Наталья Павлова", "Игорь Михайлов", "Юлия Романова", "Максим Захаров", "Виктория Баранова", "Григорий Киселёв", "Алиса Громова", "Валерий Соловьёв", "Полина Белова", "Роман Гаврилов", "Вера Корнилова", "Евгений Ефимов", "Дарья Крылова", "Никита Соловьёв", "Кристина Кузьмина", "Василиса Котова", "Михаил Грачёв", "Анастасия Климова", "Виталий Кузьмин", "Маргарита Ковалева", "Глеб Сидоров", "Лидия Киселёва", "Андрей Козлов", "София Фролова", "Вячеслав Белов", "Елизавета Громова", "Аркадий Орлов", "Диана Кузнецова", "Пётр Соловьёв", "Алёна Морозова", "Владислав Фёдоров", "Оксана Лебедева", "Даниил Попов", "Евгения Павлова", "Станислав Иванов"
];
const MOCK_BIOS = [
  "Люблю музыку и новые знакомства!", "Ищу единомышленников для совместных проектов.", "Пишу песни и играю на гитаре.", "Открыт для коллабораций.", "Музыка — моя жизнь.", "Экспериментирую с жанрами.", "Готов к новым музыкальным открытиям!", "Ищу группу для выступлений.", "Обожаю живые концерты.", "Пишу аранжировки и свожу треки."
];
const MOCK_CITIES = [
  "Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск", "Самара", "Воронеж", "Краснодар", "Уфа", "Пермь", "Ростов-на-Дону", "Челябинск", "Нижний Новгород", "Омск", "Волгоград", "Томск", "Тула", "Калуга", "Сочи", "Ярославль"
];
function getRandomFromArray<T>(arr: T[], count: number) {
  const shuffled = arr.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
function getRandomInterests() {
  const allTags = INTEREST_CATEGORIES.flatMap(cat => cat.subcategories.flatMap(sub => sub.tags));
  return getRandomFromArray(allTags, 3 + Math.floor(Math.random() * 4)); // 3-6 интересов
}
function getRandomAvatar(name: string) {
  // Используем https://ui-avatars.com/ для генерации аватарок
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
}
const MOCK_SOCIALS = [
  (name: string) => `https://vk.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://t.me/${name.split(' ')[0].toLowerCase()}`,
  (name: string) => `https://instagram.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://youtube.com/@${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://soundcloud.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://bandcamp.com/${name.replace(/\s/g, '').toLowerCase()}`,
  (name: string) => `https://mysite.com/${name.replace(/\s/g, '').toLowerCase()}`
];
function getRandomSocials(name: string) {
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = MOCK_SOCIALS.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(fn => fn(name));
}
export const MOCK_USERS: UserProfile[] = Array.from({ length: 100 }).map((_, i) => {
  const name = MOCK_NAMES[i % MOCK_NAMES.length] + (i >= MOCK_NAMES.length ? ` #${i+1}` : "");
  const [firstName, ...lastNameArr] = name.split(" ");
  const lastName = lastNameArr.join(" ") || "";
  const city = getRandomFromArray(MOCK_CITIES, 1)[0];
  const country = "Россия";
  const workPlace = getRandomFromArray(MOCK_WORKPLACES, 1)[0];
  const skills = getRandomInterests();
  const interests = getRandomInterests();
  const bio = getRandomFromArray(MOCK_BIOS, 1)[0] + (Math.random() > 0.5 ? "\nЛюбимый город: " + city : "");
  const phone = `+7 (9${Math.floor(10 + Math.random()*89)}) ${Math.floor(100+Math.random()*900)}-${Math.floor(10+Math.random()*90)}-${Math.floor(10+Math.random()*90)}`;
  const email = `user${i+1}@mooza.ru`;
  const portfolioText = `Портфолио пользователя ${name}. Достижения, проекты, ссылки.`;
  const fileUrl = getRandomFromArray(MOCK_PORTFOLIO_FILES, 1)[0];
  return {
    userId: `user_${i+1}_${Math.random().toString(36).slice(2, 10)}`,
    firstName,
    lastName,
    name,
    bio,
    workPlace,
    skills,
    interests,
    portfolio: { text: portfolioText, fileUrl },
    phone,
    email,
    avatarUrl: getRandomAvatar(name),
    city,
    country,
    socials: getRandomSocials(name),
  };
});
// --- Моковые посты ---
const MOCK_POSTS: Post[] = [
  ...Array.from({ length: 30 }).map((_, i) => {
    const user = MOCK_USERS[i % MOCK_USERS.length];
    const texts = [
      "Ищу музыкантов для совместных репетиций!",
      "Записываю каверы, ищу вокалиста!",
      "Давайте соберёмся на квартирник!",
      "В пятницу джемим блюз в баре! Присоединяйтесь!",
      "Ищу басиста для новой группы.",
      "Готовлю новый альбом, ищу саунд-продюсера.",
      "Кто хочет поиграть джаз на выходных?",
      "Нужен барабанщик для live-сета.",
      "Пишу электронную музыку, ищу вокал.",
      "Давайте устроим jam-session в парке!",
      "Ищу единомышленников для записи EP.",
      "Кто хочет снять клип на песню?",
      "Ищу клавишника для кавер-группы.",
      "Готовлюсь к концерту, ищу подтанцовку!",
      "Нужен совет по сведению трека.",
      "Кто хочет вместе поэкспериментировать с жанрами?",
      "Ищу группу для выступлений на фестивале.",
      "Пишу аранжировки, ищу вокалистку.",
      "Давайте обменяемся демками!",
      "Кто хочет записать совместный трек?",
    ];
    return {
      id: i + 1,
      userId: user.userId,
      author: user.name,
      avatarUrl: user.avatarUrl,
      content: texts[i % texts.length],
      tags: user.interests.slice(0, 3),
      liked: false,
      favorite: false,
      createdAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 30).toISOString(),
      updatedAt: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 30).toISOString(),
    };
  })
];

// Toast context и компонент
const ToastContext = createContext<(msg: string) => void>(() => {});
function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && <div className="toast animate-fade-in animate-scale-in">{toast}</div>}
    </ToastContext.Provider>
  );
}
function useToast() {
  return useContext(ToastContext);
}

function App() {
  // Получаем пользователя Telegram (или дефолт)
  const tgUser = getTelegramUser();
  const [showWelcome, setShowWelcome] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ВСЕ остальные хуки — сюда, до любого return!
  const [allUsers, setAllUsers] = useState<UserProfile[]>(MOCK_USERS);
  const [allPosts, setAllPosts] = useState<Post[]>(MOCK_POSTS);
  const [friends, setFriends] = useState<string[]>([MOCK_USERS[0].userId, MOCK_USERS[1].userId]);
  const [favorites, setFavorites] = useState<string[]>([MOCK_USERS[2].userId]);
  const [userCard, setUserCard] = useState<{ user: UserProfile, posts: Post[] } | null>(null);
  const navigate = useNavigate();

  // ... handleUserClick ...
  const handleUserClick = (user: UserProfile) => {
    navigate(`/user/${encodeURIComponent(user.userId)}`);
  };
  // ... handleAddFriend, handleRemoveFriend, handleToggleFavorite ...
  const handleAddFriend = (userId: string) => setFriends((prev) => [...prev, userId]);
  const handleRemoveFriend = (userId: string) => setFriends((prev) => prev.filter((id) => id !== userId));
  const handleToggleFavorite = (userId: string) => setFavorites((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);

  // Добавляю функции для редактирования, удаления, лайка поста
  const handleCreateUserPost = (content: string, tags: string[], attachmentUrl?: string) => {
    const now = new Date().toISOString();
    setAllPosts(prev => [
      {
        id: Date.now(),
        userId: profile!.userId,
        author: profile!.name,
        avatarUrl: profile!.avatarUrl,
        content,
        tags,
        liked: false,
        favorite: false,
        attachmentUrl,
        createdAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);
  };
  const handleUpdateUserPost = (id: number, content: string, tags: string[]) => {
    const now = new Date().toISOString();
    setAllPosts(prev => prev.map(p => p.id === id ? { ...p, content, tags, updatedAt: now } : p));
  };
  const handleDeleteUserPost = (id: number) => {
    setAllPosts(prev => prev.filter(p => p.id !== id));
  };
  const handleLikeUserPost = (id: number) => {
    setAllPosts(prev => prev.map(p => p.id === id ? { ...p, liked: !p.liked } : p));
  };

  if (showWelcome) {
    return <WelcomePage onFinish={p => {
      setProfile({
        ...p,
        vkId: p.vk,
        youtubeId: p.youtube,
        telegramId: p.telegram,
        interests: p.interests || [],
      });
      setShowWelcome(false);
    }} />;
  }

  return (
    <ToastProvider>
      <AppBar />
      <Layout>
        <Routes>
          <Route path="/" element={<HomeFeed profile={profile!} allPosts={allPosts} friends={friends} onUserClick={handleUserClick} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} users={allUsers} />} />
          <Route path="/search" element={<Search profile={profile!} users={allUsers} friends={friends} favorites={favorites} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onToggleFavorite={handleToggleFavorite} onUserClick={handleUserClick} />} />
          <Route path="/friends" element={<Friends profile={profile!} friends={friends} users={allUsers} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onUserClick={handleUserClick} />} />
          <Route path="/profile" element={<Profile profile={profile!} setProfile={setProfile} allPosts={allPosts} setAllPosts={setAllPosts} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} users={allUsers} setAllUsers={setAllUsers} friends={friends} favorites={favorites} />} />
          <Route path="/user/:userName" element={<UserPageWrapper 
            allUsers={allUsers} 
            allPosts={allPosts} 
            onBack={() => navigate(-1)}
            friends={friends}
            favorites={favorites}
            onAddFriend={handleAddFriend}
            onRemoveFriend={handleRemoveFriend}
            onToggleFavorite={handleToggleFavorite}
            onLikeUserPost={handleLikeUserPost}
            currentUserName={profile!.name}
          />} />
        </Routes>
      </Layout>
      <TabBar />
    </ToastProvider>
  );
}

// Обёртка для Router
function AppWithRouter() {
  return (
    <Router>
      <App />
    </Router>
  );
}

export default AppWithRouter;

// Вспомогательная функция для поиска категории и подкатегории по тегу
function getInterestPath(tag: string) {
  for (const cat of INTEREST_CATEGORIES) {
    for (const sub of cat.subcategories) {
      if (sub.tags.includes(tag)) {
        return `${cat.category} - ${sub.name} - ${tag}`;
      }
    }
  }
  return tag;
}

// 1. Создаю компонент UserPage
function UserPage({ user, posts, onBack, isFriend, isFavorite, onAddFriend, onRemoveFriend, onToggleFavorite, onLikePost, currentUserName }: {
  user: UserProfile,
  posts: Post[],
  onBack: () => void,
  isFriend: boolean,
  isFavorite: boolean,
  onAddFriend: () => void,
  onRemoveFriend: () => void,
  onToggleFavorite: () => void,
  onLikePost: (id: number) => void,
  currentUserName: string,
}) {
  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6">
        <button className="mb-4 flex items-center gap-2 text-dark-accent hover:underline text-base font-semibold" onClick={onBack}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Назад
        </button>
        <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-xl p-6 flex flex-col items-center gap-3 animate-fade-in animate-scale-in">
          <div className="avatar-gradient mx-auto mt-2 mb-2">
            <div className="avatar-inner w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg flex items-center justify-center">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span role="img" aria-label="avatar" className="text-5xl">👤</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 w-full">
            <div className="font-bold text-2xl sm:text-3xl text-dark-text text-center break-words flex-1" style={{fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif'}}>{user.name}</div>
          </div>
          {(user.country || user.city) && <div className="text-blue-700 text-xs font-medium">{[user.country, user.city].filter(Boolean).join(', ')}</div>}
          <div className="text-dark-muted text-base text-center max-w-xs whitespace-pre-line break-words mb-2">{user.bio}</div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {user.interests.filter(Boolean).map((interest, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white">{getInterestPath(interest)}</span>
            ))}
          </div>
          {user.socials && user.socials.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {user.socials?.filter(Boolean).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-text" title={link} tabIndex={0}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/></svg>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 mt-4">
          <div className="font-semibold text-base mb-2 text-dark-text pl-2">Посты пользователя</div>
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
                <div className="text-xs text-dark-muted ml-auto">{new Date(post.createdAt).toLocaleDateString()}</div>
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
      </section>
    </main>
  );
}

// 5. Вспомогательный враппер для UserPage (перемещён выше App)
function UserPageWrapper({ allUsers, allPosts, onBack, friends, favorites, onAddFriend, onRemoveFriend, onToggleFavorite, onLikeUserPost, currentUserName }: {
  allUsers: UserProfile[],
  allPosts: Post[],
  onBack: () => void,
  friends: string[],
  favorites: string[],
  onAddFriend: (userId: string) => void,
  onRemoveFriend: (userId: string) => void,
  onToggleFavorite: (userId: string) => void,
  onLikeUserPost: (id: number) => void,
  currentUserName: string,
}) {
  const { userName: userId } = useParams();
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

function SocialLinkEdit({ label, icon, value, onChange, placeholder, statusText }: { label: string, icon: string, value: string, onChange: (v: string) => void, placeholder: string, statusText: string }) {
  return (
    <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
      <span className="text-xl">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none text-base text-dark-text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
      {value && (
        <button className="text-red-500 text-xs px-2" onClick={() => onChange("")} title="Отвязать"><span style={{fontSize: '1.2em'}}>✖</span></button>
      )}
    </div>
  );
}

