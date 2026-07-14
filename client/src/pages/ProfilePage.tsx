import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, connectionAPI, groupAPI, dealAPI, authAPI, orderAPI } from '../lib/api';
import { DEALS_ENABLED } from '../lib/features';
import { useAuthStore } from '../stores/authStore';
import AudioPlayer from '../components/AudioPlayer';
import {
  Camera, Save, Check, X, MapPin, Briefcase, Star, LogOut,
  Globe, Calendar, GraduationCap,
  Headphones, Edit3, Plus,
  FileText, FileSpreadsheet, FileArchive, Download, Trash2, Loader2, Crown, Ban, Link2, Zap,
  Music2, HandshakeIcon, Eye, Phone, Shield, ChevronDown, ChevronUp,
  ClipboardList, UserRound,
} from 'lucide-react';
import ConnectionViewModal from '../components/ConnectionViewModal';
import ConnectionCard from '../components/ConnectionCard';

import ConfirmDialog from '../components/ConfirmDialog';
import OrderStatusChip from '../components/OrderStatusChip';
import BadgeTooltip from '../components/BadgeTooltip';
import { SocialIconRow, SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useScrollLock } from '../lib/scrollLock';
import { limitsFor, isProActive } from '../lib/proLimits';
import ShareButton from '../components/ShareButton';
import ReviewsBlock from '../components/ReviewsBlock';
import ImageCropModal, { blobToFile } from '../components/ImageCropModal';
import ProfileProgressBar, { profileCompletion } from '../components/ProfileProgressBar';
import PublicConsentGate from '../components/PublicConsentGate';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';


function formatBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

