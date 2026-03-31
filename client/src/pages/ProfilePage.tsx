import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, DollarSign, Calendar,
  Headphones, Edit3, User, Plus, ChevronDown, ChevronLeft, ChevronRight,
  Building2, FileText, Trash2,
} from 'lucide-react';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Услуги', icon: <Briefcase size={14} /> },
];

type ServiceCustomFilter = { id: string; name: string; values: { id: string; value: string }[] };

type UserServiceEntry = {
  fieldOfActivityId: string;
  fieldOfActivityName: string;
  professionId: string;
  professionName: string;
  serviceId: string;
  serviceName: string;
  allowedFilterTypes: string[];
  serviceCustomFilters: ServiceCustomFilter[];
  genreIds: string[];
  workFormatIds: string[];
  employmentTypeIds: string[];
  skillLevelIds: string[];
  availabilityIds: string[];
  geographyIds: string[];
  priceFrom: string;
  priceTo: string;
};

const emptyEntry = (): UserServiceEntry => ({
  fieldOfActivityId: '', fieldOfActivityName: '',
  professionId: '', professionName: '', serviceId: '', serviceName: '',
  allowedFilterTypes: [], serviceCustomFilters: [],
  genreIds: [], workFormatIds: [], employmentTypeIds: [], skillLevelIds: [],
  availabilityIds: [], geographyIds: [], priceFrom: '', priceTo: '',
});

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
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

  // User services state
  const [userServices, setUserServices] = useState<UserServiceEntry[]>([]);
  const [expandedSvcIdx, setExpandedSvcIdx] = useState<number | null>(null);
  const [openFilterSheet, setOpenFilterSheet] = useState<string | null>(null);

  const [portfolioFiles, setPortfolioFiles] = useState<any[]>([]);
  const [isUploadingPortfolio, setIsUploadingPortfolio] = useState(false);
  const [artists, setArtists] = useState<any[]>([]);
  const [employers, setEmployers] = useState<any[]>([]);
  const [openBasicSheet, setOpenBasicSheet] = useState<string | null>(null);

  // Add-service multi-step flow
  const [addStep, setAddStep] = useState<'field' | 'direction' | 'profession' | 'service' | 'filters' | null>(null);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [addFlowDirections, setAddFlowDirections] = useState<any[]>([]);
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
      referenceAPI.getArtists().then(r => setArtists(r.data));
      referenceAPI.getEmployers().then(r => setEmployers(r.data));
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
      setPortfolioFiles(data.portfolioFiles ?? []);
      setUserServices(
        data.userServices?.map((us: any) => ({
          fieldOfActivityId: us.profession?.direction?.fieldOfActivity?.id || '',
          fieldOfActivityName: us.profession?.direction?.fieldOfActivity?.name || '',
          professionId: us.professionId,
          professionName: us.profession?.name || '',
          serviceId: us.serviceId,
          serviceName: us.service?.name || '',
          allowedFilterTypes: us.service?.allowedFilterTypes || [],
          serviceCustomFilters: us.service?.customFilters || [],
          genreIds: us.genres?.map((g: any) => g.id) || [],
          workFormatIds: us.workFormats?.map((w: any) => w.id) || [],
          employmentTypeIds: us.employmentTypes?.map((e: any) => e.id) || [],
          skillLevelIds: us.skillLevels?.map((s: any) => s.id) || [],
          availabilityIds: us.availabilities?.map((a: any) => a.id) || [],
          geographyIds: us.geographies?.map((g: any) => g.id) || [],
          priceFrom: us.priceFrom != null ? String(us.priceFrom) : '',
          priceTo: us.priceTo != null ? String(us.priceTo) : '',
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

  const uploadBannerMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('banner', file);
      const { data } = await userAPI.uploadBanner(fd);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const updateMutation = useMutation({
    mutationFn: userAPI.updateMe,
  });

  const updateServicesMutation = useMutation({
    mutationFn: (services: typeof userServices) => userAPI.updateServices(
      services.map(us => ({
        professionId: us.professionId,
        serviceId: us.serviceId,
        genreIds: us.genreIds,
        workFormatIds: us.workFormatIds,
        employmentTypeIds: us.employmentTypeIds,
        skillLevelIds: us.skillLevelIds,
        availabilityIds: us.availabilityIds,
        geographyIds: us.geographyIds,
        priceFrom: us.priceFrom !== '' ? Number(us.priceFrom) : undefined,
        priceTo: us.priceTo !== '' ? Number(us.priceTo) : undefined,
      }))
    ),
  });

  const handleSave = async () => {
    try {
      await Promise.all([
        updateMutation.mutateAsync(formData),
        updateServicesMutation.mutateAsync(userServices),
      ]);
    } finally {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setIsEditing(false);
    }
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
  const bannerUrl = profile?.bannerImage ? `${API_URL}${profile.bannerImage}` : null;

  const inputCls = "w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  const EmptyState = ({ text }: { text: string }) => (
    <div className="py-8 text-center">
      <p className="text-slate-500 text-sm">{text}</p>
    </div>
  );

  const friendCount = (profile?._count?.sentRequests ?? 0) + (profile?._count?.receivedRequests ?? 0);
  const rating = (() => {
    if (!profile) return 0;
    let s = 0;
    if (profile.firstName) s += 5;
    if (profile.lastName) s += 5;
    if (profile.nickname) s += 5;
    if (profile.bio) s += 15;
    if (profile.avatar) s += 15;
    if (profile.country) s += 5;
    if (profile.city) s += 5;
    if (profile.vkLink) s += 5;
    if (profile.youtubeLink) s += 5;
    if (profile.telegramLink) s += 5;
    if (profile.employer) s += 5;
    if (profile.userArtists?.length > 0) s += 5;
    if (profile.userServices?.length > 0) s += 15;
    if (portfolioFiles.length > 0) s += 5;
    return Math.min(100, s);
  })();

  // Group userServices by field → profession for view mode
  const servicesByField = profile?.userServices?.reduce((acc: Record<string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }>, us: any) => {
    const fId = us.profession?.direction?.fieldOfActivity?.id || 'unknown';
    const fName = us.profession?.direction?.fieldOfActivity?.name || '';
    const pId = us.professionId;
    const pName = us.profession?.name || '';
    if (!acc[fId]) acc[fId] = { fieldName: fName, byProfession: {} };
    if (!acc[fId].byProfession[pId]) acc[fId].byProfession[pId] = { profName: pName, services: [] };
    acc[fId].byProfession[pId].services.push(us);
    return acc;
  }, {} as Record<string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }>) ?? {};

  // Helper: get name from list by id
  const getName = (list: any[], id: string) => list.find(x => x.id === id)?.name ?? id;
  const getNames = (list: any[], ids: string[]) => ids.map(id => getName(list, id)).filter(Boolean);

  // Update field of a userService entry
  const updateSvc = (idx: number, patch: Partial<UserServiceEntry>) =>
    setUserServices(prev => prev.map((us, i) => i === idx ? { ...us, ...patch } : us));

  const handlePortfolioUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (portfolioFiles.length >= 5) break;
      const fd = new FormData();
      fd.append('file', file);
      setIsUploadingPortfolio(true);
      try {
        const { data } = await userAPI.uploadPortfolio(fd);
        setPortfolioFiles(prev => [...prev, data]);
      } catch { /* ignore */ }
      finally { setIsUploadingPortfolio(false); }
    }
  };

  const handlePortfolioDelete = async (fileId: string) => {
    await userAPI.deletePortfolioFile(fileId);
    setPortfolioFiles(prev => prev.filter((f: any) => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Filter selectors for a service entry (edit mode expanded)
  const ServiceFilterEditors = ({ idx }: { idx: number }) => {
    const us = userServices[idx];
    const key = (k: string) => `${k}-${idx}`;
    const allowed = us.allowedFilterTypes;
    const show = (k: string) => allowed.includes(k);
    const hasAny = show('genre') || show('workFormat') || show('employmentType') || show('skillLevel') || show('availability') || show('priceRange') || show('geography') || us.serviceCustomFilters.length > 0;
    if (!hasAny) return (
      <div className="px-3 pb-3 border-t border-slate-600/30 pt-2">
        <p className="text-xs text-slate-500">Фильтры не настроены для этой услуги</p>
      </div>
    );
    return (
      <div className="px-3 pb-3 border-t border-slate-600/30 space-y-2 pt-2">
        {show('genre') && <SelectField label="Жанры" value={getNames(genres, us.genreIds).join(', ')} placeholder="Выберите жанры" icon={<Music size={13} />} onClick={() => setOpenFilterSheet(key('genre'))} badge={us.genreIds.length || undefined} />}
        {show('workFormat') && <SelectField label="Формат работы" value={getNames(workFormats, us.workFormatIds).join(', ')} placeholder="Не указан" icon={<Globe size={13} />} onClick={() => setOpenFilterSheet(key('workFormat'))} badge={us.workFormatIds.length || undefined} />}
        {show('employmentType') && <SelectField label="Тип занятости" value={getNames(employmentTypes, us.employmentTypeIds).join(', ')} placeholder="Не указан" icon={<Briefcase size={13} />} onClick={() => setOpenFilterSheet(key('employmentType'))} badge={us.employmentTypeIds.length || undefined} />}
        {show('skillLevel') && <SelectField label="Уровень" value={getNames(skillLevels, us.skillLevelIds).join(', ')} placeholder="Не указан" icon={<Star size={13} />} onClick={() => setOpenFilterSheet(key('skillLevel'))} badge={us.skillLevelIds.length || undefined} />}
        {show('availability') && <SelectField label="Доступность" value={getNames(availabilities, us.availabilityIds).join(', ')} placeholder="Не указана" icon={<Calendar size={13} />} onClick={() => setOpenFilterSheet(key('availability'))} badge={us.availabilityIds.length || undefined} />}
        {show('priceRange') && (
          <div>
            <p className="text-xs font-semibold mb-1 text-slate-400 flex items-center gap-1"><DollarSign size={13} />Бюджет (₽)</p>
            <div className="flex gap-2">
              <input type="number" min={0} placeholder="От" value={us.priceFrom} onChange={e => updateSvc(idx, { priceFrom: e.target.value })} className="flex-1 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
              <input type="number" min={0} placeholder="До" value={us.priceTo} onChange={e => updateSvc(idx, { priceTo: e.target.value })} className="flex-1 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>
        )}
        {show('geography') && <SelectField label="Город / Регион" value={getNames(geographies, us.geographyIds).join(', ')} placeholder="Не указан" icon={<MapPin size={13} />} onClick={() => setOpenFilterSheet(key('geography'))} badge={us.geographyIds.length || undefined} />}
        {us.serviceCustomFilters.map(cf => (
          <SelectField key={cf.id} label={cf.name} value="" placeholder="Выберите значение" icon={<Star size={13} />} onClick={() => {}} />
        ))}

        {show('genre') && <SelectSheet isOpen={openFilterSheet === key('genre')} onClose={() => setOpenFilterSheet(null)} title="Жанры" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.genreIds} onSelect={ids => updateSvc(idx, { genreIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />}
        {show('workFormat') && <SelectSheet isOpen={openFilterSheet === key('workFormat')} onClose={() => setOpenFilterSheet(null)} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={us.workFormatIds} onSelect={ids => updateSvc(idx, { workFormatIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('employmentType') && <SelectSheet isOpen={openFilterSheet === key('employmentType')} onClose={() => setOpenFilterSheet(null)} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={us.employmentTypeIds} onSelect={ids => updateSvc(idx, { employmentTypeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('skillLevel') && <SelectSheet isOpen={openFilterSheet === key('skillLevel')} onClose={() => setOpenFilterSheet(null)} title="Уровень" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={us.skillLevelIds} onSelect={ids => updateSvc(idx, { skillLevelIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('availability') && <SelectSheet isOpen={openFilterSheet === key('availability')} onClose={() => setOpenFilterSheet(null)} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={us.availabilityIds} onSelect={ids => updateSvc(idx, { availabilityIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('geography') && <SelectSheet isOpen={openFilterSheet === key('geography')} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.geographyIds} onSelect={ids => updateSvc(idx, { geographyIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />}
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
                setPending(prev => ({ ...prev, fieldOfActivityId: f.id, fieldOfActivityName: f.name }));
                referenceAPI.getDirections({ fieldOfActivityId: f.id }).then(r => setAddFlowDirections(r.data));
                setAddStep('direction');
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

    if (addStep === 'direction') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <button onClick={() => setAddStep('field')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors">
          <ChevronLeft size={11} />Назад
        </button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите направление:</p>
        {addFlowDirections.length === 0
          ? <p className="text-slate-500 text-xs">Нет направлений в этой сфере</p>
          : <div className="flex flex-wrap gap-1.5">
              {addFlowDirections.map((d: any) => (
                <button key={d.id} type="button"
                  onClick={() => {
                    referenceAPI.getProfessions({ directionId: d.id }).then(r => setAddFlowProfessions(r.data));
                    setAddStep('profession');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                >
                  <ChevronRight size={11} />{d.name}
                </button>
              ))}
            </div>
        }
        <button onClick={() => setAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
      </div>
    );

    if (addStep === 'profession') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
        <button onClick={() => setAddStep('direction')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors">
          <ChevronLeft size={11} />Назад
        </button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите профессию:</p>
        {addFlowProfessions.length === 0
          ? <p className="text-slate-500 text-xs">Нет профессий в этом направлении</p>
          : <div className="flex flex-wrap gap-1.5">
              {addFlowProfessions.map((p: any) => (
                <button key={p.id} type="button"
                  onClick={() => {
                    setPending(prev => ({ ...emptyEntry(), fieldOfActivityId: prev.fieldOfActivityId, fieldOfActivityName: prev.fieldOfActivityName, professionId: p.id, professionName: p.name }));
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
                      setPending(prev => ({ ...prev, serviceId: s.id, serviceName: s.name, allowedFilterTypes: s.allowedFilterTypes || [], serviceCustomFilters: s.customFilters || [] }));
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
        {(() => {
          const pAllowed = pending.allowedFilterTypes;
          const pShow = (k: string) => pAllowed.includes(k);
          const pHasAny = pShow('genre') || pShow('workFormat') || pShow('employmentType') || pShow('skillLevel') || pShow('availability') || pShow('priceRange') || pShow('geography') || pending.serviceCustomFilters.length > 0;
          if (!pHasAny) return <p className="text-xs text-slate-500">Фильтры не настроены для этой услуги</p>;
          return (
            <div className="space-y-2">
              {pShow('genre') && <SelectField label="Жанры" value={getNames(genres, pending.genreIds).join(', ')} placeholder="Выберите жанры" icon={<Music size={13} />} onClick={() => setOpenFilterSheet('pending-genre')} badge={pending.genreIds.length || undefined} />}
              {pShow('workFormat') && <SelectField label="Формат работы" value={getNames(workFormats, pending.workFormatIds).join(', ')} placeholder="Не указан" icon={<Globe size={13} />} onClick={() => setOpenFilterSheet('pending-workFormat')} badge={pending.workFormatIds.length || undefined} />}
              {pShow('employmentType') && <SelectField label="Тип занятости" value={getNames(employmentTypes, pending.employmentTypeIds).join(', ')} placeholder="Не указан" icon={<Briefcase size={13} />} onClick={() => setOpenFilterSheet('pending-employmentType')} badge={pending.employmentTypeIds.length || undefined} />}
              {pShow('skillLevel') && <SelectField label="Уровень" value={getNames(skillLevels, pending.skillLevelIds).join(', ')} placeholder="Не указан" icon={<Star size={13} />} onClick={() => setOpenFilterSheet('pending-skillLevel')} badge={pending.skillLevelIds.length || undefined} />}
              {pShow('availability') && <SelectField label="Доступность" value={getNames(availabilities, pending.availabilityIds).join(', ')} placeholder="Не указана" icon={<Calendar size={13} />} onClick={() => setOpenFilterSheet('pending-availability')} badge={pending.availabilityIds.length || undefined} />}
              {pShow('priceRange') && (
                <div>
                  <p className="text-xs font-semibold mb-1 text-slate-400 flex items-center gap-1"><DollarSign size={13} />Бюджет (₽)</p>
                  <div className="flex gap-2">
                    <input type="number" min={0} placeholder="От" value={pending.priceFrom} onChange={e => setPending(p => ({ ...p, priceFrom: e.target.value }))} className="flex-1 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    <input type="number" min={0} placeholder="До" value={pending.priceTo} onChange={e => setPending(p => ({ ...p, priceTo: e.target.value }))} className="flex-1 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                </div>
              )}
              {pShow('geography') && <SelectField label="Город / Регион" value={getNames(geographies, pending.geographyIds).join(', ')} placeholder="Не указан" icon={<MapPin size={13} />} onClick={() => setOpenFilterSheet('pending-geography')} badge={pending.geographyIds.length || undefined} />}
              {pending.serviceCustomFilters.map(cf => (
                <SelectField key={cf.id} label={cf.name} value="" placeholder="Выберите значение" icon={<Star size={13} />} onClick={() => {}} />
              ))}
            </div>
          );
        })()}
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
        <SelectSheet isOpen={openFilterSheet === 'pending-geography'} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={pending.geographyIds} onSelect={ids => setPending(p => ({ ...p, geographyIds: ids as string[] }))} mode="multiple" showConfirm searchable height="half" />
      </div>
    );

    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28">

        {/* ── HERO CARD ────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-4 bg-slate-900 relative">
          {/* Full-bleed cover image */}
          {bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />}
          {bannerUrl && <div className="absolute inset-0 bg-black/50 z-0" />}
          {/* Banner */}
          <div className="relative h-28 group z-20">
            {!bannerUrl && <div className="absolute inset-0 bg-gradient-to-br from-primary-900/70 via-purple-900/50 to-slate-900 opacity-100" />}
            {!bannerUrl && <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 15% 60%, rgba(99,102,241,0.5) 0%, transparent 55%), radial-gradient(circle at 85% 20%, rgba(168,85,247,0.5) 0%, transparent 55%)' }} />}
            {/* Banner upload button */}
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="absolute bottom-2 left-2 z-10 flex items-center gap-1 px-2 py-1 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white rounded-lg text-[10px] font-medium transition-all opacity-0 group-hover:opacity-100"
            >
              <Camera size={10} />Фон
            </button>
            <input ref={bannerInputRef} type="file" accept="image/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBannerMutation.mutate(f); e.target.value = ''; }}
              className="hidden" />
            {/* Actions */}
            <div className="absolute top-3 right-3 flex gap-1.5 z-10">
              {isEditing ? (
                <>
                  <button onClick={() => setIsEditing(false)} className="p-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700 rounded-lg border border-slate-600/50 transition-all">
                    <X size={14} className="text-slate-300" />
                  </button>
                  <button onClick={handleSave} disabled={updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg text-white text-xs font-medium transition-all disabled:opacity-60 shadow-lg shadow-primary-500/30">
                    <Save size={12} />Сохранить
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700 rounded-lg border border-slate-600/50 hover:border-primary-500/50 text-slate-300 hover:text-white text-xs font-medium transition-all">
                    <Edit3 size={12} />Изменить
                  </button>
                  <button onClick={logout} className="p-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700 rounded-lg border border-slate-600/50 text-slate-400 hover:text-red-400 transition-all">
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>
            {/* Avatar overlapping banner */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl overflow-hidden ring-2 ring-primary-500/40 ring-offset-2 ring-offset-slate-900 shadow-xl shadow-primary-500/20">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">{profile?.firstName?.[0]}{profile?.lastName?.[0]}</span>
                      </div>
                  }
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-1.5 -right-1.5 bg-primary-500 hover:bg-primary-600 text-white p-1.5 rounded-lg shadow-lg transition-all">
                  <Camera size={11} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatarMutation.mutate(f); e.target.value = ''; }}
                  className="hidden" />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="pt-12 pb-4 px-4 text-center relative z-10">
            <h2 className="text-lg font-bold text-white leading-tight">
              {profile?.firstName} {profile?.lastName}
            </h2>
            {profile?.nickname && <p className="text-slate-400 text-sm mt-0.5">@{profile.nickname}</p>}
            {profile?.role && (
              <span className="block mt-1.5 px-2.5 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-full border border-primary-500/30 text-center">
                {profile.role}
              </span>
            )}

            {/* Location chips */}
            {(profile?.city || profile?.country) && (
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                {profile?.city && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
                    <MapPin size={10} className="text-primary-400" />{profile.city}
                  </span>
                )}
                {profile?.country && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
                    <Globe size={10} className="text-slate-500" />{profile.country}
                  </span>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center mt-3 bg-slate-800/50 rounded-xl border border-slate-700/50 divide-x divide-slate-700/50">
              <div className="flex-1 py-2.5 text-center">
                <div className="text-base font-bold text-white">{friendCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Друзья</div>
              </div>
              <div className="flex-1 py-2.5 text-center">
                <div className="text-base font-bold text-white">{rating}<span className="text-xs text-slate-500 font-normal">/100</span></div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Профиль</div>
              </div>
            </div>
            <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full transition-all" style={{ width: `${rating}%` }} />
            </div>

            {/* Social links */}
            {(profile?.vkLink || profile?.youtubeLink || profile?.telegramLink) && (
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                {profile?.vkLink && (
                  <a href={profile.vkLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 text-xs font-semibold rounded-full transition-all">
                    VK
                  </a>
                )}
                {profile?.youtubeLink && (
                  <a href={profile.youtubeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold rounded-full transition-all">
                    YT
                  </a>
                )}
                {profile?.telegramLink && (
                  <a href={profile.telegramLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-full transition-all">
                    TG
                  </a>
                )}
              </div>
            )}
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
                {/* Моя группа */}
                <div>
                  <label className={labelCls}>Моя группа</label>
                  <SelectField
                    label=""
                    value={formData.artistIds.map(id => artists.find((a: any) => a.id === id)?.name ?? profile?.userArtists?.find((ua: any) => ua.artistId === id)?.artist?.name ?? '').filter(Boolean).join(', ')}
                    placeholder="Выберите группу или артиста"
                    icon={<Music size={13} />}
                    onClick={() => setOpenBasicSheet('artists')}
                    badge={formData.artistIds.length || undefined}
                  />
                  <SelectSheet
                    isOpen={openBasicSheet === 'artists'}
                    onClose={() => setOpenBasicSheet(null)}
                    title="Моя группа"
                    options={artists.map((a: any) => ({ id: a.id, name: a.name }))}
                    selectedIds={formData.artistIds}
                    onSelect={ids => setFormData({ ...formData, artistIds: ids as string[] })}
                    mode="multiple"
                    showConfirm
                    searchable
                    height="half"
                  />
                </div>
                {/* Мой работодатель */}
                <div>
                  <label className={labelCls}>Мой работодатель</label>
                  <SelectField
                    label=""
                    value={employers.find((e: any) => e.id === formData.employerId)?.name ?? profile?.employer?.name ?? ''}
                    placeholder="Выберите работодателя"
                    icon={<Building2 size={13} />}
                    onClick={() => setOpenBasicSheet('employer')}
                  />
                  <SelectSheet
                    isOpen={openBasicSheet === 'employer'}
                    onClose={() => setOpenBasicSheet(null)}
                    title="Мой работодатель"
                    options={employers.map((e: any) => ({ id: e.id, name: e.name, subtitle: e.inn ? `ИНН ${e.inn}` : undefined }))}
                    selectedIds={formData.employerId}
                    onSelect={id => setFormData({ ...formData, employerId: id as string })}
                    mode="single"
                    searchable
                    height="half"
                  />
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
                {/* Моё портфолио */}
                <div>
                  <label className={labelCls}>Моё портфолио</label>
                  <p className="text-xs text-slate-500 mb-2">До 5 файлов, не более 5 МБ каждый</p>
                  <div className="space-y-1.5 mb-2">
                    {portfolioFiles.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 rounded-xl border border-slate-600/50">
                        <FileText size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="flex-1 text-xs text-slate-300 truncate">{f.originalName}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(f.size)}</span>
                        <button type="button" onClick={() => handlePortfolioDelete(f.id)} className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {portfolioFiles.length < 5 && (
                    <label className={`flex items-center justify-center gap-2 py-2.5 border border-dashed rounded-xl text-sm transition-all cursor-pointer ${isUploadingPortfolio ? 'border-slate-600 text-slate-500' : 'border-slate-600 text-slate-400 hover:text-primary-400 hover:border-primary-500/50'}`}>
                      <input type="file" multiple accept="*/*" className="hidden" disabled={isUploadingPortfolio}
                        onChange={e => handlePortfolioUpload(e.target.files)} />
                      {isUploadingPortfolio ? 'Загрузка...' : `+ Добавить файл (${portfolioFiles.length}/5)`}
                    </label>
                  )}
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
                {/* Groups */}
                {profile?.userArtists?.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                    <span className="w-full text-xs text-slate-500 font-semibold">Группы / Артисты</span>
                    {profile.userArtists.map((ua: any) => (
                      <span key={ua.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 rounded-xl text-purple-300 text-xs border border-purple-500/20">
                        <Music size={11} />{ua.artist?.name}
                      </span>
                    ))}
                  </div>
                )}
                {/* Employer */}
                {profile?.employer && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                    <span className="w-full text-xs text-slate-500 font-semibold">Работодатель</span>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-xl text-green-300 text-xs border border-green-500/20">
                      <Building2 size={11} />{profile.employer.name}
                    </span>
                  </div>
                )}
                {/* Portfolio */}
                {portfolioFiles.length > 0 && (
                  <div className="pt-2 border-t border-slate-700/50">
                    <p className="text-xs text-slate-500 font-semibold mb-2">Портфолио</p>
                    <div className="space-y-1.5">
                      {portfolioFiles.map((f: any) => (
                        <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-slate-700/20 rounded-xl border border-slate-600/30 hover:border-primary-500/30 transition-colors">
                          <FileText size={13} className="text-slate-400 flex-shrink-0" />
                          <span className="flex-1 text-xs text-slate-300 truncate">{f.originalName}</span>
                          <span className="text-xs text-slate-500">{formatFileSize(f.size)}</span>
                        </a>
                      ))}
                    </div>
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

                  {/* Existing service cards grouped by field */}
                  {(() => {
                    const byField: Record<string, { fieldName: string; entries: { us: UserServiceEntry; idx: number }[] }> = {};
                    userServices.forEach((us, idx) => {
                      const fId = us.fieldOfActivityId || 'unknown';
                      if (!byField[fId]) byField[fId] = { fieldName: us.fieldOfActivityName, entries: [] };
                      byField[fId].entries.push({ us, idx });
                    });
                    return (
                      <div className="space-y-3 mb-2">
                        {Object.entries(byField).map(([fId, { fieldName, entries }]) => (
                          <div key={fId}>
                            <p className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-1.5">{fieldName}</p>
                            <div className="space-y-2 pl-2 border-l border-primary-500/20">
                              {entries.map(({ us, idx }) => (
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
                          </div>
                        ))}
                      </div>
                    );
                  })()}

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
                {Object.keys(servicesByField).length > 0 ? (
                  <div className="space-y-4">
                    {(Object.entries(servicesByField) as [string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }][]).map(([fieldId, { fieldName, byProfession }]) => (
                      <div key={fieldId}>
                        {/* Field of activity header */}
                        <p className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2">{fieldName}</p>
                        <div className="space-y-3 pl-2 border-l border-primary-500/20">
                          {(Object.entries(byProfession) as [string, { profName: string; services: any[] }][]).map(([professionId, { profName, services }]) => (
                            <div key={professionId}>
                              <p className="text-xs text-slate-500 font-semibold mb-1.5">{profName}</p>
                              <div className="space-y-2">
                                {services.map((us: any) => {
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
                          ))}
                        </div>
                      </div>
                    ))}
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
