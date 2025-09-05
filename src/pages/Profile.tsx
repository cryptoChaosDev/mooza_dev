import React, { useState } from "react";
import { ProfileView } from "../components/ProfileView";
import { InterestSelector } from "../InterestSelector";
import { formatPostDate, getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";
import { useToast } from "../contexts/ToastContext";
import { SocialLinkEdit } from "../components/SocialLinkEdit";

export function Profile({ profile, setProfile, allPosts, setAllPosts, onCreatePost, onUpdatePost, onDeletePost, onLikePost, users, setAllUsers, friends, favorites, onUserClick }: {
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
  onUserClick: (user: UserProfile) => void,
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

  

  // Функция для Mooza-иконок соцсетей
  const getSocialIcon = (url: string) => {
    if (url.includes('vk.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2787F5"/><text x="7" y="16" fontSize="10" fill="#fff">VK</text></svg>;
    if (url.includes('t.me')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><text x="5" y="16" fontSize="10" fill="#fff">TG</text></svg>;
    if (url.includes('instagram.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#E1306C"/><text x="3" y="16" fontSize="10" fill="#fff">IG</text></svg>;
    if (url.includes('youtube.com')) return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FF0000"/><text x="3" y="16" fontSize="10" fill="#fff">YT</text></svg>;
    return <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#888"/></svg>;
  };

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
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6 animate-fade-in px-4">
        {/* Современный профиль Mooza */}
        <div className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-6">
          <ProfileView profile={profile} editable onEdit={() => setEditOpen(true)} />
          
          {/* Stats Section */}
          <div className="flex justify-around bg-dark-bg/30 rounded-2xl p-4">
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-dark-text">{userPosts.length}</span>
              <span className="text-xs text-dark-muted">Постов</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-dark-text">{friendsCount}</span>
              <span className="text-xs text-dark-muted">Друзей</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-dark-text">{favoritesCount}</span>
              <span className="text-xs text-dark-muted">Избранных</span>
            </div>
          </div>
        </div>

        {/* Кнопка создать пост */}
        <div className="flex justify-end">
          <button 
            className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
            title="Создать пост" 
            onClick={() => setShowCreate(v => !v)}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5" stroke="#fff" strokeWidth="1.5"/></svg>
            <span className="font-medium text-base">Новый пост</span>
          </button>
        </div>

        {/* Форма создания поста */}
        {showCreate && (
          <div className="bg-dark-card rounded-3xl shadow-card p-7 flex flex-col gap-6 animate-fade-in animate-scale-in">
            <div className="text-2xl font-bold text-dark-text">Создать пост</div>
            <textarea
              className="w-full border-none rounded-2xl px-6 py-5 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
              rows={5}
              placeholder="Что нового? Поделитесь с друзьями..."
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
            />
            <div className="flex flex-col gap-5">
              <div className="text-base text-dark-muted font-semibold">Теги:</div>
              <InterestSelector
                selected={newPost.tags}
                onChange={tags => setNewPost(prev => ({ ...prev, tags }))}
              />
            </div>
            <div className="flex items-center gap-5">
              <label className="cursor-pointer p-4 rounded-2xl bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-accent" title="Прикрепить изображение">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewPost(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  className="hidden"
                />
              </label>
              {newPost.attachment && (
                <img src={URL.createObjectURL(newPost.attachment)} alt="attachment" className="max-h-24 rounded-2xl object-contain" />
              )}
              <button
                className="ml-auto px-7 py-4 rounded-2xl bg-dark-accent text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-3"
                onClick={handleCreatePost}
                disabled={!newPost.content.trim() || newPost.tags.length === 0}
                title="Опубликовать пост"
                type="button"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 12h16M12 4l8 8-8 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="text-base">Опубликовать</span>
              </button>
            </div>
          </div>
        )}

        {/* Лента постов */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-dark-text">Мои посты</div>
            <div className="text-base text-dark-muted font-medium">{userPosts.length} постов</div>
          </div>
          
          {userPosts.length === 0 ? (
            <div className="bg-dark-card rounded-3xl shadow-card p-12 flex flex-col items-center justify-center gap-5">
              <div className="text-6xl opacity-50">🎵</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-xl">У вас пока нет постов</div>
                <div className="text-base mt-2">Поделитесь чем-нибудь интересным!</div>
              </div>
              <button 
                className="mt-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all text-base"
                onClick={() => setShowCreate(true)}
              >
                Создать первый пост
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {userPosts.map((post) => (
                <div key={post.id} className="bg-dark-card rounded-3xl shadow-card p-7 flex flex-col gap-5 animate-fade-in animate-scale-in">
                  <div className="flex items-start gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-xl border-2 border-white overflow-hidden flex-shrink-0">
                      {post.avatarUrl ? (
                        <img src={post.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span role="img" aria-label="avatar" className="text-2xl">👤</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-dark-text text-lg">{profile.firstName} {profile.lastName}</div>
                      <div className="text-sm text-dark-muted">{formatPostDate(post.createdAt)}</div>
                    </div>
                    {/* Кнопки редактирования/удаления только для своих постов */}
                    <div className="flex gap-3">
                      <button 
                        title="Редактировать пост" 
                        className="p-3 rounded-2xl bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors"
                        onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}
                      >
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </button>
                      <button 
                        title="Удалить пост" 
                        className="p-3 rounded-2xl bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        onClick={() => onDeletePost(post.id)}
                      >
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-dark-text text-lg whitespace-pre-line leading-relaxed">{post.content}</div>
                  
                  {post.attachmentUrl && (
                    <img src={post.attachmentUrl} alt="attachment" className="max-h-72 rounded-2xl object-contain" />
                  )}
                  
                  <div className="flex flex-wrap gap-3">
                    {post.tags.map((tag, i) => (
                      <span key={i} className="px-4 py-2 bg-dark-bg/60 text-blue-700 rounded-2xl text-sm font-medium">{getInterestPath(tag)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Модальное окно редактирования поста */}
        {editPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-x-hidden">
            <div className="bg-dark-card rounded-3xl shadow-2xl p-7 w-[90vw] max-w-md flex flex-col gap-6 animate-fade-in animate-scale-in">
              <div className="flex justify-between items-center">
                <div className="text-xl font-bold text-dark-text">Редактировать пост</div>
                <button 
                  className="p-3 rounded-2xl hover:bg-dark-bg/60 transition-colors"
                  onClick={() => setEditPost(null)}
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
              </div>
              
              <textarea
                className="w-full border-none rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
                rows={4}
                placeholder="Текст поста"
                value={editPostData.content}
                onChange={e => setEditPostData({ ...editPostData, content: e.target.value })}
              />
              
              <div className="flex flex-col gap-4">
                <div className="text-sm text-dark-muted">Теги:</div>
                <InterestSelector
                  selected={editPostData.tags}
                  onChange={tags => setEditPostData(prev => ({ ...prev, tags }))}
                />
              </div>
              
              <div className="flex gap-4 pt-3">
                <button
                  className="flex-1 py-4 rounded-2xl bg-dark-accent text-white font-semibold shadow active:scale-95 transition-transform"
                  onClick={() => { onUpdatePost(editPost.id, editPostData.content, editPostData.tags); setEditPost(null); }}
                  disabled={!editPostData.content.trim() || editPostData.tags.length === 0}
                >
                  Сохранить
                </button>
                <button
                  className="flex-1 py-4 rounded-2xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform"
                  onClick={() => setEditPost(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно редактирования профиля - Современный дизайн */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-bg/90 p-4 overflow-x-hidden">
            <div className="w-full max-w-md bg-dark-card rounded-3xl shadow-2xl flex flex-col animate-fade-in animate-scale-in relative overflow-hidden max-h-[95vh]">
              {/* Header с градиентом */}
              <div className="flex justify-between items-center p-5 border-b border-dark-bg/30 bg-gradient-to-r from-blue-600 to-cyan-500">
                <div className="text-xl font-bold text-white">Редактировать профиль</div>
                <button 
                  className="p-3 rounded-2xl hover:bg-white/20 transition-colors"
                  onClick={() => setEditOpen(false)}
                >
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="white" strokeWidth="1.5"/></svg>
                </button>
              </div>
              
              {/* Индикатор прогресса */}
              <div className="p-5 bg-dark-bg/20">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-dark-muted">Заполненность профиля</span>
                  <span className="font-medium text-dark-text">{progress}%</span>
                </div>
                <div className="w-full h-2.5 bg-dark-bg/30 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
              
              {/* Прокручиваемый контент */}
              <div className="overflow-y-auto flex-1 p-5">
                {/* Секция аватара */}
                <div className="flex flex-col items-center gap-4 mb-7">
                  <div className="relative">
                    <div className="w-28 h-28 rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-dark-bg/80 flex items-center justify-center">
                      {avatarFile ? (
                        <img src={URL.createObjectURL(avatarFile)} alt="avatar" className="w-full h-full object-cover" />
                      ) : editData.avatarUrl ? (
                        <img src={editData.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span role="img" aria-label="avatar" className="text-5xl">👤</span>
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-400 p-3 rounded-2xl shadow-lg hover:scale-105 transition cursor-pointer" title="Сменить аватар">
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
                  <div className="text-sm text-dark-muted">JPG, PNG, до 3 МБ</div>
                </div>
                
                {/* Форма профиля */}
                <div className="w-full flex flex-col gap-6">
                  {/* Основная информация */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Основная информация</h3>
                    
                    <div className="grid grid-cols-2 gap-5">
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-firstName">Имя</label>
                        <input 
                          id="profile-firstName" 
                          className={`flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 ${errors.firstName ? 'border border-red-500' : ''}`} 
                          value={editData.firstName} 
                          onChange={e => {
                            setEditData({ ...editData, firstName: e.target.value });
                            setErrors((err: any) => ({ ...err, firstName: validateField('firstName', e.target.value) }));
                          }} 
                          placeholder="Имя" 
                          maxLength={40} 
                          autoComplete="given-name" 
                        />
                        {errors.firstName && <div className="text-sm text-red-500">{errors.firstName}</div>}
                      </div>
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-lastName">Фамилия</label>
                        <input 
                          id="profile-lastName" 
                          className={`flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 ${errors.lastName ? 'border border-red-500' : ''}`} 
                          value={editData.lastName} 
                          onChange={e => {
                            setEditData({ ...editData, lastName: e.target.value });
                            setErrors((err: any) => ({ ...err, lastName: validateField('lastName', e.target.value) }));
                          }} 
                          placeholder="Фамилия" 
                          maxLength={40} 
                          autoComplete="family-name" 
                        />
                        {errors.lastName && <div className="text-sm text-red-500">{errors.lastName}</div>}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-bio">О себе</label>
                      <textarea 
                        id="profile-bio" 
                        className="flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 resize-none" 
                        value={editData.bio || ''} 
                        onChange={e => setEditData({ ...editData, bio: e.target.value })} 
                        placeholder="Расскажите немного о себе..." 
                        rows={4} 
                        maxLength={300} 
                      />
                    </div>
                  </div>
                  
                  {/* Местоположение и работа */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Местоположение и работа</h3>
                    
                    <div className="grid grid-cols-2 gap-5">
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-country">Страна</label>
                        <input 
                          id="profile-country" 
                          className="flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4" 
                          value={editData.country || ''} 
                          onChange={e => setEditData({ ...editData, country: e.target.value })} 
                          placeholder="Страна" 
                          maxLength={40} 
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-city">Город</label>
                        <input 
                          id="profile-city" 
                          className="flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4" 
                          value={editData.city || ''} 
                          onChange={e => setEditData({ ...editData, city: e.target.value })} 
                          placeholder="Город" 
                          maxLength={40} 
                          autoComplete="address-level2" 
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-workPlace">Место работы</label>
                      <input 
                        id="profile-workPlace" 
                        className="flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4" 
                        value={editData.workPlace || ''} 
                        onChange={e => setEditData({ ...editData, workPlace: e.target.value })} 
                        placeholder="Место работы" 
                        maxLength={60} 
                      />
                    </div>
                  </div>
                  
                  {/* Навыки и интересы */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Навыки и интересы</h3>
                    
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col gap-3">
                        <div className="text-sm text-dark-muted font-semibold">Навыки</div>
                        <InterestSelector 
                          selected={editData.skills || []} 
                          onChange={skills => {
                            setEditData(prev => ({ ...prev, skills }));
                            setErrors((err: any) => ({ ...err, skills: validateField('skills', skills) }));
                          }} 
                        />
                        {errors.skills && <div className="text-sm text-red-500">{errors.skills}</div>}
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <div className="text-sm text-dark-muted font-semibold">Интересы</div>
                        <InterestSelector 
                          selected={editData.interests || []} 
                          onChange={interests => {
                            setEditData(prev => ({ ...prev, interests }));
                            setErrors((err: any) => ({ ...err, interests: validateField('interests', interests) }));
                          }} 
                        />
                        {errors.interests && <div className="text-sm text-red-500">{errors.interests}</div>}
                      </div>
                    </div>
                  </div>
                  
                  {/* Портфолио */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Портфолио</h3>
                    
                    <div className="flex flex-col gap-4">
                      <textarea 
                        className={`flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 resize-none ${errors.portfolioText ? 'border border-red-500' : ''}`} 
                        value={editData.portfolio?.text || ''} 
                        onChange={e => {
                          setEditData({ ...editData, portfolio: { ...editData.portfolio, text: e.target.value } });
                          setErrors((err: any) => ({ ...err, portfolioText: validateField('portfolioText', e.target.value) }));
                        }} 
                        placeholder="Резюме, достижения, ссылки..." 
                        rows={4} 
                        maxLength={500} 
                      />
                      {errors.portfolioText && <div className="text-sm text-red-500">{errors.portfolioText}</div>}
                      
                      <div className="flex items-center gap-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:opacity-90 transition-colors">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                            <path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
                          </svg>
                          <span className="text-sm">Прикрепить файл</span>
                          <input 
                            type="file" 
                            accept="image/jpeg,image/png,application/pdf" 
                            onChange={e => {
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
                            }} 
                            className="hidden" 
                          />
                        </label>
                        {editData.portfolio?.fileUrl && (
                          <a href={editData.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-sm">Скачать вложение</a>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Контакты */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Контакты</h3>
                    
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-phone">Телефон</label>
                        <input 
                          id="profile-phone" 
                          className={`flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 ${errors.phone ? 'border border-red-500' : ''}`} 
                          value={editData.phone || ''} 
                          onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 11) val = val.slice(0, 11);
                            let formatted = '+7';
                            if (val.length > 1) formatted += ' (' + val.slice(1, 4);
                            if (val.length >= 4) formatted += ') ' + val.slice(4, 7);
                            if (val.length >= 7) formatted += '-' + val.slice(7, 9);
                            if (val.length >= 9) formatted += '-' + val.slice(9, 11);
                            setEditData({ ...editData, phone: formatted });
                            setErrors((err: any) => ({ ...err, phone: validateField('phone', formatted) }));
                          }} 
                          placeholder="+7 (___) ___-__-__" 
                          maxLength={18} 
                        />
                        {errors.phone && <div className="text-sm text-red-500">{errors.phone}</div>}
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <label className="text-sm text-dark-muted font-semibold" htmlFor="profile-email">Email</label>
                        <input 
                          id="profile-email" 
                          className={`flex-1 bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-5 py-4 ${errors.email ? 'border border-red-500' : ''}`} 
                          value={editData.email || ''} 
                          onChange={e => {
                            setEditData({ ...editData, email: e.target.value });
                            setErrors((err: any) => ({ ...err, email: validateField('email', e.target.value) }));
                          }} 
                          placeholder="Email" 
                          maxLength={60} 
                          type="email" 
                          autoComplete="email" 
                        />
                        {errors.email && <div className="text-sm text-red-500">{errors.email}</div>}
                      </div>
                    </div>
                  </div>
                  
                  {/* Социальные сети */}
                  <div className="flex flex-col gap-5">
                    <h3 className="text-lg font-semibold text-dark-text border-b border-dark-bg/30 pb-3">Социальные сети</h3>
                    
                    <div className="flex flex-col gap-4">
                      <SocialLinkEdit
                        label="VK"
                        icon="🟦"
                        value={vkInput}
                        onChange={setVkInput}
                        placeholder="https://vk.com/username"
                        statusText=""
                      />
                      {errors.vkId && <div className="text-sm text-red-500">{errors.vkId}</div>}
                      
                      <SocialLinkEdit
                        label="YouTube"
                        icon="🔴"
                        value={ytInput}
                        onChange={setYtInput}
                        placeholder="https://youtube.com/@username"
                        statusText=""
                      />
                      <SocialLinkEdit
                        label="Telegram"
                        icon="🟩"
                        value={tgInput}
                        onChange={setTgInput}
                        placeholder="https://t.me/username"
                        statusText=""
                      />
                      {errors.youtubeId && <div className="text-sm text-red-500">{errors.youtubeId}</div>}
                      {errors.telegramId && <div className="text-sm text-red-500">{errors.telegramId}</div>}
                    </div>
                  </div>
                </div>
                
                {/* Кнопка сохранить */}
                <div className="sticky bottom-4 left-0 right-0 p-5 bg-gradient-to-t from-dark-bg to-transparent">
                  <button 
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
                    onClick={() => {
                      // Валидация перед сохранением
                      const newErrors: any = {};
                      newErrors.firstName = validateField('firstName', editData.firstName);
                      newErrors.lastName = validateField('lastName', editData.lastName);
                      newErrors.country = validateField('country', editData.country);
                      newErrors.city = validateField('city', editData.city);
                      newErrors.skills = validateField('skills', editData.skills);
                      newErrors.interests = validateField('interests', editData.interests);
                      newErrors.portfolioText = validateField('portfolioText', editData.portfolio?.text || '');
                      newErrors.phone = validateField('phone', editData.phone);
                      newErrors.email = validateField('email', editData.email);
                      newErrors.vkId = validateField('vkId', vkInput);
                      newErrors.youtubeId = validateField('youtubeId', ytInput);
                      newErrors.telegramId = validateField('telegramId', tgInput);
                      
                      setErrors(newErrors);
                      
                      const hasErrors = Object.values(newErrors).some(err => err);
                      if (!hasErrors) {
                        handleSave();
                      } else {
                        toast("Пожалуйста, исправьте ошибки в форме");
                      }
                    }}
                  >
                    Сохранить изменения
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
