import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI, connectionAPI, groupAPI } from '../lib/api';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, DollarSign, Calendar, Film, Image,
  Headphones, Edit3, User, Plus, ChevronDown, ChevronLeft, ChevronRight,
  FileText, Trash2, Radio, Loader2, Crown, BadgeCheck, Ban, Link2,
} from 'lucide-react';
import ConnectionViewModal from '../components/ConnectionViewModal';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';
import { channelAPI } from '../lib/api';
import { SocialIconRow, SocialLinksEditor } from '../components/SocialLinks';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import ShareButton from '../components/ShareButton';
import { plural } from '../lib/plural';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type Tab = 'basic' | 'profession' | 'channel';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',   icon: <User size={14} /> },
  { id: 'profession', label: 'Мои услуги', icon: <Briefcase size={14} /> },
  { id: 'channel',    label: 'Канал',      icon: <Radio size={14} /> },
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
  customFilterValueIds: Record<string, string[]>; // filterId → [valueId, ...]
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
  allowedFilterTypes: [], serviceCustomFilters: [], customFilterValueIds: {},
  genreIds: [], workFormatIds: [], employmentTypeIds: [], skillLevelIds: [],
  availabilityIds: [], geographyIds: [], priceFrom: '', priceTo: '',
});

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('basic');

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', nickname: '', bio: '',
    country: '', city: '', role: '', genres: [] as string[],
    socialLinks: {} as Record<string, string>,
    fieldOfActivityId: '',
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
  const [lightboxFile, setLightboxFile] = useState<any>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [openBasicSheet, setOpenBasicSheet] = useState<string | null>(null);

  // Add-service multi-step flow
  const [addStep, setAddStep] = useState<'field' | 'direction' | 'profession' | 'service' | 'filters' | null>(null);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [addFlowDirections, setAddFlowDirections] = useState<any[]>([]);
  const [addFlowProfessions, setAddFlowProfessions] = useState<any[]>([]);
  const [addFlowServices, setAddFlowServices] = useState<any[]>([]);

  useEffect(() => {
    if (isEditing) {
      lockScroll();
      referenceAPI.getFieldsOfActivity({ all: true }).then(r => setFieldsOfActivity(r.data));
      referenceAPI.getWorkFormats().then(r => setWorkFormats(r.data));
      referenceAPI.getEmploymentTypes().then(r => setEmploymentTypes(r.data));
      referenceAPI.getSkillLevels().then(r => setSkillLevels(r.data));
      referenceAPI.getAvailabilities().then(r => setAvailabilities(r.data));
      referenceAPI.getGenres().then(r => setGenres(r.data));
      referenceAPI.getGeographies().then(r => setGeographies(r.data));
      referenceAPI.getArtists().then(r => setArtists(r.data));
    } else {
      unlockScroll();
    }
    return () => unlockScroll();
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
        socialLinks: (data.socialLinks as Record<string, string>) || {},
        fieldOfActivityId: data.fieldOfActivityId || '',
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
          allowedFilterTypes: us.profession?.direction?.allowedFilterTypes || [],
          serviceCustomFilters: us.profession?.direction?.customFilters || [],
          customFilterValueIds: (us.selectedCustomFilterValues || []).reduce((acc: Record<string, string[]>, v: any) => {
            if (!acc[v.filterId]) acc[v.filterId] = [];
            acc[v.filterId].push(v.id);
            return acc;
          }, {}),
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

  // ── Channel ────────────────────────────────────────────────────────────────
  const [channelForm, setChannelForm] = useState({ name: '', description: '' });
  const [channelEditing, setChannelEditing] = useState(false);
  const channelAvatarRef = useRef<HTMLInputElement>(null);

  const [viewConn, setViewConn] = useState<any>(null);
  const [connExpanded, setConnExpanded] = useState(false);

  const { data: myConnections = [] } = useQuery({
    queryKey: ['connections-accepted'],
    queryFn: async () => { const { data } = await connectionAPI.getAccepted(); return data; },
  });

  const { data: myGroups = [] } = useQuery({
    queryKey: ['my-groups'],
    queryFn: async () => { const { data } = await groupAPI.getMyGroups(); return data as any[]; },
  });

  const { data: myChannel, refetch: refetchChannel } = useQuery({
    queryKey: ['my-channel'],
    queryFn: async () => {
      const { data } = await channelAPI.getMyChannel();
      return data as { id: string; name: string; description: string | null; avatar: string | null; _count: { subscriptions: number; posts: number } } | null;
    },
  });

  const createChannelMut = useMutation({
    mutationFn: () => channelAPI.createChannel({ name: channelForm.name.trim(), description: channelForm.description.trim() || undefined }),
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['my-channel'] }); setChannelForm({ name: '', description: '' }); },
  });

  const updateChannelMut = useMutation({
    mutationFn: () => channelAPI.updateChannel({ name: channelForm.name.trim(), description: channelForm.description.trim() || undefined }),
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['my-channel'] }); setChannelEditing(false); },
  });

  const deleteChannelMut = useMutation({
    mutationFn: () => channelAPI.deleteChannel(),
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['my-channel'] }); },
  });

  const uploadChannelAvatarMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('avatar', file);
      const { data } = await channelAPI.uploadAvatar(fd);
      return data;
    },
    onSuccess: () => { refetchChannel(); queryClient.invalidateQueries({ queryKey: ['my-channel'] }); },
  });

  const handleChannelAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadChannelAvatarMut.mutate(file);
    e.target.value = '';
  };

  const startEditChannel = () => {
    if (myChannel) {
      setChannelForm({ name: myChannel.name, description: myChannel.description || '' });
      setChannelEditing(true);
    }
  };

  // ── End Channel ─────────────────────────────────────────────────────────────

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
        customFilterValueIds: Object.values(us.customFilterValueIds).flat(),
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30" />
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  const friendCount = (profile?._count?.sentRequests ?? 0) + (profile?._count?.receivedRequests ?? 0);


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
          <SelectField key={cf.id} label={cf.name} value={(us.customFilterValueIds[cf.id] || []).map(vid => cf.values.find(v => v.id === vid)?.value || vid).join(', ')} placeholder="Выберите значение" icon={<Star size={13} />} onClick={() => setOpenFilterSheet(key(`cf-${cf.id}`))} badge={(us.customFilterValueIds[cf.id] || []).length || undefined} />
        ))}

        {show('genre') && <SelectSheet isOpen={openFilterSheet === key('genre')} onClose={() => setOpenFilterSheet(null)} title="Жанры" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.genreIds} onSelect={ids => updateSvc(idx, { genreIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />}
        {show('workFormat') && <SelectSheet isOpen={openFilterSheet === key('workFormat')} onClose={() => setOpenFilterSheet(null)} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={us.workFormatIds} onSelect={ids => updateSvc(idx, { workFormatIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('employmentType') && <SelectSheet isOpen={openFilterSheet === key('employmentType')} onClose={() => setOpenFilterSheet(null)} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={us.employmentTypeIds} onSelect={ids => updateSvc(idx, { employmentTypeIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('skillLevel') && <SelectSheet isOpen={openFilterSheet === key('skillLevel')} onClose={() => setOpenFilterSheet(null)} title="Уровень" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={us.skillLevelIds} onSelect={ids => updateSvc(idx, { skillLevelIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('availability') && <SelectSheet isOpen={openFilterSheet === key('availability')} onClose={() => setOpenFilterSheet(null)} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={us.availabilityIds} onSelect={ids => updateSvc(idx, { availabilityIds: ids as string[] })} mode="multiple" showConfirm searchable={false} height="auto" />}
        {show('geography') && <SelectSheet isOpen={openFilterSheet === key('geography')} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={us.geographyIds} onSelect={ids => updateSvc(idx, { geographyIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />}
        {us.serviceCustomFilters.map(cf => (
          <SelectSheet key={cf.id} isOpen={openFilterSheet === key(`cf-${cf.id}`)} onClose={() => setOpenFilterSheet(null)} title={cf.name} options={cf.values.map(v => ({ id: v.id, name: v.value }))} selectedIds={us.customFilterValueIds[cf.id] || []} onSelect={ids => updateSvc(idx, { customFilterValueIds: { ...us.customFilterValueIds, [cf.id]: ids as string[] } })} mode="multiple" showConfirm searchable={false} height="auto" />
        ))}
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
                referenceAPI.getDirections({ fieldOfActivityId: f.id, all: true }).then(r => setAddFlowDirections(r.data));
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
                    referenceAPI.getProfessions({ directionId: d.id, all: true }).then(r => setAddFlowProfessions(r.data));
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
                <SelectField key={cf.id} label={cf.name} value={(pending.customFilterValueIds[cf.id] || []).map(vid => cf.values.find(v => v.id === vid)?.value || vid).join(', ')} placeholder="Выберите значение" icon={<Star size={13} />} onClick={() => setOpenFilterSheet(`pending-cf-${cf.id}`)} badge={(pending.customFilterValueIds[cf.id] || []).length || undefined} />
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
        {pending.serviceCustomFilters.map(cf => (
          <SelectSheet key={cf.id} isOpen={openFilterSheet === `pending-cf-${cf.id}`} onClose={() => setOpenFilterSheet(null)} title={cf.name} options={cf.values.map(v => ({ id: v.id, name: v.value }))} selectedIds={pending.customFilterValueIds[cf.id] || []} onSelect={ids => setPending(p => ({ ...p, customFilterValueIds: { ...p.customFilterValueIds, [cf.id]: ids as string[] } }))} mode="multiple" showConfirm searchable={false} height="auto" />
        ))}
      </div>
    );

    return null;
  };

  // ── Edit-mode modal content for "Основное" tab ────────────────────────────
  const EditBasicTab = () => (
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
        <label className={labelCls}>Моя группа</label>
        <SelectField label="" value={formData.artistIds.map(id => artists.find((a: any) => a.id === id)?.name ?? profile?.userArtists?.find((ua: any) => ua.artistId === id)?.artist?.name ?? '').filter(Boolean).join(', ')} placeholder="Выберите группу или артиста" icon={<Music size={13} />} onClick={() => setOpenBasicSheet('artists')} badge={formData.artistIds.length || undefined} />
        <SelectSheet isOpen={openBasicSheet === 'artists'} onClose={() => setOpenBasicSheet(null)} title="Моя группа" options={artists.map((a: any) => ({ id: a.id, name: a.name }))} selectedIds={formData.artistIds} onSelect={ids => setFormData({ ...formData, artistIds: ids as string[] })} mode="multiple" showConfirm searchable height="half" />
      </div>
      <div>
        <label className={labelCls}>Социальные сети и сервисы</label>
        <SocialLinksEditor value={formData.socialLinks} onChange={v => setFormData({ ...formData, socialLinks: v })} />
      </div>
      <div>
        <label className={labelCls}>Портфолио</label>
        <p className="text-xs text-slate-500 mb-2">До 5 файлов, не более 5 МБ каждый</p>
        <div className="space-y-1.5 mb-2">
          {portfolioFiles.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 rounded-xl border border-slate-600/50">
              <FileText size={14} className="text-slate-400 flex-shrink-0" />
              <span className="flex-1 text-xs text-slate-300 truncate">{f.originalName}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(f.size)}</span>
              <button type="button" onClick={() => handlePortfolioDelete(f.id)} className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all flex-shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        {portfolioFiles.length < 5 && (
          <label className={`flex items-center justify-center gap-2 py-2.5 border border-dashed rounded-xl text-sm transition-all cursor-pointer ${isUploadingPortfolio ? 'border-slate-600 text-slate-500' : 'border-slate-600 text-slate-400 hover:text-primary-400 hover:border-primary-500/50'}`}>
            <input type="file" multiple accept="*/*" className="hidden" disabled={isUploadingPortfolio} onChange={e => handlePortfolioUpload(e.target.files)} />
            {isUploadingPortfolio ? 'Загрузка...' : `+ Добавить файл (${portfolioFiles.length}/5)`}
          </label>
        )}
      </div>
    </div>
  );

  // ── Edit-mode modal content for "Услуги" tab ───────────────────────────────
  const EditServicesTab = () => {
    const byField: Record<string, { fieldName: string; entries: { us: UserServiceEntry; idx: number }[] }> = {};
    userServices.forEach((us, idx) => {
      const fId = us.fieldOfActivityId || 'unknown';
      if (!byField[fId]) byField[fId] = { fieldName: us.fieldOfActivityName, entries: [] };
      byField[fId].entries.push({ us, idx });
    });
    return (
      <div className="p-4 space-y-4">
        <p className="text-xs text-slate-500">Выберите услуги, по которым вас можно найти. Для каждой услуги настройте жанры, формат и другие параметры.</p>
        <div className="space-y-3">
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
                      <button type="button" onClick={() => { setUserServices(prev => prev.filter((_, i) => i !== idx)); if (expandedSvcIdx === idx) setExpandedSvcIdx(null); }} className="flex-shrink-0 p-1 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all"><X size={14} /></button>
                    </div>
                    {expandedSvcIdx === idx && <ServiceFilterEditors idx={idx} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {addStep ? <AddServiceFlow /> : (
          <button type="button" onClick={() => setAddStep('field')} className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm">
            <Plus size={14} />Добавить услугу
          </button>
        )}
      </div>
    );
  };

  // ── Edit-mode modal content for "Канал" tab ────────────────────────────────
  const EditChannelTab = () => (
    <div className="p-4 space-y-4">
      {myChannel ? (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-700 border border-slate-600 flex items-center justify-center">
                {myChannel.avatar ? <img src={getAvatarUrl(myChannel.avatar)!} alt="" className="w-full h-full object-cover" /> : <Radio size={24} className="text-slate-500" />}
              </div>
              <button onClick={() => channelAvatarRef.current?.click()} className="absolute -bottom-1 -right-1 p-1 bg-primary-600 hover:bg-primary-500 rounded-full shadow transition-colors"><Camera size={10} className="text-white" /></button>
              <input ref={channelAvatarRef} type="file" accept="image/*" className="hidden" onChange={handleChannelAvatarChange} />
            </div>
            <div className="flex-1 min-w-0">
              {channelEditing ? (
                <input value={channelForm.name} onChange={e => setChannelForm(f => ({ ...f, name: e.target.value }))} className="w-full px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-white" placeholder="Название канала" />
              ) : (
                <p className="text-base font-semibold text-white truncate">{myChannel.name}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                <span>{myChannel._count.subscriptions} {plural(myChannel._count.subscriptions, 'подписчик', 'подписчика', 'подписчиков')}</span>
                <span>{myChannel._count.posts} {plural(myChannel._count.posts, 'пост', 'поста', 'постов')}</span>
              </div>
            </div>
          </div>
          {channelEditing ? (
            <textarea value={channelForm.description} onChange={e => setChannelForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Описание канала..." className="w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500 resize-none" />
          ) : myChannel.description ? (
            <p className="text-sm text-slate-400 leading-relaxed">{myChannel.description}</p>
          ) : (
            <p className="text-sm text-slate-600 italic">Нет описания</p>
          )}
          {channelEditing ? (
            <div className="flex gap-2">
              <button onClick={() => setChannelEditing(false)} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
              <button onClick={() => updateChannelMut.mutate()} disabled={updateChannelMut.isPending || !channelForm.name.trim()} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {updateChannelMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Сохранить
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={startEditChannel} className="flex-1 py-2 text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-colors flex items-center justify-center gap-1.5"><Edit3 size={14} />Редактировать</button>
              <button onClick={() => { if (confirm('Удалить канал? Все посты канала будут отвязаны.')) deleteChannelMut.mutate(); }} disabled={deleteChannelMut.isPending} className="py-2 px-3 text-sm text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-xl transition-colors">
                {deleteChannelMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col items-center py-4 text-center">
            <div className="p-4 bg-slate-800/50 rounded-2xl mb-3"><Radio size={28} className="text-slate-500" /></div>
            <p className="text-white font-semibold mb-1">У вас нет канала</p>
            <p className="text-slate-500 text-sm">Создайте канал, чтобы публиковать посты от его имени</p>
          </div>
          <input value={channelForm.name} onChange={e => setChannelForm(f => ({ ...f, name: e.target.value }))} placeholder="Название канала *" className="w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500" />
          <textarea value={channelForm.description} onChange={e => setChannelForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Описание (необязательно)" className="w-full px-3.5 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-slate-500 resize-none" />
          <button onClick={() => createChannelMut.mutate()} disabled={createChannelMut.isPending || !channelForm.name.trim()} className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
            {createChannelMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Создать канал
          </button>
        </div>
      )}
    </div>
  );

  const aUrl = getAvatarUrl(profile?.avatar);
  const bUrl = profile?.bannerImage ? `${API_URL}${profile.bannerImage}` : null;
  const hasSocialLinks = Object.values((profile?.socialLinks as Record<string, string>) || {}).some(Boolean);

  // Unique profession names from UserService chain
  const professionNames = (() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const us of profile?.userServices ?? []) {
      const name = us.profession?.name;
      if (name && !seen.has(name)) { seen.add(name); names.push(name); }
    }
    return names;
  })();

  // Flat list of services for carousel
  const servicesFlat = (Object.values(servicesByField) as { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }[]).flatMap(({ fieldName, byProfession }) =>
    Object.values(byProfession).flatMap(({ profName, services }) =>
      services.map((us: any) => ({ ...us, _profName: profName, _fieldName: fieldName }))
    )
  );

  // Portfolio categorised by mimeType
  const photoFiles = portfolioFiles.filter(f => f.mimeType?.startsWith('image/'));
  const audioFiles = portfolioFiles.filter(f => f.mimeType?.startsWith('audio/'));
  const videoFiles = portfolioFiles.filter(f => f.mimeType?.startsWith('video/'));
  const otherFiles = portfolioFiles.filter(f =>
    !f.mimeType?.startsWith('image/') && !f.mimeType?.startsWith('audio/') && !f.mimeType?.startsWith('video/')
  );

  return (
    <>
    <div className="min-h-screen bg-slate-950">

      {/* ── LIGHTBOX ─────────────────────────────────────────────────────── */}
      {lightboxFile && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
          onClick={() => setLightboxFile(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full transition-colors"
            onClick={() => setLightboxFile(null)}
          >
            <X size={20} />
          </button>
          <img
            src={`${API_URL}${lightboxFile.url}`}
            alt={lightboxFile.originalName}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <p className="mt-3 text-xs text-slate-500">{lightboxFile.originalName}</p>
        </div>
      )}

      {/* ── EDIT MODAL (full-screen) ─────────────────────────────────────── */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          {/* Modal header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0 bg-slate-950">
            <button onClick={() => setIsEditing(false)} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
              <X size={20} />
            </button>
            <span className="font-semibold text-white text-sm">Редактирование профиля</span>
            <button onClick={handleSave} disabled={updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
              {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Сохранить
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-2 bg-slate-950 border-b border-slate-800 flex-shrink-0">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-6" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            {activeTab === 'basic' && EditBasicTab()}
            {activeTab === 'profession' && EditServicesTab()}
            {activeTab === 'channel' && EditChannelTab()}
          </div>
        </div>
      )}

      {/* ── VIEW MODE ────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto pb-28">

        {/* Banner */}
        <div className="relative group">
          <div className="h-32 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
          </div>
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
          >
            <Camera size={12} />Сменить фон
          </button>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadBannerMutation.mutate(f); e.target.value = ''; }} />
        </div>

        <div className="px-4">
          {/* Avatar + action buttons row */}
          <div className="flex items-end justify-between -mt-14 mb-5">
            <div className="relative z-10">
              <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-slate-950 shadow-2xl bg-gradient-to-br from-primary-500 to-purple-600">
                {aUrl
                  ? <img src={aUrl} alt="Avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">{profile?.firstName?.[0]}{profile?.lastName?.[0]}</span>
                    </div>
                }
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0.5 right-0.5 bg-primary-500 hover:bg-primary-600 text-white p-2 rounded-full shadow-lg transition-all border-2 border-slate-950">
                <Camera size={13} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatarMutation.mutate(f); e.target.value = ''; }} />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <ShareButton
                url={`/profile/${profile?.id}`}
                title={`${profile?.firstName} ${profile?.lastName} — Moooza`}
                text={profile?.bio?.slice(0, 100)}
                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                iconSize={16}
              />
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white rounded-xl text-sm font-medium transition-all">
                <Edit3 size={15} />Редактировать
              </button>
            </div>
          </div>

          {/* 1. ФИО */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h1 className="text-2xl font-bold text-white leading-tight">{profile?.firstName} {profile?.lastName}</h1>
            {profile?.isPremium && <span title="Premium"><Crown size={18} className="text-amber-400" /></span>}
            {profile?.isVerified && <span title="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></span>}
            {profile?.isBlocked && <span title="Заблокирован"><Ban size={18} className="text-red-500" /></span>}
          </div>

          {/* 2. Ник + Гео */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-1">
            {profile?.nickname && <span>@{profile.nickname}</span>}
            {(profile?.city || profile?.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Stats — compact inline */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
            <span><span className="font-semibold text-slate-300">{friendCount}</span> друзей</span>
            {servicesFlat.length > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{servicesFlat.length}</span> услуг</span></>}
            {myConnections.length > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{myConnections.length}</span> {plural(myConnections.length, 'связь', 'связи', 'связей')}</span></>}
            {myChannel && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{myChannel._count.subscriptions}</span> {plural(myChannel._count.subscriptions, 'подписчик', 'подписчика', 'подписчиков')}</span></>}
          </div>

          {/* Bio */}
          {profile?.bio && (
            <p className="text-slate-300 text-sm leading-relaxed mb-4 border-l-2 border-primary-500/40 pl-3">{profile.bio}</p>
          )}

          {/* 3. Специализация */}
          {professionNames.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Специализация</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {professionNames.map((name, i) => (
                  <span key={i} className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium">{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* 4. Группы */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Группы</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {myGroups.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => navigate('/groups/' + g.id)}
                  className="px-2.5 py-1 bg-primary-600/15 border border-primary-500/30 text-primary-400 rounded-lg text-xs font-medium hover:bg-primary-600/25 transition-colors"
                >
                  {g.name}
                </button>
              ))}
              <button
                onClick={() => navigate('/groups/create')}
                className="px-2.5 py-1 bg-primary-600/20 border border-primary-500/40 text-primary-400 rounded-lg text-xs font-medium hover:bg-primary-600/30 transition-colors flex items-center gap-1"
              >
                + Создать группу
              </button>
            </div>
          </div>

          {/* 5. Связи */}
          {myConnections.length > 0 && (() => {
            const LIMIT = 6;
            const visible = connExpanded ? myConnections : myConnections.slice(0, LIMIT);
            return (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={13} className="text-primary-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Профессиональные связи</span>
                  <span className="text-[11px] text-slate-600 font-medium">{myConnections.length}</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visible.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => setViewConn(c)}
                      className="text-left p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl hover:border-primary-500/30 hover:bg-slate-800/70 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-700 flex-shrink-0 ring-1 ring-white/5">
                          {c.partner.avatar
                            ? <img src={`${API_URL}${c.partner.avatar}`} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full bg-primary-600/30 flex items-center justify-center text-xs text-primary-300 font-bold">{c.partner.firstName?.[0]}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate leading-tight">{c.partner.firstName} {c.partner.lastName}</p>
                          {c.partner.city && <p className="text-[11px] text-slate-500 truncate">{c.partner.city}</p>}
                        </div>
                        <Link2 size={12} className="text-primary-400/50 group-hover:text-primary-400 flex-shrink-0 transition-colors" />
                      </div>
                      {c.services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.services.slice(0, 3).map((s: any) => (
                            <span key={s.id} className="text-[11px] bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-md px-1.5 py-0.5 leading-none">
                              {s.name}
                            </span>
                          ))}
                          {c.services.length > 3 && (
                            <span className="text-[11px] bg-slate-700/60 text-slate-400 rounded-md px-1.5 py-0.5 leading-none">
                              +{c.services.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {myConnections.length > LIMIT && (
                  <button
                    onClick={() => setConnExpanded(v => !v)}
                    className="mt-2 w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors text-center"
                  >
                    {connExpanded ? 'Свернуть' : `Показать ещё ${myConnections.length - LIMIT}`}
                  </button>
                )}
              </div>
            );
          })()}

          {/* 6. Контакты */}
          {hasSocialLinks && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Контакты</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <SocialIconRow links={(profile?.socialLinks as Record<string, string>) || {}} labeled />
            </div>
          )}

          {/* 6. Портфолио */}
          {portfolioFiles.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Портфолио</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <div className="space-y-5">

                {/* Фото — карусель */}
                {photoFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Image size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Фото</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {photoFiles.map((f: any) => (
                        <button key={f.id} onClick={() => setLightboxFile(f)}
                          className="flex-shrink-0 w-48 h-48 rounded-xl overflow-hidden bg-slate-800 hover:opacity-90 transition-opacity">
                          <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Аудио — встроенный плеер */}
                {audioFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Headphones size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Аудио</span>
                    </div>
                    <div className="space-y-2">
                      {audioFiles.map((f: any) => (
                        <div key={f.id} className="rounded-xl bg-slate-900/60 border border-slate-800/60 px-3 pt-3 pb-2">
                          <p className="text-xs text-slate-400 truncate mb-2">{f.originalName}</p>
                          <audio controls src={`${API_URL}${f.url}`} className="w-full h-9" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Видео — встроенный плеер */}
                {videoFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Film size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Видео</span>
                    </div>
                    <div className="space-y-2">
                      {videoFiles.map((f: any) => (
                        <div key={f.id} className="rounded-xl overflow-hidden bg-slate-900/60 border border-slate-800/60">
                          <video controls src={`${API_URL}${f.url}`} className="w-full max-h-64 object-contain bg-black" />
                          <p className="text-xs text-slate-500 truncate px-3 py-1.5">{f.originalName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Другое — ссылки */}
                {otherFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <FileText size={13} className="text-slate-500" />
                      <span className="text-xs text-slate-500 font-medium">Другое</span>
                    </div>
                    <div className="space-y-1">
                      {otherFiles.map((f: any) => (
                        <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/60 transition-colors group">
                          <FileText size={14} className="text-slate-500 flex-shrink-0 group-hover:text-primary-400 transition-colors" />
                          <span className="flex-1 text-sm text-slate-300 truncate group-hover:text-white transition-colors">{f.originalName}</span>
                          <span className="text-xs text-slate-600 flex-shrink-0">{formatFileSize(f.size)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* 7. Услуги — горизонтальная карусель */}
        {servicesFlat.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 px-4">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Услуги</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3 px-4" style={{ scrollbarWidth: 'none' }}>
              {servicesFlat.map((us: any) => {
                const tags = [
                  ...(us.genres?.map((g: any) => g.name) ?? []),
                  ...(us.workFormats?.map((w: any) => w.name) ?? []),
                  ...(us.employmentTypes?.map((e: any) => e.name) ?? []),
                  ...(us.skillLevels?.map((s: any) => s.name) ?? []),
                  ...(us.availabilities?.map((a: any) => a.name) ?? []),
                  ...(us.geographies?.map((g: any) => g.name) ?? []),
                ];
                const price = us.priceFrom != null || us.priceTo != null
                  ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                  : null;
                return (
                  <div key={us.id} className="flex-shrink-0 w-52 rounded-2xl border border-slate-800/60 bg-slate-900/70 p-4 flex flex-col gap-2">
                    <div>
                      <p className="text-sm font-bold text-white leading-snug">{us.service?.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{us._profName} · {us._fieldName}</p>
                    </div>
                    {price && <span className="text-sm font-semibold text-primary-400">{price}</span>}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-auto pt-1">
                        {tags.slice(0, 4).map((t: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">{t}</span>
                        ))}
                        {tags.length > 4 && <span className="px-1.5 py-0.5 text-slate-600 text-[10px]">+{tags.length - 4}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 8. Канал */}
        {myChannel && (
          <div className="px-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Канал</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-800/60 bg-slate-900/50">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                {myChannel.avatar
                  ? <img src={getAvatarUrl(myChannel.avatar)!} alt="" className="w-full h-full object-cover" />
                  : <Radio size={20} className="text-slate-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{myChannel.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{myChannel._count.subscriptions} {plural(myChannel._count.subscriptions, 'подписчик', 'подписчика', 'подписчиков')} · {myChannel._count.posts} {plural(myChannel._count.posts, 'пост', 'поста', 'постов')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Подвал профиля */}
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/8 border border-red-500/20 hover:border-red-500/40 rounded-xl text-sm font-medium transition-all"
          >
            <LogOut size={16} />Выйти из профиля
          </button>
        </div>

      </div>
    </div>

    {viewConn && (
      <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />
    )}
    </>
  );
}
