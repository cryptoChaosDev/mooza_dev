import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../contexts/ToastContext";
import { updateProfile, apiMe, API_URL } from "../api";
import { ProfileView } from "../components/ProfileView";
import { PostCard } from "../components/PostCard";
import { formatPostDate, getInterestPath } from "../utils";
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
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState<'profile' | 'posts'>('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize editData when profile changes
  useEffect(() => {
    setEditData(profile);
    setAvatarPreview(profile.avatarUrl || null);
  }, [profile]);

  // --- Phone number formatting ---
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Take only first 11 digits (for +7XXXXXXXXXX format)
    const trimmed = phoneNumber.substring(0, 11);
    
    // Format according to +7 (XXX) XXX-XX-XX
    let formatted = '';
    if (trimmed.length > 0) {
      formatted = '+7';
      if (trimmed.length >= 2) {
        formatted += ' (' + trimmed.substring(1, 4);
      }
      if (trimmed.length >= 5) {
        formatted += ') ' + trimmed.substring(4, 7);
      }
      if (trimmed.length >= 8) {
        formatted += '-' + trimmed.substring(7, 9);
      }
      if (trimmed.length >= 10) {
        formatted += '-' + trimmed.substring(9, 11);
      }
    }
    
    return formatted;
  };

  // --- Handle phone number input ---
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setEditData({...editData, phone: formatted});
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
      case 'portfolioText':
        if (value && value.length > 500) return 'Максимум 500 символов';
        return '';
      case 'phone':
        if (!value) return 'Обязательное поле';
        // Check if it matches the format +7 (XXX) XXX-XX-XX
        if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value)) return 'Формат: +7 (XXX) XXX-XX-XX';
        return '';
      case 'email':
        if (!value) return 'Обязательное поле';
        if (!/^\S+@\S+\.\S+$/.test(value)) return 'Некорректный email';
        return '';
      case 'vkId':
      case 'youtubeId':
      case 'telegramId':
        if (value && value.trim() !== '' && !/^https?:\/\//.test(value)) return 'Введите ссылку, начиная с https://';
        return '';
      default:
        return '';
    }
  }

  // --- Прогресс заполнения ---
  const calculateProgress = () => {
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
    
    return Math.round((validCount / fieldsToCheck.length) * 100);
  };

  const progress = calculateProgress();

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

      // Validate all fields before saving
      const newErrors: any = {};
      const fieldsToValidate = [
        { key: 'firstName', value: editData.firstName },
        { key: 'lastName', value: editData.lastName },
        { key: 'country', value: editData.country },
        { key: 'city', value: editData.city },
        { key: 'phone', value: editData.phone },
        { key: 'email', value: editData.email },
      ];

      fieldsToValidate.forEach(({ key, value }) => {
        const error = validateField(key, value);
        if (error) {
          newErrors[key] = error;
        }
      });

      // Also validate portfolio text separately
      const portfolioTextError = validateField('portfolioText', editData.portfolio?.text);
      if (portfolioTextError) {
        newErrors['portfolioText'] = portfolioTextError;
      }

      // Validate social links only if they have values
      const socialFields = [
        { key: 'vkId', value: editData.vkId },
        { key: 'youtubeId', value: editData.youtubeId },
        { key: 'telegramId', value: editData.telegramId },
      ];

      socialFields.forEach(({ key, value }) => {
        if (value && value.trim() !== '') {
          const error = validateField(key, value);
          if (error) {
            newErrors[key] = error;
          }
        }
      });

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        toast("Пожалуйста, исправьте ошибки в форме");
        setLoading(false);
        return;
      }

      // Clear errors if validation passes
      setErrors({});

      // Обновляем профиль на сервере
      const payload: any = {
        firstName: editData.firstName,
        lastName: editData.lastName,
        avatarUrl: editData.avatarUrl || '',
        bio: editData.bio || '',
        workPlace: editData.workPlace || '',
        city: editData.city || '',
        country: editData.country || '',
        phone: editData.phone,
        email: editData.email,
        vkId: editData.vkId || '',
        youtubeId: editData.youtubeId || '',
        telegramId: editData.telegramId || '',
      };

      // Добавляем portfolio только если он существует
      if (editData.portfolio) {
        payload.portfolio = {
          text: editData.portfolio.text || '',
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
          avatarUrl: res.profile.avatarUrl !== undefined ? res.profile.avatarUrl : profile.avatarUrl,
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
        
        // Dispatch event to refresh profile in other components
        window.dispatchEvent(new CustomEvent('profileUpdated'));
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
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    img.onload = async () => {
      // Проверка минимальных размеров (400x400)
      if (img.width < 400 || img.height < 400) {
        toast("Изображение должно быть не менее 400x400 пикселей");
        return;
      }

      try {
        // Upload avatar to server
        const token = localStorage.getItem('token');
        if (!token) {
          toast("Ошибка авторизации");
          return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/profile/me/avatar`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error('Не удалось загрузить аватар');
        }

        const result = await response.json();
      
        // Set preview and update editData with the avatar URL returned from server
        setAvatarPreview(result.avatarUrl);
        setEditData({ ...editData, avatarUrl: result.avatarUrl });
      } catch (error) {
        console.error('Error uploading avatar:', error);
        toast("Ошибка при загрузке аватара");
      }
    };
    img.src = URL.createObjectURL(file);
  };

  // --- Обработка социальных сетей ---
  const handleSocialChange = (field: 'vkId' | 'youtubeId' | 'telegramId', value: string) => {
    // Автоматически добавляем https:// если пользователь не указал протокол
    let formattedValue = value;
    if (value && value.trim() !== '' && !/^https?:\/\//.test(value)) {
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

  // --- Форматирование ошибок ---
  const renderError = (field: string) => {
    if (errors[field]) {
      return <div className="text-red-500 text-xs mt-1">{errors[field]}</div>;
    }
    return null;
  };

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md px-4">
        {/* Profile header with tabs */}
        <div className="bg-dark-card rounded-3xl shadow-card p-6 mb-6">
          <div className="flex flex-col items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-3xl border-4 border-white shadow-xl">
                {avatarPreview ? (
                  <img src={avatarPreview.startsWith('http') ? avatarPreview : `${API_URL}${avatarPreview}`} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span role="img" aria-label="avatar">👤</span>
                )}
              </div>
              {isEditing && (
                <button 
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-center text-white shadow-lg"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.066H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
              />
            </div>
            
            {/* Name */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-dark-text">
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <input
                      className={`text-center bg-dark-bg/60 rounded-xl px-3 py-1 text-dark-text ${errors.firstName ? 'border border-red-500' : ''}`}
                      value={editData.firstName || ''}
                      onChange={e => setEditData({...editData, firstName: e.target.value})}
                      placeholder="Имя"
                    />
                    {renderError('firstName')}
                    <input
                      className={`text-center bg-dark-bg/60 rounded-xl px-3 py-1 text-dark-text ${errors.lastName ? 'border border-red-500' : ''}`}
                      value={editData.lastName || ''}
                      onChange={e => setEditData({...editData, lastName: e.target.value})}
                      placeholder="Фамилия"
                    />
                    {renderError('lastName')}
                  </div>
                ) : (
                  `${profile.firstName || ''} ${profile.lastName || ''}`
                )}
              </h1>
              {(profile.city || profile.country) && (
                <div className="text-blue-400 text-sm font-medium flex items-center justify-center gap-1.5 mt-1">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
                  </svg>
                  {[profile.country, profile.city].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            
            {/* Progress bar */}
            {isEditing && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-dark-muted mb-1">
                  <span>Заполненность профиля</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-dark-bg/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {/* Edit/Save buttons */}
            <div className="flex gap-3">
              {isEditing ? (
                <>
                  <button
                    className="px-4 py-2 rounded-2xl bg-dark-bg/60 text-dark-text font-medium text-sm hover:bg-dark-bg/80 transition-colors"
                    onClick={() => {
                      setIsEditing(false);
                      setEditData(profile);
                      setAvatarPreview(profile.avatarUrl || null);
                      setErrors({});
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-medium text-sm hover:opacity-90 transition-all flex items-center gap-2"
                    onClick={handleSave}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Сохранение...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Сохранить
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-medium text-sm hover:opacity-90 transition-all flex items-center gap-2"
                  onClick={() => setIsEditing(true)}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.066H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Редактировать
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex mb-6 bg-dark-bg/40 rounded-2xl p-1">
          <button
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-muted'}`}
            onClick={() => setActiveTab('profile')}
          >
            Профиль
          </button>
          <button
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'posts' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-muted'}`}
            onClick={() => setActiveTab('posts')}
          >
            Посты ({allPosts.filter(p => p.userId === profile.userId).length})
          </button>
        </div>
        
        {/* Tab content */}
        {activeTab === 'profile' ? (
          <div className="bg-dark-card rounded-3xl shadow-card p-6">
            {isEditing ? (
              // Edit mode
              <div className="flex flex-col gap-6">
                {/* Bio */}
                <div>
                  <label className="block text-sm font-semibold text-dark-muted mb-2">О себе</label>
                  <textarea
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner"
                    rows={4}
                    value={editData.bio || ''}
                    onChange={e => setEditData({...editData, bio: e.target.value})}
                    placeholder="Расскажите немного о себе..."
                  />
                </div>
                
                {/* Work place */}
                <div>
                  <label className="block text-sm font-semibold text-dark-muted mb-2">Место работы</label>
                  <input
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner"
                    value={editData.workPlace || ''}
                    onChange={e => setEditData({...editData, workPlace: e.target.value})}
                    placeholder="Где вы работаете?"
                  />
                </div>
                
                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-dark-muted mb-2">Страна *</label>
                    <input
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner ${errors.country ? 'border border-red-500' : ''}`}
                      value={editData.country || ''}
                      onChange={e => setEditData({...editData, country: e.target.value})}
                      placeholder="Страна"
                    />
                    {renderError('country')}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-dark-muted mb-2">Город *</label>
                    <input
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner ${errors.city ? 'border border-red-500' : ''}`}
                      value={editData.city || ''}
                      onChange={e => setEditData({...editData, city: e.target.value})}
                      placeholder="Город"
                    />
                    {renderError('city')}
                  </div>
                </div>
                
                {/* Contact info */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-dark-muted mb-2">Телефон *</label>
                    <input
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner ${errors.phone ? 'border border-red-500' : ''}`}
                      value={editData.phone || ''}
                      onChange={handlePhoneChange}
                      placeholder="+7 (XXX) XXX-XX-XX"
                    />
                    {renderError('phone')}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-dark-muted mb-2">Email *</label>
                    <input
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner ${errors.email ? 'border border-red-500' : ''}`}
                      value={editData.email || ''}
                      onChange={e => setEditData({...editData, email: e.target.value})}
                      placeholder="your@email.com"
                    />
                    {renderError('email')}
                  </div>
                </div>
                
                {/* Portfolio */}
                <div>
                  <label className="block text-sm font-semibold text-dark-muted mb-2">Портфолио</label>
                  <textarea
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm shadow-inner ${errors.portfolioText ? 'border border-red-500' : ''}`}
                    rows={3}
                    value={editData.portfolio?.text || ''}
                    onChange={e => setEditData({
                      ...editData, 
                      portfolio: {...editData.portfolio, text: e.target.value}
                    })}
                    placeholder="Расскажите о ваших работах, проектах, достижениях..."
                  />
                  {renderError('portfolioText')}
                </div>
                
                {/* Social links */}
                <div className="flex flex-col gap-3">
                  <label className="block text-sm font-semibold text-dark-muted mb-2">Социальные сети</label>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20">VK:</span>
                        <input
                          className={`flex-1 px-3 py-2 rounded-xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm ${errors.vkId ? 'border border-red-500' : ''}`}
                          value={editData.vkId || ''}
                          onChange={e => handleSocialChange('vkId', e.target.value)}
                          placeholder="https://vk.com/username"
                        />
                      </div>
                      {renderError('vkId')}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20">YouTube:</span>
                        <input
                          className={`flex-1 px-3 py-2 rounded-xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm ${errors.youtubeId ? 'border border-red-500' : ''}`}
                          value={editData.youtubeId || ''}
                          onChange={e => handleSocialChange('youtubeId', e.target.value)}
                          placeholder="https://youtube.com/channel/id"
                        />
                      </div>
                      {renderError('youtubeId')}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20">Telegram:</span>
                        <input
                          className={`flex-1 px-3 py-2 rounded-xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm ${errors.telegramId ? 'border border-red-500' : ''}`}
                          value={editData.telegramId || ''}
                          onChange={e => handleSocialChange('telegramId', e.target.value)}
                          placeholder="https://t.me/username"
                        />
                      </div>
                      {renderError('telegramId')}
                    </div>
                  </div>
                </div>
                
                {/* Skills and interests link */}
                <div className="pt-2">
                  <button
                    className="w-full py-3 rounded-2xl bg-dark-bg/60 text-dark-text font-medium text-sm hover:bg-dark-bg/80 transition-colors"
                    onClick={() => navigate('/skills')}
                  >
                    Редактировать навыки и интересы
                  </button>
                </div>
              </div>
            ) : (
              // View mode
              <div className="flex flex-col gap-6">
                {/* Bio */}
                {profile.bio && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">О себе</div>
                    <div className="text-dark-text whitespace-pre-line bg-dark-bg/30 rounded-2xl p-4 shadow-inner">
                      {profile.bio}
                    </div>
                  </div>
                )}
                
                {/* Work place */}
                {profile.workPlace && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Место работы</div>
                    <div className="text-dark-text bg-dark-bg/30 rounded-2xl px-4 py-3 shadow-inner flex items-center gap-2">
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                        <path d="M3 21h18v-2H3v2zM19 9h-2V7h2v2zm0-4h-2V3h2v2zm-4 8h-2v-2h2v2zm0-4h-2V7h2v2zm0-4h-2V3h2v2zm-8 8H5v-2h2v2zm0-4H5V7h2v2zm0-4H5V3h2v2zm-4 8h2v2H3v-2h2v-2H3v2zm16 0h2v2h-2v-2zm0-2v-2h2v2h-2z" fill="currentColor"/>
                      </svg>
                      <span>{profile.workPlace}</span>
                    </div>
                  </div>
                )}
                
                {/* Location */}
                {(profile.country || profile.city) && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Местоположение</div>
                    <div className="text-dark-text bg-dark-bg/30 rounded-2xl px-4 py-3 shadow-inner flex items-center gap-2">
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/>
                      </svg>
                      <span>{[profile.country, profile.city].filter(Boolean).join(', ')}</span>
                    </div>
                  </div>
                )}
                
                {/* Contact info */}
                {(profile.phone || profile.email) && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Контакты</div>
                    <div className="flex flex-col gap-2">
                      {profile.phone && (
                        <div className="text-dark-text bg-dark-bg/30 rounded-2xl px-4 py-3 shadow-inner flex items-center gap-2">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                            <path d="M3 7c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V7zm3 2h12v8H6V9zm2 2v2h2v-2H8zm4 0v2h2v-2h-2z" fill="currentColor"/>
                          </svg>
                          <span>{profile.phone}</span>
                        </div>
                      )}
                      {profile.email && (
                        <div className="text-dark-text bg-dark-bg/30 rounded-2xl px-4 py-3 shadow-inner flex items-center gap-2">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                            <path d="M3 3h18v18H3V3zm4.2 7.2l3.8 2.4 3.8-2.4c.4-.3.9 0 1.1.4l.1.2v5.2c0 .5-.5.9-1 .9H7c-.5 0-1-.4-1-.9V9.8c0-.4.5-.7.9-.5l.3.2z" fill="currentColor"/>
                          </svg>
                          <span>{profile.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Portfolio */}
                {profile.portfolio?.text && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Портфолио</div>
                    <div className="text-dark-text whitespace-pre-line bg-dark-bg/30 rounded-2xl p-4 shadow-inner">
                      {profile.portfolio.text}
                    </div>
                  </div>
                )}
                
                {/* Skills */}
                {profile.skills && profile.skills.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Навыки</div>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-2xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm">
                          {getInterestPath(skill)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Interests */}
                {profile.interests && profile.interests.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Интересы</div>
                    <div className="flex flex-wrap gap-2">
                      {profile.interests.map((interest, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-2xl text-sm font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-400/30 shadow-sm">
                          {getInterestPath(interest)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Social links */}
                {(profile.vkId || profile.youtubeId || profile.telegramId) && (
                  <div>
                    <div className="text-sm font-semibold text-dark-muted mb-2">Социальные сети</div>
                    <div className="flex flex-wrap gap-3">
                      {profile.vkId && (
                        <a 
                          href={profile.vkId} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <span>VK</span>
                        </a>
                      )}
                      {profile.youtubeId && (
                        <a 
                          href={profile.youtubeId} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <span>YouTube</span>
                        </a>
                      )}
                      {profile.telegramId && (
                        <a 
                          href={profile.telegramId} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors"
                        >
                          <span>Telegram</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Posts tab
          <div className="flex flex-col gap-5">
            {allPosts.filter(p => p.userId === profile.userId).length === 0 ? (
              <div className="bg-dark-card rounded-3xl shadow-card p-8 flex flex-col items-center justify-center gap-4">
                <div className="text-5xl opacity-50">📝</div>
                <div className="text-center text-dark-muted">
                  <div className="font-semibold text-xl">У вас пока нет постов</div>
                  <div className="text-base mt-2">Создайте свой первый пост!</div>
                </div>
                <button 
                  className="mt-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all text-base hover:scale-105"
                  onClick={() => setShowCreate(true)}
                >
                  Создать пост
                </button>
              </div>
            ) : (
              allPosts
                .filter(p => p.userId === profile.userId)
                .map(post => (
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
                  />
                ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}
