import React, { useState } from "react";
import { ProfileView } from "../components/ProfileView";
import { InterestSelector } from "../InterestSelector";
import { formatPostDate, getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";
import { useToast } from "../contexts/ToastContext";

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
        <ProfileView profile={profile} editable onEdit={() => setEditOpen(true)} />
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
                  <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline" onClick={() => {
                    const u = users.find(u => u.userId === post.userId);
                    if (u) onUserClick(u);
                  }}>{(() => {
                    const u = users.find(u => u.userId === post.userId);
                    return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : post.author;
                  })()}</div>
                  <div className="text-xs text-dark-muted ml-auto">{formatPostDate(post.createdAt)}</div>
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