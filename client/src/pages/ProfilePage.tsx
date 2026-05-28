import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI, connectionAPI, groupAPI, dealAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Music, Star, LogOut,
  Globe, DollarSign, Calendar,
  Headphones, Edit3, Plus, ChevronLeft, ChevronRight,
  FileText, Loader2, Crown, BadgeCheck, Ban, Link2, Zap, Search,
  Music2, Play, Pause, HandshakeIcon, Eye,
} from 'lucide-react';
import ConnectionViewModal from '../components/ConnectionViewModal';
import ConnectionCard from '../components/ConnectionCard';

import ConfirmDialog from '../components/ConfirmDialog';
import BadgeTooltip from '../components/BadgeTooltip';
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';
import { SocialIconRow, SocialLinksEditor } from '../components/SocialLinks';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import ShareButton from '../components/ShareButton';
import JoinArtistModal from '../components/JoinArtistModal';
import ReviewsBlock from '../components/ReviewsBlock';


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';


function getFileExt(name: string) {
  return (name.split('.').pop() ?? '').toUpperCase().slice(0, 4);
}

function AudioTile({ url, title, onDelete }: { url: string; title?: string; onDelete?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  return (
    <div className="flex flex-col gap-1 flex-shrink-0 relative w-16">
      <button onClick={toggle} className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-900/80 to-slate-800/80 border border-primary-700/30 flex flex-col items-center justify-center gap-1 hover:border-primary-500/50 transition-colors group">
        <Music2 size={14} className="text-primary-400" />
        <div className="w-6 h-6 rounded-full bg-primary-600/80 flex items-center justify-center group-hover:bg-primary-500 transition-colors">
          {playing ? <Pause size={10} className="text-white" /> : <Play size={10} className="text-white ml-0.5" />}
        </div>
      </button>
      {title && <p className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2 w-full">{title}</p>}
      {onDelete && <button onClick={onDelete} className="absolute -top-1 -right-1 p-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors"><X size={9} /></button>}
      <audio ref={ref} src={url} onEnded={() => setPlaying(false)} preload="none" />
    </div>
  );
}


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
  customFilterValueIds: Record<string, string[]>;
  genreIds: string[];
  workFormatIds: string[];
  employmentTypeIds: string[];
  skillLevelIds: string[];
  availabilityIds: string[];
  geographyIds: string[];
  name: string;
  priceFrom: string;
  priceTo: string;
  deadlineFrom: string;
  deadlineTo: string;
  description: string;
  priceItems: Array<{ name: string; price: string }>;
  status?: 'draft' | 'pending_review';
  professionFilters: Array<{ id: string; name: string; values: string[] }>;
  professionFilterValues: Record<string, string[]>;
};

const emptyEntry = (): UserServiceEntry => ({
  fieldOfActivityId: '', fieldOfActivityName: '',
  professionId: '', professionName: '', serviceId: '', serviceName: '',
  allowedFilterTypes: [], serviceCustomFilters: [], customFilterValueIds: {},
  genreIds: [], workFormatIds: [], employmentTypeIds: [], skillLevelIds: [],
  availabilityIds: [], geographyIds: [],
  name: '', priceFrom: '', priceTo: '', deadlineFrom: '', deadlineTo: '', description: '',
  priceItems: [],
  status: 'pending_review',
  professionFilters: [],
  professionFilterValues: {},
});


export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', nickname: '', bio: '',
    country: '', city: '', role: '', genres: [] as string[],
    socialLinks: {} as Record<string, string>,
    fieldOfActivityId: '',
    userProfessions: [] as { professionId: string; features: string[] }[],
    artistIds: [] as string[],
    birthDate: '',
    occupancyStatus: '' as '' | 'closed' | 'considering' | 'open',
  });

  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [workFormats, setWorkFormats] = useState<any[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<any[]>([]);
  const [skillLevels, setSkillLevels] = useState<any[]>([]);
  const [availabilities, setAvailabilities] = useState<any[]>([]);
  const [geographies, setGeographies] = useState<any[]>([]);

  const [userServices, setUserServices] = useState<UserServiceEntry[]>([]);
  const [openFilterSheet, setOpenFilterSheet] = useState<string | null>(null);

  const [portfolioFiles, setPortfolioFiles] = useState<any[]>([]);
  const [portfolioLinks, setPortfolioLinks] = useState<any[]>([]);
  const [isUploadingPortfolio, setIsUploadingPortfolio] = useState(false);
  const [imageFullscreen, setImageFullscreen] = useState<string | null>(null);
  const [docFullscreen, setDocFullscreen] = useState<{ url: string; name: string } | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'audio' | 'images' | 'other'>('audio');
  const [addStep, setAddStep] = useState<'search' | 'field' | 'direction' | 'profession' | 'service' | 'filters' | null>(null);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [addFlowDirections, setAddFlowDirections] = useState<any[]>([]);
  const [addFlowProfessions, setAddFlowProfessions] = useState<any[]>([]);
  const [addFlowServices, setAddFlowServices] = useState<any[]>([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceSearchResults, setServiceSearchResults] = useState<any[]>([]);
  const [serviceSearching, setServiceSearching] = useState(false);

  const [editingHero, setEditingHero] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingServices, setEditingServices] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);

  // Autosave when formData changes while any section is open
  useEffect(() => {
    if (!editingHero && !editingBio && !editingContacts) return;
    triggerAutoSave(formData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const [confirmDeleteServiceIdx, setConfirmDeleteServiceIdx] = useState<number | null>(null);
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);

  // Chip panels

  const [viewConn, setViewConn] = useState<any>(null);


  const [myStandaloneProfessions, setMyStandaloneProfessions] = useState<{ professionId: string; professionName: string }[]>([]);
  const [editingProfessions, setEditingProfessions] = useState(false);
  const [selectedProfession, setSelectedProfession] = useState<{ professionId: string; professionName: string } | null>(null);
  const [showJoinArtist, setShowJoinArtist] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [profAddStep, setProfAddStep] = useState<'field' | 'direction' | 'profession' | null>(null);
  const [profFlowDirections, setProfFlowDirections] = useState<any[]>([]);
  const [profFlowProfessions, setProfFlowProfessions] = useState<any[]>([]);
  const [savingProfessions, setSavingProfessions] = useState(false);


  useEffect(() => {
    if (!serviceQuery.trim()) { setServiceSearchResults([]); return; }
    const t = setTimeout(() => {
      setServiceSearching(true);
      referenceAPI.searchServices(serviceQuery.trim())
        .then(r => setServiceSearchResults(r.data))
        .finally(() => setServiceSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [serviceQuery]);

  useEffect(() => {
    if (editingProfessions || editingServices) {
      referenceAPI.getFieldsOfActivity({ all: true }).then(r => setFieldsOfActivity(r.data));
      if (editingServices) {
        referenceAPI.getWorkFormats().then(r => setWorkFormats(r.data));
        referenceAPI.getEmploymentTypes().then(r => setEmploymentTypes(r.data));
        referenceAPI.getSkillLevels().then(r => setSkillLevels(r.data));
        referenceAPI.getAvailabilities().then(r => setAvailabilities(r.data));
        referenceAPI.getGenres().then(r => setGenres(r.data));
        referenceAPI.getGeographies().then(r => setGeographies(r.data));
      }
    }
  }, [editingProfessions, editingServices]);

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
        birthDate: data.birthDate ? new Date(data.birthDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        occupancyStatus: data.occupancyStatus || '',
      });
      setMyStandaloneProfessions(
        data.userProfessions?.map((up: any) => ({
          professionId: up.professionId,
          professionName: up.profession?.name || '',
        })) || []
      );
      setPortfolioFiles(data.portfolioFiles ?? []);
      setPortfolioLinks(data.portfolioLinks ?? []);
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
          description: us.description ?? '',
          name: us.name ?? '',
          deadlineFrom: us.deadlineFrom != null ? String(us.deadlineFrom) : '',
          deadlineTo: us.deadlineTo != null ? String(us.deadlineTo) : '',
          priceItems: Array.isArray(us.priceItems) ? us.priceItems : [],
          status: us.status,
          professionFilters: [],
          professionFilterValues: {},
        })) || []
      );
      return data;
    },
  });

  const { data: myConnectionsRaw = [] } = useQuery({
    queryKey: ['connections-all'],
    queryFn: async () => { const { data } = await connectionAPI.getAll(); return data as any[]; },
  });

  const { data: myDeals = [] } = useQuery<any[]>({
    queryKey: ['deals'],
    queryFn: async () => { const { data } = await dealAPI.getAll(); return data as any[]; },
  });
  const activeDeals = myDeals.filter((d: any) => !['COMPLETED', 'CANCELLED'].includes(d.status));
  const totalDeals = myDeals.length;

  // One entry per unique partner
  const myConnPartners = Array.from(
    myConnectionsRaw.reduce((map: Map<string, { partner: any; connections: any[] }>, c: any) => {
      const pid = c.partner.id;
      if (!map.has(pid)) map.set(pid, { partner: c.partner, connections: [] });
      map.get(pid)!.connections.push(c);
      return map;
    }, new Map()).values()
  );

  const { data: myGroups = [] } = useQuery({
    queryKey: ['my-groups'],
    queryFn: async () => { const { data } = await groupAPI.getMyGroups(); return data as any[]; },
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

  const updateMutation = useMutation({ mutationFn: userAPI.updateMe });
  const [autoSaved, setAutoSaved] = useState(false);

  // Debounce autosave: when editing is open and formData changes, auto-save after 1.5s
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerAutoSave = useCallback((data: typeof formData) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await userAPI.updateMe(data);
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      } catch {}
    }, 1500);
  }, []);


  const updateServicesMutation = useMutation({
    mutationFn: (services: typeof userServices) => userAPI.updateServices(
      services.map(us => ({
        professionId: us.professionId,
        serviceId: us.serviceId,
        name: us.name || undefined,
        genreIds: us.genreIds,
        workFormatIds: us.workFormatIds,
        employmentTypeIds: us.employmentTypeIds,
        skillLevelIds: us.skillLevelIds,
        availabilityIds: us.availabilityIds,
        geographyIds: us.geographyIds,
        priceFrom: us.priceFrom !== '' ? Number(us.priceFrom) : undefined,
        priceTo: us.priceTo !== '' ? Number(us.priceTo) : undefined,
        deadlineFrom: us.deadlineFrom !== '' ? Number(us.deadlineFrom) : undefined,
        deadlineTo: us.deadlineTo !== '' ? Number(us.deadlineTo) : undefined,
        description: us.description || undefined,
        customFilterValueIds: Object.values(us.customFilterValueIds).flat(),
        status: us.status,
        priceItems: us.priceItems.length > 0 ? us.priceItems : undefined,
      }))
    ),
  });

  const handleSaveHero = async () => {
    // Convert DD.MM.YYYY → ISO date for server
    const bd = formData.birthDate;
    const birthDateISO = bd.length === 10
      ? `${bd.slice(6)}-${bd.slice(3, 5)}-${bd.slice(0, 2)}`
      : undefined;
    try { await updateMutation.mutateAsync({ ...formData, birthDate: birthDateISO ?? null }); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingHero(false); }
  };

  const handleSaveBio = async () => {
    try { await updateMutation.mutateAsync(formData); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingBio(false); }
  };

  const handleSaveContacts = async () => {
    try { await updateMutation.mutateAsync(formData); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingContacts(false); }
  };

  const handleSaveServices = async () => {
    try { await updateServicesMutation.mutateAsync(userServices); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingServices(false); setAddStep(null); }
  };

  const handleSaveProfessions = async (list: { professionId: string; professionName: string }[]) => {
    setSavingProfessions(true);
    try {
      await updateMutation.mutateAsync({ userProfessions: list.map(p => ({ professionId: p.professionId })) });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditingProfessions(false);
      setProfAddStep(null);
    } finally {
      setSavingProfessions(false);
    }
  };

  const handleDeleteService = async (idx: number) => {
    const newServices = userServices.filter((_, i) => i !== idx);
    setUserServices(newServices);
    await updateServicesMutation.mutateAsync(newServices);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
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

  const inputCls = "w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  const servicesByField = profile?.userServices?.reduce((acc: Record<string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }>, us: any) => {
    const fId = us.profession?.direction?.fieldOfActivity?.id || 'unknown';
    const fName = us.profession?.direction?.fieldOfActivity?.name || '';
    const pId = us.professionId;
    const pName = us.profession?.name || '';
    if (!acc[fId]) acc[fId] = { fieldName: fName, byProfession: {} };
    if (!acc[fId].byProfession[pId]) acc[fId].byProfession[pId] = { profName: pName, services: [] };
    acc[fId].byProfession[pId].services.push(us);
    return acc;
  }, {}) ?? {};

  const getName = (list: any[], id: string) => list.find(x => x.id === id)?.name ?? id;
  const getNames = (list: any[], ids: string[]) => ids.map(id => getName(list, id)).filter(Boolean);


  const handlePortfolioUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (portfolioFiles.length >= 5) break;
      const fd = new FormData();
      fd.append('file', file);
      setIsUploadingPortfolio(true);
      try { const { data } = await userAPI.uploadPortfolio(fd); setPortfolioFiles(prev => [...prev, data]); }
      catch { /* ignore */ }
      finally { setIsUploadingPortfolio(false); }
    }
  };

  const handlePortfolioDelete = async (fileId: string) => {
    await userAPI.deletePortfolioFile(fileId);
    setPortfolioFiles(prev => prev.filter((f: any) => f.id !== fileId));
  };

  const handleDeleteLink = async (linkId: string) => {
    await userAPI.deletePortfolioLink(linkId);
    setPortfolioLinks(prev => prev.filter((l: any) => l.id !== linkId));
  };


  const AddServiceFlow = () => {
    if (addStep === 'search') return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            autoFocus
            type="text"
            value={serviceQuery}
            onChange={e => setServiceQuery(e.target.value)}
            placeholder="Поиск услуги..."
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {serviceSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
        </div>

        {serviceQuery.trim() && serviceSearchResults.length === 0 && !serviceSearching && (
          <p className="text-xs text-slate-500 text-center py-1">Ничего не найдено</p>
        )}

        {serviceSearchResults.length > 0 && (
          <div className="max-h-52 overflow-y-auto space-y-1">
            {serviceSearchResults.map((r: any, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPending({
                    ...emptyEntry(),
                    fieldOfActivityId: r.fieldOfActivityId, fieldOfActivityName: r.fieldOfActivityName,
                    professionId: r.professionId, professionName: r.professionName,
                    serviceId: r.serviceId, serviceName: r.serviceName,
                    allowedFilterTypes: r.allowedFilterTypes,
                    serviceCustomFilters: r.customFilters,
                  });
                  setAddStep('filters');
                  // Загружаем фильтры выбранной профессии
                  if (r.professionId) {
                    referenceAPI.getProfessionFilters(r.professionId).then((resp: any) => {
                      setPending(prev => ({ ...prev, professionFilters: resp.data || [] }));
                    }).catch(() => {});
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/40 hover:border-primary-500/40 transition-all"
              >
                <p className="text-sm font-medium text-white">{r.serviceName}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {r.fieldOfActivityName} · {r.directionName}
                </p>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => setAddStep(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
          <span className="text-slate-700 text-xs">·</span>
          <button
            onClick={() => { referenceAPI.getFieldsOfActivity({ all: true }).then(r => setFieldsOfActivity(r.data)); setAddStep('field'); }}
            className="text-xs text-slate-500 hover:text-primary-400 transition-colors"
          >Выбрать вручную</button>
        </div>
      </div>
    );
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
        <button onClick={() => setAddStep('field')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"><ChevronLeft size={11} />Назад</button>
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
        <button onClick={() => setAddStep('direction')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"><ChevronLeft size={11} />Назад</button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите профессию:</p>
        {addFlowProfessions.length === 0
          ? <p className="text-slate-500 text-xs">Нет профессий в этом направлении</p>
          : <div className="flex flex-wrap gap-1.5">
              {addFlowProfessions.map((p: any) => (
                <button key={p.id} type="button"
                  onClick={() => {
                    const base = { ...emptyEntry(), fieldOfActivityId: pending.fieldOfActivityId, fieldOfActivityName: pending.fieldOfActivityName, professionId: p.id, professionName: p.name };
                    setPending(base);
                    referenceAPI.getServices({ professionId: p.id }).then((r: any) => {
                      const svcs: any[] = r.data || [];
                      setAddFlowServices(svcs);
                      // Auto-select when only one catalog service matches the profession
                      const matchSvc = svcs.find((s: any) => s.name === p.name) ?? (svcs.length === 1 ? svcs[0] : null);
                      if (matchSvc) {
                        setPending(prev => ({ ...prev, serviceId: matchSvc.id, serviceName: matchSvc.name, allowedFilterTypes: [], serviceCustomFilters: [] }));
                        // Load catalog filters for this profession
                        referenceAPI.getProfessionFilters(p.id).then((fr: any) => {
                          setPending(prev => ({ ...prev, professionFilters: fr.data || [] }));
                        }).catch(() => {});
                        setAddStep('filters');
                      } else {
                        setAddStep('service');
                      }
                    });
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
        <button onClick={() => setAddStep('profession')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"><ChevronLeft size={11} />{pending.professionName}</button>
        <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите услугу:</p>
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
                      // Загружаем фильтры выбранной профессии
                      if (pending.professionId) {
                        referenceAPI.getProfessionFilters(pending.professionId).then((resp: any) => {
                          setPending(prev => ({ ...prev, professionFilters: resp.data || [] }));
                        }).catch(() => {});
                      }
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
            <button onClick={() => setAddStep(serviceQuery ? 'search' : 'service')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"><ChevronLeft size={11} />{serviceQuery ? 'Поиск' : pending.professionName}</button>
            <p className="text-sm font-semibold text-white mt-0.5">{pending.serviceName}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-2">Настройте фильтры (необязательно):</p>
        {(() => {
          const pAllowed = pending.allowedFilterTypes;
          const pShow = (k: string) => pAllowed.includes(k);
          const pHasAny = pShow('genre') || pShow('workFormat') || pShow('employmentType') || pShow('skillLevel') || pShow('availability') || pShow('priceRange') || pShow('geography') || pending.serviceCustomFilters.length > 0 || pending.professionFilters.length > 0;
          if (!pHasAny) return <p className="text-xs text-slate-500">Фильтры не настроены для этой услуги</p>;
          return (
            <div className="space-y-2">
              {pShow('genre') && <SelectField label="Жанры" value={getNames(genres, pending.genreIds).join(', ')} placeholder="Выберите жанры" icon={<Music size={13} />} onClick={() => setOpenFilterSheet('pending-genre')} badge={pending.genreIds.length || undefined} />}
              {pShow('workFormat') && <SelectField label="Формат работы" value={getNames(workFormats, pending.workFormatIds).join(', ')} placeholder="Не указан" icon={<Globe size={13} />} onClick={() => setOpenFilterSheet('pending-workFormat')} badge={pending.workFormatIds.length || undefined} />}
              {pShow('employmentType') && <SelectField label="Тип занятости" value={getNames(employmentTypes, pending.employmentTypeIds).join(', ')} placeholder="Не указан" icon={<Briefcase size={13} />} onClick={() => setOpenFilterSheet('pending-employmentType')} badge={pending.employmentTypeIds.length || undefined} />}
              {pShow('skillLevel') && <SelectField label="Уровень" value={getNames(skillLevels, pending.skillLevelIds).join(', ')} placeholder="Не указан" icon={<Star size={13} />} onClick={() => setOpenFilterSheet('pending-skillLevel')} badge={pending.skillLevelIds.length || undefined} />}
              {pShow('availability') && <SelectField label="Доступность" value={getNames(availabilities, pending.availabilityIds).join(', ')} placeholder="Не указана" icon={<Calendar size={13} />} onClick={() => setOpenFilterSheet('pending-availability')} badge={pending.availabilityIds.length || undefined} />}
              {pShow('priceRange') && (
                <>
                  <div>
                    <p className="text-xs font-semibold mb-1 text-slate-400">Название (своё — необязательно, макс. 50 символов)</p>
                    <input
                      type="text" maxLength={50}
                      placeholder={`${pending.serviceName || 'Название услуги'}...`}
                      value={pending.name}
                      onChange={e => setPending(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1 text-slate-400 flex items-center gap-1"><DollarSign size={13} />Бюджет (₽)</p>
                    <div className="flex gap-2">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="От" value={pending.priceFrom} onChange={e => setPending(p => ({ ...p, priceFrom: e.target.value.replace(/\D/g, '') }))} className="flex-1 min-w-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="До" value={pending.priceTo} onChange={e => setPending(p => ({ ...p, priceTo: e.target.value.replace(/\D/g, '') }))} className="flex-1 min-w-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1 text-slate-400">Срок исполнения (дней)</p>
                    <div className="flex gap-2">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="От" value={pending.deadlineFrom} onChange={e => setPending(p => ({ ...p, deadlineFrom: e.target.value.replace(/\D/g, '') }))} className="flex-1 min-w-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="До" value={pending.deadlineTo} onChange={e => setPending(p => ({ ...p, deadlineTo: e.target.value.replace(/\D/g, '') }))} className="flex-1 min-w-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1 text-slate-400">Прайс-лист (необязательно)</p>
                    <p className="text-[10px] text-slate-600 mb-2">Детализация стоимости по позициям. Подсказка: не забудьте учесть комиссию сервиса.</p>
                    <div className="space-y-2">
                      {pending.priceItems.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input
                            type="text" maxLength={100}
                            placeholder="Название позиции"
                            value={item.name}
                            onChange={e => setPending(p => ({ ...p, priceItems: p.priceItems.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                            className="flex-1 min-w-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <input
                            type="text"
                            placeholder="Цена ₽"
                            value={item.price}
                            onChange={e => setPending(p => ({ ...p, priceItems: p.priceItems.map((x, i) => i === idx ? { ...x, price: e.target.value } : x) }))}
                            className="w-24 flex-shrink-0 px-2.5 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <button type="button" onClick={() => setPending(p => ({ ...p, priceItems: p.priceItems.filter((_, i) => i !== idx) }))}
                            className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setPending(p => ({ ...p, priceItems: [...p.priceItems, { name: '', price: '' }] }))}
                        className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                        <Plus size={12} />Добавить позицию
                      </button>
                    </div>
                  </div>
                </>
              )}
              {pShow('geography') && <SelectField label="Город / Регион" value={getNames(geographies, pending.geographyIds).join(', ')} placeholder="Не указан" icon={<MapPin size={13} />} onClick={() => setOpenFilterSheet('pending-geography')} badge={pending.geographyIds.length || undefined} />}
              {pending.serviceCustomFilters.map(cf => (
                <SelectField key={cf.id} label={cf.name} value={(pending.customFilterValueIds[cf.id] || []).map(vid => cf.values.find(v => v.id === vid)?.value || vid).join(', ')} placeholder="Выберите значение" icon={<Star size={13} />} onClick={() => setOpenFilterSheet(`pending-cf-${cf.id}`)} badge={(pending.customFilterValueIds[cf.id] || []).length || undefined} />
              ))}
              {/* Фильтры профессии из каталога */}
              {pending.professionFilters.map(pf => (
                <div key={pf.id}>
                  <p className="text-xs font-semibold mb-1 text-slate-400">{pf.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pf.values.map(val => {
                      const isSelected = (pending.professionFilterValues[pf.id] || []).includes(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setPending(prev => {
                              const cur = prev.professionFilterValues[pf.id] || [];
                              const next = isSelected
                                ? cur.filter(v => v !== val)
                                : [...cur, val];
                              return { ...prev, professionFilterValues: { ...prev.professionFilterValues, [pf.id]: next } };
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? 'bg-primary-600 border-primary-500 text-white'
                              : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setAddStep(null)} className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0">Отмена</button>
          <button
            onClick={() => { setUserServices(prev => [...prev, { ...pending, status: 'draft' }]); setPending(emptyEntry()); setAddStep(null); }}
            className="flex-1 py-2 rounded-lg border border-slate-600/50 text-slate-300 hover:bg-slate-700/40 text-sm transition-colors"
          >В черновик</button>
          <button
            onClick={() => { setUserServices(prev => [...prev, { ...pending, status: 'pending_review' }]); setPending(emptyEntry()); setAddStep(null); }}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
          >Опубликовать</button>
        </div>
        <SelectSheet isOpen={openFilterSheet === 'pending-genre'} onClose={() => setOpenFilterSheet(null)} title="Жанры" options={genres.map(g => ({ id: g.id, name: g.name }))} selectedIds={pending.genreIds} onSelect={ids => setPending(p => ({ ...p, genreIds: ids as string[] }))} mode="multiple" showConfirm searchable />
        <SelectSheet isOpen={openFilterSheet === 'pending-workFormat'} onClose={() => setOpenFilterSheet(null)} title="Формат работы" options={workFormats.map(w => ({ id: w.id, name: w.name }))} selectedIds={pending.workFormatIds} onSelect={ids => setPending(p => ({ ...p, workFormatIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} />
        <SelectSheet isOpen={openFilterSheet === 'pending-employmentType'} onClose={() => setOpenFilterSheet(null)} title="Тип занятости" options={employmentTypes.map(e => ({ id: e.id, name: e.name }))} selectedIds={pending.employmentTypeIds} onSelect={ids => setPending(p => ({ ...p, employmentTypeIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} />
        <SelectSheet isOpen={openFilterSheet === 'pending-skillLevel'} onClose={() => setOpenFilterSheet(null)} title="Уровень" options={skillLevels.map(s => ({ id: s.id, name: s.name }))} selectedIds={pending.skillLevelIds} onSelect={ids => setPending(p => ({ ...p, skillLevelIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} />
        <SelectSheet isOpen={openFilterSheet === 'pending-availability'} onClose={() => setOpenFilterSheet(null)} title="Доступность" options={availabilities.map(a => ({ id: a.id, name: a.name }))} selectedIds={pending.availabilityIds} onSelect={ids => setPending(p => ({ ...p, availabilityIds: ids as string[] }))} mode="multiple" showConfirm searchable={false} />
        <SelectSheet isOpen={openFilterSheet === 'pending-geography'} onClose={() => setOpenFilterSheet(null)} title="Город / Регион" options={geographies.map(g => ({ id: g.id, name: g.name }))} selectedIds={pending.geographyIds} onSelect={ids => setPending(p => ({ ...p, geographyIds: ids as string[] }))} mode="multiple" showConfirm searchable />
        {pending.serviceCustomFilters.map(cf => (
          <SelectSheet key={cf.id} isOpen={openFilterSheet === `pending-cf-${cf.id}`} onClose={() => setOpenFilterSheet(null)} title={cf.name} options={cf.values.map(v => ({ id: v.id, name: v.value }))} selectedIds={pending.customFilterValueIds[cf.id] || []} onSelect={ids => setPending(p => ({ ...p, customFilterValueIds: { ...p.customFilterValueIds, [cf.id]: ids as string[] } }))} mode="multiple" showConfirm searchable={false} />
        ))}
      </div>
    );
    return null;
  };

  const aUrl = getAvatarUrl(profile?.avatar);
  const bUrl = profile?.bannerImage ? `${API_URL}${profile.bannerImage}` : null;
  const hasSocialLinks = Object.values((profile?.socialLinks as Record<string, string>) || {}).some(Boolean);


  const servicesFlat = (Object.values(servicesByField) as { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }[]).flatMap(({ fieldName, byProfession }) =>
    Object.values(byProfession).flatMap(({ profName, services }) =>
      services.map((us: any) => ({ ...us, _profName: profName, _fieldName: fieldName }))
    )
  );

  const audioLinks = portfolioLinks.filter((l: any) => l.type === 'audio');
  const audioFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('audio/'));
  const imageFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('image/'));
  const otherFiles = portfolioFiles.filter((f: any) => !f.mimeType?.startsWith('audio/') && !f.mimeType?.startsWith('image/'));

  const servicesByFieldEdit: Record<string, { fieldName: string; entries: { us: UserServiceEntry; idx: number }[] }> = {};
  userServices.forEach((us, idx) => {
    const fId = us.fieldOfActivityId || 'unknown';
    if (!servicesByFieldEdit[fId]) servicesByFieldEdit[fId] = { fieldName: us.fieldOfActivityName, entries: [] };
    servicesByFieldEdit[fId].entries.push({ us, idx });
  });

  return (
    <>
    <div className="min-h-screen bg-slate-950">


      <div className="max-w-2xl mx-auto pb-28">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div className="relative">
          <div className="h-44 overflow-hidden bg-gradient-to-br from-primary-900 via-purple-900/70 to-slate-900">
            {bUrl
              ? <img src={bUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.8) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.7) 0%, transparent 60%)' }} />
            }
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          </div>
          {/* Always-visible banner button */}
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all"
          >
            <Camera size={12} />Сменить фон
          </button>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadBannerMutation.mutate(f); e.target.value = ''; }} />
        </div>

        <div className="px-4">
          {/* Avatar + action buttons */}
          <div className="flex items-end justify-between -mt-14 mb-4">
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
                className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white rounded-xl transition-all"
                iconSize={16}
              />
              <button
                onClick={() => setEditingHero(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${editingHero ? 'bg-primary-600 border-primary-500 text-white' : 'bg-primary-600/20 hover:bg-primary-600/30 border-primary-500/40 text-primary-300 hover:text-primary-200'}`}
              >
                <Edit3 size={15} />{editingHero ? 'Закрыть' : 'Редактировать'}
              </button>
              {profile?.id && (
                <button
                  onClick={() => navigate(`/profile/${profile.id}`)}
                  className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white rounded-xl transition-all"
                  title="Превью — как видят другие"
                >
                  <Eye size={16} />
                </button>
              )}
              {autoSaved && (
                <span className="text-xs text-emerald-400 font-medium animate-pulse">✓ Сохранено</span>
              )}
            </div>
          </div>

          {/* ── HERO INLINE EDIT ── */}
          {editingHero ? (
            <div className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-4 mb-5 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Основная информация</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Имя</label>
                  <input type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className={inputCls} placeholder="Имя" />
                </div>
                <div>
                  <label className={labelCls}>Фамилия</label>
                  <input type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className={inputCls} placeholder="Фамилия" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Никнейм</label>
                <input type="text" value={formData.nickname} onChange={e => setFormData({ ...formData, nickname: e.target.value })} placeholder="@nickname" className={inputCls} />
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
                <label className={labelCls}>Статус занятости</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'open', label: '🟢 Открыт', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
                    { value: 'considering', label: '🟡 Рассматриваю', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
                    { value: 'closed', label: '🔴 Закрыт', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormData({ ...formData, occupancyStatus: opt.value as any })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        formData.occupancyStatus === opt.value ? opt.color : 'border-slate-700/60 text-slate-500 hover:text-slate-300'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                  {formData.occupancyStatus && (
                    <button type="button" onClick={() => setFormData({ ...formData, occupancyStatus: '' })}
                      className="px-2 py-1.5 rounded-xl text-xs text-slate-600 hover:text-slate-400 transition-colors">
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Дата рождения</label>
                <input
                  type="text"
                  value={formData.birthDate}
                  placeholder="ДД.ММ.ГГГГ"
                  maxLength={10}
                  onChange={e => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length >= 3) v = v.slice(0, 2) + '.' + v.slice(2);
                    if (v.length >= 6) v = v.slice(0, 5) + '.' + v.slice(5);
                    v = v.slice(0, 10);
                    const iso = v.length === 10
                      ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}`
                      : '';
                    setFormData({ ...formData, birthDate: v, ...(iso ? { _birthDateISO: iso } as any : {}) });
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Социальные сети и сервисы</label>
                <SocialLinksEditor value={formData.socialLinks} onChange={v => setFormData({ ...formData, socialLinks: v })} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingHero(false)} className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                <button onClick={handleSaveHero} disabled={updateMutation.isPending} className="flex-1 py-2.5 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                  {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Сохранить
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h1 className="text-2xl font-bold text-white leading-tight">{profile?.firstName} {profile?.lastName}</h1>
                {profile?.isPro
                  ? <BadgeTooltip label="PRO аккаунт"><Zap size={18} className="text-violet-400" /></BadgeTooltip>
                  : <button onClick={() => setShowProModal(true)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-violet-500/30 text-violet-400/60 hover:text-violet-400 hover:border-violet-500/60 rounded-lg transition-colors">
                      <Zap size={11} />PRO
                    </button>
                }
                {profile?.isPremium && <BadgeTooltip label="Premium"><Crown size={18} className="text-amber-400" /></BadgeTooltip>}
                {profile?.isVerified && <BadgeTooltip label="Верифицирован"><BadgeCheck size={18} className="text-sky-400" /></BadgeTooltip>}
                {(profile?._count?.referrals ?? 0) >= 100 && <BadgeTooltip label="Амбасадор Moooza"><Star size={18} className="text-orange-400" /></BadgeTooltip>}
                {profile?.isBlocked && <BadgeTooltip label="Заблокирован"><Ban size={18} className="text-red-500" /></BadgeTooltip>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-2">
                {profile?.nickname && <span className="text-slate-500">@{profile.nickname}</span>}
                {(profile?.city || profile?.country) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="flex-shrink-0" />
                    {[profile.city, profile.country].filter(Boolean).join(', ')}
                  </span>
                )}
                {profile?.birthDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="flex-shrink-0" />
                    {new Date(profile.birthDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
              {profile?.occupancyStatus && (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border font-medium mb-2 ${
                  profile.occupancyStatus === 'open' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                  profile.occupancyStatus === 'considering' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                  'text-red-400 border-red-500/20 bg-red-500/10'
                }`}>
                  {profile.occupancyStatus === 'open' ? '🟢 Открыт для работы' :
                   profile.occupancyStatus === 'considering' ? '🟡 Рассматриваю предложения' :
                   '🔴 Не беру заказы'}
                </span>
              )}
              {/* ── Stats row ── */}
              <div className="grid grid-cols-2 divide-x divide-slate-800 mb-5 bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
                <button onClick={() => navigate('/friends?tab=connections')} className="flex flex-col items-center py-1.5 px-1 hover:bg-slate-800/40 transition-colors">
                  <span className="text-sm font-bold text-white">{myConnPartners.length}</span>
                  <span className="text-[9px] text-slate-500">Связи</span>
                </button>
                <button onClick={() => navigate('/deals')} className="flex flex-col items-center py-1.5 px-1 hover:bg-slate-800/40 transition-colors">
                  <span className="text-sm font-bold text-white">{totalDeals}</span>
                  <span className="text-[9px] text-slate-500">Сделки</span>
                </button>
              </div>
            </>
          )}

          {/* ── CONTENT CARDS ────────────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Bio */}
            {editingBio ? (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2">
                <textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} maxLength={100} rows={3} placeholder="Расскажите о себе..." className={`${inputCls} resize-none`} />
                <p className="text-right text-[11px] text-slate-600">{formData.bio.length}/100</p>
                <div className="flex gap-2">
                  <button onClick={() => setEditingBio(false)} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                  <button onClick={handleSaveBio} disabled={updateMutation.isPending} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                    {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {profile?.bio
                    ? <p className="text-slate-300 text-sm leading-relaxed break-words">{profile.bio}</p>
                    : <button onClick={() => setEditingBio(true)} className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic">+ Добавить описание</button>
                  }
                </div>
                <button onClick={() => setEditingBio(true)} className="p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800 flex-shrink-0 mt-0.5"><Edit3 size={13} /></button>
              </div>
            )}

            {/* ── Collectives tile slider ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Артисты</p>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {/* Add tile — first */}
                <button
                  onClick={() => setShowJoinArtist(true)}
                  className="flex flex-col gap-1.5 flex-shrink-0 group"
                  style={{ width: 'calc((100% - 24px) / 3.5)' }}
                >
                  <div className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all">
                    <Plus size={16} className="text-slate-500 group-hover:text-primary-400 transition-colors" />
                  </div>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors text-center leading-tight">Добавить</span>
                </button>

                {myGroups.map((g: any) => {
                  const myMembership = (g.userArtists ?? []).find((ua: any) => ua.user?.id === profile?.id);
                  const role = myMembership?.profession?.name ?? (myMembership?.isOwner ? 'Основатель' : null);
                  return (
                    <button
                      key={g.id}
                      onClick={() => navigate('/groups/' + g.id)}
                      className="flex flex-col gap-1.5 flex-shrink-0 text-left group"
                      style={{ width: 'calc((100% - 24px) / 3.5)' }}
                    >
                      <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-800/60 to-purple-800/60 border border-primary-600/30 flex items-center justify-center overflow-hidden group-hover:border-primary-500/60 transition-colors">
                        {g.avatar
                          ? <img src={getAvatarUrl(g.avatar) ?? ''} alt={g.name} className="w-full h-full object-cover" />
                          : <Music2 size={16} className="text-primary-400" />
                        }
                      </div>
                      <div className="w-full">
                        <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{g.name}</p>
                        {role && <p className="text-[9px] text-slate-500 leading-tight mt-0.5 truncate">{role}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Professions card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Briefcase size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Профессии</span>
                {myStandaloneProfessions.length > 0 && <span className="text-xs text-slate-500">{myStandaloneProfessions.length}</span>}
                <button
                  onClick={() => { setEditingProfessions(v => !v); setProfAddStep(null); }}
                  className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                >
                  {editingProfessions ? 'Готово' : 'Изменить'}
                </button>
              </div>

              {editingProfessions ? (
                <div className="p-3 space-y-3">
                  {/* Existing professions */}
                  {myStandaloneProfessions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {myStandaloneProfessions.map((p, i) => (
                        <div key={p.professionId} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 border border-primary-500/25 rounded-xl">
                          <span className="text-xs text-primary-300 font-medium">{p.professionName}</span>
                          <button onClick={() => setMyStandaloneProfessions(prev => prev.filter((_, idx) => idx !== i))} className="text-primary-400/60 hover:text-red-400 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add flow */}
                  {profAddStep === null && (
                    <button onClick={() => setProfAddStep('field')} className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm">
                      <Plus size={14} />Добавить профессию
                    </button>
                  )}
                  {profAddStep === 'field' && (
                    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
                      <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите сферу деятельности:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldsOfActivity.map((f: any) => (
                          <button key={f.id} type="button"
                            onClick={() => {
                              referenceAPI.getDirections({ fieldOfActivityId: f.id, all: true }).then(r => setProfFlowDirections(r.data));
                              setProfAddStep('direction');
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                          >
                            <ChevronRight size={11} />{f.name}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setProfAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
                    </div>
                  )}
                  {profAddStep === 'direction' && (
                    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
                      <button onClick={() => setProfAddStep('field')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"><ChevronLeft size={11} />Назад</button>
                      <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите направление:</p>
                      {profFlowDirections.length === 0
                        ? <p className="text-slate-500 text-xs">Нет направлений в этой сфере</p>
                        : <div className="flex flex-wrap gap-1.5">
                            {profFlowDirections.map((d: any) => (
                              <button key={d.id} type="button"
                                onClick={() => {
                                  referenceAPI.getProfessions({ directionId: d.id, all: true }).then(r => setProfFlowProfessions(r.data));
                                  setProfAddStep('profession');
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300 transition-all text-xs font-medium"
                              >
                                <ChevronRight size={11} />{d.name}
                              </button>
                            ))}
                          </div>
                      }
                      <button onClick={() => setProfAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
                    </div>
                  )}
                  {profAddStep === 'profession' && (
                    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3">
                      <button onClick={() => setProfAddStep('direction')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"><ChevronLeft size={11} />Назад</button>
                      <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Briefcase size={11} /> Выберите профессию:</p>
                      {profFlowProfessions.length === 0
                        ? <p className="text-slate-500 text-xs">Нет профессий в этом направлении</p>
                        : <div className="flex flex-wrap gap-1.5">
                            {profFlowProfessions.map((p: any) => {
                              const alreadyAdded = myStandaloneProfessions.some(x => x.professionId === p.id);
                              return (
                                <button key={p.id} type="button" disabled={alreadyAdded}
                                  onClick={() => {
                                    setMyStandaloneProfessions(prev => [...prev, { professionId: p.id, professionName: p.name }]);
                                    setProfAddStep(null);
                                  }}
                                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${alreadyAdded ? 'bg-slate-800/20 border-slate-700/30 text-slate-600 cursor-default' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300'}`}
                                >
                                  {alreadyAdded ? <span className="text-emerald-500">✓</span> : <Plus size={11} />}{p.name}
                                </button>
                              );
                            })}
                          </div>
                      }
                      <button onClick={() => setProfAddStep(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setEditingProfessions(false); setProfAddStep(null); setMyStandaloneProfessions(profile?.userProfessions?.map((up: any) => ({ professionId: up.professionId, professionName: up.profession?.name || '' })) || []); }} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                    <button onClick={() => handleSaveProfessions(myStandaloneProfessions)} disabled={savingProfessions} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {savingProfessions ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                </div>
              ) : myStandaloneProfessions.length > 0 ? (
                <div className="px-4 pt-3 pb-2">
                  <p className="text-sm leading-relaxed">
                    {myStandaloneProfessions.map((p, i) => (
                      <span key={p.professionId}>
                        <button
                          onClick={() => setSelectedProfession(p)}
                          className="text-primary-400 hover:text-primary-300 font-medium underline underline-offset-2 decoration-primary-500/40 hover:decoration-primary-400 transition-colors"
                        >
                          {p.professionName}
                        </button>
                        {i < myStandaloneProfessions.length - 1 && <span className="text-slate-500">, </span>}
                      </span>
                    ))}
                  </p>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-slate-600 italic">Нет добавленных профессий</p>
                </div>
              )}
            </div>

            {/* ── Services card — tile slider ── */}
            <div ref={servicesRef} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Briefcase size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Услуги</span>
                {servicesFlat.length > 0 && <span className="text-xs text-slate-500">{servicesFlat.length}</span>}
                {servicesFlat.length > 0 && (
                  <button onClick={() => navigate(`/profile/${profile?.id}/services`)} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">Смотреть все</button>
                )}
              </div>

              {editingServices ? (
                <div className="p-3 space-y-3">
                  {AddServiceFlow()}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setEditingServices(false); setAddStep(null); }} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                    <button onClick={handleSaveServices} disabled={updateServicesMutation.isPending} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {updateServicesMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {/* Add tile — always first */}
                    <button
                      onClick={() => { setEditingServices(true); setAddStep('search'); setServiceQuery(''); setServiceSearchResults([]); }}
                      className="flex flex-col gap-2 flex-shrink-0 group"
                      style={{ width: 'calc((100% - 24px) / 3.5)' }}
                    >
                      <div className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all">
                        <Plus size={16} className="text-slate-500 group-hover:text-primary-400 transition-colors" />
                      </div>
                      <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors text-center leading-tight">Добавить</span>
                    </button>

                    {servicesFlat.map((us: any) => {
                      const price = us.priceFrom != null || us.priceTo != null
                        ? [us.priceFrom != null ? `от ${us.priceFrom}₽` : null, us.priceTo != null ? `до ${us.priceTo}₽` : null].filter(Boolean).join(' ')
                        : null;
                      return (
                        <button
                          key={us.id}
                          onClick={() => navigate(`/services/${us.id}`)}
                          className="flex flex-col gap-0 flex-shrink-0 text-left group"
                          style={{ width: 'calc((100% - 24px) / 3.5)' }}
                        >
                          <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-900/80 to-slate-800/80 border border-primary-700/30 flex items-center justify-center p-2 group-hover:border-primary-500/50 transition-colors overflow-hidden">
                            <Briefcase size={16} className="text-primary-400 flex-shrink-0" />
                          </div>
                          <div className="w-full mt-1.5">
                            <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{us.service?.name}</p>
                            {price && <p className="text-[9px] text-primary-400 leading-tight mt-0.5">{price}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Deals card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <HandshakeIcon size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Мои сделки</span>
                {totalDeals > 0 && <span className="text-xs text-slate-500">{totalDeals}</span>}
                <button onClick={() => navigate('/deals')} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                  Смотреть все
                </button>
              </div>
              {activeDeals.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-600 italic">Активных сделок нет</div>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {activeDeals.slice(0, 3).map((deal: any) => {
                    const isCustomer = deal.customerId === profile?.id;
                    const partner = isCustomer ? deal.executor : deal.customer;
                    const STATUS_LABEL: Record<string, string> = {
                      PENDING: 'На согласовании', AWAITING_PAYMENT: 'Ожидает оплаты',
                      IN_PROGRESS: 'В работе', REVIEW: 'На проверке', REVISION: 'На доработке',
                    };
                    return (
                      <button
                        key={deal.id}
                        onClick={() => navigate(`/deals/${deal.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-xl bg-primary-900/60 border border-primary-700/30 flex items-center justify-center flex-shrink-0">
                          <HandshakeIcon size={14} className="text-primary-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{deal.title}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {partner ? `${partner.firstName} ${partner.lastName}` : ''}
                            {deal.service ? ` · ${deal.service.name}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium text-primary-400/80 flex-shrink-0">
                          {STATUS_LABEL[deal.status] ?? deal.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Connections card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Link2 size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Связи</span>
                {myConnPartners.length > 0 && <span className="text-xs text-slate-500">{myConnPartners.length}</span>}
                {myConnPartners.length > 3 && profile?.id && (
                  <button onClick={() => navigate(`/profile/${profile.id}/connections`)} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                    Смотреть все
                  </button>
                )}
              </div>
              {myConnPartners.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-600 italic">Связей пока нет</div>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {myConnPartners.slice(0, 3).map((g: any) => (
                    <ConnectionCard
                      key={g.partner.id}
                      connection={{ ...g.connections[0], partner: g.partner }}
                      onClick={() => navigate(`/connection/${g.partner.id}`, { state: g })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Reviews ── */}
            {profile?.id && <ReviewsBlock userId={profile.id} isOwner={true} />}

            {/* ── Portfolio ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Headphones size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Портфолио</span>
              </div>
              {/* Tabs */}
              <div className="flex border-b border-slate-800/60">
                {([
                  { key: 'audio', label: 'Аудио', count: audioLinks.length + audioFiles.length },
                  { key: 'images', label: 'Изображения', count: imageFiles.length },
                  { key: 'other', label: 'Другое', count: otherFiles.length },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setPortfolioTab(tab.key)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors relative ${portfolioTab === tab.key ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    {tab.label}
                    {tab.count > 0 && <span className="ml-1 text-[10px] opacity-70">{tab.count}</span>}
                    {portfolioTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />}
                  </button>
                ))}
              </div>
              {/* Hint */}
              <div className="px-4 pt-2 pb-0">
                {portfolioTab === 'audio' && <p className="text-[10px] text-slate-600">до 20 МБ · mp3, wav, flac, ogg</p>}
                {portfolioTab === 'images' && <p className="text-[10px] text-slate-600">до 20 МБ · jpg, png, gif, webp</p>}
                {portfolioTab === 'other' && <p className="text-[10px] text-slate-600">до 20 МБ · pdf, doc, xls</p>}
              </div>
              {/* Content */}
              <div className="px-4 py-3">
                {portfolioTab === 'audio' && (
                  <div className="space-y-3">
                  <div className="px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                    <p className="text-xs font-semibold text-amber-400 mb-0.5">⚠️ Важно</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">Загружая файл, ты подтверждаешь, что у тебя есть права на его использование. Не заливай чужой контент без разрешения — можем удалить и ограничить доступ.</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <label className="flex flex-col gap-1 flex-shrink-0 cursor-pointer group w-16">
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all">
                        {isUploadingPortfolio ? <Loader2 size={14} className="text-slate-500 animate-spin" /> : <Plus size={16} className="text-slate-500 group-hover:text-primary-400 transition-colors" />}
                      </div>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-400 text-center leading-tight">Добавить</span>
                      <input type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/flac,audio/aac,audio/x-m4a,audio/mp4" multiple className="hidden" disabled={isUploadingPortfolio} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {audioFiles.map((f: any) => (
                      <AudioTile key={f.id} url={`${API_URL}${f.url}`} title={f.originalName} onDelete={() => handlePortfolioDelete(f.id)} />
                    ))}
                    {audioLinks.map((l: any) => (
                      <AudioTile key={l.id} url={l.url} title={l.title || l.url} onDelete={() => setConfirmDeleteLinkId(l.id)} />
                    ))}
                  </div>
                  </div>
                )}
                {portfolioTab === 'images' && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <label className="flex flex-col gap-1 flex-shrink-0 cursor-pointer group w-16">
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all">
                        {isUploadingPortfolio ? <Loader2 size={14} className="text-slate-500 animate-spin" /> : <Plus size={16} className="text-slate-500 group-hover:text-primary-400 transition-colors" />}
                      </div>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-400 text-center leading-tight">Добавить</span>
                      <input type="file" accept="image/*" multiple className="hidden" disabled={isUploadingPortfolio} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {imageFiles.map((f: any) => (
                      <div key={f.id} className="flex flex-col gap-1 flex-shrink-0 relative w-16">
                        <button onClick={() => setImageFullscreen(`${API_URL}${f.url}`)}
                          className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700/40 hover:border-primary-500/40 transition-colors">
                          <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full h-full object-cover" />
                        </button>
                        <button onClick={() => handlePortfolioDelete(f.id)} className="absolute -top-1 -right-1 p-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors"><X size={9} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {portfolioTab === 'other' && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <label className="flex flex-col gap-1 flex-shrink-0 cursor-pointer group w-16">
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-primary-500/50 group-hover:bg-primary-500/5 transition-all">
                        {isUploadingPortfolio ? <Loader2 size={14} className="text-slate-500 animate-spin" /> : <Plus size={16} className="text-slate-500 group-hover:text-primary-400 transition-colors" />}
                      </div>
                      <span className="text-[9px] text-slate-500 group-hover:text-slate-400 text-center leading-tight">Добавить</span>
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" disabled={isUploadingPortfolio} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {otherFiles.map((f: any) => (
                      <div key={f.id} className="flex flex-col gap-1 flex-shrink-0 relative w-16">
                        <button onClick={() => setDocFullscreen({ url: `${API_URL}${f.url}`, name: f.originalName })}
                          className="w-16 h-16 rounded-xl bg-slate-800/60 border border-slate-700/40 hover:border-primary-500/40 flex flex-col items-center justify-center gap-1 transition-colors">
                          <span className="text-sm font-black text-primary-400">{getFileExt(f.originalName)}</span>
                          <FileText size={13} className="text-slate-500" />
                        </button>
                        <p className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2 w-full">{f.originalName}</p>
                        <button onClick={() => handlePortfolioDelete(f.id)} className="absolute -top-1 -right-1 p-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors"><X size={9} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Contacts card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Globe size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Контакты</span>
                <button onClick={() => setEditingContacts(v => !v)} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                  {editingContacts ? 'Готово' : 'Изменить'}
                </button>
              </div>
              <div className="p-4">
                {editingContacts ? (
                  <div className="space-y-3">
                    <SocialLinksEditor value={formData.socialLinks} onChange={v => setFormData({ ...formData, socialLinks: v })} />
                    <button onClick={handleSaveContacts} disabled={updateMutation.isPending} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                ) : hasSocialLinks ? (
                  <SocialIconRow links={(profile?.socialLinks as Record<string, string>) || {}} />
                ) : (
                  <button onClick={() => setEditingContacts(true)} className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic">+ Добавить контакты</button>
                )}
              </div>
            </div>

            {/* Logout */}
            <button onClick={() => logout()} className="w-full flex items-center justify-center gap-2 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/8 border border-red-500/20 hover:border-red-500/40 rounded-xl text-sm font-medium transition-all">
              <LogOut size={16} />Выйти из профиля
            </button>

          </div>
        </div>
      </div>
    </div>

    {/* Image fullscreen */}
    {imageFullscreen && (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setImageFullscreen(null)}>
        <button onClick={() => setImageFullscreen(null)} className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors z-10"><X size={20} /></button>
        <img src={imageFullscreen} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
      </div>
    )}

    {/* Document fullscreen */}
    {docFullscreen && (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <span className="text-sm text-slate-300 truncate">{docFullscreen.name}</span>
          <button onClick={() => setDocFullscreen(null)} className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-colors flex-shrink-0"><X size={20} /></button>
        </div>
        <iframe src={docFullscreen.url} className="flex-1 w-full border-0" title={docFullscreen.name} />
      </div>
    )}

    {viewConn && <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />}

    {/* Profession detail popup */}
    {selectedProfession && createPortal(
      <>
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setSelectedProfession(null)} />
        <div className="fixed inset-x-0 bottom-0 z-[71] bg-slate-900 border-t border-slate-800 rounded-t-3xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-1" />
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white">{selectedProfession.professionName}</h3>
            <button onClick={() => setSelectedProfession(null)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <div className="px-5 py-4">
            {(() => {
              const relatedServices = (profile?.userServices ?? []).filter(
                (us: any) => us.profession?.id === selectedProfession.professionId
              );
              if (relatedServices.length === 0) {
                return <p className="text-sm text-slate-500 text-center py-4">Нет добавленных услуг для этой профессии</p>;
              }
              return (
                <div className="space-y-3">
                  {relatedServices.map((us: any) => (
                    <button key={us.id} onClick={() => { setSelectedProfession(null); navigate(`/services/${us.id}`); }}
                      className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3 text-left hover:bg-slate-800 transition-colors">
                      <Briefcase size={16} className="text-primary-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{us.service?.name}</p>
                        {(us.priceFrom || us.priceTo) && (
                          <p className="text-xs text-primary-400 mt-0.5">
                            {[us.priceFrom && `от ${us.priceFrom} ₽`, us.priceTo && `до ${us.priceTo} ₽`].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </>,
      document.body
    )}

    <ConfirmDialog
      open={confirmDeleteServiceIdx !== null}
      message="Удалить услугу из профиля?"
      onConfirm={() => { if (confirmDeleteServiceIdx !== null) handleDeleteService(confirmDeleteServiceIdx); }}
      onCancel={() => setConfirmDeleteServiceIdx(null)}
    />
    <ConfirmDialog
      open={!!confirmDeleteLinkId}
      message="Удалить ссылку из портфолио?"
      onConfirm={() => { if (confirmDeleteLinkId) handleDeleteLink(confirmDeleteLinkId); }}
      onCancel={() => setConfirmDeleteLinkId(null)}
    />

    {showJoinArtist && <JoinArtistModal onClose={() => setShowJoinArtist(false)} />}

    {showProModal && createPortal(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowProModal(false)} />
        <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-5 pt-6 pb-4 text-center border-b border-slate-800">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-3">
              <Zap size={28} className="text-violet-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Moooza PRO</h3>
            <p className="text-sm text-slate-400">Расширенные возможности для профессионалов</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {[
              ['Приоритет в каталоге', 'Ваш профиль показывается выше в поиске'],
              ['Расширенная аналитика', 'Статистика просмотров и обращений'],
              ['Неограниченные услуги', 'Добавляйте любое количество услуг'],
              ['PRO-бейдж на профиле', 'Подчеркните свой профессионализм'],
              ['Расширенный портфолио', 'До 50 файлов вместо 5'],
            ].map(([title, desc]) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-violet-400 text-xs font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-6 space-y-2">
            <button className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2">
              <Zap size={16} />Скоро — следите за новостями
            </button>
            <button onClick={() => setShowProModal(false)} className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors">
              Закрыть
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    </>
  );
}
