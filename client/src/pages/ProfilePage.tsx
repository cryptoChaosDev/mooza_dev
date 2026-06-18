import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, referenceAPI, connectionAPI, groupAPI, dealAPI, authAPI, orderAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AudioPlayer from '../components/AudioPlayer';
import {
  Camera, Save, Check, X, MapPin, Briefcase, Star, LogOut,
  Globe, Calendar,
  Headphones, Edit3, Plus,
  FileText, FileSpreadsheet, FileArchive, Download, Trash2, Loader2, Crown, BadgeCheck, Ban, Link2, Zap, Search,
  Music2, HandshakeIcon, Eye, Phone, Shield, ChevronDown,
  Image as ImageIcon, ClipboardList,
} from 'lucide-react';
import ConnectionViewModal from '../components/ConnectionViewModal';
import ConnectionCard from '../components/ConnectionCard';

import ConfirmDialog from '../components/ConfirmDialog';
import BadgeTooltip from '../components/BadgeTooltip';
import { SocialIconRow, SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { limitsFor, isProActive } from '../lib/proLimits';
import { yoNorm } from '../lib/search';
import ShareButton from '../components/ShareButton';
import JoinArtistModal from '../components/JoinArtistModal';
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
  priceItems: Array<{ name: string; price: string; from?: boolean }>;
  status?: 'draft' | 'active' | 'pending_review';
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

// Profile-field saves (hero/bio/contacts/socials/autosave) must NOT send
// userProfessions: those rows carry per-profession filter selections that are
// only complete when saved via handleSaveProfessions. Including the lean copy
// here would wipe the saved filters server-side (deleteMany + recreate).
function stripProfessions<T extends { userProfessions?: unknown }>(data: T): Omit<T, 'userProfessions'> {
  const { userProfessions, ...rest } = data;
  return rest;
}

// ── Order ADD form (customer-posted «Заказ») ──────────────────────────────────
// Mirror of ServiceForm() but for orders: title / catalog section / single-or-
// multi filters / budget from-to / deadline toggle+date / description /
// references (files + links). Self-contained — owns its own state and persists
// via orderAPI. Silent draft autosave on accidental close (unmount), mirroring
// the service form: if meaningful data + neither «Отмена» nor «Опубликовать».
type OrderFilter = { id: string; name: string; values: { id: string; value: string }[] };
type OrderRefLink = { url: string; title: string; source: string };

const ORDER_LINK_SOURCES: { id: string; label: string }[] = [
  { id: 'yandex_disk', label: 'Яндекс.Диск' },
  { id: 'google_docs', label: 'Google Docs' },
  { id: 'dropbox',     label: 'Dropbox' },
  { id: 'youtube',     label: 'YouTube' },
];

const ORDER_MAX_REF_BYTES = 20 * 1024 * 1024; // 20 МБ суммарно

function OrderForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputCls = "w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  const [sections, setSections] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Picked catalog section (= справочная Service) + its filters.
  const [serviceId, setServiceId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [filters, setFilters] = useState<OrderFilter[]>([]);
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({});

  const [title, setTitle] = useState('');
  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState(''); // ДД.ММ.ГГГГ
  const [description, setDescription] = useState('');
  const [refLinks, setRefLinks] = useState<OrderRefLink[]>([]);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // «Уровень» — single-select; the rest — multi.
  const isLevelFilter = (f: { name: string }) => f.name.trim().toLowerCase() === 'уровень';

  // Load the catalog once for the autocomplete.
  useEffect(() => {
    referenceAPI.getSections().then(r => setSections(r.data)).catch(() => {});
  }, []);

  const catalogServices: { id: string; name: string; sectionId: string; sectionName: string }[] =
    sections.flatMap((sec: any) =>
      (sec.services ?? []).map((s: any) => ({ id: s.id, name: s.name, sectionId: sec.id, sectionName: sec.name }))
    );

  const query = yoNorm(catalogSearch.trim());
  const matches = query
    ? catalogServices.filter(s => yoNorm(s.name).includes(query)).slice(0, 12)
    : [];

  const onlyDigits = (v: string) => v.replace(/[^\d]/g, '');

  // No auto-pull of filters from the profile — order filters start empty.
  const selectCatalogService = async (svc: { id: string; name: string; sectionId: string; sectionName: string }) => {
    setLoadingDetail(true);
    setCatalogSearch('');
    try {
      const { data } = await referenceAPI.getServiceDetail(svc.id);
      setServiceId(svc.id);
      setServiceName(data.name || svc.name);
      setSectionName(svc.sectionName);
      setFilters(data.filters || []);
      setFilterSel({});
    } catch {
      setServiceId(svc.id);
      setServiceName(svc.name);
      setSectionName(svc.sectionName);
      setFilters([]);
      setFilterSel({});
    } finally {
      setLoadingDetail(false);
    }
  };

  const clearService = () => {
    setServiceId(''); setServiceName(''); setSectionName('');
    setFilters([]); setFilterSel({});
  };

  const toggleFilter = (filterId: string, valueId: string) => {
    setFilterSel(prev => {
      const cur = prev[filterId] || [];
      const next = cur.includes(valueId) ? cur.filter(v => v !== valueId) : [...cur, valueId];
      return { ...prev, [filterId]: next };
    });
  };
  const setLevelValue = (filterId: string, valueId: string) => {
    setFilterSel(prev => {
      const isSame = (prev[filterId] || [])[0] === valueId;
      return { ...prev, [filterId]: isSame ? [] : [valueId] };
    });
  };

  const levelFilter = filters.find(isLevelFilter);
  const otherFilters = filters.filter(f => !isLevelFilter(f));

  // References — files (images + audio, ≤20 МБ total) + links.
  const refFilesBytes = refFiles.reduce((s, f) => s + f.size, 0);
  const handleRefUpload = (files: FileList | null) => {
    if (!files) return;
    let total = refFilesBytes;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const okType = file.type.startsWith('image/') || file.type.startsWith('audio/');
      if (!okType) { toast.error(`«${file.name}» — поддерживаются только изображения и аудио`); continue; }
      if (total + file.size > ORDER_MAX_REF_BYTES) {
        toast.error(`«${file.name}» превышает суммарный лимит 20 МБ — не добавлен`);
        continue;
      }
      total += file.size;
      accepted.push(file);
    }
    if (accepted.length) setRefFiles(prev => [...prev, ...accepted]);
  };
  const removeRefFile = (i: number) => setRefFiles(prev => prev.filter((_, idx) => idx !== i));

  const addRefLink = () => setRefLinks(prev => [...prev, { url: '', title: '', source: 'yandex_disk' }]);
  const updateRefLink = (i: number, patch: Partial<OrderRefLink>) =>
    setRefLinks(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeRefLink = (i: number) => setRefLinks(prev => prev.filter((_, idx) => idx !== i));

  // ДД.ММ.ГГГГ → ISO midnight UTC (or null).
  const parseDeadline = (): string | null => {
    if (!deadlineEnabled) return null;
    const m = deadlineDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    const iso = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    return isNaN(iso.getTime()) ? null : iso.toISOString();
  };

  const budgetFromNum = budgetFrom !== '' ? Number(budgetFrom) : undefined;
  const budgetToNum = budgetTo !== '' ? Number(budgetTo) : undefined;
  const budgetInvalid = budgetFromNum != null && budgetToNum != null && budgetFromNum > budgetToNum;
  const deadlineInvalid = deadlineEnabled && deadlineDate.trim() !== '' && parseDeadline() === null;

  const titleOk = title.trim().length > 0 && title.length <= 50;
  const serviceOk = !!serviceId;
  const canSave = titleOk && serviceOk && !budgetInvalid && !deadlineInvalid;

  // True when the form holds something worth keeping as a draft.
  const hasMeaningfulData = () =>
    !!serviceId || title.trim().length > 0 || budgetFrom.trim().length > 0 ||
    budgetTo.trim().length > 0 || description.trim().length > 0 ||
    refLinks.some(l => l.url.trim().length > 0) || refFiles.length > 0;

  // Build the order payload from current state.
  const buildPayload = (status: 'active' | 'draft') => ({
    title: title.trim(),
    serviceId,
    budgetFrom: budgetFromNum ?? null,
    budgetTo: budgetToNum ?? null,
    deadline: parseDeadline(),
    description: description.trim() || undefined,
    customFilterValueIds: Object.values(filterSel).flat(),
    referenceLinks: refLinks
      .filter(l => l.url.trim().length > 0)
      .map(l => ({ url: l.url.trim(), title: l.title.trim(), source: l.source })),
    status,
  });

  // Mirror refs so the unmount cleanup sees fresh state (closures capture stale).
  const handledRef = useRef(false);   // explicit «Опубликовать» — already saved
  const discardedRef = useRef(false); // «Отмена» — never autosave
  const autosaveDoneRef = useRef(false);
  const stateRef = useRef<() => boolean>(() => false);
  const payloadRef = useRef<(s: 'active' | 'draft') => any>(() => ({}));
  useEffect(() => { stateRef.current = hasMeaningfulData; payloadRef.current = buildPayload; });

  // Upload selected reference files to a freshly-created order.
  const uploadRefs = async (orderId: string) => {
    if (refFiles.length === 0) return;
    const fd = new FormData();
    refFiles.forEach(f => fd.append('files', f));
    try { await orderAPI.uploadReferences(orderId, fd); }
    catch (e: any) { toast.error(getApiError(e, 'Не удалось загрузить часть референсов')); }
  };

  const publish = async () => {
    if (!canSave || submitting) return;
    handledRef.current = true;
    autosaveDoneRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await orderAPI.create(buildPayload('active'));
      await uploadRefs(data.id);
      queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] });
      toast.success('Заказ опубликован');
      onClose();
    } catch (e: any) {
      handledRef.current = false;
      autosaveDoneRef.current = false;
      toast.error(getApiError(e, 'Не удалось опубликовать заказ'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async () => {
    if (submitting) return;
    handledRef.current = true;
    autosaveDoneRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await orderAPI.create(buildPayload('draft'));
      await uploadRefs(data.id);
      queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] });
      onClose();
    } catch (e: any) {
      handledRef.current = false;
      autosaveDoneRef.current = false;
      toast.error(getApiError(e, 'Не удалось сохранить черновик'));
    } finally {
      setSubmitting(false);
    }
  };

  // Unmount-only silent draft (skips reference files — multipart needs a live form).
  useEffect(() => {
    return () => {
      try {
        if (discardedRef.current || handledRef.current || autosaveDoneRef.current) return;
        if (!stateRef.current()) return;
        autosaveDoneRef.current = true;
        orderAPI.create(payloadRef.current('draft')).catch(() => {});
      } catch { /* never throw from cleanup */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3 space-y-3">
      <p className="text-sm font-semibold text-white">Новый заказ</p>

      {/* 1 — Название заказа */}
      <div>
        <label className={labelCls}>Название заказа <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={title}
          maxLength={50}
          onChange={e => setTitle(e.target.value)}
          placeholder="Например: Нужно свести трек"
          className={inputCls}
        />
        <p className="text-right text-[11px] text-slate-600 mt-1">{title.length}/50</p>
      </div>

      {/* 2 — Раздел каталога (autocomplete) */}
      <div>
        <label className={labelCls}>Раздел каталога <span className="text-red-400">*</span></label>
        {serviceId ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800/60 border border-primary-500/40 rounded-xl">
            <Briefcase size={13} className="text-primary-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{serviceName}</p>
              {sectionName && <p className="text-[10px] text-slate-500 truncate">{sectionName}</p>}
            </div>
            {loadingDetail && <Loader2 size={13} className="text-slate-400 animate-spin flex-shrink-0" />}
            <button type="button" onClick={clearService} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
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
                    disabled={loadingDetail}
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
              const isSelected = (filterSel[levelFilter.id] || [])[0] === v.id;
              return (
                <button key={v.id} type="button"
                  onClick={() => setLevelValue(levelFilter.id, v.id)}
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
              const isSelected = (filterSel[filter.id] || []).includes(v.id);
              return (
                <button key={v.id} type="button"
                  onClick={() => toggleFilter(filter.id, v.id)}
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

      {/* 5 — Бюджет */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Бюджет «от», ₽</label>
            <input type="number" inputMode="numeric" min={0} max={budgetTo || undefined} value={budgetFrom}
              onChange={e => setBudgetFrom(onlyDigits(e.target.value))}
              placeholder="0" className={`${inputCls} ${budgetInvalid ? '!border-red-500/60' : ''}`} />
          </div>
          <div>
            <label className={labelCls}>Бюджет «до», ₽</label>
            <input type="number" inputMode="numeric" min={budgetFrom || 0} value={budgetTo}
              onChange={e => setBudgetTo(onlyDigits(e.target.value))}
              placeholder="0" className={`${inputCls} ${budgetInvalid ? '!border-red-500/60' : ''}`} />
          </div>
        </div>
        {budgetInvalid && <p className="text-[11px] text-red-400 mt-1">«Бюджет от» не может быть больше «Бюджет до»</p>}
        {budgetFrom === '' && budgetTo === '' && (
          <p className="text-[11px] text-slate-500 mt-1">Если оставить пустым, бюджет будет указан как «По договорённости».</p>
        )}
      </div>

      {/* 6 — Срок */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none mb-1.5">
          <input type="checkbox" checked={deadlineEnabled} onChange={e => setDeadlineEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40" />
          <span className="text-xs font-semibold text-slate-300">Указать срок</span>
        </label>
        {deadlineEnabled ? (
          <div className="relative">
            <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              inputMode="numeric"
              value={deadlineDate}
              onChange={e => setDeadlineDate(e.target.value)}
              placeholder="ДД.ММ.ГГГГ"
              className={`w-full pl-8 pr-3 py-2.5 bg-slate-800/60 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition ${deadlineInvalid ? 'border-red-500/60' : 'border-slate-700/50'}`}
            />
            {deadlineInvalid && <p className="text-[11px] text-red-400 mt-1">Введите дату в формате ДД.ММ.ГГГГ</p>}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Без срока заказ будет помечен как «Срок не ограничен».</p>
        )}
      </div>

      {/* 7 — Описание */}
      <div>
        <label className={labelCls}>Описание</label>
        <textarea value={description} rows={4}
          onChange={e => setDescription(e.target.value)}
          placeholder="Опишите, что нужно сделать..." className={`${inputCls} resize-none`} />
      </div>

      {/* 8 — Референсы: файлы */}
      <div>
        <label className={labelCls}>Референсы (изображения и аудио, до 20 МБ суммарно)</label>
        <input ref={fileInputRef} type="file" accept="image/*,audio/*" multiple className="hidden"
          onChange={e => { handleRefUpload(e.target.files); e.target.value = ''; }} />
        {refFiles.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {refFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl">
                {f.type.startsWith('audio/')
                  ? <Music2 size={14} className="text-primary-400 flex-shrink-0" />
                  : <ImageIcon size={14} className="text-primary-400 flex-shrink-0" />}
                <span className="flex-1 min-w-0 text-xs text-white truncate">{f.name}</span>
                <span className="text-[10px] text-slate-500 flex-shrink-0">{formatBytes(f.size)}</span>
                <button type="button" onClick={() => removeRefFile(i)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-xs">
          <Plus size={13} />Добавить файл
        </button>
        {refFiles.length > 0 && (
          <p className="text-right text-[11px] text-slate-600 mt-1">{formatBytes(refFilesBytes)} / 20 МБ</p>
        )}
      </div>

      {/* 9 — Референсы: ссылки */}
      <div>
        <label className={labelCls}>Ссылки-референсы</label>
        <div className="space-y-2">
          {refLinks.map((link, i) => (
            <div key={i} className="space-y-1.5 p-2 rounded-xl border border-slate-700/50 bg-slate-800/40">
              <div className="flex gap-2">
                <select
                  value={link.source}
                  onChange={e => updateRefLink(i, { source: e.target.value })}
                  className="px-2 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition flex-shrink-0"
                >
                  {ORDER_LINK_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <button type="button" onClick={() => removeRefLink(i)}
                  className="p-2 rounded-lg border border-slate-700/50 text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
              <input type="url" value={link.url}
                onChange={e => updateRefLink(i, { url: e.target.value })}
                placeholder="https://..." className={inputCls} />
              <input type="text" value={link.title} maxLength={100}
                onChange={e => updateRefLink(i, { title: e.target.value })}
                placeholder="Название (необязательно)" className={inputCls} />
            </div>
          ))}
          <button type="button" onClick={addRefLink}
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-primary-400 hover:border-primary-500/50 transition-all text-xs">
            <Plus size={13} />Добавить ссылку
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => { discardedRef.current = true; onClose(); }}
          className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0">
          Отмена
        </button>
        <button
          onClick={saveDraft}
          disabled={!serviceOk || !titleOk || submitting}
          className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 text-sm font-medium transition-colors flex-shrink-0">
          В черновики
        </button>
        <button
          onClick={publish}
          disabled={!canSave || submitting}
          className="flex-1 min-w-[8rem] py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:hover:bg-primary-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Опубликовать
        </button>
      </div>
    </div>
  );
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
  // Order ADD form (customer-posted «Заказ») — open/closed.
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [pending, setPending] = useState<UserServiceEntry>(emptyEntry());
  const [sections, setSections] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [pendingServiceFilters, setPendingServiceFilters] = useState<ServiceCustomFilter[]>([]);
  const [pendingServiceFilterSel, setPendingServiceFilterSel] = useState<Record<string, string[]>>({});
  const [loadingServiceDetail, setLoadingServiceDetail] = useState(false);
  // Post-save «Поток» dialogs. `publishDialog` is shown after a NEW service is
  // saved («Опубликовать в Потоке?»); `updateDialog` after an EXISTING one is
  // edited («Сообщить об изменениях в Потоке?»). Both carry the saved
  // user-service id used to deep-link into the Поток composer.
  const [publishDialog, setPublishDialog] = useState<{ userServiceId: string | null } | null>(null);
  const [updateDialog, setUpdateDialog] = useState<{ userServiceId: string | null } | null>(null);

  // --- Accidental-close autosave (drafts) -------------------------------------
  // If the user opens the ADD form, enters meaningful data, and then the form
  // gets closed by navigating away / unmounting (NOT via «Отмена», «Опубликовать»
  // or «Убрать в черновики»), we silently persist the entry as a draft.
  // The cleanup closure captures stale state, so we mirror everything into refs.
  const serviceFormOpenRef = useRef<'add' | number | null>(serviceFormOpen);
  const pendingRef = useRef<UserServiceEntry>(pending);
  const pendingServiceFilterSelRef = useRef<Record<string, string[]>>(pendingServiceFilterSel);
  const userServicesRef = useRef<UserServiceEntry[]>([]);
  // discardedRef: «Отмена» was pressed → never autosave.
  // handledRef: «Опубликовать»/«Убрать в черновики» already saved → never autosave again.
  const serviceFormDiscardedRef = useRef(false);
  const serviceFormHandledRef = useRef(false);
  // Guards a single autosave per form lifecycle (avoids double-save).
  const autosaveDoneRef = useRef(false);

  const [editingHero, setEditingHero] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingServices, setEditingServices] = useState(false);
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
  useEffect(() => { serviceFormOpenRef.current = serviceFormOpen; }, [serviceFormOpen]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => { pendingServiceFilterSelRef.current = pendingServiceFilterSel; }, [pendingServiceFilterSel]);
  useEffect(() => { userServicesRef.current = userServices; }, [userServices]);

  // True when the ADD form holds something worth keeping as a draft: a picked
  // catalog service OR any non-empty name / price / description.
  const pendingHasMeaningfulData = (p: UserServiceEntry): boolean =>
    !!p.serviceId ||
    p.name.trim().length > 0 ||
    p.priceFrom.trim().length > 0 ||
    p.priceTo.trim().length > 0 ||
    p.description.trim().length > 0 ||
    p.priceItems.some(it => it.name.trim().length > 0 || it.price.trim().length > 0);

  // Unmount-only effect: if the page unmounts while the ADD form is open with
  // meaningful data and the user neither cancelled nor explicitly saved, persist
  // the entry as a draft. Fire-and-forget; never throws.
  useEffect(() => {
    return () => {
      try {
        if (serviceFormOpenRef.current !== 'add') return;          // add-only
        if (serviceFormDiscardedRef.current) return;               // «Отмена»
        if (serviceFormHandledRef.current) return;                 // already saved
        if (autosaveDoneRef.current) return;                       // no double-save
        const p = pendingRef.current;
        if (!pendingHasMeaningfulData(p)) return;                  // no empty-save
        autosaveDoneRef.current = true;
        const draftEntry: UserServiceEntry = {
          ...p,
          customFilterValueIds: pendingServiceFilterSelRef.current,
          status: 'draft',
        };
        // Fire-and-forget; swallow any rejection.
        userAPI.updateServices([...userServicesRef.current, draftEntry] as any).catch(() => {});
      } catch {
        /* never throw from cleanup */
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [confirmDeleteServiceIdx, setConfirmDeleteServiceIdx] = useState<number | null>(null);
  const [confirmDeleteLinkId, setConfirmDeleteLinkId] = useState<string | null>(null);

  // Chip panels

  const [viewConn, setViewConn] = useState<any>(null);


  const [myStandaloneProfessions, setMyStandaloneProfessions] = useState<{ professionId: string; professionName: string }[]>([]);
  const [editingProfessions, setEditingProfessions] = useState(false);
  const [selectedProfession, setSelectedProfession] = useState<{ professionId: string; professionName: string } | null>(null);
  const [showJoinArtist, setShowJoinArtist] = useState(false);
  const [profAddOpen, setProfAddOpen] = useState(false);
  const [profSearch, setProfSearch] = useState('');
  const [profSearchResults, setProfSearchResults] = useState<any[]>([]);
  const [profSearching, setProfSearching] = useState(false);
  const [savingProfessions, setSavingProfessions] = useState(false);
  const [profFiltersData, setProfFiltersData] = useState<Record<string, any[]>>({});
  const [profFilterSelections, setProfFilterSelections] = useState<Record<string, string[]>>({});
  // Per-profession filter accordions are collapsed by default (profId → open filterIds).
  const [profOpenFilters, setProfOpenFilters] = useState<Record<string, Set<string>>>({});
  // Editable profession features (profId → selected feature names) + the catalog.
  const [profFeatures, setProfFeatures] = useState<Record<string, string[]>>({});
  const [allFeatures, setAllFeatures] = useState<{ id: string; name: string }[]>([]);


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

  // Load the global profession-features catalog once, when the editor opens.
  useEffect(() => {
    if (!editingProfessions || allFeatures.length) return;
    referenceAPI.getProfessionFeatures().then(r => setAllFeatures(r.data)).catch(() => {});
  }, [editingProfessions, allFeatures.length]);

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
        const feats: Record<string, string[]> = {};
        data.userProfessions.forEach((up: any) => {
          selections[up.professionId] = up.selectedCustomFilterValues?.map((cfv: any) => cfv.id) || [];
          feats[up.professionId] = up.features || [];
        });
        setProfFilterSelections(selections);
        setProfFeatures(feats);
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
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить услуги')),
  });

  const handleSaveHero = async () => {
    // Convert DD.MM.YYYY → ISO date for server
    const bd = formData.birthDate;
    const birthDateISO = bd.length === 10
      ? `${bd.slice(6)}-${bd.slice(3, 5)}-${bd.slice(0, 2)}`
      : undefined;
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

  const toggleProfFilterOpen = (profId: string, filterId: string) => {
    setProfOpenFilters(prev => {
      const cur = new Set(prev[profId] || []);
      if (cur.has(filterId)) cur.delete(filterId); else cur.add(filterId);
      return { ...prev, [profId]: cur };
    });
  };

  const toggleProfFeature = (profId: string, name: string) => {
    setProfFeatures(prev => {
      const cur = prev[profId] || [];
      const next = cur.includes(name) ? cur.filter(f => f !== name) : [...cur, name];
      return { ...prev, [profId]: next };
    });
  };

  const handleSaveProfessions = async (list: { professionId: string; professionName: string }[]) => {
    setSavingProfessions(true);
    try {
      await updateMutation.mutateAsync({
        userProfessions: list.map(p => ({
          professionId: p.professionId,
          features: profFeatures[p.professionId] || [],
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

  // Price-list row helpers (composite name + price rows). A row's price may be a
  // concrete number or the «от [сумма]» format (toggled per row via `from`).
  const addPriceItem = () => setPending(prev => ({ ...prev, priceItems: [...prev.priceItems, { name: '', price: '', from: false }] }));
  const updatePriceItem = (i: number, patch: Partial<{ name: string; price: string; from: boolean }>) =>
    setPending(prev => ({ ...prev, priceItems: prev.priceItems.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const removePriceItem = (i: number) =>
    setPending(prev => ({ ...prev, priceItems: prev.priceItems.filter((_, idx) => idx !== i) }));

  // Reset the autosave flags for a fresh form lifecycle.
  const resetServiceFormFlags = () => {
    serviceFormDiscardedRef.current = false;
    serviceFormHandledRef.current = false;
    autosaveDoneRef.current = false;
  };

  // Open the form to ADD a brand-new service.
  const openAddServiceForm = () => {
    resetServiceFormFlags();
    setPending(emptyEntry());
    setPendingServiceFilters([]);
    setPendingServiceFilterSel({});
    setCatalogSearch('');
    setServiceFormOpen('add');
  };

  // Open the form to EDIT an existing service entry: hydrate pending + load its
  // filters, mapping already-selected value ids back into the selection map.
  const openEditServiceForm = async (idx: number) => {
    resetServiceFormFlags();
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
  // mode 'publish' → status 'active', then shows the Поток publish/update dialog.
  // mode 'draft'   → status 'draft', NO Поток dialog (drafts skip Поток).
  const commitServiceForm = async (mode: 'publish' | 'draft') => {
    const entry: UserServiceEntry = {
      ...pending,
      customFilterValueIds: pendingServiceFilterSel,
      status: mode === 'draft' ? 'draft' : 'active',
    };
    const isAdd = serviceFormOpen === 'add';
    const next = isAdd
      ? [...userServices, entry]
      : userServices.map((us, i) => (i === serviceFormOpen ? entry : us));
    // Mark as explicitly handled so the unmount autosave never duplicates it.
    serviceFormHandledRef.current = true;
    autosaveDoneRef.current = true;
    setUserServices(next);
    closeServiceForm();
    try {
      const { data } = await updateServicesMutation.mutateAsync(next);
      if (mode === 'draft') return; // drafts skip the Поток dialogs entirely
      // The server returns the full user-services list (each with its own id).
      // Resolve the just-saved service by catalog serviceId to deep-link Поток.
      const saved = Array.isArray(data)
        ? data.find((s: any) => s.serviceId === entry.serviceId || s.service?.id === entry.serviceId)
        : null;
      const userServiceId = saved?.id ?? null;
      if (isAdd) setPublishDialog({ userServiceId });
      else setUpdateDialog({ userServiceId });
    } finally {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
  };

  const handleDeleteService = async (idx: number) => {
    const newServices = userServices.filter((_, i) => i !== idx);
    setUserServices(newServices);
    await updateServicesMutation.mutateAsync(newServices);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

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

  const handleDeleteLink = async (linkId: string) => {
    try {
      await userAPI.deletePortfolioLink(linkId);
      setPortfolioLinks(prev => prev.filter((l: any) => l.id !== linkId));
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось удалить ссылку'));
    }
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

    const query = yoNorm(catalogSearch.trim());
    const matches = query
      ? catalogServices
          .filter(s => yoNorm(s.name).includes(query))
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
          <p className="text-[11px] text-slate-500 mt-1">Не забудьте учесть комиссию сервиса.</p>
          {pending.priceFrom === '' && pending.priceTo === '' && (
            <p className="text-[11px] text-slate-500 mt-0.5">Если оставить пустым, стоимость будет указана как «По договорённости».</p>
          )}
        </div>

        {/* 6 — Прайс-лист */}
        <div>
          <label className={labelCls}>Прайс-лист</label>
          <div className="space-y-2">
            {pending.priceItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_6.5rem_auto] gap-2 items-center">
                <input type="text" value={item.name} maxLength={100}
                  onChange={e => updatePriceItem(i, { name: e.target.value })}
                  placeholder="Название позиции" className={`${inputCls} min-w-0`} />
                {/* «от» toggle: when on, the price is shown as «от [сумма]». */}
                <button type="button"
                  onClick={() => updatePriceItem(i, { from: !item.from })}
                  aria-pressed={!!item.from}
                  className={`px-2.5 py-2.5 rounded-xl text-xs font-medium border transition-all flex-shrink-0 ${
                    item.from
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'
                  }`}>
                  от
                </button>
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
          <p className="text-[11px] text-slate-500 mt-1.5">Не забудьте учесть комиссию сервиса.</p>
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
          <p className="text-[11px] text-slate-500 mt-1">Укажите срок в днях.</p>
        </div>

        {/* 8 — Описание */}
        <div>
          <label className={labelCls}>Описание</label>
          <textarea value={pending.description} rows={4}
            onChange={e => setPending(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Опишите услугу..." className={`${inputCls} resize-none`} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => { serviceFormDiscardedRef.current = true; closeServiceForm(); }}
            className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0">
            Отмена
          </button>
          <button
            onClick={() => commitServiceForm('draft')}
            disabled={!canSave || updateServicesMutation.isPending}
            className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 text-sm font-medium transition-colors flex-shrink-0">
            В черновики
          </button>
          <button
            onClick={() => ensurePublicConsent(() => commitServiceForm('publish'))}
            disabled={!canSave || updateServicesMutation.isPending}
            className="flex-1 min-w-[8rem] py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:hover:bg-primary-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
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
            <div className="relative z-10">
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
            <div className="flex items-center gap-2 mb-1">
              <ShareButton
                url={`/profile/${profile?.id}`}
                title={`${profile?.firstName} ${profile?.lastName} — Moooza`}
                text={profile?.bio?.slice(0, proLimits.bioChars)}
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
            </>
          )}

          {/* ── CONTENT CARDS ────────────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Profile completion meter (own profile only) */}
            <ProfileProgressBar profile={profile} />

            {/* Bio */}
            {editingBio ? (
              <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2">
                <textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} maxLength={proLimits.bioChars} rows={3} placeholder="Расскажите о себе..." className={`${inputCls} resize-none`} />
                <p className="text-right text-[11px] text-slate-600">{formData.bio.length}/{proLimits.bioChars}</p>
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
                          {/* Each filter is a collapsible accordion — collapsed by default. */}
                          {!profFiltersData[p.professionId] && (
                            <p className="text-[10px] text-slate-600 mt-1.5">Загрузка параметров...</p>
                          )}
                          {(profFiltersData[p.professionId]?.length > 0 || allFeatures.length > 0) && (
                            <div className="mt-2">
                              {(profFiltersData[p.professionId] || []).map((filter: any) => {
                                const sel = profFilterSelections[p.professionId] || [];
                                const selCount = filter.values.filter((v: any) => sel.includes(v.id)).length;
                                const open = profOpenFilters[p.professionId]?.has(filter.id);
                                return (
                                  <div key={filter.id} className="border-b border-slate-800/60 last:border-0">
                                    <button type="button"
                                      onClick={() => toggleProfFilterOpen(p.professionId, filter.id)}
                                      className="w-full flex items-center gap-1.5 py-1.5 text-left">
                                      <span className="text-xs text-slate-400 flex-1">{filter.name}</span>
                                      {selCount > 0 && <span className="text-[10px] bg-primary-600/80 text-white px-1.5 py-0.5 rounded-full">{selCount}</span>}
                                      <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {open && (
                                      <div className="flex flex-wrap gap-1.5 pb-2">
                                        {filter.values.map((v: any) => {
                                          const isSelected = sel.includes(v.id);
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
                                    )}
                                  </div>
                                );
                              })}
                              {/* Profession features (e.g. «Начинающий», «Платно») — collapsible. */}
                              {allFeatures.length > 0 && (() => {
                                const selF = profFeatures[p.professionId] || [];
                                const open = profOpenFilters[p.professionId]?.has('__features__');
                                return (
                                  <div className="border-b border-slate-800/60 last:border-0">
                                    <button type="button"
                                      onClick={() => toggleProfFilterOpen(p.professionId, '__features__')}
                                      className="w-full flex items-center gap-1.5 py-1.5 text-left">
                                      <span className="text-xs text-slate-400 flex-1">Особенности</span>
                                      {selF.length > 0 && <span className="text-[10px] bg-primary-600/80 text-white px-1.5 py-0.5 rounded-full">{selF.length}</span>}
                                      <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    {open && (
                                      <div className="flex flex-wrap gap-1.5 pb-2">
                                        {allFeatures.map((f) => {
                                          const isSelected = selF.includes(f.name);
                                          return (
                                            <button key={f.id} type="button"
                                              onClick={() => toggleProfFeature(p.professionId, f.name)}
                                              className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                                                isSelected ? 'bg-primary-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                              }`}>
                                              {f.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {profFiltersData[p.professionId]?.length === 0 && allFeatures.length === 0 && (
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

            {/* ── Orders card — tile slider ── */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <ClipboardList size={14} className="text-rose-400" />
                <span className="text-sm font-semibold text-white">Мои заказы</span>
                {activeOrdersCount > 0 && <span className="text-xs text-slate-500">{activeOrdersCount}</span>}
                {myOrders.length > 0 && (
                  <button onClick={() => navigate('/orders')} className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                    Посмотреть все
                  </button>
                )}
              </div>

              <div className="p-3 space-y-3">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                  {/* Add tile — always first */}
                  <button
                    onClick={() => setOrderFormOpen(true)}
                    className="flex flex-col gap-2 flex-shrink-0 group"
                    style={{ width: 'calc((100% - 24px) / 3.5)' }}
                  >
                    <div className="w-full aspect-square rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:border-rose-500/50 group-hover:bg-rose-500/5 transition-all">
                      <Plus size={16} className="text-slate-500 group-hover:text-rose-400 transition-colors" />
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors text-center leading-tight">Добавить</span>
                  </button>

                  {myOrders.map((o: any) => {
                    const oSection = o.service?.section?.name || '';
                    const oDeadline = o.deadline ? new Date(o.deadline).toLocaleDateString('ru-RU') : 'Срок не ограничен';
                    return (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="flex flex-col gap-0 flex-shrink-0 group text-left"
                        style={{ width: 'calc((100% - 24px) / 3.5)' }}
                      >
                        <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-rose-900/60 to-slate-800/80 border border-rose-700/30 flex items-center justify-center p-2 group-hover:border-rose-500/50 transition-colors overflow-hidden">
                          <ClipboardList size={16} className="text-rose-400 flex-shrink-0" />
                        </div>
                        <div className="w-full mt-1.5">
                          <p className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{o.title}</p>
                          {oSection && <p className="text-[9px] text-slate-500 leading-tight mt-0.5 truncate">{oSection}</p>}
                          <p className="text-[9px] text-rose-400/90 leading-tight mt-0.5 truncate">{oDeadline}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {orderFormOpen && <OrderForm onClose={() => setOrderFormOpen(false)} />}
              </div>
            </div>

            {/* ── Deals card ── */}
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
                        {audioFiles.map((f: any) => (
                          <div key={f.id} className="flex items-center gap-1">
                            <div className="flex-1 min-w-0"><AudioPlayer src={`${API_URL}${f.url}`} name={f.originalName} /></div>
                            <button onClick={() => handlePortfolioDelete(f.id)} title="Удалить" className="p-2 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={15} /></button>
                          </div>
                        ))}
                        {audioLinks.map((l: any) => (
                          <div key={l.id} className="flex items-center gap-1">
                            <div className="flex-1 min-w-0"><AudioPlayer src={l.url} name={l.title || l.url} /></div>
                            <button onClick={() => setConfirmDeleteLinkId(l.id)} title="Удалить" className="p-2 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={15} /></button>
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
                    {imageFiles.map((f: any) => (
                      <div key={f.id} className="relative group aspect-square">
                        <button onClick={() => setImageFullscreen(`${API_URL}${f.url}`)}
                          className="w-full h-full rounded-xl overflow-hidden border border-slate-700/40 hover:border-primary-500/40 transition-colors">
                          <img src={`${API_URL}${f.url}`} alt={f.originalName} className="w-full h-full object-cover" />
                        </button>
                        <button onClick={() => handlePortfolioDelete(f.id)} className="absolute top-1 right-1 p-1 rounded-md bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><X size={11} /></button>
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
                        {otherFiles.map((f: any) => {
                          const meta = fileTypeMeta(f.originalName);
                          const Icon = meta.Icon;
                          return (
                            <div key={f.id} className="flex items-center gap-3 px-2.5 py-2 bg-slate-800/40 border border-slate-700/40 rounded-xl">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                                <Icon size={18} className={meta.color} />
                              </div>
                              <button onClick={() => setDocFullscreen({ url: `${API_URL}${f.url}`, name: f.originalName })} className="flex-1 min-w-0 text-left">
                                <p className="text-sm text-slate-200 truncate">{f.originalName}</p>
                                <p className="text-[11px] text-slate-500">{meta.label}{f.size ? ` · ${formatBytes(f.size)}` : ''}</p>
                              </button>
                              <a href={`${API_URL}${f.url}`} download target="_blank" rel="noopener noreferrer" title="Скачать" className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors flex-shrink-0"><Download size={15} /></a>
                              <button onClick={() => handlePortfolioDelete(f.id)} title="Удалить" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={15} /></button>
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
                        const apply = () => {
                          const next = {
                            ...formData,
                            contactsVisibility: opt.value,
                            contactsVisible: opt.value === 'ALL',
                          };
                          setFormData(next);
                          updateMutation.mutate({ contactsVisibility: opt.value } as any, {
                            onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
                          });
                        };
                        // «Все» = public distribution of contacts → gate on consent.
                        if (opt.value === 'ALL') ensurePublicConsent(apply); else apply();
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

    {consentAction && (
      <PublicConsentGate onAccept={handleConsentAccept} onClose={() => setConsentAction(null)} />
    )}

    {/* Publish-to-Поток dialog — after a NEW service is saved. */}
    {publishDialog && createPortal(
      <>
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={() => setPublishDialog(null)} />
        <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start gap-3 mb-1">
            <div className="p-2 bg-primary-500/15 rounded-xl flex-shrink-0">
              <Zap size={18} className="text-primary-400" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-semibold text-white">Опубликовать в Потоке?</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Услуга уже сохранена и видна в профиле. Можно дополнительно рассказать о ней в Потоке.</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setPublishDialog(null)}
              className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Только услугу
            </button>
            <button
              onClick={() => {
                const id = publishDialog.userServiceId;
                setPublishDialog(null);
                navigate(`/create-post?type=service${id ? `&serviceId=${id}` : ''}`);
              }}
              className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
            >
              В Потоке
            </button>
          </div>
        </div>
      </>,
      document.body
    )}

    {/* Announce-changes dialog — after an EXISTING service is edited. */}
    {updateDialog && createPortal(
      <>
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={() => setUpdateDialog(null)} />
        <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start gap-3 mb-1">
            <div className="p-2 bg-primary-500/15 rounded-xl flex-shrink-0">
              <Zap size={18} className="text-primary-400" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-semibold text-white">Сообщить об изменениях в Потоке?</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Изменения уже сохранены. Можно опубликовать апдейт услуги в Потоке.</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setUpdateDialog(null)}
              className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Нет
            </button>
            <button
              onClick={() => {
                const id = updateDialog.userServiceId;
                setUpdateDialog(null);
                navigate(`/create-post?type=service${id ? `&serviceId=${id}` : ''}`);
              }}
              className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
            >
              Сделать апдейт
            </button>
          </div>
        </div>
      </>,
      document.body
    )}

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

    </>
  );
}
