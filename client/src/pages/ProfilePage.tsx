import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI, connectionAPI, groupAPI, dealAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  Camera, Save, X, MapPin, Briefcase, Star, LogOut,
  Globe, Calendar,
  Headphones, Edit3, Plus,
  FileText, Loader2, Crown, BadgeCheck, Ban, Link2, Zap, Search,
  Music2, Play, Pause, HandshakeIcon, Eye, Phone, Shield,
} from 'lucide-react';
import ConnectionViewModal from '../components/ConnectionViewModal';
import ConnectionCard from '../components/ConnectionCard';

import ConfirmDialog from '../components/ConfirmDialog';
import BadgeTooltip from '../components/BadgeTooltip';
import { SocialIconRow, SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import ShareButton from '../components/ShareButton';
import JoinArtistModal from '../components/JoinArtistModal';
import ReviewsBlock from '../components/ReviewsBlock';
import ImageCropModal, { blobToFile } from '../components/ImageCropModal';


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
    birthDateVisible: false,
    contactsVisible: true,
    contactsVisibility: 'ALL' as 'ALL' | 'REGISTERED' | 'FRIENDS',
    occupancyStatus: '' as '' | 'closed' | 'considering' | 'open',
  });
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Image cropping (avatar / banner) before upload
  const [cropAvatarFile, setCropAvatarFile] = useState<File | null>(null);
  const [cropBannerFile, setCropBannerFile] = useState<File | null>(null);

  const [userServices, setUserServices] = useState<UserServiceEntry[]>([]);

  const [portfolioFiles, setPortfolioFiles] = useState<any[]>([]);
  const [portfolioLinks, setPortfolioLinks] = useState<any[]>([]);
  const [isUploadingPortfolio, setIsUploadingPortfolio] = useState(false);
  const [imageFullscreen, setImageFullscreen] = useState<string | null>(null);
  const [docFullscreen, setDocFullscreen] = useState<{ url: string; name: string } | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'audio' | 'images' | 'other'>('audio');
  // Service add/edit form (single comprehensive form).
  // serviceFormOpen: 'add' to create a new entry, or the index of an existing
  // entry being edited. null = closed.
  const [serviceFormOpen, setServiceFormOpen] = useState<'add' | number | null>(null);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [sections, setSections] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [pendingServiceFilters, setPendingServiceFilters] = useState<ServiceCustomFilter[]>([]);
  const [pendingServiceFilterSel, setPendingServiceFilterSel] = useState<Record<string, string[]>>({});
  const [loadingServiceDetail, setLoadingServiceDetail] = useState(false);

  const [editingHero, setEditingHero] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingServices, setEditingServices] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingSocials, setEditingSocials] = useState(false);

  // Autosave when formData changes while any section is open
  useEffect(() => {
    if (!editingHero && !editingBio && !editingContacts && !editingSocials) return;
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
  const [profAddOpen, setProfAddOpen] = useState(false);
  const [profSearch, setProfSearch] = useState('');
  const [profSearchResults, setProfSearchResults] = useState<any[]>([]);
  const [profSearching, setProfSearching] = useState(false);
  const [savingProfessions, setSavingProfessions] = useState(false);
  const [profFiltersData, setProfFiltersData] = useState<Record<string, any[]>>({});
  const [profFilterSelections, setProfFilterSelections] = useState<Record<string, string[]>>({});


  // Flat profession search (Task 1)
  useEffect(() => {
    if (!profSearch.trim()) { setProfSearchResults([]); return; }
    const t = setTimeout(() => {
      setProfSearching(true);
      referenceAPI.getProfessions({ search: profSearch.trim(), all: true })
        .then(r => setProfSearchResults(r.data))
        .finally(() => setProfSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [profSearch]);

  // Load the sections catalog when the service form opens (for the autocomplete)
  useEffect(() => {
    if (serviceFormOpen !== null && sections.length === 0) {
      referenceAPI.getSections().then(r => setSections(r.data)).catch(() => {});
    }
  }, [serviceFormOpen, sections.length]);

  // Preload + expand filters for every already-added profession while editing (Task 1)
  useEffect(() => {
    if (!editingProfessions) return;
    myStandaloneProfessions.forEach(p => { loadProfFilters(p.professionId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProfessions, myStandaloneProfessions]);

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
        birthDateVisible: !!data.birthDateVisible,
        contactsVisible: data.contactsVisible !== false,
        contactsVisibility: (['ALL', 'REGISTERED', 'FRIENDS'].includes(data.contactsVisibility) ? data.contactsVisibility : 'ALL') as 'ALL' | 'REGISTERED' | 'FRIENDS',
        occupancyStatus: data.occupancyStatus || '',
      });
      setMyStandaloneProfessions(
        data.userProfessions?.map((up: any) => ({
          professionId: up.professionId,
          professionName: up.profession?.name || '',
        })) || []
      );
      if (data.userProfessions) {
        const selections: Record<string, string[]> = {};
        data.userProfessions.forEach((up: any) => {
          selections[up.professionId] = up.selectedCustomFilterValues?.map((cfv: any) => cfv.id) || [];
        });
        setProfFilterSelections(selections);
      }
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

  // Open the contacts editor, pre-filling phone/email from the registration data
  // (user.phone / user.email) when those contact links are not set yet.
  const openContactsEditor = () => {
    setFormData(prev => {
      const links = { ...prev.socialLinks };
      const regPhone = (profile as any)?.phone;
      const regEmail = (profile as any)?.email;
      if (!links.phone && regPhone) links.phone = `tel:${regPhone}`;
      if (!links.email && regEmail) links.email = `mailto:${regEmail}`;
      return { ...prev, socialLinks: links };
    });
    setEditingContacts(true);
  };

  const handleSaveContacts = async () => {
    try { await updateMutation.mutateAsync(formData); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingContacts(false); }
  };

  const handleSaveSocials = async () => {
    try { await updateMutation.mutateAsync(formData); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingSocials(false); }
  };

  const closeServiceForm = () => {
    setServiceFormOpen(null);
    setPending(emptyEntry());
    setPendingServiceFilters([]);
    setPendingServiceFilterSel({});
    setCatalogSearch('');
  };

  const loadProfFilters = async (profId: string) => {
    if (profFiltersData[profId]) return;
    try {
      const { data } = await referenceAPI.getProfessionFilters(profId);
      setProfFiltersData(prev => ({ ...prev, [profId]: data }));
    } catch {}
  };

  const toggleProfFilterValue = (profId: string, valueId: string) => {
    setProfFilterSelections(prev => {
      const cur = prev[profId] || [];
      const next = cur.includes(valueId) ? cur.filter(v => v !== valueId) : [...cur, valueId];
      return { ...prev, [profId]: next };
    });
  };

  const handleSaveProfessions = async (list: { professionId: string; professionName: string }[]) => {
    setSavingProfessions(true);
    try {
      await updateMutation.mutateAsync({
        userProfessions: list.map(p => ({
          professionId: p.professionId,
          selectedCustomFilterValueIds: profFilterSelections[p.professionId] || [],
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditingProfessions(false);
      setProfAddOpen(false);
      setProfSearch('');
    } finally {
      setSavingProfessions(false);
    }
  };

  // Value TEXTS the user already selected across their professions — used to
  // partially auto-fill matching service filter values when a service is picked.
  const ownedFilterValueTexts: string[] = (profile?.userProfessions ?? [])
    .flatMap((up: any) => (up.selectedCustomFilterValues ?? []).map((cfv: any) => cfv.value))
    .filter(Boolean);

  // Flattened catalog: every service across all sections (for the autocomplete).
  const catalogServices: { id: string; name: string; sectionId: string; sectionName: string }[] =
    sections.flatMap((sec: any) =>
      (sec.services ?? []).map((s: any) => ({ id: s.id, name: s.name, sectionId: sec.id, sectionName: sec.name }))
    );

  // Is the «Уровень» filter — rendered as single-select.
  const isLevelFilter = (f: { name: string }) => f.name.trim().toLowerCase() === 'уровень';

  // When a catalog service is picked, load its filters + linked professions and
  // partially auto-fill any filter value whose text matches the user's profession
  // selections.
  const selectCatalogService = async (svc: { id: string; name: string; sectionId: string; sectionName: string }) => {
    setLoadingServiceDetail(true);
    setPendingServiceFilters([]);
    setPendingServiceFilterSel({});
    setCatalogSearch('');
    try {
      const { data } = await referenceAPI.getServiceDetail(svc.id);
      const linked: { id: string; name: string }[] = data.professions || [];
      // Prefer a profession the user already has, else the first linked one
      const owned = linked.find(lp => myStandaloneProfessions.some(mp => mp.professionId === lp.id));
      const professionId = owned?.id || linked[0]?.id || '';
      const professionName = owned?.name || linked[0]?.name || '';
      const filters: ServiceCustomFilter[] = data.filters || [];
      setPending(prev => ({
        ...prev,
        fieldOfActivityId: svc.sectionId,
        fieldOfActivityName: svc.sectionName,
        professionId,
        professionName,
        serviceId: svc.id,
        serviceName: data.name || svc.name,
      }));
      setPendingServiceFilters(filters);
      // Partial auto-fill: pre-select matching values (skip the single-select «Уровень»).
      const prefill: Record<string, string[]> = {};
      filters.forEach(f => {
        if (isLevelFilter(f)) return;
        const matched = f.values.filter(v => ownedFilterValueTexts.includes(v.value)).map(v => v.id);
        if (matched.length) prefill[f.id] = matched;
      });
      setPendingServiceFilterSel(prefill);
    } catch {
      // Fallback: still allow adding without filters
      setPending(prev => ({ ...prev, fieldOfActivityId: svc.sectionId, fieldOfActivityName: svc.sectionName, serviceId: svc.id, serviceName: svc.name }));
      setPendingServiceFilters([]);
      setPendingServiceFilterSel({});
    } finally {
      setLoadingServiceDetail(false);
    }
  };

  // Multi-select toggle for non-«Уровень» filters.
  const togglePendingServiceFilter = (filterId: string, valueId: string) => {
    setPendingServiceFilterSel(prev => {
      const cur = prev[filterId] || [];
      const next = cur.includes(valueId) ? cur.filter(v => v !== valueId) : [...cur, valueId];
      return { ...prev, [filterId]: next };
    });
  };

  // Single-select for the «Уровень» filter: picking replaces; clicking the
  // selected value clears it.
  const setLevelFilterValue = (filterId: string, valueId: string) => {
    setPendingServiceFilterSel(prev => {
      const isSame = (prev[filterId] || [])[0] === valueId;
      return { ...prev, [filterId]: isSame ? [] : [valueId] };
    });
  };

  // Price-list row helpers (composite name + price rows).
  const addPriceItem = () => setPending(prev => ({ ...prev, priceItems: [...prev.priceItems, { name: '', price: '' }] }));
  const updatePriceItem = (i: number, patch: Partial<{ name: string; price: string }>) =>
    setPending(prev => ({ ...prev, priceItems: prev.priceItems.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const removePriceItem = (i: number) =>
    setPending(prev => ({ ...prev, priceItems: prev.priceItems.filter((_, idx) => idx !== i) }));

  // Open the form to ADD a brand-new service.
  const openAddServiceForm = () => {
    setPending(emptyEntry());
    setPendingServiceFilters([]);
    setPendingServiceFilterSel({});
    setCatalogSearch('');
    setServiceFormOpen('add');
  };

  // Open the form to EDIT an existing service entry: hydrate pending + load its
  // filters, mapping already-selected value ids back into the selection map.
  const openEditServiceForm = async (idx: number) => {
    const entry = userServices[idx];
    setPending({ ...entry });
    setPendingServiceFilters([]);
    setCatalogSearch('');
    setServiceFormOpen(idx);
    if (!entry.serviceId) { setPendingServiceFilterSel({}); return; }
    setLoadingServiceDetail(true);
    try {
      const { data } = await referenceAPI.getServiceDetail(entry.serviceId);
      const filters: ServiceCustomFilter[] = data.filters || [];
      setPendingServiceFilters(filters);
      // Map the entry's flat/grouped selected value ids onto these filters.
      const selectedIds = new Set(Object.values(entry.customFilterValueIds).flat());
      const sel: Record<string, string[]> = {};
      filters.forEach(f => {
        const picked = f.values.filter(v => selectedIds.has(v.id)).map(v => v.id);
        if (picked.length) sel[f.id] = picked;
      });
      setPendingServiceFilterSel(sel);
    } catch {
      setPendingServiceFilters([]);
      setPendingServiceFilterSel({});
    } finally {
      setLoadingServiceDetail(false);
    }
  };

  // Commit the comprehensive form: build the full entry and append (add) or
  // replace (edit). Persists immediately via the existing services mutation.
  const commitServiceForm = async () => {
    const entry: UserServiceEntry = {
      ...pending,
      customFilterValueIds: pendingServiceFilterSel,
      status: pending.status ?? 'pending_review',
    };
    const next = serviceFormOpen === 'add'
      ? [...userServices, entry]
      : userServices.map((us, i) => (i === serviceFormOpen ? entry : us));
    setUserServices(next);
    closeServiceForm();
    try { await updateServicesMutation.mutateAsync(next); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); }
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

  // My services regrouped by SECTION (sections now own the catalog; services no
  // longer carry a field/direction). Falls back to a single "Услуги" bucket.
  const servicesBySection = (profile?.userServices ?? []).reduce(
    (acc: Record<string, { sectionName: string; services: any[] }>, us: any) => {
      const sId = us.service?.section?.id || 'unknown';
      const sName = us.service?.section?.name || 'Услуги';
      if (!acc[sId]) acc[sId] = { sectionName: sName, services: [] };
      acc[sId].services.push(us);
      return acc;
    },
    {} as Record<string, { sectionName: string; services: any[] }>
  );


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


  // ── Comprehensive service ADD/EDIT form ─────────────────────────────────────
  const ServiceForm = () => {
    if (serviceFormOpen === null) return null;
    const isEdit = serviceFormOpen !== 'add';
    const nameOk = pending.name.trim().length > 0 && pending.name.length <= 50;
    const serviceOk = !!pending.serviceId;
    // «от» не может превышать «до» (и наоборот) — для стоимости и для срока.
    const priceInvalid = pending.priceFrom !== '' && pending.priceTo !== '' && Number(pending.priceFrom) > Number(pending.priceTo);
    const deadlineInvalid = pending.deadlineFrom !== '' && pending.deadlineTo !== '' && Number(pending.deadlineFrom) > Number(pending.deadlineTo);
    const canSave = nameOk && serviceOk && !priceInvalid && !deadlineInvalid;

    // Стоимость и сроки — только неотрицательные целые: оставляем лишь цифры
    // (убирает минус, точку, «e» и прочее, что допускает type=number).
    const onlyDigits = (v: string) => v.replace(/[^\d]/g, '');

    const query = catalogSearch.trim().toLowerCase();
    const matches = query
      ? catalogServices
          .filter(s => s.name.toLowerCase().includes(query))
          .filter(s => !userServices.some((us, i) => us.serviceId === s.id && i !== serviceFormOpen))
          .slice(0, 12)
      : [];

    const levelFilter = pendingServiceFilters.find(isLevelFilter);
    const otherFilters = pendingServiceFilters.filter(f => !isLevelFilter(f));

    return (
      <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3 space-y-3">
        <p className="text-sm font-semibold text-white">{isEdit ? 'Редактировать услугу' : 'Новая услуга'}</p>

        {/* 1 — Название услуги */}
        <div>
          <label className={labelCls}>Название услуги <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={pending.name}
            maxLength={50}
            onChange={e => setPending(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Например: Сведение трека"
            className={inputCls}
          />
          <p className="text-right text-[11px] text-slate-600 mt-1">{pending.name.length}/50</p>
        </div>

        {/* 2 — Раздел каталога (autocomplete) */}
        <div>
          <label className={labelCls}>Раздел каталога <span className="text-red-400">*</span></label>
          {pending.serviceId ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800/60 border border-primary-500/40 rounded-xl">
              <Briefcase size={13} className="text-primary-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{pending.serviceName}</p>
                {pending.fieldOfActivityName && <p className="text-[10px] text-slate-500 truncate">{pending.fieldOfActivityName}</p>}
              </div>
              {loadingServiceDetail && <Loader2 size={13} className="text-slate-400 animate-spin flex-shrink-0" />}
              <button
                type="button"
                onClick={() => {
                  setPending(prev => ({ ...prev, serviceId: '', serviceName: '', fieldOfActivityId: '', fieldOfActivityName: '', professionId: '', professionName: '' }));
                  setPendingServiceFilters([]);
                  setPendingServiceFilterSel({});
                }}
                className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                placeholder="Поиск услуги в каталоге..."
                className="w-full pl-8 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
              />
              {query && matches.length === 0 && (
                <p className="text-xs text-slate-500 mt-1.5">Ничего не найдено</p>
              )}
              {matches.length > 0 && (
                <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900/90 divide-y divide-slate-800/60">
                  {matches.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={loadingServiceDetail}
                      onClick={() => selectCatalogService(s)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary-500/10 transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm text-white truncate">{s.name}</span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{s.sectionName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3 — Фильтр «Уровень» (single-select) */}
        {levelFilter && (
          <div>
            <label className={labelCls}>{levelFilter.name}</label>
            <div className="flex flex-wrap gap-1.5">
              {levelFilter.values.map(v => {
                const isSelected = (pendingServiceFilterSel[levelFilter.id] || [])[0] === v.id;
                return (
                  <button key={v.id} type="button"
                    onClick={() => setLevelFilterValue(levelFilter.id, v.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-primary-600 border-primary-500 text-white'
                        : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'
                    }`}
                  >
                    {v.value}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4 — Остальные фильтры (multi-select) */}
        {otherFilters.map(filter => (
          <div key={filter.id}>
            <label className={labelCls}>{filter.name}</label>
            <div className="flex flex-wrap gap-1.5">
              {filter.values.map(v => {
                const isSelected = (pendingServiceFilterSel[filter.id] || []).includes(v.id);
                return (
                  <button key={v.id} type="button"
                    onClick={() => togglePendingServiceFilter(filter.id, v.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-primary-600 border-primary-500 text-white'
                        : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'
                    }`}
                  >
                    {v.value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* 5 — Стоимость */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Стоимость «от», ₽</label>
              <input type="number" inputMode="numeric" min={0} max={pending.priceTo || undefined} value={pending.priceFrom}
                onChange={e => setPending(prev => ({ ...prev, priceFrom: onlyDigits(e.target.value) }))}
                placeholder="0" className={`${inputCls} ${priceInvalid ? '!border-red-500/60' : ''}`} />
            </div>
            <div>
              <label className={labelCls}>Стоимость «до», ₽</label>
              <input type="number" inputMode="numeric" min={pending.priceFrom || 0} value={pending.priceTo}
                onChange={e => setPending(prev => ({ ...prev, priceTo: onlyDigits(e.target.value) }))}
                placeholder="0" className={`${inputCls} ${priceInvalid ? '!border-red-500/60' : ''}`} />
            </div>
          </div>
          {priceInvalid && <p className="text-[11px] text-red-400 mt-1">«Стоимость от» не может быть больше «Стоимость до»</p>}
        </div>

        {/* 6 — Прайс-лист */}
        <div>
          <label className={labelCls}>Прайс-лист</label>
          <div className="space-y-2">
            {pending.priceItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_6.5rem_auto] gap-2 items-center">
                <input type="text" value={item.name}
                  onChange={e => updatePriceItem(i, { name: e.target.value })}
                  placeholder="Название позиции" className={`${inputCls} min-w-0`} />
                <input type="number" inputMode="numeric" min={0} value={item.price}
                  onChange={e => updatePriceItem(i, { price: onlyDigits(e.target.value) })}
                  placeholder="Цена ₽" className={`${inputCls} min-w-0 text-center`} />
                <button type="button" onClick={() => removePriceItem(i)}
                  className="p-2.5 rounded-xl border border-slate-700/50 text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addPriceItem}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-xs">
              <Plus size={13} />Добавить позицию
            </button>
          </div>
        </div>

        {/* 7 — Срок исполнения */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Срок «от», дней</label>
              <input type="number" inputMode="numeric" min={0} max={pending.deadlineTo || undefined} value={pending.deadlineFrom}
                onChange={e => setPending(prev => ({ ...prev, deadlineFrom: onlyDigits(e.target.value) }))}
                placeholder="0" className={`${inputCls} ${deadlineInvalid ? '!border-red-500/60' : ''}`} />
            </div>
            <div>
              <label className={labelCls}>Срок «до», дней</label>
              <input type="number" inputMode="numeric" min={pending.deadlineFrom || 0} value={pending.deadlineTo}
                onChange={e => setPending(prev => ({ ...prev, deadlineTo: onlyDigits(e.target.value) }))}
                placeholder="0" className={`${inputCls} ${deadlineInvalid ? '!border-red-500/60' : ''}`} />
            </div>
          </div>
          {deadlineInvalid && <p className="text-[11px] text-red-400 mt-1">«Срок от» не может быть больше «Срок до»</p>}
        </div>

        {/* 8 — Описание */}
        <div>
          <label className={labelCls}>Описание</label>
          <textarea value={pending.description} rows={4}
            onChange={e => setPending(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Опишите услугу..." className={`${inputCls} resize-none`} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={closeServiceForm}
            className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0">
            Отмена
          </button>
          <button
            onClick={commitServiceForm}
            disabled={!canSave || updateServicesMutation.isPending}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:hover:bg-primary-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            {updateServicesMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Сохранить изменения' : 'Добавить услугу'}
          </button>
        </div>
      </div>
    );
  };


  const aUrl = getAvatarUrl(profile?.avatar);
  const bUrl = profile?.bannerImage ? `${API_URL}${profile.bannerImage}` : null;
  const socialLinksMap = (profile?.socialLinks as Record<string, string>) || {};
  const hasContactLinks = CONTACT_KEYS.some(k => socialLinksMap[k]);
  const hasSocialNetworkLinks = SOCIAL_KEYS.some(k => socialLinksMap[k]);


  const servicesFlat = (Object.values(servicesBySection) as { sectionName: string; services: any[] }[])
    .flatMap(({ sectionName, services }) =>
      services.map((us: any) => ({ ...us, _sectionName: sectionName }))
    );

  const audioLinks = portfolioLinks.filter((l: any) => l.type === 'audio');
  const audioFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('audio/'));
  const imageFiles = portfolioFiles.filter((f: any) => f.mimeType?.startsWith('image/'));
  const otherFiles = portfolioFiles.filter((f: any) => !f.mimeType?.startsWith('audio/') && !f.mimeType?.startsWith('image/'));

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
            onChange={e => { const f = e.target.files?.[0]; if (f) setCropBannerFile(f); e.target.value = ''; }} />
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
                onChange={e => { const f = e.target.files?.[0]; if (f) setCropAvatarFile(f); e.target.value = ''; }} />
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
              <button
                onClick={() => setShowPrivacy(true)}
                className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white rounded-xl transition-all"
                title="Приватность"
              >
                <Shield size={16} />
              </button>
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
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <Shield size={11} /> Видимость даты рождения — в настройках приватности
                </p>
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
                      onClick={() => navigate('/artist/' + g.id)}
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
                  onClick={() => { setEditingProfessions(v => !v); setProfAddOpen(false); setProfSearch(''); }}
                  className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                >
                  {editingProfessions ? 'Готово' : 'Изменить'}
                </button>
              </div>

              {editingProfessions ? (
                <div className="p-3 space-y-3">
                  {/* Existing professions */}
                  {myStandaloneProfessions.length > 0 && (
                    <div className="space-y-2">
                      {myStandaloneProfessions.map((p, i) => (
                        <div key={p.professionId} className="bg-primary-500/5 border border-primary-500/20 rounded-xl p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-primary-300 font-medium flex-1">{p.professionName}</span>
                            <button onClick={() => { setMyStandaloneProfessions(prev => prev.filter((_, idx) => idx !== i)); }} className="text-primary-400/60 hover:text-red-400 transition-colors">
                              <X size={12} />
                            </button>
                          </div>
                          {/* Filters always expanded for easy multi-select */}
                          {!profFiltersData[p.professionId] && (
                            <p className="text-[10px] text-slate-600 mt-1.5">Загрузка параметров...</p>
                          )}
                          {profFiltersData[p.professionId]?.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {profFiltersData[p.professionId].map((filter: any) => (
                                <div key={filter.id}>
                                  <p className="text-xs text-slate-500 mb-1">{filter.name}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {filter.values.map((v: any) => {
                                      const isSelected = profFilterSelections[p.professionId]?.includes(v.id);
                                      return (
                                        <button key={v.id} type="button"
                                          onClick={() => toggleProfFilterValue(p.professionId, v.id)}
                                          className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                                            isSelected ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                          }`}>
                                          {v.value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {profFiltersData[p.professionId]?.length === 0 && (
                            <p className="text-[10px] text-slate-600 mt-1.5">Нет параметров для этой профессии</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add flow — flat profession search */}
                  {!profAddOpen && (
                    <button onClick={() => { setProfAddOpen(true); setProfSearch(''); setProfSearchResults([]); }} className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-sm">
                      <Plus size={14} />Добавить профессию
                    </button>
                  )}
                  {profAddOpen && (
                    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3 space-y-2">
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          autoFocus
                          type="text"
                          value={profSearch}
                          onChange={e => setProfSearch(e.target.value)}
                          placeholder="Поиск профессии..."
                          className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        {profSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
                      </div>
                      {profSearch.trim() && profSearchResults.length === 0 && !profSearching && (
                        <p className="text-xs text-slate-500 text-center py-1">Ничего не найдено</p>
                      )}
                      {profSearchResults.length > 0 && (
                        <div className="max-h-52 overflow-y-auto flex flex-wrap gap-1.5">
                          {profSearchResults.map((p: any) => {
                            const alreadyAdded = myStandaloneProfessions.some(x => x.professionId === p.id);
                            return (
                              <button key={p.id} type="button" disabled={alreadyAdded}
                                onClick={() => {
                                  setMyStandaloneProfessions(prev => [...prev, { professionId: p.id, professionName: p.name }]);
                                  // Immediately load + expand this profession's filters
                                  loadProfFilters(p.id);
                                  setProfAddOpen(false);
                                  setProfSearch('');
                                  setProfSearchResults([]);
                                }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${alreadyAdded ? 'bg-slate-800/20 border-slate-700/30 text-slate-600 cursor-default' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-primary-500/10 hover:border-primary-500/40 hover:text-primary-300'}`}
                              >
                                {alreadyAdded ? <span className="text-emerald-500">✓</span> : <Plus size={11} />}{p.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button onClick={() => { setProfAddOpen(false); setProfSearch(''); setProfSearchResults([]); }} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Отмена</button>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setEditingProfessions(false); setProfAddOpen(false); setProfSearch(''); setMyStandaloneProfessions(profile?.userProfessions?.map((up: any) => ({ professionId: up.professionId, professionName: up.profession?.name || '' })) || []); }} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                    <button onClick={() => handleSaveProfessions(myStandaloneProfessions)} disabled={savingProfessions} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {savingProfessions ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                </div>
              ) : myStandaloneProfessions.length > 0 ? (
                <div className="px-4 pt-3 pb-2 space-y-2">
                  {myStandaloneProfessions.map((p) => {
                    const profData = profile?.userProfessions?.find((up: any) => up.professionId === p.professionId);
                    const cfvs: any[] = profData?.selectedCustomFilterValues || [];
                    return (
                      <div key={p.professionId}>
                        <button
                          onClick={() => setSelectedProfession(p)}
                          className="text-primary-400 hover:text-primary-300 font-medium underline underline-offset-2 decoration-primary-500/40 hover:decoration-primary-400 transition-colors text-sm"
                        >
                          {p.professionName}
                        </button>
                        {cfvs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cfvs.map((cfv: any) => (
                              <span key={cfv.id} className="text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">
                                {cfv.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  <button
                    onClick={() => { setEditingServices(v => !v); closeServiceForm(); }}
                    className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    {editingServices ? 'Готово' : 'Изменить'}
                  </button>
                )}
              </div>

              <div className="p-3 space-y-3">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                  {/* Add tile — always first */}
                  <button
                    onClick={openAddServiceForm}
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
                    const stateIdx = userServices.findIndex(s => s.serviceId === us.serviceId);
                    return (
                      <div key={us.id} className="flex flex-col gap-0 flex-shrink-0 relative group" style={{ width: 'calc((100% - 24px) / 3.5)' }}>
                        <button
                          onClick={() => editingServices && stateIdx >= 0 ? openEditServiceForm(stateIdx) : navigate(`/services/${us.id}`)}
                          className="flex flex-col gap-0 text-left w-full"
                        >
                          <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary-900/80 to-slate-800/80 border border-primary-700/30 flex items-center justify-center p-2 group-hover:border-primary-500/50 transition-colors overflow-hidden">
                            {editingServices ? <Edit3 size={16} className="text-primary-400 flex-shrink-0" /> : <Briefcase size={16} className="text-primary-400 flex-shrink-0" />}
                          </div>
                          <div className="w-full mt-1.5">
                            <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{us.name || us.service?.name}</p>
                            {price && <p className="text-[9px] text-primary-400 leading-tight mt-0.5">{price}</p>}
                          </div>
                        </button>
                        {editingServices && stateIdx >= 0 && (
                          <button
                            onClick={() => setConfirmDeleteServiceIdx(stateIdx)}
                            className="absolute -top-1 -right-1 p-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors z-10"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {ServiceForm()}
              </div>
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
                <Phone size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Контакты</span>
                <button onClick={() => editingContacts ? setEditingContacts(false) : openContactsEditor()} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                  {editingContacts ? 'Готово' : 'Изменить'}
                </button>
              </div>
              <div className="p-4">
                {editingContacts ? (
                  <div className="space-y-3">
                    <SocialLinksEditor only={CONTACT_KEYS} value={formData.socialLinks} onChange={v => setFormData({ ...formData, socialLinks: v })} />
                    <button onClick={handleSaveContacts} disabled={updateMutation.isPending} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                ) : hasContactLinks ? (
                  <SocialIconRow only={CONTACT_KEYS} links={(profile?.socialLinks as Record<string, string>) || {}} />
                ) : (
                  <button onClick={openContactsEditor} className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic">+ Добавить контакты</button>
                )}
              </div>
            </div>

            {/* ── Social networks card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Globe size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Соц.сети</span>
                <button onClick={() => setEditingSocials(v => !v)} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                  {editingSocials ? 'Готово' : 'Изменить'}
                </button>
              </div>
              <div className="p-4">
                {editingSocials ? (
                  <div className="space-y-3">
                    <SocialLinksEditor only={SOCIAL_KEYS} value={formData.socialLinks} onChange={v => setFormData({ ...formData, socialLinks: v })} />
                    <button onClick={handleSaveSocials} disabled={updateMutation.isPending} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                      {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                    </button>
                  </div>
                ) : hasSocialNetworkLinks ? (
                  <SocialIconRow only={SOCIAL_KEYS} links={(profile?.socialLinks as Record<string, string>) || {}} />
                ) : (
                  <button onClick={() => setEditingSocials(true)} className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic">+ Добавить соц.сети</button>
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

    {/* Privacy settings */}
    {showPrivacy && createPortal(
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPrivacy(false)} />
        <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-primary-400" />
              <h3 className="text-base font-semibold text-white">Приватность</h3>
            </div>
            <button onClick={() => setShowPrivacy(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
          </div>
          <div className="px-5 py-3">
            {/* Contacts visibility — 3-level selector */}
            <div className="py-3 border-b border-slate-800/60">
              <p className="text-sm font-medium text-white">Кто видит контакты</p>
              <p className="text-xs text-slate-500 mb-2.5">Телефон, email и Telegram</p>
              <div className="space-y-1.5">
                {([
                  { value: 'ALL' as const, label: 'Все' },
                  { value: 'REGISTERED' as const, label: 'Только зарегистрированные' },
                  { value: 'FRIENDS' as const, label: 'Только друзья и коллеги' },
                ]).map(opt => {
                  const active = formData.contactsVisibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const next = {
                          ...formData,
                          contactsVisibility: opt.value,
                          contactsVisible: opt.value === 'ALL',
                        };
                        setFormData(next);
                        updateMutation.mutate({ contactsVisibility: opt.value } as any, {
                          onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
                        });
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${active ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-slate-600'}`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-primary-500' : 'border-slate-600'}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-primary-500" />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Birth date visibility — boolean toggle */}
            {([
              { key: 'birthDateVisible' as const, label: 'Показывать дату рождения', desc: 'Дата рождения видна в вашем профиле' },
            ]).map(row => (
              <div key={row.key} className="flex items-center gap-3 py-3 border-b border-slate-800/60 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{row.label}</p>
                  <p className="text-xs text-slate-500">{row.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...formData, [row.key]: !formData[row.key] };
                    setFormData(next);
                    updateMutation.mutate({ [row.key]: next[row.key] } as any, {
                      onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
                    });
                  }}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${formData[row.key] ? 'bg-primary-600' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${formData[row.key] ? 'translate-x-4' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    )}

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

    {cropAvatarFile && (
      <ImageCropModal
        file={cropAvatarFile}
        aspect={1}
        cropShape="round"
        title="Аватар"
        onCancel={() => setCropAvatarFile(null)}
        onCropped={blob => { uploadAvatarMutation.mutate(blobToFile(blob, 'avatar.jpg')); setCropAvatarFile(null); }}
      />
    )}

    {cropBannerFile && (
      <ImageCropModal
        file={cropBannerFile}
        aspect={3}
        cropShape="rect"
        title="Обложка"
        onCancel={() => setCropBannerFile(null)}
        onCropped={blob => { uploadBannerMutation.mutate(blobToFile(blob, 'banner.jpg')); setCropBannerFile(null); }}
      />
    )}

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
