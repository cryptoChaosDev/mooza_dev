import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { InterestSelector } from "./InterestSelector";
import { INTEREST_CATEGORIES } from "./categories";
import { WelcomePage } from "./Welcome";

// Тип профиля пользователя
interface UserProfile {
  avatarUrl?: string;
  name: string;
  bio: string;
  interests: string[];
  city?: string;
  socials?: string[];
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
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
function PostCard({ post, isOwn, onEdit, onDelete, onLike, onUserClick }: {
  post: Post,
  isOwn?: boolean,
  onEdit?: () => void,
  onDelete?: () => void,
  onLike?: () => void,
  onUserClick?: () => void,
}) {
  return (
    <div className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-6 relative border border-dark-bg/40 font-sans animate-fade-in animate-scale-in mb-4">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden">
          {post.avatarUrl ? (
            <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
          ) : (
            <span role="img" aria-label="avatar">👤</span>
          )}
        </div>
        <div className="font-semibold text-dark-text text-base cursor-pointer hover:underline truncate" onClick={onUserClick}>{post.author}</div>
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
        <span className="text-2xl font-bold text-dark-text select-none" style={{fontFamily: 'Pacifico, cursive', letterSpacing: '0.04em'}}>Mooza</span>
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
  // Новый фильтр: выбранные теги через InterestSelector
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [interestMode, setInterestMode] = useState<'popular' | 'manual' | 'mine'>('popular');

  // --- Фильтрация пользователей ---
  const getProfileMatchCount = (user: UserProfile) => user.interests.filter(tag => profile.interests.includes(tag)).length;
  let matchedUsers: (UserProfile & { matchCount: number })[] = [];
  if (interestMode === 'mine') {
    if (profile.interests && profile.interests.length > 0) {
      matchedUsers = users
        .map(u => ({ ...u, matchCount: getProfileMatchCount(u) }))
        .filter(u => u.interests.some(tag => profile.interests.includes(tag)))
        .sort((a, b) => b.matchCount - a.matchCount);
    } else {
      matchedUsers = [];
    }
  } else {
    matchedUsers = users
      .map(u => ({ ...u, matchCount: getProfileMatchCount(u) }))
      .filter(u => {
        if (selectedTags.length > 0) {
          if (showOnlyMatches) {
            // Только те, у кого есть все выбранные теги
            return selectedTags.every(tag => u.interests.includes(tag));
          } else {
            // Те, у кого есть хотя бы один выбранный тег
            return u.interests.some(tag => selectedTags.includes(tag));
          }
        } else {
          // Нет выбранных тегов — фильтруем по совпадению с интересами профиля
          return !showOnlyMatches || u.matchCount > 0;
        }
      })
      .sort((a, b) => b.matchCount - a.matchCount);
  }

  // --- UI фильтра ---
  return (
    <main className="p-4 sm:p-6 pt-20 text-center text-dark-text min-h-[100dvh] bg-dark-bg flex flex-col items-center text-base sm:text-lg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* --- Новый фильтр интересов через InterestSelector --- */}
        <div className="flex flex-col gap-2 mb-2 animate-fade-in">
          <InterestSelector
            selected={selectedTags}
            onChange={setSelectedTags}
            profileInterests={profile.interests}
            onModeChange={setInterestMode}
          />
          <label className="flex items-center gap-2 cursor-pointer text-sm mt-2">
            <input type="checkbox" checked={showOnlyMatches} onChange={e => setShowOnlyMatches(e.target.checked)} />
            Только совпадающие
          </label>
        </div>
        {/* --- Конец фильтра --- */}
        {matchedUsers.length === 0 && <div className="text-dark-muted empty-state">Нет подходящих пользователей</div>}
        {matchedUsers.map(user => (
          <div key={user.name} className="bg-dark-card rounded-2xl shadow-card p-4 flex flex-col gap-2 mb-3 animate-fade-in animate-scale-in">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden cursor-pointer" onClick={() => onUserClick({ ...profile, name: user.name, avatarUrl: user.avatarUrl })}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span role="img" aria-label="avatar">👤</span>
                )}
              </div>
              <div className="font-semibold text-dark-text text-base cursor-pointer hover:underline truncate flex-1" onClick={() => onUserClick({ ...profile, name: user.name, avatarUrl: user.avatarUrl })}>{user.name}</div>
              {/* --- Кнопки добавить в друзья/избранное --- */}
              <div className="flex gap-2 ml-2">
                {friends.includes(user.name) ? (
                  <button title="Удалить из друзей" className="p-2 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors" onClick={() => onRemoveFriend(user.name)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                  </button>
                ) : (
                  <button title="Добавить в друзья" className="p-2 rounded-full bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white transition-colors" onClick={() => onAddFriend(user.name)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
                  </button>
                )}
                <button
                  title={favorites.includes(user.name) ? "Убрать из избранного" : "В избранное"}
                  className={`p-2 rounded-full transition-colors ${favorites.includes(user.name) ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`}
                  onClick={() => onToggleFavorite(user.name)}
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
              </div>
            </div>
            {/* Интересы пользователя */}
            <div className="flex flex-wrap gap-2 mt-1">
              {user.interests.map((tag, i) => {
                // Если выбран фильтр — подсвечивать совпадающие с фильтром, иначе с интересами профиля
                const isMatch = selectedTags.length > 0
                  ? selectedTags.includes(tag)
                  : profile.interests && profile.interests.includes(tag);
                return (
                  <span
                    key={i}
                    className={`px-3 py-0.5 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none animate-fade-in
                      ${isMatch ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white scale-105' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white'}`}
                  >
                    {getInterestPath(tag)}
                    {isMatch && <span className="ml-1">★</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
function Friends({ profile, friends, favorites, users, onUserClick, onAddFriend, onRemoveFriend, onToggleFavorite }: {
  profile: UserProfile,
  friends: string[],
  favorites: string[],
  users: UserProfile[],
  onUserClick: (user: UserProfile) => void,
  onAddFriend: (name: string) => void,
  onRemoveFriend: (name: string) => void,
  onToggleFavorite: (name: string) => void,
}) {
  // --- Современные фильтры ---
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [subcategoryDropdownOpen, setSubcategoryDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [view, setView] = useState<'friends' | 'favorites' | 'recommended'>("friends");

  // --- Получаем список тегов для фильтра ---
  let filterTags: string[] = [];
  if (selectedCategories.length > 0) {
    INTEREST_CATEGORIES.forEach(cat => {
      if (selectedCategories.includes(cat.category)) {
        if (selectedSubcategories.length > 0) {
          cat.subcategories.forEach(sub => {
            if (selectedSubcategories.includes(sub.name)) {
              filterTags.push(...sub.tags);
            }
          });
        } else {
          filterTags.push(...cat.subcategories.flatMap(s => s.tags));
        }
      }
    });
  }

  // --- Фильтрация пользователей ---
  let filteredUsers = users.filter(u =>
    (!search || u.name.toLowerCase().includes(search.toLowerCase())) &&
    (filterTags.length === 0 || u.interests.some(tag => filterTags.includes(tag))) &&
    ((view === 'friends' && friends.includes(u.name)) || (view === 'favorites' && favorites.includes(u.name)))
  );

  // --- Рекомендованные пользователи ---
  let recommendedUsers: UserProfile[] = [];
  if (view === 'recommended') {
    recommendedUsers = users
      .filter(u => !friends.includes(u.name) && !favorites.includes(u.name) && u.name !== profile.name)
      .map(u => ({ ...u, matchCount: u.interests.filter(tag => profile.interests.includes(tag)).length }))
      .filter(u => u.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount);
  }

  // Сортировка: сначала друзья/избранные
  const sortedUsers = [...filteredUsers];

  // --- UI ---
  return (
    <main className="p-4 sm:p-6 pt-20 min-h-[100dvh] bg-dark-bg flex flex-col items-center font-sans animate-fade-in transition-all duration-300 w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6">
        {/* --- Фильтры --- */}
        <div className="flex flex-col gap-2 animate-fade-in mb-2">
          {/* ...категории, подкатегории, поиск по имени... */}
          <div className="flex gap-2 mb-2">
            <button className={`px-4 py-1 rounded-full text-xs font-semibold border-none transition-all ${view === 'friends' ? 'bg-dark-accent text-white' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white'} shadow-sm active:scale-95`} onClick={() => setView('friends')}>Друзья</button>
            <button className={`px-4 py-1 rounded-full text-xs font-semibold border-none transition-all ${view === 'favorites' ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-dark-muted hover:bg-yellow-400 hover:text-white'} shadow-sm active:scale-95`} onClick={() => setView('favorites')}>Избранные</button>
            <button className={`px-4 py-1 rounded-full text-xs font-semibold border-none transition-all ${view === 'recommended' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white' : 'bg-dark-bg/60 text-dark-muted hover:bg-blue-500/20 hover:text-blue-500'} shadow-sm active:scale-95`} onClick={() => setView('recommended')}>Рекомендованные</button>
          </div>
          {/* ...чипы фильтров, сброс... */}
        </div>
        {/* --- Список пользователей --- */}
        {view === 'recommended' ? (
          <>
            <div className="text-2xl font-bold mb-4 text-dark-text pl-2">Рекомендованные друзья</div>
            {recommendedUsers.length === 0 && (
              <div className="text-dark-muted text-center py-8">Нет подходящих рекомендаций</div>
            )}
            {recommendedUsers.map((user) => (
              <div key={user.name} className="bg-dark-card rounded-2xl shadow-card p-4 flex flex-col gap-2 mb-3 animate-fade-in animate-scale-in">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden cursor-pointer" onClick={() => onUserClick(user)}>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-semibold text-dark-text text-base cursor-pointer hover:underline truncate flex-1" onClick={() => onUserClick(user)}>{user.name}</div>
                  {/* --- Кнопки добавить в друзья/избранное --- */}
                  <div className="flex gap-2 ml-2">
                    <button title="Добавить в друзья" className="p-2 rounded-full bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white transition-colors" onClick={() => onAddFriend(user.name)}>
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </button>
                    <button
                      title={favorites.includes(user.name) ? "Убрать из избранного" : "В избранное"}
                      className={`p-2 rounded-full transition-colors ${favorites.includes(user.name) ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`}
                      onClick={() => onToggleFavorite(user.name)}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={favorites.includes(user.name) ? '#fbbf24' : 'none'} /></svg>
                    </button>
                  </div>
                </div>
                <div className="text-dark-muted text-sm truncate mb-1">{user.bio}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {user.interests.map((tag, i) => {
                    const isMatch = profile.interests && profile.interests.includes(tag);
                    return (
                      <span
                        key={i}
                        className={`px-3 py-0.5 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none animate-fade-in
                          ${isMatch ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white scale-105' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white'}`}
                      >
                        {getInterestPath(tag)}
                        {isMatch && <span className="ml-1">★</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="text-2xl font-bold mb-4 text-dark-text pl-2">{view === 'friends' ? 'Мои друзья' : 'Избранные пользователи'}</div>
            {sortedUsers.length === 0 && (
              <div className="text-dark-muted text-center py-8">
                {view === 'friends' ? 'У вас пока нет друзей' : 'В избранном пока никого нет'}
              </div>
            )}
            {sortedUsers.map((user) => (
              <div key={user.name} className="bg-dark-card rounded-2xl shadow-card p-4 flex flex-col gap-2 mb-3 animate-fade-in animate-scale-in">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-dark-bg/80 flex items-center justify-center text-2xl border border-dark-bg/40 overflow-hidden cursor-pointer" onClick={() => onUserClick(user)}>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-semibold text-dark-text text-base cursor-pointer hover:underline truncate flex-1" onClick={() => onUserClick(user)}>{user.name}</div>
                  {/* --- Кнопки добавить в друзья/избранное --- */}
                  <div className="flex gap-2 ml-2">
                    {friends.includes(user.name) ? (
                      <button title="Удалить из друзей" className="p-2 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors" onClick={() => onRemoveFriend(user.name)}>
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                      </button>
                    ) : (
                      <button title="Добавить в друзья" className="p-2 rounded-full bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white transition-colors" onClick={() => onAddFriend(user.name)}>
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </button>
                    )}
                    <button
                      title={favorites.includes(user.name) ? "Убрать из избранного" : "В избранное"}
                      className={`p-2 rounded-full transition-colors ${favorites.includes(user.name) ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`}
                      onClick={() => onToggleFavorite(user.name)}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={favorites.includes(user.name) ? '#fbbf24' : 'none'} /></svg>
                    </button>
                  </div>
                </div>
                <div className="text-dark-muted text-sm truncate mb-1">{user.bio}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {user.interests.map((tag, i) => (
                    <span
                      key={i}
                      className={`px-3 py-0.5 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none animate-fade-in
                        ${profile.interests && profile.interests.includes(tag) ? 'bg-dark-accent text-white' : 'bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white'}`}
                    >
                      {getInterestPath(tag)}
                      {profile.interests && profile.interests.includes(tag) && <span className="ml-1">★</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </main>
  );
}

const POPULAR_TAGS = [
  "Гитара", "Бас", "Барабаны", "Вокал", "Клавиши", "Скрипка", "Саксофон", "Флейта", "Рок", "Поп", "Джаз", "Блюз", "Электроника", "Импровизация", "Каверы", "Авторская музыка", "Сведение", "Продюсирование"
];

interface Post {
  id: number;
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
            {user.city && <div className="text-blue-700 text-xs font-medium">{user.city}</div>}
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
              <PostCard key={post.id} post={post} />
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
function HomeFeed({ profile, allPosts, friends, onUserClick, onDeletePost, onLikePost, onCreatePost, onUpdatePost }: {
  profile: UserProfile,
  allPosts: Post[],
  friends: string[],
  onUserClick: (user: UserProfile) => void,
  onDeletePost: (id: number) => void,
  onLikePost: (id: number) => void,
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void,
  onUpdatePost: (id: number, content: string, tags: string[]) => void,
}) {
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState<{ content: string; tags: string[]; attachment: File | null }>({ content: "", tags: [], attachment: null });
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const filteredPosts = allPosts.filter((post) => friends.includes(post.author) || post.author === profile.name);
  const handleCreatePost = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
  };

  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState<{ content: string; tags: string[] }>({ content: "", tags: [] });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="text-lg font-bold text-dark-text">Лента друзей</div>
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
              profileInterests={profile.interests}
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
        <div className="flex flex-col gap-4">
          {filteredPosts.length === 0 && (
            <div className="text-center text-dark-muted py-8">Нет постов по вашим интересам</div>
          )}
          {filteredPosts.map((post) => (
            <div key={post.id} className="relative bg-dark-card rounded-2xl shadow p-4 flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden">
                  {post.avatarUrl ? (
                    <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span role="img" aria-label="avatar">👤</span>
                  )}
                </div>
                <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline" onClick={() => onUserClick({ ...profile, name: post.author, avatarUrl: post.avatarUrl })}>{post.author}</div>
                {post.author === profile.name && (
                  <button title="Редактировать пост" className="p-2 rounded-full bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors ml-2" onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
                  </button>
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
                {post.author === profile.name && (
                  <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => setDeletePostId(post.id)}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
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
                profileInterests={profile.interests}
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

function Profile({ profile, setProfile, allPosts, onCreatePost, onUpdatePost, onDeletePost, onLikePost }: {
  profile: UserProfile,
  setProfile: (p: UserProfile) => void,
  allPosts: Post[],
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void,
  onUpdatePost: (id: number, content: string, tags: string[]) => void,
  onDeletePost: (id: number) => void,
  onLikePost: (id: number) => void,
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<UserProfile>({
    ...profile,
    city: profile.city || "",
    vkId: profile.vkId || "",
    youtubeId: profile.youtubeId || "",
    telegramId: profile.telegramId || "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newPost, setNewPost] = useState<{ content: string; tags: string[]; attachment: File | null }>({ content: "", tags: [], attachment: null });
  const [showTagSelect, setShowTagSelect] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState({ content: "", tags: [] as string[] });
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    if (!editOpen) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      setProfile(editData);
    }, 1000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [editData, editOpen]);
  const toggleInterest = (tag: string) => {
    setEditData((prev) =>
      prev.interests.includes(tag)
        ? { ...prev, interests: prev.interests.filter((t) => t !== tag) }
        : { ...prev, interests: [...prev.interests, tag] }
    );
  };
  const handleEdit = () => {
    setEditData(profile);
    setAvatarFile(null);
    setEditOpen(true);
  };
  const handleSave = () => {
    let avatarUrl = editData.avatarUrl;
    if (avatarFile) {
      avatarUrl = URL.createObjectURL(avatarFile);
    }
    setProfile({ ...editData, avatarUrl });
    setEditOpen(false);
  };
  // Посты пользователя
  const userPosts = allPosts.filter((p) => p.author === profile.name);
  // Создание поста
  const handleCreatePost = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
    setShowTagSelect(false);
  };
  // Редактирование поста
  const handleEditPost = (post: Post) => {
    setEditPost(post);
    setEditPostData({ content: post.content, tags: post.tags });
  };
  const handleSaveEditPost = () => {
    if (editPost && editPostData.content.trim() && editPostData.tags.length > 0) {
      onUpdatePost(editPost.id, editPostData.content, editPostData.tags);
      setEditPost(null);
    }
  };
  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6">
        <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-xl p-6 flex flex-col items-center gap-3 animate-fade-in animate-scale-in">
          <div className="avatar-gradient mx-auto mt-2 mb-2">
            <div className="avatar-inner w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg flex items-center justify-center">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span role="img" aria-label="avatar" className="text-5xl">👤</span>
              )}
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-accent-gradient text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all text-base rounded-xl mx-auto mb-2 animate-fade-in animate-scale-in" onClick={handleEdit}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg>
            Редактировать профиль
          </button>
          <div className="flex items-center justify-center gap-2 w-full">
            <div className="font-bold text-2xl sm:text-3xl text-dark-text text-center break-words flex-1" style={{fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif'}}>{profile.name}</div>
          </div>
          {profile.city && <div className="text-blue-700 text-xs font-medium">{profile.city}</div>}
          <div className="text-dark-muted text-base text-center max-w-xs whitespace-pre-line break-words mb-2">{profile.bio}</div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {profile.interests.filter(Boolean).map((interest, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium border-none transition-all shadow-sm focus:outline-none bg-dark-bg/60 text-dark-muted hover:bg-dark-accent hover:text-white">{getInterestPath(interest)}</span>
            ))}
          </div>
          {profile.socials && profile.socials.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {profile.socials?.filter(Boolean).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-text" title={link} tabIndex={0}>
                  {/* Можно вставить SVG-иконку соцсети по ссылке */}
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/></svg>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-6 mb-2">
          <div className="text-lg font-bold text-dark-text">Мои посты</div>
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
              profileInterests={profile.interests}
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
        <div className="flex flex-col gap-3 mt-4">
          {userPosts.length === 0 && <div className="text-dark-muted text-center">У вас пока нет постов</div>}
          {userPosts.map((post) => (
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
                <button title="Редактировать пост" className="p-2 rounded-full bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors ml-2" onClick={() => handleEditPost(post)}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
                </button>
                <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => setDeletePostId(post.id)}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                </button>
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
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* Модальное окно редактирования */}
      {editOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          style={{ paddingTop: 60, paddingBottom: 60 }}>
          <div className="bg-dark-card shadow-2xl w-full max-w-md p-8 relative animate-fade-in flex flex-col items-center gap-6"
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto'
            }}>
            <button className="absolute top-4 right-4 text-3xl text-dark-muted hover:text-dark-text transition active:scale-110" onClick={() => setEditOpen(false)}>&times;</button>
            <div className="relative mb-2">
              <img src={avatarFile ? URL.createObjectURL(avatarFile) : (editData.avatarUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(editData.name || 'Профиль'))} alt="avatar" className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-lg bg-dark-bg/80" />
              <label className="absolute bottom-2 right-2 bg-dark-accent p-2 rounded-full shadow hover:scale-110 transition cursor-pointer" title="Сменить аватар">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg>
                <input type="file" accept="image/*" className="hidden" onChange={e => setAvatarFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
              </label>
            </div>
            <div className="w-full flex flex-col gap-3">
              <label className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
                <input className="flex-1 bg-transparent outline-none text-base text-dark-text" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Имя и фамилия" maxLength={40} autoComplete="name" />
              </label>
              <label className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
                <input className="flex-1 bg-transparent outline-none text-base text-dark-text" value={editData.city || ''} onChange={e => setEditData({ ...editData, city: e.target.value })} placeholder="Город" maxLength={40} autoComplete="address-level2" />
                <button
                  type="button"
                  className="ml-2 px-2 py-1 rounded bg-dark-accent text-white text-xs font-medium hover:bg-blue-500/80 transition-colors"
                  title="Определить по геолокации"
                  onClick={async () => {
                    if (!navigator.geolocation) {
                      alert('Геолокация не поддерживается вашим браузером');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                      const { latitude, longitude } = pos.coords;
                      try {
                        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ru`);
                        const data = await resp.json();
                        const city = data.address.city || data.address.town || data.address.village || data.address.settlement || data.address.state || '';
                        if (city) {
                          setEditData(prev => ({ ...prev, city }));
                        } else {
                          alert('Не удалось определить город по координатам');
                        }
                      } catch {
                        alert('Ошибка при определении города');
                      }
                    }, (err) => {
                      alert('Не удалось получить геолокацию: ' + err.message);
                    });
                  }}
                >
                  Определить по геолокации
                </button>
              </label>
              <label className="flex items-start gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner focus-within:ring-2 focus-within:ring-blue-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v8H8V8z" stroke="#4F8CFF" strokeWidth="1.5"/></svg>
                <textarea className="flex-1 bg-transparent outline-none text-base text-dark-text resize-none" value={editData.bio} onChange={e => setEditData({ ...editData, bio: e.target.value })} placeholder="Короткое био пользователя, интересы и стиль музыки" rows={3} maxLength={120} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-dark-muted mb-1">Интересы</span>
                <InterestSelector selected={editData.interests} onChange={interests => setEditData(prev => ({ ...prev, interests }))} disableMineMode={true} />
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <span className="text-xs text-dark-muted mb-1">Соцсети</span>
                {/* VK */}
                <SocialLinkEdit
                  label="VK"
                  icon="🟦"
                  value={editData.vkId || ""}
                  onChange={vkId => setEditData(prev => ({ ...prev, vkId }))}
                  placeholder="vk id"
                  statusText="VK — авторизация через vk.id"
                />
                {/* YouTube */}
                <SocialLinkEdit
                  label="YouTube"
                  icon="▶️"
                  value={editData.youtubeId || ""}
                  onChange={youtubeId => setEditData(prev => ({ ...prev, youtubeId }))}
                  placeholder="YouTube id"
                  statusText="YouTube — авторизация через YouTube"
                />
                {/* Telegram */}
                <SocialLinkEdit
                  label="Telegram"
                  icon="✈️"
                  value={editData.telegramId || ""}
                  onChange={telegramId => setEditData(prev => ({ ...prev, telegramId }))}
                  placeholder="Telegram id"
                  statusText="Telegram — авторизация через telegram id"
                />
              </div>
            </div>
            <div className="flex gap-4 mt-4 w-full">
              <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform text-lg" onClick={handleSave}>Сохранить</button>
              <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform text-lg" onClick={() => setEditOpen(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
      {/* Модалка редактирования поста */}
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
                profileInterests={profile.interests}
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
      {deletePostId !== null && (
        <ConfirmModal
          text="Вы уверены, что хотите удалить этот пост?"
          onConfirm={() => { onDeletePost(deletePostId); setDeletePostId(null); }}
          onCancel={() => setDeletePostId(null)}
        />
      )}
    </main>
  );
}

// --- Генерация моковых пользователей ---
function getRandomFromArray<T>(arr: T[], count: number) {
  const shuffled = arr.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
const MOCK_NAMES = [
  "Алексей Иванов", "Мария Петрова", "Денис Смирнов", "Ольга Сидорова", "Иван Кузнецов", "Екатерина Орлова", "Павел Волков", "Светлана Морозова", "Дмитрий Фёдоров", "Анна Васильева", "Владимир Попов", "Елена Соколова", "Сергей Лебедев", "Татьяна Козлова", "Артём Новиков", "Наталья Павлова", "Игорь Михайлов", "Юлия Романова", "Максим Захаров", "Виктория Баранова", "Григорий Киселёв", "Алиса Громова", "Валерий Соловьёв", "Полина Белова", "Роман Гаврилов", "Вера Корнилова", "Евгений Ефимов", "Дарья Крылова", "Никита Соловьёв", "Кристина Кузьмина", "Василиса Котова", "Михаил Грачёв", "Анастасия Климова", "Виталий Кузьмин", "Маргарита Ковалева", "Глеб Сидоров", "Лидия Киселёва", "Андрей Козлов", "София Фролова", "Вячеслав Белов", "Елизавета Громова", "Аркадий Орлов", "Диана Кузнецова", "Пётр Соловьёв", "Алёна Морозова", "Владислав Фёдоров", "Оксана Лебедева", "Даниил Попов", "Евгения Павлова", "Станислав Иванов"
];
const MOCK_BIOS = [
  "Люблю музыку и новые знакомства!", "Ищу единомышленников для совместных проектов.", "Пишу песни и играю на гитаре.", "Открыт для коллабораций.", "Музыка — моя жизнь.", "Экспериментирую с жанрами.", "Готов к новым музыкальным открытиям!", "Ищу группу для выступлений.", "Обожаю живые концерты.", "Пишу аранжировки и свожу треки."
];
function getAllTags() {
  return INTEREST_CATEGORIES.flatMap(cat => cat.subcategories.flatMap(sub => sub.tags));
}
function getRandomInterests() {
  const allTags = getAllTags();
  return getRandomFromArray(allTags, 3 + Math.floor(Math.random() * 4)); // 3-6 интересов
}
function getRandomAvatar(name: string) {
  // Используем https://ui-avatars.com/ для генерации аватарок
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
}
const MOCK_CITIES = [
  "Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск", "Самара", "Воронеж", "Краснодар", "Уфа", "Пермь", "Ростов-на-Дону", "Челябинск", "Нижний Новгород", "Омск", "Волгоград", "Томск", "Тула", "Калуга", "Сочи", "Ярославль"
];
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
  return {
    name,
    bio: getRandomFromArray(MOCK_BIOS, 1)[0],
    interests: getRandomInterests(),
    avatarUrl: getRandomAvatar(name),
    city: getRandomFromArray(MOCK_CITIES, 1)[0],
    socials: getRandomSocials(name),
  };
});
// --- Моковые посты ---
const MOCK_POSTS: Post[] = [
  // Примеры постов разных пользователей
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

function App() {
  // Получаем пользователя Telegram (или дефолт)
  const tgUser = getTelegramUser();
  const [showWelcome, setShowWelcome] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ВСЕ остальные хуки — сюда, до любого return!
  const [allUsers, setAllUsers] = useState<UserProfile[]>(MOCK_USERS);
  const [allPosts, setAllPosts] = useState<Post[]>(MOCK_POSTS);
  const [friends, setFriends] = useState<string[]>([MOCK_USERS[0].name, MOCK_USERS[1].name]);
  const [favorites, setFavorites] = useState<string[]>([MOCK_USERS[2].name]);
  const [userCard, setUserCard] = useState<{ user: UserProfile, posts: Post[] } | null>(null);
  const navigate = useNavigate();

  // ... handleUserClick ...
  const handleUserClick = (user: UserProfile) => {
    navigate(`/user/${encodeURIComponent(user.name)}`);
  };
  // ... handleAddFriend, handleRemoveFriend, handleToggleFavorite ...
  const handleAddFriend = (name: string) => setFriends((prev) => [...prev, name]);
  const handleRemoveFriend = (name: string) => setFriends((prev) => prev.filter((n) => n !== name));
  const handleToggleFavorite = (name: string) => setFavorites((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  // Добавляю функции для редактирования, удаления, лайка поста
  const handleCreateUserPost = (content: string, tags: string[], attachmentUrl?: string) => {
    const now = new Date().toISOString();
    setAllPosts(prev => [
      {
        id: Date.now(),
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
    return <WelcomePage onFinish={p => { setProfile({ ...p, interests: p.interests || [] }); setShowWelcome(false); }} />;
  }

  return (
    <>
      <AppBar />
      <Layout>
        <Routes>
          <Route path="/" element={<HomeFeed profile={profile!} allPosts={allPosts} friends={friends} onUserClick={handleUserClick} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} />} />
          <Route path="/search" element={<Search profile={profile!} users={allUsers} friends={friends} favorites={favorites} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onToggleFavorite={handleToggleFavorite} onUserClick={handleUserClick} />} />
          <Route path="/friends" element={<Friends profile={profile!} friends={friends} favorites={favorites} users={allUsers} onUserClick={handleUserClick} onAddFriend={handleAddFriend} onRemoveFriend={handleRemoveFriend} onToggleFavorite={handleToggleFavorite} />} />
          <Route path="/profile" element={<Profile profile={profile!} setProfile={setProfile} allPosts={allPosts} onCreatePost={handleCreateUserPost} onUpdatePost={handleUpdateUserPost} onDeletePost={handleDeleteUserPost} onLikePost={handleLikeUserPost} />} />
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
    </>
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
          {user.city && <div className="text-blue-700 text-xs font-medium">{user.city}</div>}
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
  onAddFriend: (name: string) => void,
  onRemoveFriend: (name: string) => void,
  onToggleFavorite: (name: string) => void,
  onLikeUserPost: (id: number) => void,
  currentUserName: string,
}) {
  const { userName } = useParams();
  const user = allUsers.find(u => u.name === userName);
  const posts = allPosts.filter(p => p.author === userName);
  if (!user) return <div className="text-center text-dark-muted pt-24">Пользователь не найден</div>;
  const isFriend = friends.includes(user.name);
  const isFavorite = favorites.includes(user.name);
  const handleAdd = () => onAddFriend(user.name);
  const handleRemove = () => onRemoveFriend(user.name);
  const handleToggleFav = () => onToggleFavorite(user.name);
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
  const [editing, setEditing] = React.useState(false);
  const [input, setInput] = React.useState(value || "");
  React.useEffect(() => { setInput(value || ""); }, [value]);

  if (value && !editing) {
    return (
      <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
        <span className="text-xl">{icon}</span>
        <a href={value} target="_blank" rel="noopener noreferrer" className="flex-1 text-blue-400 underline text-sm truncate">{value}</a>
        <button className="text-red-500 text-xs px-2" onClick={() => onChange("")} title="Отвязать"><span style={{fontSize: '1.2em'}}>✖</span></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
      <span className="text-xl">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none text-base text-dark-text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
      <button className="text-blue-500 text-xs px-2" onClick={() => { if (input.trim()) { onChange(input.trim()); setEditing(false); } }} title="Сохранить"><span style={{fontSize: '1.2em'}}>💾</span></button>
    </div>
  );
}
