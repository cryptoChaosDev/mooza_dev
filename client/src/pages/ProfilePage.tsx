import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, Building2, Search, Check, Clock, DollarSign, Calendar,
  Headphones, Settings, Edit3, ChevronRight, User
} from 'lucide-react';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession' | 'search' | 'social';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Профессия', icon: <Briefcase size={14} /> },
  { id: 'search',     label: 'Поиск',     icon: <Settings size={14} /> },
  { id: 'social',     label: 'Соцсети',   icon: <Globe size={14} /> },
];

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('basic');

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

  const [searchProfile, setSearchProfile] = useState({
    serviceId: '', genreId: '', workFormatId: '', employmentTypeId: '',
    skillLevelId: '', availabilityId: '', pricePerHour: '', pricePerEvent: '',
  });

  const [searchSheets, setSearchSheets] = useState({
    service: false, genre: false, workFormat: false,
    employmentType: false, skillLevel: false, availability: false,
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

  useEffect(() => {
    if (isEditing && searchProfile.serviceId)
      referenceAPI.getGenres({ serviceId: searchProfile.serviceId }).then(r => setGenres(r.data));
  }, [isEditing, searchProfile.serviceId]);

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
      if (data.userSearchProfiles?.length > 0) {
        const sp = data.userSearchProfiles[0];
        setSearchProfile({
          serviceId: sp.serviceId || '', genreId: sp.genreId || '',
          workFormatId: sp.workFormatId || '', employmentTypeId: sp.employmentTypeId || '',
          skillLevelId: sp.skillLevelId || '', availabilityId: sp.availabilityId || '',
          pricePerHour: sp.pricePerHour?.toString() || '',
          pricePerEvent: sp.pricePerEvent?.toString() || '',
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
      serviceId: searchProfile.serviceId || undefined,
      genreId: searchProfile.genreId || undefined,
      workFormatId: searchProfile.workFormatId || undefined,
      employmentTypeId: searchProfile.employmentTypeId || undefined,
      skillLevelId: searchProfile.skillLevelId || undefined,
      availabilityId: searchProfile.availabilityId || undefined,
      pricePerHour: searchProfile.pricePerHour ? parseFloat(searchProfile.pricePerHour) : undefined,
      pricePerEvent: searchProfile.pricePerEvent ? parseFloat(searchProfile.pricePerEvent) : undefined,
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
  const sp = profile?.userSearchProfiles?.[0];
  const hasSearchProfile = sp && (sp.service || sp.genre || sp.workFormat || sp.employmentType || sp.skillLevel || sp.availability || sp.pricePerHour || sp.pricePerEvent);

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

                {/* Professions */}
                {formData.fieldOfActivityId && professions.length > 0 && (
                  <div>
                    <label className={`${labelCls} flex items-center gap-1`}><Star size={11} /> Профессии</label>
                    <div className="flex flex-wrap gap-2">
                      {professions.map((prof: any) => {
                        const selected = formData.userProfessions.some(up => up.professionId === prof.id);
                        return (
                          <button key={prof.id} type="button"
                            onClick={() => {
                              if (selected) setFormData({ ...formData, userProfessions: formData.userProfessions.filter(up => up.professionId !== prof.id) });
                              else setFormData({ ...formData, userProfessions: [...formData.userProfessions, { professionId: prof.id, features: [] }] });
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${
                              selected ? 'bg-primary-500/20 border-primary-500/50 text-primary-300' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {selected && <Check size={11} className="text-primary-400" />}
                            {prof.name}
                          </button>
                        );
                      })}
                    </div>
                    {/* Features */}
                    {formData.userProfessions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {formData.userProfessions.map(up => {
                          const prof = professions.find((p: any) => p.id === up.professionId);
                          return (
                            <div key={up.professionId} className="bg-slate-700/20 rounded-lg p-3 border border-slate-600/30">
                              <p className="text-xs font-semibold text-slate-300 mb-2">{prof?.name}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {professionFeatures.map((feat: any) => {
                                  const isSel = up.features.includes(feat.name);
                                  return (
                                    <button key={feat.id} type="button"
                                      onClick={() => setFormData({ ...formData, userProfessions: formData.userProfessions.map(p => p.professionId !== up.professionId ? p : { ...p, features: isSel ? p.features.filter(f => f !== feat.name) : [...p.features, feat.name] }) })}
                                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${isSel ? 'bg-primary-500/20 border-primary-500/50 text-primary-300' : 'bg-slate-600/20 border-slate-600/50 text-slate-400 hover:text-slate-300'}`}
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
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Star size={11} className="text-primary-400" />Профессии</p>
                    <div className="space-y-2">
                      {profile.userProfessions.map((up: any) => (
                        <div key={up.id} className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2.5 py-1 bg-primary-500/15 text-primary-300 rounded-lg text-xs font-semibold border border-primary-500/30">{up.profession?.name}</span>
                          {up.features?.map((f: string) => (
                            <span key={f} className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs border border-slate-600/30">{f}</span>
                          ))}
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
                <SelectField label="Услуга" value={services.find((s: any) => s.id === searchProfile.serviceId)?.name || ''} placeholder="Выберите услугу" icon={<Headphones size={14} />} onClick={() => openSheet('service')} />
                {searchProfile.serviceId && <SelectField label="Жанр" value={genres.find((g: any) => g.id === searchProfile.genreId)?.name || ''} placeholder="Выберите жанр" icon={<Music size={14} />} onClick={() => openSheet('genre')} />}
                <SelectField label="Формат работы" value={workFormats.find((w: any) => w.id === searchProfile.workFormatId)?.name || ''} placeholder="Не указан" icon={<Globe size={14} />} onClick={() => openSheet('workFormat')} />
                <SelectField label="Тип занятости" value={employmentTypes.find((e: any) => e.id === searchProfile.employmentTypeId)?.name || ''} placeholder="Не указан" icon={<Briefcase size={14} />} onClick={() => openSheet('employmentType')} />
                <SelectField label="Уровень навыка" value={skillLevels.find((s: any) => s.id === searchProfile.skillLevelId)?.name || ''} placeholder="Не указан" icon={<Star size={14} />} onClick={() => openSheet('skillLevel')} />
                <SelectField label="Доступность" value={availabilities.find((a: any) => a.id === searchProfile.availabilityId)?.name || ''} placeholder="Не указана" icon={<Calendar size={14} />} onClick={() => openSheet('availability')} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${labelCls} flex items-center gap-1`}><DollarSign size={11} />Цена/час, ₽</label>
                    <input type="number" value={searchProfile.pricePerHour} onChange={e => setSearchProfile({ ...searchProfile, pricePerHour: e.target.value })} placeholder="0" className={inputCls} />
                  </div>
                  <div>
                    <label className={`${labelCls} flex items-center gap-1`}><Clock size={11} />Цена/выступление, ₽</label>
                    <input type="number" value={searchProfile.pricePerEvent} onChange={e => setSearchProfile({ ...searchProfile, pricePerEvent: e.target.value })} placeholder="0" className={inputCls} />
                  </div>
                </div>
                <SelectSheet isOpen={searchSheets.service} onClose={() => closeSheet('service')} title="Выберите услугу" options={services.map(s => ({ id: s.id, name: s.name }))} selectedIds={searchProfile.serviceId} onSelect={id => { setSearchProfile({ ...searchProfile, serviceId: id as string, genreId: '' }); closeSheet('service'); }} mode="single" searchable searchPlaceholder="Поиск услуги..." height="half" />
                <SelectSheet isOpen={searchSheets.genre} onClose={() => closeSheet('genre')} title="Выберите жанр" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={searchProfile.genreId} onSelect={id => { setSearchProfile({ ...searchProfile, genreId: id as string }); closeSheet('genre'); }} mode="single" searchable height="half" />
                <SelectSheet isOpen={searchSheets.workFormat} onClose={() => closeSheet('workFormat')} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={searchProfile.workFormatId} onSelect={id => { setSearchProfile({ ...searchProfile, workFormatId: id as string }); closeSheet('workFormat'); }} mode="single" searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.employmentType} onClose={() => closeSheet('employmentType')} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={searchProfile.employmentTypeId} onSelect={id => { setSearchProfile({ ...searchProfile, employmentTypeId: id as string }); closeSheet('employmentType'); }} mode="single" searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.skillLevel} onClose={() => closeSheet('skillLevel')} title="Уровень навыка" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={searchProfile.skillLevelId} onSelect={id => { setSearchProfile({ ...searchProfile, skillLevelId: id as string }); closeSheet('skillLevel'); }} mode="single" searchable={false} height="auto" />
                <SelectSheet isOpen={searchSheets.availability} onClose={() => closeSheet('availability')} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={searchProfile.availabilityId} onSelect={id => { setSearchProfile({ ...searchProfile, availabilityId: id as string }); closeSheet('availability'); }} mode="single" searchable={false} height="auto" />
              </div>
            ) : (
              <div className="p-4">
                {hasSearchProfile ? (
                  <div className="flex flex-wrap gap-2">
                    {sp?.service && (
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 rounded-lg border border-primary-500/20">
                        <Headphones size={11} className="text-primary-400" /><span className="text-primary-300 text-xs">{sp.service.name}</span>
                      </div>
                    )}
                    {sp?.genre && (
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 rounded-lg border border-primary-500/20">
                        <Music size={11} className="text-primary-400" /><span className="text-primary-300 text-xs">{sp.genre.name}</span>
                      </div>
                    )}
                    {sp?.workFormat     && <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{sp.workFormat.name}</span>}
                    {sp?.employmentType && <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{sp.employmentType.name}</span>}
                    {sp?.skillLevel     && <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{sp.skillLevel.name}</span>}
                    {sp?.availability   && <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">{sp.availability.name}</span>}
                    {(sp?.pricePerHour || sp?.pricePerEvent) && (
                      <div className="w-full flex flex-wrap gap-3 pt-2 mt-1 border-t border-slate-700/50">
                        {sp?.pricePerHour  && <div className="flex items-center gap-1 text-green-300 text-xs font-semibold"><DollarSign size={11} />{sp.pricePerHour} ₽/час</div>}
                        {sp?.pricePerEvent && <div className="flex items-center gap-1 text-green-300 text-xs font-semibold"><Clock size={11} />{sp.pricePerEvent} ₽/выступление</div>}
                      </div>
                    )}
                  </div>
                ) : <EmptyState text="Параметры поиска не заполнены" />}
              </div>
            )
          )}

          {/* ── СОЦСЕТИ ── */}
          {activeTab === 'social' && (
            isEditing ? (
              <div className="p-4 space-y-4">
                <div>
                  <label className={labelCls}>Роль</label>
                  <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={`${inputCls} cursor-pointer bg-slate-700/50`}>
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
              <div className="p-4">
                {(profile?.vkLink || profile?.youtubeLink || profile?.telegramLink || profile?.role) ? (
                  <div className="space-y-2">
                    {profile?.role && (
                      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-700/50">
                        <span className="text-slate-400 text-xs">Роль:</span>
                        <span className="px-2 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-md border border-primary-500/30">{profile.role}</span>
                      </div>
                    )}
                    {profile?.vkLink && (
                      <a href={profile.vkLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group">
                        <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/25 transition-colors">
                          <span className="text-blue-400 text-xs font-bold">VK</span>
                        </div>
                        <span className="text-sm flex-1 truncate">{profile.vkLink}</span>
                        <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                      </a>
                    )}
                    {profile?.youtubeLink && (
                      <a href={profile.youtubeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group">
                        <div className="w-7 h-7 bg-red-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/25 transition-colors">
                          <span className="text-red-400 text-xs font-bold">YT</span>
                        </div>
                        <span className="text-sm flex-1 truncate">{profile.youtubeLink}</span>
                        <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                      </a>
                    )}
                    {profile?.telegramLink && (
                      <a href={profile.telegramLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group">
                        <div className="w-7 h-7 bg-sky-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-sky-500/25 transition-colors">
                          <span className="text-sky-400 text-xs font-bold">TG</span>
                        </div>
                        <span className="text-sm flex-1 truncate">{profile.telegramLink}</span>
                        <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                ) : <EmptyState text="Соцсети не добавлены" />}
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
