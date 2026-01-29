import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, Phone, Mail, Building2, User, Search, Check
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    bio: '',
    country: '',
    city: '',
    role: '',
    genres: [] as string[],
    vkLink: '',
    youtubeLink: '',
    telegramLink: '',
    fieldOfActivityId: '',
    employerId: '',
    userProfessions: [] as { professionId: string; features: string[] }[],
    artistIds: [] as string[],
  });

  // Reference data for editing
  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [professions, setProfessions] = useState<any[]>([]);
  const [professionFeatures, setProfessionFeatures] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [employers, setEmployers] = useState<any[]>([]);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchEmployer, setSearchEmployer] = useState('');

  // Load references when editing
  useEffect(() => {
    if (isEditing) {
      referenceAPI.getFieldsOfActivity().then(r => setFieldsOfActivity(r.data));
      referenceAPI.getProfessionFeatures().then(r => setProfessionFeatures(r.data));
      referenceAPI.getArtists({}).then(r => setArtists(r.data));
      referenceAPI.getEmployers({}).then(r => setEmployers(r.data));
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && formData.fieldOfActivityId) {
      referenceAPI.getProfessions({ fieldOfActivityId: formData.fieldOfActivityId })
        .then(r => setProfessions(r.data));
    }
  }, [isEditing, formData.fieldOfActivityId]);

  useEffect(() => {
    if (isEditing) {
      referenceAPI.getArtists({ search: searchArtist }).then(r => setArtists(r.data));
    }
  }, [searchArtist, isEditing]);

  useEffect(() => {
    if (isEditing) {
      referenceAPI.getEmployers({ search: searchEmployer }).then(r => setEmployers(r.data));
    }
  }, [searchEmployer, isEditing]);

  // Fetch current user data
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await userAPI.getMe();
      setFormData({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        nickname: data.nickname || '',
        bio: data.bio || '',
        country: data.country || '',
        city: data.city || '',
        role: data.role || '',
        genres: data.genres || [],
        vkLink: data.vkLink || '',
        youtubeLink: data.youtubeLink || '',
        telegramLink: data.telegramLink || '',
        fieldOfActivityId: data.fieldOfActivityId || '',
        employerId: data.employerId || '',
        userProfessions: data.userProfessions?.map((up: any) => ({
          professionId: up.professionId || up.profession?.id,
          features: up.features || [],
        })) || [],
        artistIds: data.userArtists?.map((ua: any) => ua.artistId || ua.artist?.id) || [],
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
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
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
            {profile?.nickname && (
              <p className="text-slate-400 text-sm mt-1">@{profile.nickname}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-slate-400 text-sm">
              {profile?.country && (
                <span className="flex items-center gap-1">
                  <Globe size={14} />
                  {profile.country}
                </span>
              )}
              {profile?.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {profile.city}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
            <Briefcase className="mx-auto mb-1 text-primary-400" size={20} />
            <div className="text-xs text-slate-400">Сфера</div>
            <div className="text-sm font-bold text-white mt-0.5 truncate">{profile?.fieldOfActivity?.name || '—'}</div>
          </div>
          <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
            <Star className="mx-auto mb-1 text-primary-400" size={20} />
            <div className="text-xs text-slate-400">Профессии</div>
            <div className="text-xl font-bold text-white mt-0.5">{profile?.userProfessions?.length || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
            <Music className="mx-auto mb-1 text-primary-400" size={20} />
            <div className="text-xs text-slate-400">Артисты</div>
            <div className="text-xl font-bold text-white mt-0.5">{profile?.userArtists?.length || 0}</div>
          </div>
          <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-4 text-center border border-slate-600/30 shadow-lg">
            <Building2 className="mx-auto mb-1 text-primary-400" size={20} />
            <div className="text-xs text-slate-400">Работодатель</div>
            <div className="text-sm font-bold text-white mt-0.5 truncate">{profile?.employer?.name || '—'}</div>
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

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">Имя</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">Фамилия</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
            </div>

            {/* Nickname */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">Никнейм</label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                disabled={!isEditing}
                placeholder="nickname"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">О себе</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                disabled={!isEditing}
                rows={3}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed resize-none transition text-white"
                placeholder="Расскажите о себе..."
              />
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <Globe size={14} /> Страна
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Россия"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <MapPin size={14} /> Город
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  disabled={!isEditing}
                  placeholder="Москва"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                />
              </div>
            </div>

            {/* Field of Activity (edit mode) */}
            {isEditing && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <Briefcase size={14} /> Сфера деятельности
                </label>
                <div className="space-y-1">
                  {fieldsOfActivity.map((field: any) => (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        fieldOfActivityId: formData.fieldOfActivityId === field.id ? '' : field.id,
                      })}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all text-left text-sm ${
                        formData.fieldOfActivityId === field.id
                          ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
                          : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        formData.fieldOfActivityId === field.id ? 'bg-primary-500 border-primary-500' : 'border-slate-500'
                      }`}>
                        {formData.fieldOfActivityId === field.id && <Check size={10} className="text-white" />}
                      </div>
                      {field.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Professions (edit mode) */}
            {isEditing && formData.fieldOfActivityId && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <Star size={14} /> Профессии
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {professions.map((prof: any) => {
                    const idx = formData.userProfessions.findIndex(up => up.professionId === prof.id);
                    const selected = idx >= 0;
                    return (
                      <button
                        key={prof.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setFormData({
                              ...formData,
                              userProfessions: formData.userProfessions.filter(up => up.professionId !== prof.id),
                            });
                          } else {
                            setFormData({
                              ...formData,
                              userProfessions: [...formData.userProfessions, { professionId: prof.id, features: [] }],
                            });
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-left text-sm ${
                          selected ? 'bg-primary-500/15 text-primary-300' : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selected ? 'bg-primary-500 border-primary-500' : 'border-slate-500'
                        }`}>
                          {selected && <Check size={10} className="text-white" />}
                        </div>
                        {prof.name}
                      </button>
                    );
                  })}
                </div>

                {/* Features for selected professions */}
                {formData.userProfessions.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {formData.userProfessions.map(up => {
                      const prof = professions.find((p: any) => p.id === up.professionId);
                      return (
                        <div key={up.professionId} className="bg-slate-700/20 rounded-lg p-3 border border-slate-600/30">
                          <p className="text-xs font-medium text-white mb-2">{prof?.name || 'Профессия'}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {professionFeatures.map((feat: any) => {
                              const isSelected = up.features.includes(feat.name);
                              return (
                                <button
                                  key={feat.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      userProfessions: formData.userProfessions.map(p => {
                                        if (p.professionId !== up.professionId) return p;
                                        return {
                                          ...p,
                                          features: isSelected
                                            ? p.features.filter(f => f !== feat.name)
                                            : [...p.features, feat.name],
                                        };
                                      }),
                                    });
                                  }}
                                  className={`px-2 py-1 rounded text-xs font-medium border transition-all ${
                                    isSelected
                                      ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
                                      : 'bg-slate-600/20 border-slate-600/50 text-slate-400 hover:text-slate-300'
                                  }`}
                                >
                                  {feat.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Artists (edit mode) */}
            {isEditing && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <Music size={14} /> Мой артист / Группа
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchArtist}
                    onChange={(e) => setSearchArtist(e.target.value)}
                    placeholder="Поиск..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {artists.map((artist: any) => {
                    const selected = formData.artistIds.includes(artist.id);
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setFormData({ ...formData, artistIds: formData.artistIds.filter(id => id !== artist.id) });
                          } else {
                            setFormData({ ...formData, artistIds: [...formData.artistIds, artist.id] });
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-left text-sm ${
                          selected ? 'bg-primary-500/15 text-primary-300' : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selected ? 'bg-primary-500 border-primary-500' : 'border-slate-500'
                        }`}>
                          {selected && <Check size={10} className="text-white" />}
                        </div>
                        {artist.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Employer (edit mode) */}
            {isEditing && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300 flex items-center gap-1">
                  <Building2 size={14} /> Работодатель
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchEmployer}
                    onChange={(e) => setSearchEmployer(e.target.value)}
                    placeholder="Поиск по названию, ИНН или ОГРН..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {employers.map((emp: any) => {
                    const selected = formData.employerId === emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          employerId: selected ? '' : emp.id,
                        })}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2 rounded-lg transition-all text-left text-sm ${
                          selected ? 'bg-green-500/15 text-green-300' : 'text-slate-300 hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            selected ? 'bg-green-500 border-green-500' : 'border-slate-500'
                          }`}>
                            {selected && <Check size={10} className="text-white" />}
                          </div>
                          {emp.name}
                        </div>
                        {emp.inn && <span className="text-xs text-slate-500">ИНН: {emp.inn}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Role & Social Links */}
            {isEditing && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-300">Роль</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white"
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

                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-300">Социальные сети</label>
                  <input
                    type="text"
                    value={formData.vkLink}
                    onChange={(e) => setFormData({ ...formData, vkLink: e.target.value })}
                    placeholder="VK ссылка"
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white text-sm"
                  />
                  <input
                    type="text"
                    value={formData.youtubeLink}
                    onChange={(e) => setFormData({ ...formData, youtubeLink: e.target.value })}
                    placeholder="YouTube ссылка"
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white text-sm"
                  />
                  <input
                    type="text"
                    value={formData.telegramLink}
                    onChange={(e) => setFormData({ ...formData, telegramLink: e.target.value })}
                    placeholder="Telegram ссылка"
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white text-sm"
                  />
                </div>
              </>
            )}
          </form>
        </div>

        {/* Professions Section (display mode) */}
        {!isEditing && profile?.userProfessions && profile.userProfessions.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Star className="text-primary-400" size={20} />
              Профессии
            </h3>
            <div className="space-y-3">
              {profile.userProfessions.map((up: any) => (
                <div key={up.id} className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1.5 bg-primary-500/20 text-primary-300 rounded-xl text-sm font-medium border border-primary-500/30">
                    {up.profession?.name}
                  </span>
                  {up.features && up.features.length > 0 && up.features.map((f: string) => (
                    <span key={f} className="px-2 py-1 bg-slate-700/50 text-slate-400 rounded-lg text-xs border border-slate-600/30">
                      {f}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Artists Section (display mode) */}
        {!isEditing && profile?.userArtists && profile.userArtists.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Music className="text-purple-400" size={20} />
              Артисты / Группы
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.userArtists.map((ua: any) => (
                <span key={ua.id} className="px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-xl text-sm font-medium border border-purple-500/30">
                  {ua.artist?.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Employer Section (display mode) */}
        {!isEditing && profile?.employer && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Building2 className="text-green-400" size={20} />
              Работодатель
            </h3>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-green-500/20 text-green-300 rounded-xl text-sm font-medium border border-green-500/30">
                {profile.employer.name}
              </span>
              {profile.employer.inn && (
                <span className="text-xs text-slate-500">ИНН: {profile.employer.inn}</span>
              )}
            </div>
          </div>
        )}

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