// File-type icon + colour (OS-like) for the portfolio "other" tab.
function fileTypeMeta(name: string): { Icon: typeof FileText; color: string; bg: string; label: string } {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  switch (ext) {
    case 'pdf':  return { Icon: FileText, color: 'text-red-400', bg: 'bg-red-500/15', label: 'PDF' };
    case 'doc':
    case 'docx': return { Icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/15', label: ext.toUpperCase() };
    case 'xls':
    case 'xlsx':
    case 'csv':  return { Icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: ext.toUpperCase() };
    case 'ppt':
    case 'pptx': return { Icon: FileText, color: 'text-orange-400', bg: 'bg-orange-500/15', label: ext.toUpperCase() };
    case 'zip':
    case 'rar':
    case '7z':   return { Icon: FileArchive, color: 'text-amber-400', bg: 'bg-amber-500/15', label: ext.toUpperCase() };
    case 'txt':  return { Icon: FileText, color: 'text-slate-300', bg: 'bg-slate-600/30', label: 'TXT' };
    default:     return { Icon: FileText, color: 'text-slate-400', bg: 'bg-slate-600/30', label: (ext || 'файл').toUpperCase() };
  }
}


// Profile-field saves (hero/bio/contacts/socials/autosave) must NOT send
// userProfessions: those rows carry per-profession filter selections that are
// only complete when saved via handleSaveProfessions. Including the lean copy
// here would wipe the saved filters server-side (deleteMany + recreate).
function stripProfessions<T extends { userProfessions?: unknown }>(data: T): Omit<T, 'userProfessions'> {
  const { userProfessions, ...rest } = data;
  return rest;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const isPro = isProActive(user);
  const proLimits = limitsFor(isPro);
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

  // Image cropping (avatar / banner) before upload
  const [cropAvatarFile, setCropAvatarFile] = useState<File | null>(null);
  const [cropBannerFile, setCropBannerFile] = useState<File | null>(null);


  const [portfolioFiles, setPortfolioFiles] = useState<any[]>([]);
  const [portfolioLinks, setPortfolioLinks] = useState<any[]>([]);
  const [isUploadingPortfolio, setIsUploadingPortfolio] = useState(false);
  const [imageFullscreen, setImageFullscreen] = useState<string | null>(null);
  const [docFullscreen, setDocFullscreen] = useState<{ url: string; name: string } | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'audio' | 'images' | 'other'>('audio');
  const [editingPortfolio, setEditingPortfolio] = useState(false);
  const [renamingFile, setRenamingFile] = useState<{ id: string; value: string } | null>(null);
  // Service add/edit form (single comprehensive form).
  // serviceFormOpen: 'add' to create a new entry, or the index of an existing
  // entry being edited. null = closed.
  // Order ADD form (customer-posted «Заказ») — open/closed.
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Post-save «Поток» dialogs. `publishDialog` is shown after a NEW service is
  // saved («Опубликовать в Потоке?»); `updateDialog` after an EXISTING one is
  // edited («Сообщить об изменениях в Потоке?»). Both carry the saved
  // user-service id used to deep-link into the Поток composer.


  const [editingHero, setEditingHero] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingSocials, setEditingSocials] = useState(false);

  // Live nickname-uniqueness check (mirrors the registration flow). The user's
  // own current nickname always counts as free. (The checking effect lives
  // after the profile query below, since it reads profile.nickname.)
  const [nickTaken, setNickTaken] = useState(false);
  const [nickChecking, setNickChecking] = useState(false);
  const nickTakenRef = useRef(false);
  useEffect(() => { nickTakenRef.current = nickTaken; }, [nickTaken]);

  // Autosave when formData changes while any section is open
  useEffect(() => {
    if (!editingHero && !editingBio && !editingContacts && !editingSocials) return;
    triggerAutoSave(formData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Keep the autosave mirror refs in sync with the live state every render.

  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);

  // Chip panels

  const [viewConn, setViewConn] = useState<any>(null);


  const [myStandaloneProfessions, setMyStandaloneProfessions] = useState<{ professionId: string; professionName: string }[]>([]);
  // Профессии / Услуги / Заказы открываются модалками (как Вакансии) — блокируем фон.
  useScrollLock(
    !!renamingFile || !!imageFullscreen || !!docFullscreen,
  );

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
      setPortfolioFiles(data.portfolioFiles ?? []);
      setPortfolioLinks(data.portfolioLinks ?? []);
      return data;
    },
  });

  // Live nickname-uniqueness check while editing the hero section.
  useEffect(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');
    const nk = formData.nickname.trim();
    if (!editingHero || nk.length < 2 || norm(nk) === norm(profile?.nickname || '')) {
      setNickTaken(false); setNickChecking(false); return;
    }
    setNickChecking(true);
    const t = setTimeout(async () => {
      try { const { data } = await authAPI.checkNickname(nk); setNickTaken(!data.available); }
      catch { setNickTaken(false); }
      finally { setNickChecking(false); }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.nickname, editingHero, profile?.nickname]);

  const { data: myConnectionsRaw = [] } = useQuery({
    queryKey: ['connections-all'],
    queryFn: async () => { const { data } = await connectionAPI.getAll(); return data as any[]; },
  });

  const { data: myDeals = [] } = useQuery<any[]>({
    queryKey: ['deals'],
    queryFn: async () => { const { data } = await dealAPI.getAll(); return data as any[]; },
    enabled: DEALS_ENABLED,
  });
  const activeDeals = myDeals.filter((d: any) => !['COMPLETED', 'CANCELLED'].includes(d.status));

  // «Мои заказы» — customer-posted orders (author = current user).
  const { data: myOrders = [] } = useQuery<any[]>({
    queryKey: ['orders', 'mine'],
    queryFn: async () => { const { data } = await orderAPI.getMine(); return data as any[]; },
  });
  const activeOrdersCount = myOrders.filter((o: any) => o.status === 'active').length;

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
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось загрузить аватар')),
  });

  const uploadBannerMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('banner', file);
      const { data } = await userAPI.uploadBanner(fd);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось загрузить обложку')),
  });

  const updateMutation = useMutation({
    mutationFn: userAPI.updateMe,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить изменения')),
  });
  const [autoSaved, setAutoSaved] = useState(false);

  // Debounce autosave: when editing is open and formData changes, auto-save after 1.5s
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerAutoSave = useCallback((data: typeof formData) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (nickTakenRef.current) return; // never autosave a taken nickname
      if (!data.firstName.trim() || !data.lastName.trim()) return; // name & surname are required
      try {
        await userAPI.updateMe(stripProfessions(data));
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      } catch (e: any) { toast.error(getApiError(e, 'Не удалось сохранить изменения')); }
    }, 1500);
  }, []);


  const handleSaveHero = async () => {
    // Convert DD.MM.YYYY → ISO date for server
    const bd = formData.birthDate;
    const birthDateISO = bd.length === 10
      ? `${bd.slice(6)}-${bd.slice(3, 5)}-${bd.slice(0, 2)}`
      : undefined;
    if (birthDateISO) {
      const birth = new Date(birthDateISO);
      const now = new Date();
      const age = now.getFullYear() - birth.getFullYear()
        - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
      if (age < 16) { toast.error('Для использования платформы необходимо быть старше 16 лет'); return; }
    }
    try {
      await updateMutation.mutateAsync({ ...stripProfessions(formData), birthDate: birthDateISO ?? null });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditingHero(false);
    } catch { /* error shown via updateMutation.onError toast; keep the editor open */ }
  };

  const handleSaveBio = async () => {
    try {
      await updateMutation.mutateAsync(stripProfessions(formData));
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditingBio(false);
    } catch { /* error shown via updateMutation.onError toast; keep the editor open */ }
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
    try { await updateMutation.mutateAsync(stripProfessions(formData)); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingContacts(false); }
  };

  const handleSaveSocials = async () => {
    try { await updateMutation.mutateAsync(stripProfessions(formData)); }
    finally { queryClient.invalidateQueries({ queryKey: ['profile'] }); setEditingSocials(false); }
  };

  // Price-list row helpers (composite name + price rows). A row's price may be a
  // concrete number or the «от [сумма]» format (toggled per row via `from`).

  // ── Consent to public distribution of PD (152-ФЗ ст. 10.1) ──────────────────
  // One-time gate before the first public action (publish service / upload
  // portfolio / set contacts to «Все»). MUST stay above the isLoading return —
  // these are hooks and run on every render.
  const [consentAction, setConsentAction] = useState<(() => void) | null>(null);
  const [locallyConsented, setLocallyConsented] = useState(false);
  const hasPublicConsent = !!(profile as any)?.publicConsentAt || locallyConsented;
  const ensurePublicConsent = (action: () => void) => {
    if (hasPublicConsent) { action(); return; }
    setConsentAction(() => action);
  };
  const handleConsentAccept = async () => {
    try { await userAPI.givePublicConsent(); } catch { /* recorded best-effort */ }
    setLocallyConsented(true);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    const action = consentAction;
    setConsentAction(null);
    action?.();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30" />
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  const inputCls = "w-full min-w-0 px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
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


  const handlePortfolioUpload = (files: FileList | null) => {
    if (!files) return;
    // Publishing portfolio is a public action — gate on first-time consent.
    ensurePublicConsent(async () => {
      for (const file of Array.from(files)) {
        if (portfolioFiles.length >= proLimits.portfolioFiles) break;
        // Photos & documents are capped at 10 MB; audio keeps the Pro-gated limit.
        const maxMb = file.type.startsWith('audio/') ? proLimits.portfolioFileMB : 10;
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`«${file.name}» больше ${maxMb} МБ — не загружен`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        setIsUploadingPortfolio(true);
        try { const { data } = await userAPI.uploadPortfolio(fd); setPortfolioFiles(prev => [...prev, data]); }
        catch (e: any) { toast.error(getApiError(e, 'Не удалось загрузить файл')); }
        finally { setIsUploadingPortfolio(false); }
      }
    });
  };

  const handlePortfolioDelete = async (fileId: string) => {
    try {
      await userAPI.deletePortfolioFile(fileId);
      setPortfolioFiles(prev => prev.filter((f: any) => f.id !== fileId));
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось удалить файл'));
    }
  };

  // Portfolio order/rename. sortOrder is global; reordering swaps a file with its
  // neighbour of the SAME type (tab) inside the full list, then persists the order.
  const portfolioTypeOf = (f: any): 'audio' | 'image' | 'other' =>
    f.mimeType?.startsWith('audio/') ? 'audio' : f.mimeType?.startsWith('image/') ? 'image' : 'other';

  const movePortfolioFile = async (file: any, dir: 'up' | 'down') => {
    const t = portfolioTypeOf(file);
    const siblings = portfolioFiles.filter((f: any) => portfolioTypeOf(f) === t);
    const sIdx = siblings.findIndex((f: any) => f.id === file.id);
    const target = siblings[sIdx + (dir === 'up' ? -1 : 1)];
    if (!target) return;
    const prev = portfolioFiles;
    const full = [...portfolioFiles];
    const i = full.findIndex((f: any) => f.id === file.id);
    const j = full.findIndex((f: any) => f.id === target.id);
    [full[i], full[j]] = [full[j], full[i]];
    setPortfolioFiles(full);
    try { await userAPI.reorderPortfolio(full.map((f: any) => f.id)); }
    catch (e: any) { setPortfolioFiles(prev); toast.error(getApiError(e, 'Не удалось изменить порядок')); }
  };

  const commitPortfolioRename = async () => {
    if (!renamingFile) return;
    const { id, value } = renamingFile;
    const title = value.trim();
    try {
      await userAPI.renamePortfolioFile(id, title);
      setPortfolioFiles(prev => prev.map((f: any) => f.id === id ? { ...f, title: title || null } : f));
      setRenamingFile(null);
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось переименовать файл'));
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await userAPI.deletePortfolioLink(linkId);
      setPortfolioLinks(prev => prev.filter((l: any) => l.id !== linkId));
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось удалить ссылку'));
    }
  };


  // ── Comprehensive service ADD/EDIT form ─────────────────────────────────────


  const aUrl = getAvatarUrl(profile?.avatar);
  const bUrl = profile?.bannerImage ? `${API_URL}${profile.bannerImage}` : null;
  const completionPct = profileCompletion(profile);
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
  // At/over the effective portfolio file-count cap (Free 10 / Pro 20).
  const portfolioFull = portfolioFiles.length >= proLimits.portfolioFiles;

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
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) {
                // GIF cover is Pro-only; for Pro, skip cropping (would lose animation) and upload directly.
                if (f.type === 'image/gif') {
                  if (isPro) uploadBannerMutation.mutate(f);
                  else window.alert('GIF-обложка доступна в Pro');
                } else {
                  setCropBannerFile(f);
                }
              }
              e.target.value = '';
            }} />
        </div>

        <div className="px-4">
          {/* Avatar + action buttons */}
          <div className="flex items-end justify-between -mt-14 mb-4">
            <div className="relative z-10 flex-shrink-0">
              <div
                className="rounded-full p-[3px]"
                title={`Профиль заполнен на ${completionPct}%`}
                style={{ background: `conic-gradient(#8b5cf6 0% ${completionPct}%, rgba(139,92,246,0.18) ${completionPct}% 100%)` }}
              >
                <div className="rounded-full p-[3px] bg-slate-950">
                  <div className="w-28 h-28 rounded-full overflow-hidden shadow-2xl bg-gradient-to-br from-primary-500 to-purple-600">
                    {aUrl
                      ? <img src={aUrl} alt="Avatar" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl font-bold text-white">{profile?.firstName?.[0]}{profile?.lastName?.[0]}</span>
                        </div>
                    }
                  </div>
                </div>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0.5 right-0.5 bg-primary-500 hover:bg-primary-600 text-white p-2 rounded-full shadow-lg transition-all border-2 border-slate-950">
                <Camera size={13} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) {
                    // GIF avatar is Pro-only; for Pro, skip cropping (would lose animation) and upload directly.
                    if (f.type === 'image/gif') {
                      if (isPro) uploadAvatarMutation.mutate(f);
                      else window.alert('GIF-аватар доступен в Pro');
                    } else {
                      setCropAvatarFile(f);
                    }
                  }
                  e.target.value = '';
                }} />
            </div>
            {/* Actions — compact round icon buttons, single row (matches Artist hero) */}
            <div className="flex items-center gap-2 pb-1">
              <ShareButton
                url={`/profile/${profile?.id}`}
                title={`${profile?.firstName} ${profile?.lastName} — Moooza`}
                className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                iconSize={16}
              />
              <button
                onClick={() => setEditingHero(v => !v)}
                title={editingHero ? 'Закрыть' : 'Редактировать'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${editingHero ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white'}`}
              >
                {editingHero ? <X size={16} /> : <Edit3 size={16} />}
              </button>
              {profile?.id && (
                <button
                  onClick={() => navigate(`/profile/${profile.id}`)}
                  className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                  title="Превью — как видят другие"
                >
                  <Eye size={16} />
                </button>
              )}
              <button
                onClick={() => navigate('/settings/privacy')}
                className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                title="Настройки приватности и уведомлений"
              >
                <Shield size={16} />
              </button>
              {autoSaved && (
                <span className="text-xs text-emerald-400 font-medium animate-pulse whitespace-nowrap">✓</span>
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
                  <input type="text" maxLength={20} value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className={`${inputCls} ${!formData.firstName.trim() ? 'ring-1 ring-red-500/60 border-red-500/60' : ''}`} placeholder="Имя" />
                </div>
                <div>
                  <label className={labelCls}>Фамилия</label>
                  <input type="text" maxLength={30} value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className={`${inputCls} ${!formData.lastName.trim() ? 'ring-1 ring-red-500/60 border-red-500/60' : ''}`} placeholder="Фамилия" />
                </div>
              </div>
              {(!formData.firstName.trim() || !formData.lastName.trim()) && (
                <p className="text-xs text-red-400 -mt-1">Имя и фамилия обязательны</p>
              )}
              <div>
                <label className={labelCls}>Никнейм</label>
                <div className="relative">
                  <input type="text" maxLength={20} value={formData.nickname} onChange={e => setFormData({ ...formData, nickname: e.target.value })} placeholder="@nickname"
                    className={`${inputCls} ${nickTaken ? 'ring-1 ring-red-500/60 border-red-500/60' : ''}`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {nickChecking && formData.nickname.trim().length >= 2 && <Loader2 size={15} className="animate-spin text-slate-500" />}
                    {!nickChecking && nickTaken && <X size={15} className="text-red-400" />}
                    {!nickChecking && !nickTaken && formData.nickname.trim().length >= 2 && <Check size={15} className="text-emerald-400" />}
                  </span>
                </div>
                {nickTaken && <p className="text-xs text-red-400 mt-1">Никнейм занят, введите другой</p>}
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
                    // handleSaveHero re-derives the ISO from formData.birthDate on save.
                    setFormData({ ...formData, birthDate: v });
                  }}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <Shield size={11} /> Видимость даты рождения — в настройках приватности
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingHero(false)} className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                <button onClick={handleSaveHero} disabled={updateMutation.isPending || nickTaken || !formData.firstName.trim() || !formData.lastName.trim()} className="flex-1 py-2.5 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                  {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Сохранить
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h1 className="text-2xl font-bold text-white leading-tight">{profile?.firstName} {profile?.lastName}</h1>
                {isPro && <BadgeTooltip label="PRO аккаунт"><Zap size={18} className="text-violet-400" /></BadgeTooltip>}
                {profile?.isPremium && <BadgeTooltip label="Premium"><Crown size={18} className="text-amber-400" /></BadgeTooltip>}
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
            </>
          )}

          {/* ── CONTENT CARDS ────────────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Profile completion meter (own profile only) */}
            <ProfileProgressBar profile={profile} />

            {/* ── Moooza Pro ── */}
            <button
              onClick={() => navigate('/pro')}
              className={`w-full flex items-center gap-3 rounded-2xl p-4 text-left transition-colors border ${
                isPro
                  ? 'bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/15'
                  : 'bg-gradient-to-r from-violet-600/15 to-violet-500/5 border-violet-500/25 hover:border-violet-500/50'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <Zap size={20} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{isPro ? 'Moooza Pro активен' : 'Moooza Pro'}</p>
                <p className="text-xs text-slate-400 truncate">
                  {isPro
                    ? (user?.proUntil
                        ? `до ${new Date(user.proUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : 'Спасибо, что поддерживаешь Moooza 🎵')
                    : 'Больше портфолио, расширенный профиль, GIF-аватар, пресеты ленты'}
                </p>
              </div>
              <span className="text-xs font-semibold text-violet-400 flex-shrink-0">{isPro ? 'Управлять' : 'Поддержать →'}</span>
            </button>

            {/* Bio — карточка в едином стиле блоков профиля */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <UserRound size={14} className="text-sky-400" />
                <span className="text-sm font-semibold text-white">О себе</span>
                {!editingBio && (
                  <button onClick={() => setEditingBio(true)} className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800 flex-shrink-0"><Edit3 size={13} /></button>
                )}
              </div>
              <div className="p-4">
                {editingBio ? (
                  <div className="space-y-2">
                    <textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} maxLength={proLimits.bioChars} rows={3} placeholder="Расскажите о себе..." className={`${inputCls} resize-none`} />
                    <p className="text-right text-[11px] text-slate-600">{formData.bio.length}/{proLimits.bioChars}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingBio(false)} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                      <button onClick={handleSaveBio} disabled={updateMutation.isPending} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                        {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Сохранить
                      </button>
                    </div>
                  </div>
                ) : profile?.bio ? (
                  <p className="text-slate-300 text-sm leading-relaxed break-words">{profile.bio}</p>
                ) : (
                  <button onClick={() => setEditingBio(true)} className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic">+ Добавить описание</button>
                )}
              </div>
            </div>

            {/* ── Collectives — шапка в едином стиле блоков, плитки с аватарками ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Music2 size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Артисты</span>
                {myGroups.length > 0 && <span className="text-xs text-slate-500">{myGroups.length}</span>}
              </div>
              <div className="p-3">
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {/* Add tile — first */}
                <button
                  onClick={() => navigate('/artist/create')}
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
            </div>

            {/* ── Professions card — акцент фуксия (отличен от фиолетовых услуг) ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <GraduationCap size={14} className="text-fuchsia-400" />
                <span className="text-sm font-semibold text-white">Профессии</span>
                {myStandaloneProfessions.length > 0 && <span className="text-xs text-slate-500">{myStandaloneProfessions.length}</span>}
                {myStandaloneProfessions.length > 0 && profile?.id && (
                  <button
                    onClick={() => navigate(`/profile/${profile.id}/professions`)}
                    className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    Смотреть все
                  </button>
                )}
              </div>

              <div className="p-3">
                {/* Компактные строки — как Услуги/Заказы; детали внутри карточки профессии */}
                <div className="divide-y divide-slate-800/60">
                  {myStandaloneProfessions.slice(0, 4).map((p) => {
                    const profData = profile?.userProfessions?.find((up: any) => up.professionId === p.professionId);
                    const cfvs: any[] = profData?.selectedCustomFilterValues || [];
                    const dirName = profData?.profession?.direction?.name || '';
                    return (
                      <button
                        key={p.professionId}
                        onClick={() => navigate(`/professions/${profile?.id}/${p.professionId}`)}
                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/20 -mx-1 px-1 rounded-lg transition-colors"
                      >
                        <div className="w-1 self-stretch rounded-full bg-fuchsia-500/60 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.professionName}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {[dirName, cfvs.length > 0 ? `характеристик: ${cfvs.length}` : null].filter(Boolean).join(' · ') || 'Без характеристик'}
                          </p>
                        </div>
                        <span className="text-slate-600 flex-shrink-0">›</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => navigate('/professions/new')}
                    className="w-full flex items-center gap-3 py-2.5 text-left group"
                  >
                    <div className="w-1 self-stretch rounded-full bg-slate-700/60 flex-shrink-0" />
                    <Plus size={14} className="text-slate-500 group-hover:text-primary-400 transition-colors flex-shrink-0" />
                    <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">
                      Добавить профессию
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Services card — tile slider ── */}
            <div ref={servicesRef} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Briefcase size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Услуги</span>
                {servicesFlat.length > 0 && <span className="text-xs text-slate-500">{servicesFlat.length}</span>}
                <div className="ml-auto flex items-center gap-3">
                  {profile?.id && (
                    <button
                      onClick={() => navigate(`/profile/${profile.id}/services`)}
                      className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                    >
                      Смотреть все
                    </button>
                  )}
                  {/* «Изменить» убрана: редактирование/удаление — внутри услуги (карандаш) */}
                </div>
              </div>

              <div className="p-3 space-y-3">
                {/* Компактные строки вместо «квадратов» — целостно с остальным профилем */}
                <div className="divide-y divide-slate-800/60">
                  {servicesFlat.map((us: any) => {
                    const price = us.priceFrom != null || us.priceTo != null
                      ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                      : 'По договорённости';
                    return (
                      <div key={us.id} className="flex items-center gap-3 py-2.5 group">
                        <div className="w-1 self-stretch rounded-full bg-primary-500/60 flex-shrink-0" />
                        <button
                          onClick={() => navigate(`/services/${us.id}`)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm font-semibold text-white truncate">{us.name || us.service?.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {[us.service?.section?.name, price].filter(Boolean).join(' · ')}
                          </p>
                        </button>
                        <span className="text-slate-600 flex-shrink-0">›</span>
                      </div>
                    );
                  })}
                  <button onClick={() => navigate('/services/new')} className="w-full flex items-center gap-3 py-2.5 text-left group">
                    <div className="w-1 self-stretch rounded-full bg-slate-700/60 flex-shrink-0" />
                    <Plus size={14} className="text-slate-500 group-hover:text-primary-400 transition-colors flex-shrink-0" />
                    <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">Добавить услугу</span>
                  </button>
                </div>

              </div>
            </div>

            {/* ── Orders card — tile slider ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <ClipboardList size={14} className="text-teal-400" />
                <span className="text-sm font-semibold text-white">Заказы</span>
                {activeOrdersCount > 0 && <span className="text-xs text-slate-500">{activeOrdersCount}</span>}
                {myOrders.length > 0 && (
                  <button onClick={() => navigate('/orders')} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                    Смотреть все
                  </button>
                )}
              </div>

              <div className="p-3 space-y-3">
                {/* Компактные строки со статусом жизненного цикла заказа */}
                <div className="divide-y divide-slate-800/60">
                  {myOrders.map((o: any) => {
                    const oSection = o.service?.section?.name || '';
                    const oDeadline = o.deadline ? `до ${new Date(o.deadline).toLocaleDateString('ru-RU')}` : 'срок не ограничен';
                    return (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/20 -mx-1 px-1 rounded-lg transition-colors"
                      >
                        <div className="w-1 self-stretch rounded-full bg-teal-500/60 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{o.title}</p>
                          <p className="text-xs text-slate-500 truncate">{[oSection, oDeadline].filter(Boolean).join(' · ')}</p>
                        </div>
                        <OrderStatusChip order={o} className="flex-shrink-0" />
                        <span className="text-slate-600 flex-shrink-0">›</span>
                      </button>
                    );
                  })}
                  <button onClick={() => navigate('/orders/new')} className="w-full flex items-center gap-3 py-2.5 text-left group">
                    <div className="w-1 self-stretch rounded-full bg-slate-700/60 flex-shrink-0" />
                    <Plus size={14} className="text-slate-500 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                    <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">Новый заказ</span>
                  </button>
                </div>

              </div>
            </div>

            {/* ── Deals card — скрыта до включения сделок (DEALS_ENABLED) ── */}
            {DEALS_ENABLED && (
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <HandshakeIcon size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Мои сделки</span>
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
            )}

            {/* ── Connections card ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Link2 size={14} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Связи</span>
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
                {(portfolioFiles.length + portfolioLinks.length) > 0 && (
                  <button onClick={() => { setEditingPortfolio(v => !v); setRenamingFile(null); }}
                    className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                    {editingPortfolio ? 'Готово' : 'Изменить'}
                  </button>
                )}
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
                    {portfolioTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />}
                  </button>
                ))}
              </div>
              {/* Hint */}
              <div className="px-4 pt-2 pb-0">
                {portfolioTab === 'audio' && <p className="text-[10px] text-slate-600">до {proLimits.portfolioFileMB} МБ · mp3, wav, flac, ogg</p>}
                {portfolioTab === 'images' && <p className="text-[10px] text-slate-600">до 10 МБ · jpg, png, gif, webp</p>}
                {portfolioTab === 'other' && <p className="text-[10px] text-slate-600">до 10 МБ · pdf, doc, xls</p>}
                {portfolioFiles.length >= proLimits.portfolioFiles && (
                  <p className="text-[10px] text-amber-400/80 mt-0.5">
                    Достигнут лимит файлов ({proLimits.portfolioFiles}){!isPro && ' · больше — в Pro'}
                  </p>
                )}
              </div>
              {/* Content */}
              <div className="px-4 py-3">
                {portfolioTab === 'audio' && (
                  <div className="space-y-3">
                    <div className="px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                      <p className="text-xs font-semibold text-amber-400 mb-0.5">⚠️ Важно</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">Загружая файл, ты подтверждаешь, что у тебя есть права на его использование. Не заливай чужой контент без разрешения — можем удалить и ограничить доступ.</p>
                    </div>
                    <label className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-700 transition-all ${portfolioFull ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/5'}`}>
                      {isUploadingPortfolio ? <Loader2 size={15} className="text-slate-500 animate-spin" /> : <Plus size={16} className="text-slate-500" />}
                      <span className="text-xs text-slate-400">Добавить аудио</span>
                      <input type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/flac,audio/aac,audio/x-m4a,audio/mp4" multiple className="hidden" disabled={isUploadingPortfolio || portfolioFull} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {audioFiles.length + audioLinks.length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-1">Пока нет аудио</p>
                    ) : (
                      <div className="space-y-1">
                        {audioFiles.map((f: any, i: number) => (
                          <div key={f.id}>
                            <AudioPlayer src={`${API_URL}${f.url}`} name={f.title || f.originalName} />
                            {editingPortfolio && (
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <button onClick={() => movePortfolioFile(f, 'up')} disabled={i === 0} title="Выше" className="p-1.5 text-slate-500 hover:text-primary-400 disabled:opacity-30 transition-colors"><ChevronUp size={16} /></button>
                                <button onClick={() => movePortfolioFile(f, 'down')} disabled={i === audioFiles.length - 1} title="Ниже" className="p-1.5 text-slate-500 hover:text-primary-400 disabled:opacity-30 transition-colors"><ChevronDown size={16} /></button>
                                <button onClick={() => setRenamingFile({ id: f.id, value: f.title || f.originalName })} title="Переименовать" className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors"><Edit3 size={15} /></button>
                                <button onClick={() => handlePortfolioDelete(f.id)} title="Удалить" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                        {audioLinks.map((l: any) => (
                          <div key={l.id}>
                            <AudioPlayer src={l.url} name={l.title || l.url} />
                            {editingPortfolio && (
                              <div className="flex items-center justify-end mt-1">
                                <button onClick={() => setConfirmDeleteLinkId(l.id)} title="Удалить" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {portfolioTab === 'images' && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className={`aspect-square rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-1 transition-all ${portfolioFull ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/5'}`}>
                      {isUploadingPortfolio ? <Loader2 size={16} className="text-slate-500 animate-spin" /> : <Plus size={18} className="text-slate-500" />}
                      <span className="text-[10px] text-slate-500">Добавить</span>
                      <input type="file" accept="image/*" multiple className="hidden" disabled={isUploadingPortfolio || portfolioFull} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {imageFiles.map((f: any, i: number) => (
                      <div key={f.id} className="relative group aspect-square">
                        <button onClick={() => setImageFullscreen(`${API_URL}${f.url}`)}
                          className="w-full h-full rounded-xl overflow-hidden border border-slate-700/40 hover:border-primary-500/40 transition-colors">
                          <img src={`${API_URL}${f.url}`} alt={f.title || f.originalName} className="w-full h-full object-cover" />
                        </button>
                        {editingPortfolio && (
                          <>
                            <button onClick={() => handlePortfolioDelete(f.id)} title="Удалить" className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-red-400 transition-all"><X size={11} /></button>
                            <button onClick={() => setRenamingFile({ id: f.id, value: f.title || f.originalName })} title="Переименовать" className="absolute top-1 left-1 p-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-primary-400 transition-all"><Edit3 size={10} /></button>
                            <div className="absolute bottom-1 inset-x-1 flex justify-center gap-1">
                              <button onClick={() => movePortfolioFile(f, 'up')} disabled={i === 0} title="Раньше" className="p-1 rounded-full bg-slate-900/85 border border-slate-700 text-slate-300 hover:text-primary-400 disabled:opacity-30 transition-all"><ChevronUp size={11} /></button>
                              <button onClick={() => movePortfolioFile(f, 'down')} disabled={i === imageFiles.length - 1} title="Позже" className="p-1 rounded-full bg-slate-900/85 border border-slate-700 text-slate-300 hover:text-primary-400 disabled:opacity-30 transition-all"><ChevronDown size={11} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {portfolioTab === 'other' && (
                  <div className="space-y-2">
                    <label className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-700 transition-all ${portfolioFull ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/5'}`}>
                      {isUploadingPortfolio ? <Loader2 size={15} className="text-slate-500 animate-spin" /> : <Plus size={16} className="text-slate-500" />}
                      <span className="text-xs text-slate-400">Добавить документ</span>
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden" disabled={isUploadingPortfolio || portfolioFull} onChange={e => handlePortfolioUpload(e.target.files)} />
                    </label>
                    {otherFiles.length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-1">Пока нет документов</p>
                    ) : (
                      <div className="space-y-1.5">
                        {otherFiles.map((f: any, i: number) => {
                          const meta = fileTypeMeta(f.originalName);
                          const Icon = meta.Icon;
                          return (
                            <div key={f.id}>
                              <div className="flex items-center gap-3 px-2.5 py-2 bg-slate-800/40 border border-slate-700/40 rounded-xl">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                                  <Icon size={18} className={meta.color} />
                                </div>
                                <button onClick={() => setDocFullscreen({ url: `${API_URL}${f.url}`, name: f.title || f.originalName })} className="flex-1 min-w-0 text-left">
                                  <p className="text-sm text-slate-200 truncate">{f.title || f.originalName}</p>
                                  <p className="text-[11px] text-slate-500">{meta.label}{f.size ? ` · ${formatBytes(f.size)}` : ''}</p>
                                </button>
                                <a href={`${API_URL}${f.url}`} download target="_blank" rel="noopener noreferrer" title="Скачать" className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors flex-shrink-0"><Download size={15} /></a>
                              </div>
                              {editingPortfolio && (
                                <div className="flex items-center justify-end gap-1 mt-1">
                                  <button onClick={() => movePortfolioFile(f, 'up')} disabled={i === 0} title="Выше" className="p-1.5 text-slate-500 hover:text-primary-400 disabled:opacity-30 transition-colors"><ChevronUp size={16} /></button>
                                  <button onClick={() => movePortfolioFile(f, 'down')} disabled={i === otherFiles.length - 1} title="Ниже" className="p-1.5 text-slate-500 hover:text-primary-400 disabled:opacity-30 transition-colors"><ChevronDown size={16} /></button>
                                  <button onClick={() => setRenamingFile({ id: f.id, value: f.title || f.originalName })} title="Переименовать" className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors"><Edit3 size={15} /></button>
                                  <button onClick={() => handlePortfolioDelete(f.id)} title="Удалить" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
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
            <button onClick={() => setConfirmLogout(true)} className="w-full flex items-center justify-center gap-2 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/8 border border-red-500/20 hover:border-red-500/40 rounded-xl text-sm font-medium transition-all">
              <LogOut size={16} />Выйти из профиля
            </button>

          </div>
        </div>
      </div>
    </div>

    {/* Portfolio file rename */}
    {renamingFile && createPortal(
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" onClick={() => setRenamingFile(null)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="text-sm font-semibold text-white mb-3">Название файла</p>
          <input
            autoFocus
            type="text"
            maxLength={100}
            value={renamingFile.value}
            onChange={e => setRenamingFile(rf => rf ? { ...rf, value: e.target.value } : rf)}
            onKeyDown={e => { if (e.key === 'Enter') commitPortfolioRename(); if (e.key === 'Escape') setRenamingFile(null); }}
            placeholder="Введите название"
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="text-[11px] text-slate-600 mt-1.5">Пусто — вернётся исходное имя файла</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setRenamingFile(null)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
            <button onClick={commitPortfolioRename} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors">Сохранить</button>
          </div>
        </div>
      </div>,
      document.body
    )}

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <span className="text-sm text-slate-300 truncate min-w-0">{docFullscreen.name}</span>
          <button onClick={() => setDocFullscreen(null)} className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-colors flex-shrink-0"><X size={20} /></button>
        </div>
        <iframe src={docFullscreen.url} className="flex-1 w-full border-0" title={docFullscreen.name} />
      </div>
    )}

    {viewConn && <ConnectionViewModal connection={viewConn} onClose={() => setViewConn(null)} />}


    <ConfirmDialog
      open={!!confirmDeleteLinkId}
      message="Удалить ссылку из портфолио?"
      onConfirm={() => { if (confirmDeleteLinkId) handleDeleteLink(confirmDeleteLinkId); }}
      onCancel={() => setConfirmDeleteLinkId(null)}
    />
    <ConfirmDialog
      open={confirmLogout}
      message="Выйти из профиля?"
      confirmLabel="Выйти"
      onConfirm={() => logout()}
      onCancel={() => setConfirmLogout(false)}
    />

    {consentAction && (
      <PublicConsentGate onAccept={handleConsentAccept} onClose={() => setConsentAction(null)} />
    )}

    {/* Publish-to-Поток dialog — after a NEW service is saved. */}

    {/* Announce-changes dialog — after an EXISTING service is edited. */}


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

    </>
  );
}
