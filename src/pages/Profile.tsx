import React, { useState, useRef } from "react";
import { useToast } from "../contexts/ToastContext";
import { updateProfile, apiMe } from "../api";
import { ProfileView } from "../components/ProfileView";
import { PostCard } from "../components/PostCard";
import { formatPostDate } from "../utils";
import { UserProfile, Post } from "../types";

export function Profile({ 
  profile, 
  setProfile, 
  allPosts, 
  setAllPosts,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
  onLikePost,
  users,
  setAllUsers,
  friends,
  favorites,
  onUserClick
}: { 
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  allPosts: Post[];
  setAllPosts: (posts: Post[]) => void;
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void;
  onUpdatePost: (id: number, content: string, tags: string[]) => void;
  onDeletePost: (id: number) => void;
  onLikePost: (id: number) => void;
  users: UserProfile[];
  setAllUsers: (users: UserProfile[]) => void;
  friends: string[];
  favorites: string[];
  onUserClick: (user: UserProfile) => void;
}) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(profile);
  const [errors, setErrors] = useState<any>({});
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl || null);
  const [newPost, setNewPost] = useState({ content: "", tags: [] as string[], attachment: null as File | null });
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState<{ content: string; tags: string[] }>({ content: "", tags: [] });
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // skills/interests moved to separate page — no validation here
      case 'portfolioText':
        if (value.length > 500) return 'Максимум 500 символов';
        return '';
      case 'phone':
        if (!value) return 'Обязательное поле';
        // Разрешаем маску +7 (XXX) XXX-XX-XX ИЛИ E.164 +7XXXXXXXXXX (10-15 цифр)
        if (!/^(\+\d{10,15}|\+7 \(\d{3}\) \d{3}-\d{2}-\d{2})$/.test(value)) return 'Формат: +7 (XXX) XXX-XX-XX либо +7XXXXXXXXXX';
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
    { key: 'portfolioText', value: editData.portfolio?.text || '' },
    { key: 'phone', value: editData.phone },
    { key: 'email', value: editData.email },
  ];
  let validCount = 0;
  fieldsToCheck.forEach(f => {
    if (!validateField(f.key, f.value)) validCount++;
  });
  const progress = Math.round((validCount / fieldsToCheck.length) * 100);

  // --- Сохранение профиля ---
  const handleSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast("Ошибка авторизации");
        setLoading(false);
        return;
      }

      // Обновляем профиль на сервере
      const payload: any = {
        firstName: editData.firstName,
        lastName: editData.lastName,
        bio: editData.bio || '',
        workPlace: editData.workPlace || '',
        city: editData.city || '',
        country: editData.country || '',
        phone: editData.phone,
        email: editData.email,
        vkId: editData.vkId,
        youtubeId: editData.youtubeId,
        telegramId: editData.telegramId,
      };

      // Добавляем portfolio только если он существует
      if (editData.portfolio) {
        payload.portfolio = {
          text: editData.portfolio.text || '',
          fileUrl: editData.portfolio.fileUrl,
        };
      }

      const res = await updateProfile(token, payload);
      if (res?.profile) {
        const updatedProfile = {
          ...profile,
          ...res.profile,
          firstName: res.profile.firstName || profile.firstName,
          lastName: res.profile.lastName || profile.lastName,
          name: `${res.profile.firstName || profile.firstName} ${res.profile.lastName || profile.lastName}`.trim(),
          bio: res.profile.bio !== undefined ? res.profile.bio : profile.bio,
          workPlace: res.profile.workPlace !== undefined ? res.profile.workPlace : profile.workPlace,
          city: res.profile.city !== undefined ? res.profile.city : profile.city,
          country: res.profile.country !== undefined ? res.profile.country : profile.country,
          phone: res.profile.phone !== undefined ? res.profile.phone : profile.phone,
          email: res.profile.email !== undefined ? res.profile.email : profile.email,
          vkId: res.profile.vkId !== undefined ? res.profile.vkId : profile.vkId,
          youtubeId: res.profile.youtubeId !== undefined ? res.profile.youtubeId : profile.youtubeId,
          telegramId: res.profile.telegramId !== undefined ? res.profile.telegramId : profile.telegramId,
          portfolio: res.profile.portfolio !== undefined ? res.profile.portfolio : profile.portfolio,
        };
        setProfile(updatedProfile);
        setEditData(updatedProfile);
        setIsEditing(false);
        toast("Профиль успешно обновлён");
        
        // Обновляем данные пользователя в списке всех пользователей
        setAllUsers(users.map(u => u.userId === updatedProfile.userId ? updatedProfile : u));
      } else {
        throw new Error('Не удалось сохранить профиль');
      }
    } catch (err: any) {
      console.error('Error saving profile', err);
      setError(err.message || 'Ошибка при сохранении профиля');
      toast(err.message || 'Ошибка при сохранении профиля');
    } finally {
      setLoading(false);
    }
  };

  // --- Обработка аватара ---
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (!file) return;

    // Проверка размера файла (максимум 5 МБ)
    if (file.size > 5 * 1024 * 1024) {
      toast("Размер файла не должен превышать 5 МБ");
      return;
    }

    // Проверка типа файла
    if (!['image/jpeg','image/png','image/jpg'].includes(file.type)) {
      toast("Поддерживаются только изображения в формате JPG, JPEG или PNG");
      return;
    }

    // Создаем временный элемент img для проверки размеров изображения
    const img = new Image();
    img.onload = () => {
      // Проверка минимальных размеров (400x400)
      if (img.width < 400 || img.height < 400) {
        toast("Изображение должно быть не менее 400x400 пикселей");
        return;
      }

      // Создаем превью
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
        setEditData({ ...editData, avatarUrl: e.target?.result as string });
      };
      reader.readAsDataURL(file);
    };
    img.src = URL.createObjectURL(file);
  };

  // --- Обработка социальных сетей ---
  const handleSocialChange = (field: 'vkId' | 'youtubeId' | 'telegramId', value: string) => {
    // Автоматически добавляем https:// если пользователь не указал протокол
    let formattedValue = value;
    if (value && !/^https?:\/\//.test(value)) {
      formattedValue = `https://${value}`;
    }
    setEditData({ ...editData, [field]: formattedValue });
  };

  // --- Обработка постов ---
  const handleCreatePostSubmit = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
    setShowCreate(false);
    toast("Пост опубликован!");
  };

  const handleEditPostSubmit = () => {
    if (!editPost || !editPostData.content.trim() || editPostData.tags.length === 0) return;
    onUpdatePost(editPost.id, editPostData.content, editPostData.tags);
    setEditPost(null);
    setEditPostData({ content: "", tags: [] });
    toast("Пост обновлён!");
  };

  const userPosts = allPosts.filter(p => p.userId === profile.userId);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6 animate-fade-in px-4">
        {/* Loading overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-dark-card rounded-2xl p-6 flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-dark-text">Сохранение...</div>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-500/90 text-white px-4 py-2 rounded-xl shadow-lg animate-fade-in">
            {error}
          </div>
        )}
        
        {!isEditing ? (
          <ProfileView 
            profile={profile} 
            editable={true} 
            onEdit={() => {
              setEditData(profile);
              setAvatarPreview(profile.avatarUrl || null);
              setIsEditing(true);
            }} 
          />
        ) : (
          <div className="bg-dark-card rounded-3xl shadow-card p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-dark-text">Редактирование профиля</h2>
              <button 
                className="text-dark-muted hover:text-dark-text transition-colors"
                onClick={() => setIsEditing(false)}
                aria-label="Отменить редактирование профиля"
              >
                Отмена
              </button>
            </div>
            
            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-dark-muted">Прогресс заполнения</span>
                <span className="text-dark-text font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-dark-bg/60 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
            
            <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-dark-bg/80 flex items-center justify-center">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span role="img" aria-label="avatar" className="text-3xl">👤</span>
                    )}
                  </div>
                  <button
                    className="absolute -bottom-2 -right-2 p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg hover:opacity-90 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Изменить аватар"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#fff" strokeWidth="1.5"/></svg>
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleAvatarChange}
                  aria-label="Загрузить новое изображение аватара"
                />
                <div className="text-xs text-dark-muted text-center max-w-xs">
                  JPG, PNG не более 5 МБ. Минимальный размер 400x400 пикселей.
                </div>
              </div>
              
              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Имя</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.firstName ? 'border border-red-500' : ''}`}
                    value={editData.firstName} 
                    onChange={e => {
                      setEditData({ ...editData, firstName: e.target.value });
                      setErrors((err: any) => ({ ...err, firstName: validateField('firstName', e.target.value) }));
                    }} 
                    placeholder="Имя" 
                    maxLength={40}
                  />
                  {errors.firstName && <div className="text-sm text-red-500 mt-1">{errors.firstName}</div>}
                </div>
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Фамилия</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.lastName ? 'border border-red-500' : ''}`}
                    value={editData.lastName} 
                    onChange={e => {
                      setEditData({ ...editData, lastName: e.target.value });
                      setErrors((err: any) => ({ ...err, lastName: validateField('lastName', e.target.value) }));
                    }} 
                    placeholder="Фамилия" 
                    maxLength={40}
                  />
                  {errors.lastName && <div className="text-sm text-red-500 mt-1">{errors.lastName}</div>}
                </div>
              </div>
              
              {/* Bio */}
              <div>
                <label className="block text-sm text-dark-muted font-semibold mb-2">О себе</label>
                <textarea 
                  className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 resize-none"
                  value={editData.bio || ''} 
                  onChange={e => setEditData({ ...editData, bio: e.target.value })} 
                  placeholder="Расскажите немного о себе" 
                  rows={3}
                  maxLength={1000}
                />
              </div>
              
              {/* Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Страна</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.country ? 'border border-red-500' : ''}`}
                    value={editData.country || ''} 
                    onChange={e => {
                      setEditData({ ...editData, country: e.target.value });
                      setErrors((err: any) => ({ ...err, country: validateField('country', e.target.value) }));
                    }} 
                    placeholder="Страна" 
                    maxLength={50}
                  />
                  {errors.country && <div className="text-sm text-red-500 mt-1">{errors.country}</div>}
                </div>
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Город</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.city ? 'border border-red-500' : ''}`}
                    value={editData.city || ''} 
                    onChange={e => {
                      setEditData({ ...editData, city: e.target.value });
                      setErrors((err: any) => ({ ...err, city: validateField('city', e.target.value) }));
                    }} 
                    placeholder="Город" 
                    maxLength={50}
                  />
                  {errors.city && <div className="text-sm text-red-500 mt-1">{errors.city}</div>}
                </div>
              </div>
              
              {/* Work */}
              <div>
                <label className="block text-sm text-dark-muted font-semibold mb-2">Место работы</label>
                <input 
                  className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3"
                  value={editData.workPlace || ''} 
                  onChange={e => setEditData({ ...editData, workPlace: e.target.value })} 
                  placeholder="Где вы работаете?" 
                  maxLength={100}
                />
              </div>
              
              {/* Portfolio */}
              <div>
                <label className="block text-sm text-dark-muted font-semibold mb-2">Портфолио</label>
                <textarea 
                  className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 resize-none"
                  value={editData.portfolio?.text || ''} 
                  onChange={e => setEditData({ ...editData, portfolio: { ...editData.portfolio, text: e.target.value } })} 
                  placeholder="Расскажите о вашем творчестве, опыте, достижениях" 
                  rows={3}
                  maxLength={500}
                />
              </div>
              
              {/* Contacts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Телефон</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.phone ? 'border border-red-500' : ''}`}
                    value={editData.phone || ''} 
                    onChange={e => {
                      // Форматирование телефона
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
                  {errors.phone && <div className="text-sm text-red-500 mt-1">{errors.phone}</div>}
                </div>
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Email</label>
                  <input 
                    className={`w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 ${errors.email ? 'border border-red-500' : ''}`}
                    value={editData.email || ''} 
                    onChange={e => {
                      setEditData({ ...editData, email: e.target.value });
                      setErrors((err: any) => ({ ...err, email: validateField('email', e.target.value) }));
                    }} 
                    placeholder="Email" 
                    maxLength={60}
                    type="email"
                  />
                  {errors.email && <div className="text-sm text-red-500 mt-1">{errors.email}</div>}
                </div>
              </div>
              
              {/* Social Links */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">VK</label>
                  <input 
                    className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3"
                    value={editData.vkId || ''} 
                    onChange={e => handleSocialChange('vkId', e.target.value)} 
                    placeholder="Ссылка на VK" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">YouTube</label>
                  <input 
                    className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3"
                    value={editData.youtubeId || ''} 
                    onChange={e => handleSocialChange('youtubeId', e.target.value)} 
                    placeholder="Ссылка на YouTube" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted font-semibold mb-2">Telegram</label>
                  <input 
                    className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3"
                    value={editData.telegramId || ''} 
                    onChange={e => handleSocialChange('telegramId', e.target.value)} 
                    placeholder="Ссылка на Telegram" 
                  />
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button 
                  className="flex-1 py-3 rounded-2xl bg-dark-bg/60 text-dark-text font-medium hover:bg-dark-bg/80 transition-all"
                  onClick={() => setIsEditing(false)}
                >
                  Отмена
                </button>
                <button 
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  onClick={() => {
                    // Валидация перед сохранением
                    const newErrors: any = {};
                    newErrors.firstName = validateField('firstName', editData.firstName);
                    newErrors.lastName = validateField('lastName', editData.lastName);
                    newErrors.country = validateField('country', editData.country);
                    newErrors.city = validateField('city', editData.city);
                    // skills/interests are edited on the separate /skills page
                    newErrors.portfolioText = validateField('portfolioText', editData.portfolio?.text || '');
                    newErrors.phone = validateField('phone', editData.phone);
                    newErrors.email = validateField('email', editData.email);

                    
                    setErrors(newErrors);
                    
                    const hasErrors = Object.values(newErrors).some(err => err);
                    if (!hasErrors) {
                      handleSave();
                    } else {
                      toast("Пожалуйста, исправьте ошибки в форме");
                    }
                  }}
                  disabled={loading}
                  aria-label="Сохранить изменения в профиле"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Posts Section */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark-text">Мои посты</h2>
            <button 
              className="text-sm text-dark-accent hover:underline"
              onClick={() => setShowCreate(true)}
              aria-label="Создать новый пост"
            >
              Создать пост
            </button>
          </div>
          
          {showCreate && (
            <div className="bg-dark-card rounded-3xl shadow-card p-5 mb-6 animate-fade-in">
              <textarea
                className="w-full bg-dark-bg/60 outline-none text-base text-dark-text rounded-2xl px-4 py-3 mb-3 resize-none"
                placeholder="О чём думаете?"
                value={newPost.content}
                onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                rows={3}
                aria-label="Текст нового поста"
              />
              <div className="flex justify-between items-center">
                <div className="text-sm text-dark-muted">
                  {newPost.tags.length > 0 ? `${newPost.tags.length} тегов` : 'Добавьте теги'}
                </div>
                <div className="flex gap-2">
                  <button 
                    className="px-4 py-2 rounded-2xl bg-dark-bg/60 text-dark-text text-sm font-medium hover:bg-dark-bg/80 transition-all"
                    onClick={() => setShowCreate(false)}
                    aria-label="Отменить создание поста"
                  >
                    Отмена
                  </button>
                  <button 
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                    onClick={handleCreatePostSubmit}
                    disabled={!newPost.content.trim() || newPost.tags.length === 0}
                    aria-label="Опубликовать пост"
                  >
                    Опубликовать
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            {userPosts.length === 0 ? (
              <div className="bg-dark-card rounded-3xl shadow-card p-8 text-center">
                <div className="text-dark-muted mb-2">Пока нет постов</div>
                <button 
                  className="text-dark-accent hover:underline text-sm"
                  onClick={() => setShowCreate(true)}
                >
                  Создать первый пост
                </button>
              </div>
            ) : (
              userPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  users={users}
                  isOwn={true}
                  onEdit={() => {
                    setEditPost(post);
                    setEditPostData({ content: post.content, tags: post.tags });
                  }}
                  onDelete={() => onDeletePost(post.id)}
                  onLike={() => onLikePost(post.id)}
                  onUserClick={() => {}}
                />
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}