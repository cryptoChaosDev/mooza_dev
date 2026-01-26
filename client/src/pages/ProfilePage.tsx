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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const avatarUrl = profile?.avatar
    ? `${API_URL}${profile.avatar}`
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
      {/* Avatar Section */}
      <div className="bg-slate-800 rounded-2xl p-6">
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center ring-4 ring-slate-900">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-slate-400">
                  {profile?.firstName?.[0]}{profile?.lastName?.[0]}
                </span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 bg-primary-500 hover:bg-primary-600 text-white p-3 rounded-full shadow-lg transition-all transform group-hover:scale-110"
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
          <h2 className="mt-4 text-2xl font-bold">
            {profile?.firstName} {profile?.lastName}
          </h2>
          <p className="text-slate-400 flex items-center gap-1 mt-1">
            <MapPin size={16} />
            {profile?.city || 'Не указан'}
          </p>
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Информация</h3>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="text-primary-400 hover:text-primary-300 transition text-sm"
            >
              Редактировать
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="p-2 hover:bg-slate-700 rounded-lg transition"
                title="Отменить"
              >
                <X size={20} />
              </button>
              <button
                onClick={handleSubmit}
                className="p-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition"
                title="Сохранить"
              >
                <Save size={20} />
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Имя
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Фамилия
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              О себе
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              disabled={!isEditing}
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed resize-none transition"
              placeholder="Расскажите о себе..."
            />
          </div>

          {/* Role & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300 flex items-center gap-1.5">
                <Briefcase size={16} /> Роль
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
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
              <label className="block text-sm font-medium mb-2 text-slate-300 flex items-center gap-1.5">
                <MapPin size={16} /> Город
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                disabled={!isEditing}
                placeholder="Ваш город"
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
              />
            </div>
          </div>

          {/* Quick Stats */}
          {!isEditing && (
            <div className="grid grid-cols-3 gap-3 pt-4">
              <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                <Music className="mx-auto mb-1 text-primary-400" size={20} />
                <div className="text-xs text-slate-400">Жанры</div>
                <div className="font-semibold">{profile?.genres?.length || 0}</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                <Star className="mx-auto mb-1 text-primary-400" size={20} />
                <div className="text-xs text-slate-400">Навыки</div>
                <div className="font-semibold">{profile?.skills?.length || 0}</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                <Briefcase className="mx-auto mb-1 text-primary-400" size={20} />
                <div className="text-xs text-slate-400">Роль</div>
                <div className="font-semibold text-xs truncate">{profile?.role || '—'}</div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Logout */}
      <button
        onClick={() => logout()}
        className="w-full bg-slate-800 hover:bg-red-500/10 text-red-400 hover:text-red-300 border border-slate-700 hover:border-red-500 font-medium py-3 px-4 rounded-xl transition flex items-center justify-center gap-2"
      >
        <LogOut size={20} />
        Выйти
      </button>
    </div>
  );
}
