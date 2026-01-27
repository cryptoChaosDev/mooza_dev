import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    bio: '',
    city: '',
    role: '',
    genres: [] as string[],
    skills: [] as string[],
    vkLink: '',
    youtubeLink: '',
    telegramLink: '',
  });

  // Fetch current user data
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await userAPI.getMe();
      setFormData({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        bio: data.bio || '',
        city: data.city || '',
        role: data.role || '',
        genres: data.genres || [],
        skills: data.skills || [],
        vkLink: data.vkLink || '',
        youtubeLink: data.youtubeLink || '',
        telegramLink: data.telegramLink || '',
      });
      return data;
    },
  });

  // Upload avatar mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await userAPI.uploadAvatar(formData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: userAPI.updateMe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setIsEditing(false);
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAvatarMutation.mutate(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30"></div>
          <p className="text-slate-400 mt-4">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  const avatarUrl = profile?.avatar
    ? `${API_URL}${profile.avatar}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Avatar Section */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 shadow-xl">
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="w-36 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center ring-4 ring-slate-900/50 shadow-2xl">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-5xl font-bold text-slate-400">
                    {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2 right-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white p-3 rounded-xl shadow-xl shadow-primary-500/30 transition-all transform group-hover:scale-110"
              >
                <Camera size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <h2 className="mt-6 text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
              {profile?.firstName} {profile?.lastName}
            </h2>
            <p className="text-slate-400 flex items-center gap-2 mt-2">
              <MapPin size={18} />
              {profile?.city || 'Город не указан'}
            </p>
          </div>
        </div>

        {/* Profile Info */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-white">Информация</h3>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-gradient-to-r from-primary-500/20 to-primary-600/20 text-primary-300 rounded-xl text-sm font-medium border border-primary-500/30 hover:border-primary-500/50 transition-all hover:scale-105"
              >
                Редактировать
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="p-3 hover:bg-slate-700/50 rounded-xl transition-all hover:scale-110"
                  title="Отменить"
                >
                  <X size={20} />
                </button>
                <button
                  onClick={handleSubmit}
                  className="p-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl transition-all hover:scale-110 shadow-lg shadow-primary-500/30"
                  title="Сохранить"
                >
                  <Save size={20} />
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-300">
                  Имя
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-300">
                  Фамилия
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-slate-300">
                О себе
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                disabled={!isEditing}
                rows={4}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed resize-none transition text-white"
                placeholder="Расскажите о себе..."
              />
            </div>

            {/* Role & City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-300 flex items-center gap-2">
                  <Briefcase size={18} /> Роль
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                >
                  <option value="">Выберите роль</option>
                  <option value="Продюсер">Продюсер</option>
                  <option value="Вокалист">Вокалист</option>
                  <option value="Битмейкер">Битмейкер</option>
                  <option value="Композитор">Композитор</option>
                  <option value="Саунд-дизайнер">Саунд-дизайнер</option>
                  <option value="Диджей">Диджей</option>
                  <option value="Звукорежиссер">Звукорежиссер</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-300 flex items-center gap-2">
                  <MapPin size={18} /> Город
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Ваш город"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
            </div>

            {/* Quick Stats */}
            {!isEditing && (
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
                  <Music className="mx-auto mb-2 text-primary-400" size={24} />
                  <div className="text-xs text-slate-400 font-medium">Жанры</div>
                  <div className="text-xl font-bold text-white mt-1">{profile?.genres?.length || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
                  <Star className="mx-auto mb-2 text-primary-400" size={24} />
                  <div className="text-xs text-slate-400 font-medium">Навыки</div>
                  <div className="text-xl font-bold text-white mt-1">{profile?.skills?.length || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
                  <Briefcase className="mx-auto mb-2 text-primary-400" size={24} />
                  <div className="text-xs text-slate-400 font-medium">Роль</div>
                  <div className="text-sm font-bold text-white mt-1 truncate">{profile?.role || '—'}</div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Logout */}
        <button
          onClick={() => logout()}
          className="w-full bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm hover:from-red-500/10 hover:to-red-600/10 text-red-400 hover:text-red-300 border border-slate-700/50 hover:border-red-500/50 font-semibold py-4 px-4 rounded-2xl transition-all hover:scale-105 flex items-center justify-center gap-3 shadow-xl"
        >
          <LogOut size={22} />
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
