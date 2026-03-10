import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, DollarSign, Calendar,
  Headphones, Edit3, User, Plus, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Профессия', icon: <Briefcase size={14} /> },
];

type UserServiceEntry = {
  professionId: string;
  professionName: string;
  serviceId: string;
  serviceName: string;
  genreIds: string[];
  workFormatIds: string[];
  employmentTypeIds: string[];
  skillLevelIds: string[];
  availabilityIds: string[];
  priceRangeIds: string[];
  geographyIds: string[];
};

const emptyEntry = (): UserServiceEntry => ({
  professionId: '', professionName: '', serviceId: '', serviceName: '',
  genreIds: [], workFormatIds: [], employmentTypeIds: [], skillLevelIds: [],
  availabilityIds: [], priceRangeIds: [], geographyIds: [],
});

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

  // Reference lists
  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [workFormats, setWorkFormats] = useState<any[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<any[]>([]);
  const [skillLevels, setSkillLevels] = useState<any[]>([]);
  const [availabilities, setAvailabilities] = useState<any[]>([]);
  const [geographies, setGeographies] = useState<any[]>([]);
  const [priceRanges, setPriceRanges] = useState<any[]>([]);

  // User services state
  const [userServices, setUserServices] = useState<UserServiceEntry[]>([]);
  const [expandedSvcIdx, setExpandedSvcIdx] = useState<number | null>(null);
  const [openFilterSheet, setOpenFilterSheet] = useState<string | null>(null);

  // Add-service multi-step flow
  const [addStep, setAddStep] = useState<'field' | 'profession' | 'service' | 'filters' | null>(null);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [addFlowProfessions, setAddFlowProfessions] = useState<any[]>([]);
  const [addFlowServices, setAddFlowServices] = useState<any[]>([]);

  useEffect(() => {
    if (isEditing) {
      referenceAPI.getFieldsOfActivity().then(r => setFieldsOfActivity(r.data));
      referenceAPI.getWorkFormats().then(r => setWorkFormats(r.data));
      referenceAPI.getEmploymentTypes().then(r => setEmploymentTypes(r.data));
      referenceAPI.getSkillLevels().then(r => setSkillLevels(r.data));
      referenceAPI.getAvailabilities().then(r => setAvailabilities(r.data));
      referenceAPI.getGenres().then(r => setGenres(r.data));
      referenceAPI.getGeographies().then(r => setGeographies(r.data));
      referenceAPI.getPriceRanges().then(r => setPriceRanges(r.data));
    }
  }, [isEditing]);

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
      setUserServices(
        data.userServices?.map((us: any) => ({
          professionId: us.professionId,
          professionName: us.profession?.name || '',
          serviceId: us.serviceId,
          serviceName: us.service?.name || '',
          genreIds: us.genres?.map((g: any) => g.id) || [],
          workFormatIds: us.workFormats?.map((w: any) => w.id) || [],
          employmentTypeIds: us.employmentTypes?.map((e: any) => e.id) || [],
          skillLevelIds: us.skillLevels?.map((s: any) => s.id) || [],
          availabilityIds: us.availabilities?.map((a: any) => a.id) || [],
          priceRangeIds: us.priceRanges?.map((p: any) => p.id) || [],
          geographyIds: us.geographies?.map((g: any) => g.id) || [],
        })) || []
      );
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

  const updateServicesMutation = useMutation({
    mutationFn: () => userAPI.updateServices(
      userServices.map(us => ({
        professionId: us.professionId,
        serviceId: us.serviceId,
        genreIds: us.genreIds,
        workFormatIds: us.workFormatIds,
        employmentTypeIds: us.employmentTypeIds,
        skillLevelIds: us.skillLevelIds,
        availabilityIds: us.availabilityIds,
        priceRangeIds: us.priceRangeIds,
        geographyIds: us.geographyIds,
      }))
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
    updateServicesMutation.mutate();
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

  const inputCls = "w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  const EmptyState = ({ text }: { text: string }) => (
    <div className="py-8 text-center">
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );

  // Group userServices by profession for view mode
  const servicesByProfession = profile?.userServices?.reduce((acc: Record<string, any[]>, us: any) => {
    const key = us.professionId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(us);
    return acc;
  }, {} as Record<string, any[]>) ?? {};

  // Helper: get name from list by id
  const getName = (list: any[], id: string) => list.find(x => x.id === id)?.name ?? id;
  const getNames = (list: any[], ids: string[]) => ids.map(id => getName(list, id)).filter(Boolean);

  // Update field of a userService entry
  const updateSvc = (idx: number, patch: Partial<UserServiceEntry>) =>
    setUserServices(prev => prev.map((us, i) => i === idx ? { ...us, ...patch } : us));

  // Filter selectors for a service entry (edit mode expanded)
  const ServiceFilterEditors = ({ idx }: { idx: number }) => {
    const us = userServices[idx];
    const key = (k: string) => `${k}-${idx}`;
    return (
      <div className="px-3 pb-3 border-t border-slate-600/30 space-y-2 pt-2">
        <SelectField label="Жанры" value={getNames(genres, us.genreIds).join(', ')} placeholder="Выберите жанры" icon={<Music size={13} />} onClick={() => setOpenFilterSheet(key('genre'))} badge={us.genreIds.length || undefined} />
        <SelectField label="Формат работы" value={getNames(workFormats, us.workFormatIds).join(', ')} placeholder="Не указан" icon={<Globe size={13} />} onClick={() => setOpenFilterSheet(key('workFormat'))} badge={us.workFormatIds.length || undefined} />
        <SelectField label="Тип занятости" value={getNames(employmentTypes, us.employmentTypeIds).join(', ')} placeholder="Не указан" icon={<Briefcase size={13} />} onClick={() => setOpenFilterSheet(key('employmentType'))} badge={us.employmentTypeIds.length || undefined} />
        <SelectField label="Уровень" value={getNames(skillLevels, us.skillLevelIds).join(', ')} placeholder="Не указан" icon={<Star size={13} />} onClick={() => setOpenFilterSheet(key('skillLevel'))} badge={us.skillLevelIds.length || undefined} />
        <SelectField label="Доступность" value={getNames(availabilities, us.availabilityIds).join(', ')} placeholder="Не указана" icon={<Calendar size={13} />} onClick={() => setOpenFilterSheet(key('availability'))} badge={us.availabilityIds.length || undefined} />
        <SelectField label="Бюджет" value={getNames(priceRanges, us.priceRangeIds).join(', ')} placeholder="Не указан" icon={<DollarSign size={13} />} onClick={() => setOpenFilterSheet(key('priceRange'))} badge={us.priceRangeIds.length || undefined} />
        <SelectField label="Город / Регион" value={getNames(geographies, us.geographyIds).join(', ')} placeholder="Не указан" icon={<MapPin size={13} />} onClick={() => setOpenFilterSheet(key('geography'))} badge={us.geographyIds.length || undefined} />

        <SelectSheet isOpen={openFilterSheet === key('genre')} onClose={() => setOpenFilterSheet(null)} title="Жанры" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.genreIds} onSelect={ids => updateSvc(idx, { genreIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />
        <SelectSheet isOpen={openFilterSheet === key('workFormat')} onClose={() => setOpenFilterSheet(null)} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={us.workFormatIds} onSelect={ids => updateSvc(idx, { workFormatIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === key('employmentType')} onClose={() => setOpenFilterSheet(null)} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={us.employmentTypeIds} onSelect={ids => updateSvc(idx, { employmentTypeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === key('skillLevel')} onClose={() => setOpenFilterSheet(null)} title="Уровень" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={us.skillLevelIds} onSelect={ids => updateSvc(idx, { skillLevelIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === key('availability')} onClose={() => setOpenFilterSheet(null)} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={us.availabilityIds} onSelect={ids => updateSvc(idx, { availabilityIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === key('priceRange')} onClose={() => setOpenFilterSheet(null)} title="Бюджет" options={priceRanges.map(p => ({ id: p.id, name: p.name }))} selectedIds={us.priceRangeIds} onSelect={ids => updateSvc(idx, { priceRangeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === key('geography')} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.geographyIds} onSelect={ids => updateSvc(idx, { geographyIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />
      </div>
    );
  };

  // Add-service flow UI
  const AddServiceFlow = () => {
    if (addStep === 'field') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите сферу деятельности:</p>
        <div className="flex flex-wrap gap-1.5">
          {fieldsOfActivity.map((f: any) => (
            <button key={f.id} type="button"
              onClick={() => {
                referenceAPI.getProfessions({ fieldOfActivityId: f.id }).then(r => setAddFlowProfessions(r.data));
                setAddStep('profession');
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
            >
              <ChevronRight size={11} />{f.name}
            </button>
          ))}
        </div>
        <button onClick={() => setAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
      </div>
    );

    if (addStep === 'profession') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <button onClick={() => setAddStep('field')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors">
          <ChevronLeft size={11} />Назад
        </button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите профессию:</p>
        {addFlowProfessions.length === 0
          ? <p className="text-slate-500 text-xs">Нет профессий в этой сфере</p>
          : <div className="flex flex-wrap gap-1.5">
              {addFlowProfessions.map((p: any) => (
                <button key={p.id} type="button"
                  onClick={() => {
                    setPending({ ...emptyEntry(), professionId: p.id, professionName: p.name });
                    referenceAPI.getServices({ professionId: p.id }).then(r => setAddFlowServices(r.data));
                    setAddStep('service');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                >
                  <ChevronRight size={11} />{p.name}
                </button>
              ))}
            </div>
        }
        <button onClick={() => setAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
      </div>
    );

    if (addStep === 'service') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <button onClick={() => setAddStep('profession')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors">
          <ChevronLeft size={11} />{pending.professionName}
        </button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Headphones size={11} /> Выберите услугу:</p>
        {addFlowServices.length === 0
          ? <p className="text-slate-500 text-xs">Нет доступных услуг</p>
          : <div className="flex flex-wrap gap-1.5">
              {addFlowServices
                .filter((s: any) => !userServices.some(us => us.serviceId === s.id))
                .map((s: any) => (
                  <button key={s.id} type="button"
                    onClick={() => {
                      setPending(prev => ({ ...prev, serviceId: s.id, serviceName: s.name }));
                      setAddStep('filters');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                  >
                    <ChevronRight size={11} />{s.name}
                  </button>
                ))
              }
            </div>
        }
        <button onClick={() => setAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
      </div>
    );

    if (addStep === 'filters') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <button onClick={() => setAddStep('service')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <ChevronLeft size={11} />{pending.professionName}
            </button>
            <p className="text-sm font-semibold text-white mt-0.5">{pending.serviceName}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-2">Настройте фильтры для этой услуги (необязательно):</p>
        <div className="space-y-2">
          <SelectField label="Жанры" value={getNames(genres, pending.genreIds).join(', ')} placeholder="Выберите жанры" icon={<Music size={13} />} onClick={() => setOpenFilterSheet('pending-genre')} badge={pending.genreIds.length || undefined} />
          <SelectField label="Формат работы" value={getNames(workFormats, pending.workFormatIds).join(', ')} placeholder="Не указан" icon={<Globe size={13} />} onClick={() => setOpenFilterSheet('pending-workFormat')} badge={pending.workFormatIds.length || undefined} />
          <SelectField label="Тип занятости" value={getNames(employmentTypes, pending.employmentTypeIds).join(', ')} placeholder="Не указан" icon={<Briefcase size={13} />} onClick={() => setOpenFilterSheet('pending-employmentType')} badge={pending.employmentTypeIds.length || undefined} />
          <SelectField label="Уровень" value={getNames(skillLevels, pending.skillLevelIds).join(', ')} placeholder="Не указан" icon={<Star size={13} />} onClick={() => setOpenFilterSheet('pending-skillLevel')} badge={pending.skillLevelIds.length || undefined} />
          <SelectField label="Доступность" value={getNames(availabilities, pending.availabilityIds).join(', ')} placeholder="Не указана" icon={<Calendar size={13} />} onClick={() => setOpenFilterSheet('pending-availability')} badge={pending.availabilityIds.length || undefined} />
          <SelectField label="Бюджет" value={getNames(priceRanges, pending.priceRangeIds).join(', ')} placeholder="Не указан" icon={<DollarSign size={13} />} onClick={() => setOpenFilterSheet('pending-priceRange')} badge={pending.priceRangeIds.length || undefined} />
          <SelectField label="Город / Регион" value={getNames(geographies, pending.geographyIds).join(', ')} placeholder="Не указан" icon={<MapPin size={13} />} onClick={() => setOpenFilterSheet('pending-geography')} badge={pending.geographyIds.length || undefined} />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setAddStep(null)} className="flex-1 py-2 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors">Отмена</button>
          <button
            onClick={() => {
              setUserServices(prev => [...prev, { ...pending }]);
              setPending(emptyEntry());
              setAddStep(null);
            }}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
          >
            Добавить
          </button>
        </div>

        <SelectSheet isOpen={openFilterSheet === 'pending-genre'} onClose={() => setOpenFilterSheet(null)} title="Жанры" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={pending.genreIds} onSelect={ids => setPending(p => ({ ...p, genreIds: ids as string[] }))} mode="multiple" showConfirm searchable height="half" />
        <SelectSheet isOpen={openFilterSheet === 'pending-workFormat'} onClose={() => setOpenFilterSheet(null)} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={pending.workFormatIds} onSelect={ids => setPending(p => ({ ...p, workFormatIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === 'pending-employmentType'} onClose={() => setOpenFilterSheet(null)} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={pending.employmentTypeIds} onSelect={ids => setPending(p => ({ ...p, employmentTypeIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === 'pending-skillLevel'} onClose={() => setOpenFilterSheet(null)} title="Уровень" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={pending.skillLevelIds} onSelect={ids => setPending(p => ({ ...p, skillLevelIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === 'pending-availability'} onClose={() => setOpenFilterSheet(null)} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={pending.availabilityIds} onSelect={ids => setPending(p => ({ ...p, availabilityIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === 'pending-priceRange'} onClose={() => setOpenFilterSheet(null)} title="Бюджет" options={priceRanges.map(p => ({ id: p.id, name: p.name }))} selectedIds={pending.priceRangeIds} onSelect={ids => setPending(p => ({ ...p, priceRangeIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} height="auto" />
        <SelectSheet isOpen={openFilterSheet === 'pending-geography'} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={pending.geographyIds} onSelect={ids => setPending(p => ({ ...p, geographyIds: ids as string[] }))} mode="multiple" showConfirm searchable height="half" />
      </div>
    );

    return null;
  };

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

        {/* ── TAB BAR ───────────────────────────────────────────────────── */}
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
              <span>{tab.label}</span>
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
                  <div className="flex items-center bg-slate-700/50 border border-slate-600/50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
                    <span className="px-3 text-slate-500 text-sm shrink-0 border-r border-slate-600/50">vk.com/</span>
                    <input type="text"
                      value={formData.vkLink.replace(/^https?:\/\/(www\.)?vk\.com\//, '')}
                      onChange={e => setFormData({ ...formData, vkLink: e.target.value ? `https://vk.com/${e.target.value}` : '' })}
                      placeholder="никнейм" className="flex-1 px-3 py-2.5 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>YouTube</label>
                  <div className="flex items-center bg-slate-700/50 border border-slate-600/50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
                    <span className="px-3 text-slate-500 text-sm shrink-0 border-r border-slate-600/50">youtube.com/</span>
                    <input type="text"
                      value={formData.youtubeLink.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}
                      onChange={e => setFormData({ ...formData, youtubeLink: e.target.value ? `https://www.youtube.com/${e.target.value}` : '' })}
                      placeholder="@никнейм" className="flex-1 px-3 py-2.5 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Telegram</label>
                  <div className="flex items-center bg-slate-700/50 border border-slate-600/50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
                    <span className="px-3 text-slate-500 text-sm shrink-0 border-r border-slate-600/50">t.me/</span>
                    <input type="text"
                      value={formData.telegramLink.replace(/^https?:\/\/(www\.)?t\.me\//, '')}
                      onChange={e => setFormData({ ...formData, telegramLink: e.target.value ? `https://t.me/${e.target.value}` : '' })}
                      placeholder="никнейм" className="flex-1 px-3 py-2.5 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {profile?.bio
                  ? <p className="text-slate-300 text-sm leading-relaxed">{profile.bio}</p>
                  : <EmptyState text="Биография не заполнена" />
                }
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

          {/* ── ПРОФЕССИЯ (edit + view) ────────────────────────────────── */}
          {activeTab === 'profession' && (
            isEditing ? (
              <div className="p-4 space-y-4">
                {/* ── User Services ── */}
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Headphones size={11} /> Мои услуги и параметры поиска</label>
                  <p className="text-xs text-slate-500 mb-2">Выберите услуги, по которым вас можно найти. Для каждой услуги настройте жанры, формат и другие параметры.</p>

                  {/* Existing service cards */}
                  <div className="space-y-2 mb-2">
                    {userServices.map((us, idx) => (
                      <div key={us.serviceId} className="bg-slate-700/30 rounded-xl border border-slate-600/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button type="button" onClick={() => setExpandedSvcIdx(expandedSvcIdx === idx ? null : idx)} className="flex-1 flex items-center justify-between text-left">
                            <div>
                              <p className="text-xs text-slate-500">{us.professionName}</p>
                              <p className="text-sm font-semibold text-white">{us.serviceName}</p>
                            </div>
                            <ChevronDown size={15} className={`text-slate-400 transition-transform mr-1 ${expandedSvcIdx === idx ? 'rotate-180' : ''}`} />
                          </button>
                          <button type="button"
                            onClick={() => {
                              setUserServices(prev => prev.filter((_, i) => i !== idx));
                              if (expandedSvcIdx === idx) setExpandedSvcIdx(null);
                            }}
                            className="flex-shrink-0 p-1 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {expandedSvcIdx === idx && <ServiceFilterEditors idx={idx} />}
                      </div>
                    ))}
                  </div>

                  {/* Add service flow */}
                  {addStep ? (
                    <AddServiceFlow />
                  ) : (
                    <button type="button"
                      onClick={() => setAddStep('field')}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm"
                    >
                      <Plus size={14} />Добавить услугу
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* ── view mode ── */
              <div className="p-4">
                {Object.keys(servicesByProfession).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(servicesByProfession).map(([professionId, services]) => {
                      const profName = (services as any[])[0]?.profession?.name ?? '';
                      return (
                        <div key={professionId}>
                          <p className="text-xs text-slate-500 font-semibold mb-1.5">{profName}</p>
                          <div className="space-y-2">
                            {(services as any[]).map((us: any) => {
                              const tags = [
                                ...(us.genres?.map((g: any) => g.name) ?? []),
                                ...(us.workFormats?.map((w: any) => w.name) ?? []),
                                ...(us.employmentTypes?.map((e: any) => e.name) ?? []),
                                ...(us.skillLevels?.map((s: any) => s.name) ?? []),
                                ...(us.availabilities?.map((a: any) => a.name) ?? []),
                                ...(us.priceRanges?.map((p: any) => p.name) ?? []),
                                ...(us.geographies?.map((g: any) => g.name) ?? []),
                              ];
                              return (
                                <div key={us.id} className="bg-slate-700/20 rounded-xl border border-slate-600/30 p-3">
                                  <p className="text-sm font-semibold text-white mb-1.5">{us.service?.name}</p>
                                  {tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {tags.map((t: string, i: number) => (
                                        <span key={i} className="px-2 py-0.5 bg-slate-600/40 text-slate-300 rounded-md text-xs border border-slate-600/30">{t}</span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-slate-500 text-xs">Фильтры не настроены</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState text="Услуги не добавлены" />
                )}
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
