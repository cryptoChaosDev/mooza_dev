import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, Building2, Search, Check, DollarSign, Calendar,
  Headphones, Settings, Edit3, User, Plus, ChevronDown
} from 'lucide-react';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession' | 'search';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Профессия', icon: <Briefcase size={14} /> },
  { id: 'search',     label: 'Поиск',     icon: <Settings size={14} /> },
];

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('basic');
  const [expandedProfessions, setExpandedProfessions] = useState<Set<string>>(new Set());
  const [showAddProfession, setShowAddProfession] = useState(false);

  const toggleProfExpand = (id: string) =>
    setExpandedProfessions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', nickname: '', bio: '',
    country: '', city: '', role: '', genres: [] as string[],
    vkLink: '', youtubeLink: '', telegramLink: '',
    fieldOfActivityId: '', employerId: '',
    userProfessions: [] as { professionId: string; features: string[] }[],
    artistIds: [] as string[],
  });

  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [professions, setProfessions] = useState<any[]>([]);
  const [professionFeatures, setProfessionFeatures] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [employers, setEmployers] = useState<any[]>([]);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchEmployer, setSearchEmployer] = useState('');
  const [services, setServices] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [workFormats, setWorkFormats] = useState<any[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<any[]>([]);
  const [skillLevels, setSkillLevels] = useState<any[]>([]);
  const [availabilities, setAvailabilities] = useState<any[]>([]);
  const [geographies, setGeographies] = useState<any[]>([]);
  const [priceRanges, setPriceRanges] = useState<any[]>([]);

  const [searchProfile, setSearchProfile] = useState({
    serviceIds: [] as string[],
    genreIds: [] as string[],
    workFormatIds: [] as string[],
    employmentTypeIds: [] as string[],
    skillLevelIds: [] as string[],
    availabilityIds: [] as string[],
    geographyIds: [] as string[],
    priceRangeIds: [] as string[],
  });

  const [searchSheets, setSearchSheets] = useState({
    service: false, genre: false, workFormat: false,
    employmentType: false, skillLevel: false, availability: false,
    geography: false, priceRange: false,
  });
  const openSheet  = (k: keyof typeof searchSheets) => setSearchSheets(s => ({ ...s, [k]: true }));
  const closeSheet = (k: keyof typeof searchSheets) => setSearchSheets(s => ({ ...s, [k]: false }));

  useEffect(() => {
    if (isEditing) {
      referenceAPI.getFieldsOfActivity().then(r => setFieldsOfActivity(r.data));
      referenceAPI.getProfessionFeatures().then(r => setProfessionFeatures(r.data));
      referenceAPI.getArtists({}).then(r => setArtists(r.data));
      referenceAPI.getEmployers({}).then(r => setEmployers(r.data));
      referenceAPI.getWorkFormats().then(r => setWorkFormats(r.data));
      referenceAPI.getEmploymentTypes().then(r => setEmploymentTypes(r.data));
      referenceAPI.getSkillLevels().then(r => setSkillLevels(r.data));
      referenceAPI.getAvailabilities().then(r => setAvailabilities(r.data));
      referenceAPI.getGenres().then(r => setGenres(r.data));
      referenceAPI.getGeographies().then(r => setGeographies(r.data));
      referenceAPI.getPriceRanges().then(r => setPriceRanges(r.data));
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && formData.fieldOfActivityId) {
      referenceAPI.getProfessions({ fieldOfActivityId: formData.fieldOfActivityId }).then(r => setProfessions(r.data));
      referenceAPI.getServices({ fieldOfActivityId: formData.fieldOfActivityId }).then(r => setServices(r.data));
    }
  }, [isEditing, formData.fieldOfActivityId]);

  useEffect(() => {
    if (isEditing) referenceAPI.getArtists({ search: searchArtist }).then(r => setArtists(r.data));
  }, [searchArtist, isEditing]);

  useEffect(() => {
    if (isEditing) referenceAPI.getEmployers({ search: searchEmployer }).then(r => setEmployers(r.data));
  }, [searchEmployer, isEditing]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await userAPI.getMe();
      setFormData({
        firstName: data.firstName || '', lastName: data.lastName || '',
        nickname: data.nickname || '', bio: data.bio || '',
        country: data.country || '', city: data.city || '',
        role: data.role || '', genres: data.genres || [],
        vkLink: data.vkLink || '', youtubeLink: data.youtubeLink || '',
        telegramLink: data.telegramLink || '',
        fieldOfActivityId: data.fieldOfActivityId || '',
        employerId: data.employerId || '',
        userProfessions: data.userProfessions?.map((up: any) => ({
          professionId: up.professionId || up.profession?.id,
          features: up.features || [],
        })) || [],
        artistIds: data.userArtists?.map((ua: any) => ua.artistId || ua.artist?.id) || [],
      });
      if (data.userSearchProfile) {
        const sp = data.userSearchProfile;
        setSearchProfile({
          serviceIds: sp.services?.map((s: any) => s.id) || [],
          genreIds: sp.genres?.map((g: any) => g.id) || [],
          workFormatIds: sp.workFormats?.map((w: any) => w.id) || [],
          employmentTypeIds: sp.employmentTypes?.map((e: any) => e.id) || [],
          skillLevelIds: sp.skillLevels?.map((s: any) => s.id) || [],
          availabilityIds: sp.availabilities?.map((a: any) => a.id) || [],
          geographyIds: sp.geographies?.map((g: any) => g.id) || [],
          priceRangeIds: sp.priceRanges?.map((p: any) => p.id) || [],
        });
      }
      return data;
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      const { data } = await userAPI.uploadAvatar(fd);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const updateMutation = useMutation({
    mutationFn: userAPI.updateMe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setIsEditing(false);
    },
  });

  const updateSearchProfileMutation = useMutation({
    mutationFn: userAPI.updateSearchProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
    updateSearchProfileMutation.mutate({
      serviceIds: searchProfile.serviceIds,
      genreIds: searchProfile.genreIds,
      workFormatIds: searchProfile.workFormatIds,
      employmentTypeIds: searchProfile.employmentTypeIds,
      skillLevelIds: searchProfile.skillLevelIds,
      availabilityIds: searchProfile.availabilityIds,
      geographyIds: searchProfile.geographyIds,
      priceRangeIds: searchProfile.priceRangeIds,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30" />
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  const avatarUrl = profile?.avatar ? `${API_URL}${profile.avatar}` : null;
  const sp = profile?.userSearchProfile;
  const hasSearchProfile = sp && (
    sp.services?.length > 0 || sp.genres?.length > 0 || sp.workFormats?.length > 0 ||
    sp.employmentTypes?.length > 0 || sp.skillLevels?.length > 0 || sp.availabilities?.length > 0 ||
    sp.geographies?.length > 0 || sp.priceRanges?.length > 0
  );

  const inputCls = "w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  // ── helpers ──────────────────────────────────────────────────────────────
  const EmptyState = ({ text }: { text: string }) => (
    <div className="py-8 text-center">
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── HERO CARD ────────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-lg overflow-hidden mb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-purple-500/5 pointer-events-none" />
          <div className="relative p-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden ring-2 ring-primary-500/30 shadow-xl">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">{profile?.firstName?.[0]}{profile?.lastName?.[0]}</span>
                      </div>
                  }
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 bg-primary-500 hover:bg-primary-600 text-white p-1.5 rounded-lg shadow-lg transition-all"
                >
                  <Camera size={12} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatarMutation.mutate(f); }}
                  className="hidden" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-white leading-tight truncate">
                  {profile?.firstName} {profile?.lastName}
                </h2>
                {profile?.nickname && <p className="text-slate-400 text-xs mt-0.5 mb-1.5">@{profile.nickname}</p>}
                {profile?.role && (
                  <span className="inline-block px-2 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-md border border-primary-500/30 mb-1.5">
                    {profile.role}
                  </span>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {profile?.country && <span className="flex items-center gap-1 text-slate-400 text-xs"><Globe size={10} />{profile.country}</span>}
                  {profile?.city    && <span className="flex items-center gap-1 text-slate-400 text-xs"><MapPin size={10} />{profile.city}</span>}
                </div>
                {(profile?.vkLink || profile?.youtubeLink || profile?.telegramLink) && (
                  <div className="flex flex-col gap-1 mt-2">
                    {profile?.vkLink && (
                      <a href={profile.vkLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        <span className="font-bold shrink-0">VK</span>
                        <span className="truncate">{profile.vkLink.replace(/^https?:\/\/(www\.)?vk\.com\//, '')}</span>
                      </a>
                    )}
                    {profile?.youtubeLink && (
                      <a href={profile.youtubeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                        <span className="font-bold shrink-0">YT</span>
                        <span className="truncate">{profile.youtubeLink.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}</span>
                      </a>
                    )}
                    {profile?.telegramLink && (
                      <a href={profile.telegramLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors">
                        <span className="font-bold shrink-0">TG</span>
                        <span className="truncate">{profile.telegramLink.replace(/^https?:\/\/(www\.)?t\.me\//, '')}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Edit / Save buttons */}
              <div className="flex-shrink-0">
                {isEditing ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg border border-slate-600/50 transition-all">
                      <X size={15} className="text-slate-300" />
                    </button>
                    <button onClick={handleSave} disabled={updateMutation.isPending} className="p-2 bg-primary-500 hover:bg-primary-600 rounded-lg shadow-lg shadow-primary-500/30 disabled:opacity-60 transition-all">
                      <Save size={15} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg border border-slate-600/50 hover:border-primary-500/50 transition-all text-slate-300 hover:text-white text-xs font-medium"
                  >
                    <Edit3 size={12} />
                    Изменить
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TAB BAR (always visible) ──────────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/50 mb-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ───────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50">

          {/* ── ОСНОВНОЕ ── */}
          {activeTab === 'basic' && (
            isEditing ? (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Имя</label>
                    <input type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Фамилия</label>
                    <input type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Никнейм</label>
                  <input type="text" value={formData.nickname} onChange={e => setFormData({ ...formData, nickname: e.target.value })} placeholder="@nickname" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>О себе</label>
                  <textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} rows={4} className={`${inputCls} resize-none`} placeholder="Расскажите о себе..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Страна</label>
                    <input type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} placeholder="Россия" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Город</label>
                    <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="Москва" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>VK</label>
                  <input type="text" value={formData.vkLink} onChange={e => setFormData({ ...formData, vkLink: e.target.value })} placeholder="https://vk.com/..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>YouTube</label>
                  <input type="text" value={formData.youtubeLink} onChange={e => setFormData({ ...formData, youtubeLink: e.target.value })} placeholder="https://youtube.com/..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Telegram</label>
                  <input type="text" value={formData.telegramLink} onChange={e => setFormData({ ...formData, telegramLink: e.target.value })} placeholder="https://t.me/..." className={inputCls} />
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Bio */}
                {profile?.bio
                  ? <p className="text-slate-300 text-sm leading-relaxed">{profile.bio}</p>
                  : <EmptyState text="Биография не заполнена" />
                }
                {/* Location */}
                {(profile?.country || profile?.city) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                    {profile?.country && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                        <Globe size={12} className="text-slate-400" />{profile.country}
                      </span>
                    )}
                    {profile?.city && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                        <MapPin size={12} className="text-slate-400" />{profile.city}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* ── ПРОФЕССИЯ ── */}
          {activeTab === 'profession' && (
            isEditing ? (
              <div className="p-4 space-y-4">
                {/* Field of Activity */}
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Briefcase size={11} /> Сфера деятельности</label>
                  <div className="flex flex-wrap gap-2">
                    {fieldsOfActivity.map((field: any) => (
                      <button key={field.id} type="button"
                        onClick={() => setFormData({ ...formData, fieldOfActivityId: formData.fieldOfActivityId === field.id ? '' : field.id, userProfessions: [] })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${
                          formData.fieldOfActivityId === field.id
                            ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
                            : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {formData.fieldOfActivityId === field.id && <Check size={11} className="text-primary-400" />}
                        {field.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Professions – accordion cards */}
                {formData.fieldOfActivityId && (
                  <div className="space-y-2">
                    <label className={`${labelCls} flex items-center gap-1`}><Star size={11} /> Профессии</label>

                    {/* Selected professions */}
                    {formData.userProfessions.map(up => {
                      const prof = professions.find((p: any) => p.id === up.professionId);
                      const isExpanded = expandedProfessions.has(up.professionId);
                      return (
                        <div key={up.professionId} className="bg-slate-700/30 rounded-xl border border-slate-600/50 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <button type="button" onClick={() => toggleProfExpand(up.professionId)} className="flex-1 flex items-center justify-between text-left">
                              <span className="text-sm font-semibold text-white">{prof?.name ?? '...'}</span>
                              <div className="flex items-center gap-2 mr-1">
                                {up.features.length > 0 && (
                                  <span className="text-xs text-slate-400">{up.features.length} навык{up.features.length > 1 ? 'а' : ''}</span>
                                )}
                                <ChevronDown size={15} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </button>
                            <button type="button"
                              onClick={() => {
                                setFormData({ ...formData, userProfessions: formData.userProfessions.filter(p => p.professionId !== up.professionId) });
                                setExpandedProfessions(prev => { const n = new Set(prev); n.delete(up.professionId); return n; });
                              }}
                              className="flex-shrink-0 p-1 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3 border-t border-slate-600/30">
                              <p className="text-xs text-slate-400 mt-2 mb-2">Специализация:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {professionFeatures.map((feat: any) => {
                                  const isSel = up.features.includes(feat.name);
                                  return (
                                    <button key={feat.id} type="button"
                                      onClick={() => setFormData({ ...formData, userProfessions: formData.userProfessions.map(p => p.professionId !== up.professionId ? p : { ...p, features: isSel ? p.features.filter(f => f !== feat.name) : [...p.features, feat.name] }) })}
                                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${isSel ? 'bg-primary-500/20 border-primary-500/50 text-primary-300' : 'bg-slate-600/20 border-slate-600/50 text-slate-400 hover:text-slate-300'}`}
                                    >
                                      {isSel && <Check size={10} className="text-primary-400" />}
                                      {feat.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add profession button */}
                    {professions.filter((p: any) => !formData.userProfessions.some(up => up.professionId === p.id)).length > 0 && (
                      <>
                        <button type="button"
                          onClick={() => setShowAddProfession(s => !s)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm"
                        >
                          <Plus size={14} />
                          Добавить профессию
                        </button>
                        {showAddProfession && (
                          <div className="flex flex-wrap gap-2 p-3 bg-slate-700/20 rounded-xl border border-slate-600/30">
                            {professions
                              .filter((p: any) => !formData.userProfessions.some(up => up.professionId === p.id))
                              .map((prof: any) => (
                                <button key={prof.id} type="button"
                                  onClick={() => {
                                    const newProfs = [...formData.userProfessions, { professionId: prof.id, features: [] }];
                                    setFormData({ ...formData, userProfessions: newProfs });
                                    setExpandedProfessions(prev => new Set([...prev, prof.id]));
                                    const remaining = professions.filter((p: any) => !newProfs.some(up => up.professionId === p.id));
                                    if (remaining.length === 0) setShowAddProfession(false);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                                >
                                  <Plus size={11} />
                                  {prof.name}
                                </button>
                              ))
                            }
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Artists */}
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Music size={11} /> Мой артист / Группа</label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input type="text" value={searchArtist} onChange={e => setSearchArtist(e.target.value)} placeholder="Поиск артиста..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                  <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg">
                    {artists.map((artist: any) => {
                      const selected = formData.artistIds.includes(artist.id);
                      return (
                        <button key={artist.id} type="button"
                          onClick={() => {
                            if (selected) setFormData({ ...formData, artistIds: formData.artistIds.filter(id => id !== artist.id) });
                            else setFormData({ ...formData, artistIds: [...formData.artistIds, artist.id] });
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left text-sm ${selected ? 'bg-primary-500/15 text-primary-300' : 'text-slate-300 hover:bg-slate-700/50'}`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'bg-primary-500 border-primary-500' : 'border-slate-500'}`}>
                            {selected && <Check size={9} className="text-white" />}
                          </div>
                          {artist.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Employer */}
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Building2 size={11} /> Работодатель</label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input type="text" value={searchEmployer} onChange={e => setSearchEmployer(e.target.value)} placeholder="Поиск по ИНН или названию..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                  <div className="space-y-0.5 max-h-36 overflow-y-auto rounded-lg">
                    {employers.map((emp: any) => {
                      const selected = formData.employerId === emp.id;
                      return (
                        <button key={emp.id} type="button"
                          onClick={() => setFormData({ ...formData, employerId: selected ? '' : emp.id })}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all text-left text-sm ${selected ? 'bg-green-500/15 text-green-300' : 'text-slate-300 hover:bg-slate-700/50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'bg-green-500 border-green-500' : 'border-slate-500'}`}>
                              {selected && <Check size={9} className="text-white" />}
                            </div>
                            {emp.name}
                          </div>
                          {emp.inn && <span className="text-xs text-slate-500 flex-shrink-0">ИНН: {emp.inn}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Field + Employer chips */}
                {(profile?.fieldOfActivity || profile?.employer) && (
                  <div className="flex flex-wrap gap-2">
                    {profile?.fieldOfActivity && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                        <Briefcase size={12} className="text-primary-400" />{profile.fieldOfActivity.name}
                      </div>
                    )}
                    {profile?.employer && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                        <Building2 size={12} className="text-green-400" />{profile.employer.name}
                        {profile.employer.inn && <span className="text-slate-500 font-normal">· ИНН {profile.employer.inn}</span>}
                      </div>
                    )}
                  </div>
                )}
                {/* Professions */}
                {profile?.userProfessions?.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Star size={11} className="text-primary-400" />Профессии
                    </p>
                    <div className="space-y-2">
                      {profile.userProfessions.map((up: any) => (
                        <div key={up.id} className="bg-slate-700/20 rounded-xl border border-slate-600/30 p-3">
                          <p className="text-sm font-semibold text-white mb-2">{up.profession?.name}</p>
                          {up.features?.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {up.features.map((f: string) => (
                                <span key={f} className="px-2.5 py-1 bg-primary-500/10 text-primary-300 rounded-lg text-xs border border-primary-500/20">{f}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-500 text-xs">Без специализации</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : !profile?.fieldOfActivity && !profile?.employer && <EmptyState text="Профессиональная информация не заполнена" />}
                {/* Artists */}
                {profile?.userArtists?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Music size={11} className="text-purple-400" />Артисты / Группы</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.userArtists.map((ua: any) => (
                        <span key={ua.id} className="px-2.5 py-1 bg-purple-500/15 text-purple-300 rounded-lg text-xs font-medium border border-purple-500/30">{ua.artist?.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* ── ПОИСК ── */}
          {activeTab === 'search' && (
            isEditing ? (
              <div className="p-4 space-y-4">
                <p className="text-slate-400 text-xs leading-relaxed">Заполни параметры, чтобы другие пользователи могли найти тебя по фильтрам в поиске.</p>

                <SelectField label="Услуги" value={searchProfile.serviceIds.length > 0 ? services.filter((s: any) => searchProfile.serviceIds.includes(s.id)).map((s: any) => s.name).join(', ') : ''} placeholder="Выберите услуги" icon={<Headphones size={14} />} onClick={() => openSheet('service')} badge={searchProfile.serviceIds.length || undefined} />
                <SelectField label="Жанры" value={searchProfile.genreIds.length > 0 ? genres.filter((g: any) => searchProfile.genreIds.includes(g.id)).map((g: any) => g.name).join(', ') : ''} placeholder="Выберите жанры" icon={<Music size={14} />} onClick={() => openSheet('genre')} badge={searchProfile.genreIds.length || undefined} />
                <SelectField label="Формат работы" value={searchProfile.workFormatIds.length > 0 ? workFormats.filter((w: any) => searchProfile.workFormatIds.includes(w.id)).map((w: any) => w.name).join(', ') : ''} placeholder="Не указан" icon={<Globe size={14} />} onClick={() => openSheet('workFormat')} badge={searchProfile.workFormatIds.length || undefined} />
                <SelectField label="Тип занятости" value={searchProfile.employmentTypeIds.length > 0 ? employmentTypes.filter((e: any) => searchProfile.employmentTypeIds.includes(e.id)).map((e: any) => e.name).join(', ') : ''} placeholder="Не указан" icon={<Briefcase size={14} />} onClick={() => openSheet('employmentType')} badge={searchProfile.employmentTypeIds.length || undefined} />
                <SelectField label="Уровень навыка" value={searchProfile.skillLevelIds.length > 0 ? skillLevels.filter((s: any) => searchProfile.skillLevelIds.includes(s.id)).map((s: any) => s.name).join(', ') : ''} placeholder="Не указан" icon={<Star size={14} />} onClick={() => openSheet('skillLevel')} badge={searchProfile.skillLevelIds.length || undefined} />
                <SelectField label="Доступность" value={searchProfile.availabilityIds.length > 0 ? availabilities.filter((a: any) => searchProfile.availabilityIds.includes(a.id)).map((a: any) => a.name).join(', ') : ''} placeholder="Не указана" icon={<Calendar size={14} />} onClick={() => openSheet('availability')} badge={searchProfile.availabilityIds.length || undefined} />
                <SelectField label="Город / Регион" value={searchProfile.geographyIds.length > 0 ? geographies.filter((g: any) => searchProfile.geographyIds.includes(g.id)).map((g: any) => g.name).join(', ') : ''} placeholder="Не указан" icon={<MapPin size={14} />} onClick={() => openSheet('geography')} badge={searchProfile.geographyIds.length || undefined} />
                <SelectField label="Бюджет" value={searchProfile.priceRangeIds.length > 0 ? priceRanges.filter((p: any) => searchProfile.priceRangeIds.includes(p.id)).map((p: any) => p.name).join(', ') : ''} placeholder="Не указан" icon={<DollarSign size={14} />} onClick={() => openSheet('priceRange')} badge={searchProfile.priceRangeIds.length || undefined} />

                <SelectSheet isOpen={searchSheets.service} onClose={() => closeSheet('service')} title="Выберите услуги" options={services.map((s: any) => ({ id: s.id, name: s.name }))} selectedIds={searchProfile.serviceIds} onSelect={ids => setSearchProfile({ ...searchProfile, serviceIds: ids as string[] })} mode="multiple" showConfirm searchable searchPlaceholder="Поиск услуги..." height="half" />
                <SelectSheet isOpen={searchSheets.genre} onClose={() => closeSheet('genre')} title="Выберите жанры" options={genres.map((g: any) => ({ id: g.id, name: g.name }))} selectedIds={searchProfile.genreIds} onSelect={ids => setSearchProfile({ ...searchProfile, genreIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />
                <SelectSheet isOpen={searchSheets.workFormat} onClose={() => closeSheet('workFormat')} title="Формат работы" options={workFormats.map((w: any) => ({ id: w.id, name: w.name }))} selectedIds={searchProfile.workFormatIds} onSelect={ids => setSearchProfile({ ...searchProfile, workFormatIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.employmentType} onClose={() => closeSheet('employmentType')} title="Тип занятости" options={employmentTypes.map((e: any) => ({ id: e.id, name: e.name }))} selectedIds={searchProfile.employmentTypeIds} onSelect={ids => setSearchProfile({ ...searchProfile, employmentTypeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.skillLevel} onClose={() => closeSheet('skillLevel')} title="Уровень навыка" options={skillLevels.map((s: any) => ({ id: s.id, name: s.name }))} selectedIds={searchProfile.skillLevelIds} onSelect={ids => setSearchProfile({ ...searchProfile, skillLevelIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.availability} onClose={() => closeSheet('availability')} title="Доступность" options={availabilities.map((a: any) => ({ id: a.id, name: a.name }))} selectedIds={searchProfile.availabilityIds} onSelect={ids => setSearchProfile({ ...searchProfile, availabilityIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.geography} onClose={() => closeSheet('geography')} title="Город / Регион" options={geographies.map((g: any) => ({ id: g.id, name: g.name }))} selectedIds={searchProfile.geographyIds} onSelect={ids => setSearchProfile({ ...searchProfile, geographyIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="half" />
                <SelectSheet isOpen={searchSheets.priceRange} onClose={() => closeSheet('priceRange')} title="Бюджет" options={priceRanges.map((p: any) => ({ id: p.id, name: p.name }))} selectedIds={searchProfile.priceRangeIds} onSelect={ids => setSearchProfile({ ...searchProfile, priceRangeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
              </div>
            ) : (
              <div className="p-4">
                {hasSearchProfile ? (
                  <div className="flex flex-wrap gap-2">
                    {sp?.services?.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 rounded-lg border border-primary-500/20">
                        <Headphones size={11} className="text-primary-400" /><span className="text-primary-300 text-xs">{s.name}</span>
                      </div>
                    ))}
                    {sp?.genres?.map((g: any) => (
                      <div key={g.id} className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Music size={11} className="text-purple-400" /><span className="text-purple-300 text-xs">{g.name}</span>
                      </div>
                    ))}
                    {sp?.workFormats?.map((w: any) => <span key={w.id} className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{w.name}</span>)}
                    {sp?.employmentTypes?.map((e: any) => <span key={e.id} className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{e.name}</span>)}
                    {sp?.skillLevels?.map((s: any) => <span key={s.id} className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{s.name}</span>)}
                    {sp?.availabilities?.map((a: any) => <span key={a.id} className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{a.name}</span>)}
                    {sp?.geographies?.map((g: any) => (
                      <div key={g.id} className="flex items-center gap-1 px-2.5 py-1 bg-slate-700/50 rounded-lg border border-slate-600/30">
                        <MapPin size={11} className="text-slate-400" /><span className="text-slate-300 text-xs">{g.name}</span>
                      </div>
                    ))}
                    {sp?.priceRanges?.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-1 px-2.5 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
                        <DollarSign size={11} className="text-green-400" /><span className="text-green-300 text-xs">{p.name}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="Параметры поиска не заполнены" />}
              </div>
            )
          )}

        </div>

        {/* Save button (edit mode) */}
        {isEditing && (
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="w-full mt-3 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-primary-500/30 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
          >
            <Save size={16} />
            Сохранить изменения
          </button>
        )}

        {/* Logout */}
        <button onClick={() => logout()}
          className="w-full mt-3 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:from-red-500/10 hover:to-red-600/10 text-red-400 hover:text-red-300 border border-slate-700/50 hover:border-red-500/50 font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
        >
          <LogOut size={16} />
          Выйти из аккаунта
        </button>

      </div>
    </div>
  );
}
