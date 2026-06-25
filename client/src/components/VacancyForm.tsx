import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X, Briefcase, Loader2, Search, Music2, Plus, Save, Users,
  Image as ImageIcon,
} from 'lucide-react';
import { vacancyAPI, referenceAPI, postAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import {
  WORK_FORMAT_OPTIONS, GEOGRAPHY_OPTIONS, EMPLOYMENT_OPTIONS, PAYMENT_OPTIONS,
  PAYMENT_WITH_COMPENSATION, type Option,
} from '../lib/vacancyOptions';

function formatBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

// ── Vacancy ADD form (artist-posted «Вакансия») ──────────────────────────────
// Clone of OrderForm() adapted per plan §6: author = Artist (artist selector when
// `artistId` is not passed), catalog = ПРОФЕССИИ (referenceAPI.getProfessions +
// getProfessionFilters), 4 single-select catalogs from vacancyOptions, compensation
// only for percent|rate, 2 toggles (comment/portfolio required), materials (files +
// links). Self-contained — owns its own state, persists via vacancyAPI. Silent
// draft autosave on accidental close (unmount), disabled in edit mode.
type VacancyFilter = { id: string; name: string; values: { id: string; value: string }[] };
type VacancyRefLink = { url: string; title: string; source: string };
type OwnerArtist = { id: string; name: string; avatar?: string };

const VACANCY_LINK_SOURCES: { id: string; label: string }[] = [
  { id: 'yandex_disk', label: 'Яндекс.Диск' },
  { id: 'google_docs', label: 'Google Docs' },
  { id: 'dropbox',     label: 'Dropbox' },
  { id: 'youtube',     label: 'YouTube' },
];

const VACANCY_MAX_REF_BYTES = 20 * 1024 * 1024; // 20 МБ суммарно

// One reusable single-select chip row (mirrors OrderForm's «Уровень» filter UI).
function SingleSelect({
  label, options, value, onChange, labelCls,
}: { label: string; options: Option[]; value: string; onChange: (id: string) => void; labelCls: string }) {
  return (
    <div>
      <label className={labelCls}>{label} <span className="text-red-400">*</span></label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const isSelected = value === o.id;
          return (
            <button key={o.id} type="button"
              onClick={() => onChange(o.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                isSelected
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function VacancyForm({
  onClose, vacancy, artistId: artistIdProp,
}: { onClose: () => void; vacancy?: any; artistId?: string }) {
  const isEdit = !!vacancy;
  const queryClient = useQueryClient();
  const inputCls = "w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500";
  const labelCls = "block text-xs font-semibold mb-1 text-slate-400";

  // ── Owner artist («От имени артиста») ──────────────────────────────────────
  // If `artistId` is passed (entry from an artist page) it is locked; otherwise
  // (entry from the feed «Создать пост») we offer a selector of owned artists.
  const [ownerArtists, setOwnerArtists] = useState<OwnerArtist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(!artistIdProp && !isEdit);
  const [artistId, setArtistId] = useState(artistIdProp || vacancy?.artist?.id || vacancy?.artistId || '');

  // ── Profession catalog + its custom filters ────────────────────────────────
  const [profSearch, setProfSearch] = useState('');
  const [profResults, setProfResults] = useState<{ id: string; name: string }[]>([]);
  const [profSearching, setProfSearching] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const [professionId, setProfessionId] = useState('');
  const [professionName, setProfessionName] = useState('');
  const [filters, setFilters] = useState<VacancyFilter[]>([]);
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({});

  // ── Scalar fields ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [workFormat, setWorkFormat] = useState('');
  const [geography, setGeography] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [compensation, setCompensation] = useState('');
  const [description, setDescription] = useState('');
  const [requireComment, setRequireComment] = useState(false);
  const [requirePortfolio, setRequirePortfolio] = useState(false);
  const [refLinks, setRefLinks] = useState<VacancyRefLink[]>([]);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<any[]>([]); // server-side reference files (edit mode)
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onlyDigits = (v: string) => v.replace(/[^\d]/g, '');
  const showCompensation = PAYMENT_WITH_COMPENSATION.has(paymentType);

  // Load owned artists for the selector (only when no artistId was passed).
  useEffect(() => {
    if (artistIdProp || isEdit) return;
    postAPI.getMyAuthors()
      .then(r => {
        const arts: OwnerArtist[] = r.data?.artists ?? [];
        setOwnerArtists(arts);
        if (arts.length === 1) setArtistId(arts[0].id); // auto-select the sole artist
      })
      .catch(() => {})
      .finally(() => setLoadingArtists(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced flat profession search (mirrors ProfilePage's Task-1 search).
  useEffect(() => {
    if (!profSearch.trim()) { setProfResults([]); return; }
    const t = setTimeout(() => {
      setProfSearching(true);
      referenceAPI.getProfessions({ search: profSearch.trim(), all: true })
        .then(r => setProfResults(r.data || []))
        .catch(() => setProfResults([]))
        .finally(() => setProfSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [profSearch]);

  const loadFilters = async (profId: string) => {
    setLoadingFilters(true);
    try {
      const { data } = await referenceAPI.getProfessionFilters(profId);
      setFilters(data || []);
    } catch {
      setFilters([]);
    } finally {
      setLoadingFilters(false);
    }
  };

  const selectProfession = async (p: { id: string; name: string }) => {
    setProfessionId(p.id);
    setProfessionName(p.name);
    setProfSearch('');
    setProfResults([]);
    setFilterSel({});
    await loadFilters(p.id);
  };

  const clearProfession = () => {
    setProfessionId(''); setProfessionName('');
    setFilters([]); setFilterSel({});
  };

  // Profession filters are multi-select (no single-select «Уровень» special-case here).
  const toggleFilter = (filterId: string, valueId: string) => {
    setFilterSel(prev => {
      const cur = prev[filterId] || [];
      const next = cur.includes(valueId) ? cur.filter(v => v !== valueId) : [...cur, valueId];
      return { ...prev, [filterId]: next };
    });
  };

  // References — files (images + audio, ≤20 МБ total) + links.
  const refFilesBytes = refFiles.reduce((s, f) => s + f.size, 0);
  const handleRefUpload = (files: FileList | null) => {
    if (!files) return;
    let total = refFilesBytes;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const okType = file.type.startsWith('image/') || file.type.startsWith('audio/');
      if (!okType) { toast.error(`«${file.name}» — поддерживаются только изображения и аудио`); continue; }
      if (total + file.size > VACANCY_MAX_REF_BYTES) {
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
  const updateRefLink = (i: number, patch: Partial<VacancyRefLink>) =>
    setRefLinks(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeRefLink = (i: number) => setRefLinks(prev => prev.filter((_, idx) => idx !== i));

  // ── Validation ─────────────────────────────────────────────────────────────
  const titleOk = title.trim().length > 0 && title.length <= 100;
  const professionOk = !!professionId;
  const selectsOk = !!workFormat && !!geography && !!employmentType && !!paymentType;
  const descriptionOk = description.trim().length > 0;
  const artistOk = !!artistId;
  const canSave = titleOk && professionOk && selectsOk && descriptionOk && artistOk;

  // True when the form holds something worth keeping as a draft.
  const hasMeaningfulData = () =>
    !!professionId || title.trim().length > 0 || !!workFormat || !!geography ||
    !!employmentType || !!paymentType || description.trim().length > 0 ||
    refLinks.some(l => l.url.trim().length > 0) || refFiles.length > 0;

  // Build the vacancy payload from current state (plan §6).
  const buildPayload = (status: 'active' | 'draft') => ({
    artistId,
    professionId,
    title: title.trim(),
    workFormat,
    geography,
    employmentType,
    paymentType,
    compensation: showCompensation && compensation !== '' ? Number(compensation) : null,
    description: description.trim() || undefined,
    customFilterValueIds: Object.values(filterSel).flat(),
    requireComment,
    requirePortfolio,
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

  // Edit mode — prefill all fields once from the passed vacancy.
  useEffect(() => {
    if (!isEdit) return;
    // Never silently autosave a draft on unmount in edit mode (would clone the vacancy).
    discardedRef.current = true;

    setTitle(vacancy.title || '');
    setProfessionId(vacancy.profession?.id || vacancy.professionId || '');
    setProfessionName(vacancy.profession?.name || '');
    setWorkFormat(vacancy.workFormat || '');
    setGeography(vacancy.geography || '');
    setEmploymentType(vacancy.employmentType || '');
    setPaymentType(vacancy.paymentType || '');
    setCompensation(vacancy.compensation != null ? String(vacancy.compensation) : '');
    setDescription(vacancy.description ?? '');
    setRequireComment(!!vacancy.requireComment);
    setRequirePortfolio(!!vacancy.requirePortfolio);
    setRefLinks((vacancy.referenceLinks || []).map((l: any) => ({ url: l.url, title: l.title, source: l.source })));
    setExistingFiles(vacancy.referenceFiles || []);

    // Pull the profession's filter options + group the picked values into filterSel.
    const pid = vacancy.profession?.id || vacancy.professionId;
    if (pid) {
      setLoadingFilters(true);
      referenceAPI.getProfessionFilters(pid)
        .then(({ data }: any) => {
          setFilters(data || []);
          const sel: Record<string, string[]> = {};
          for (const v of (vacancy.selectedCustomFilterValues || [])) {
            (sel[v.filter.id] = sel[v.filter.id] || []).push(v.id);
          }
          setFilterSel(sel);
        })
        .catch(() => {})
        .finally(() => setLoadingFilters(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete a server-side reference file (edit mode).
  const removeExistingFile = async (f: any) => {
    try {
      await vacancyAPI.deleteReference(vacancy.id, f.id);
      setExistingFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось удалить файл'));
    }
  };

  // Upload selected reference files to a freshly-created / edited vacancy.
  const uploadRefs = async (vacancyId: string) => {
    if (refFiles.length === 0) return;
    const fd = new FormData();
    refFiles.forEach(f => fd.append('files', f));
    try { await vacancyAPI.uploadReferences(vacancyId, fd); }
    catch (e: any) { toast.error(getApiError(e, 'Не удалось загрузить часть материалов')); }
  };

  const invalidate = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['vacancies', 'mine', artistId] });
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['vacancy', id] });
  };

  const publish = async () => {
    if (!canSave || submitting) return;
    handledRef.current = true;
    autosaveDoneRef.current = true;
    setSubmitting(true);
    try {
      const saved = isEdit
        ? await vacancyAPI.update(vacancy.id, buildPayload('active'))
        : await vacancyAPI.create(buildPayload('active'));
      const newId = isEdit ? vacancy.id : saved.data.id;
      await uploadRefs(newId);
      invalidate(newId);
      toast.success('Вакансия опубликована');
      onClose();
    } catch (e: any) {
      handledRef.current = false;
      autosaveDoneRef.current = false;
      toast.error(getApiError(e, 'Не удалось опубликовать вакансию'));
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
      const saved = isEdit
        ? await vacancyAPI.update(vacancy.id, buildPayload('draft'))
        : await vacancyAPI.create(buildPayload('draft'));
      const newId = isEdit ? vacancy.id : saved.data.id;
      await uploadRefs(newId);
      invalidate(newId);
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
        if (!artistId) return; // can't create without an owning artist
        autosaveDoneRef.current = true;
        vacancyAPI.create(payloadRef.current('draft')).catch(() => {});
      } catch { /* never throw from cleanup */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 0 owned artists (feed entry, no artistId) → can't post a vacancy.
  const noArtists = !artistIdProp && !isEdit && !loadingArtists && ownerArtists.length === 0;

  return (
    <div className="border border-dashed border-primary-500/40 rounded-xl bg-primary-500/5 p-3 space-y-3">
      <p className="text-sm font-semibold text-white">{isEdit ? 'Редактирование вакансии' : 'Новая вакансия'}</p>

      {noArtists ? (
        <div className="text-center py-6 px-4 space-y-3">
          <Users size={26} className="mx-auto text-slate-500" />
          <p className="text-sm text-slate-300">Создайте артиста, чтобы публиковать вакансии.</p>
          <button onClick={() => { discardedRef.current = true; onClose(); }}
            className="py-2 px-4 rounded-lg border border-slate-600/50 text-slate-300 hover:text-white text-sm transition-colors">
            Закрыть
          </button>
        </div>
      ) : (
      <>
      {/* 0 — От имени артиста (only when artistId is not pre-set & there's a choice) */}
      {!artistIdProp && !isEdit && (
        <div>
          <label className={labelCls}>От имени артиста <span className="text-red-400">*</span></label>
          {loadingArtists ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1 py-2">
              <Loader2 size={13} className="animate-spin" /> Загрузка артистов…
            </div>
          ) : ownerArtists.length === 1 ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800/60 border border-primary-500/40 rounded-xl">
              <Users size={13} className="text-primary-400 flex-shrink-0" />
              <span className="text-sm text-white truncate">{ownerArtists[0].name}</span>
            </div>
          ) : (
            <select value={artistId} onChange={e => setArtistId(e.target.value)} className={inputCls}>
              <option value="">Выберите артиста…</option>
              {ownerArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* 1 — Название вакансии */}
      <div>
        <label className={labelCls}>Название <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={title}
          maxLength={100}
          onChange={e => setTitle(e.target.value)}
          placeholder="Например: Ищем гитариста в группу"
          className={inputCls}
        />
        <p className="text-right text-[11px] text-slate-600 mt-1">{title.length}/100</p>
      </div>

      {/* 2 — Раздел = Профессия (autocomplete по каталогу профессий) */}
      <div>
        <label className={labelCls}>Профессия <span className="text-red-400">*</span></label>
        {professionId ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800/60 border border-primary-500/40 rounded-xl">
            <Briefcase size={13} className="text-primary-400 flex-shrink-0" />
            <p className="flex-1 min-w-0 text-sm text-white truncate">{professionName}</p>
            {loadingFilters && <Loader2 size={13} className="text-slate-400 animate-spin flex-shrink-0" />}
            <button type="button" onClick={clearProfession} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={profSearch}
              onChange={e => setProfSearch(e.target.value)}
              placeholder="Поиск профессии…"
              className="w-full pl-8 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
            />
            {profSearch.trim() && !profSearching && profResults.length === 0 && (
              <p className="text-xs text-slate-500 mt-1.5">Ничего не найдено</p>
            )}
            {profResults.length > 0 && (
              <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900/90 divide-y divide-slate-800/60">
                {profResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProfession(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary-500/10 transition-colors"
                  >
                    <span className="text-sm text-white truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3 — Фильтры профессии (multi-select chips) */}
      {filters.map(filter => (
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

      {/* 4 — 4 single-select каталога (из vacancyOptions) */}
      <SingleSelect label="Формат работы" options={WORK_FORMAT_OPTIONS} value={workFormat} onChange={setWorkFormat} labelCls={labelCls} />
      <SingleSelect label="География" options={GEOGRAPHY_OPTIONS} value={geography} onChange={setGeography} labelCls={labelCls} />
      <SingleSelect label="Тип занятости" options={EMPLOYMENT_OPTIONS} value={employmentType} onChange={setEmploymentType} labelCls={labelCls} />
      <SingleSelect label="Тип оплаты" options={PAYMENT_OPTIONS} value={paymentType} onChange={setPaymentType} labelCls={labelCls} />

      {/* 5 — Размер вознаграждения (только percent|rate) */}
      {showCompensation && (
        <div>
          <label className={labelCls}>Размер вознаграждения</label>
          <input type="number" inputMode="numeric" min={0} value={compensation}
            onChange={e => setCompensation(onlyDigits(e.target.value))}
            placeholder={paymentType === 'percent' ? 'Например: 30 (%)' : 'Например: 5000 (₽)'}
            className={inputCls} />
        </div>
      )}

      {/* 6 — Описание */}
      <div>
        <label className={labelCls}>Описание <span className="text-red-400">*</span></label>
        <textarea value={description} rows={4}
          onChange={e => setDescription(e.target.value)}
          placeholder="Расскажите, кого вы ищете и на каких условиях…" className={`${inputCls} resize-none`} />
      </div>

      {/* 7 — Материалы: файлы */}
      <div>
        <label className={labelCls}>Материалы (изображения и аудио, до 20 МБ суммарно)</label>
        <input ref={fileInputRef} type="file" accept="image/*,audio/*" multiple className="hidden"
          onChange={e => { handleRefUpload(e.target.files); e.target.value = ''; }} />
        {existingFiles.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {existingFiles.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl">
                {String(f.mimeType || '').startsWith('audio/')
                  ? <Music2 size={14} className="text-primary-400 flex-shrink-0" />
                  : <ImageIcon size={14} className="text-primary-400 flex-shrink-0" />}
                <span className="flex-1 min-w-0 text-xs text-white truncate">{f.originalName}</span>
                <span className="text-[10px] text-slate-500 flex-shrink-0">{formatBytes(f.size)}</span>
                <button type="button" onClick={() => removeExistingFile(f)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
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

      {/* 8 — Материалы: ссылки */}
      <div>
        <label className={labelCls}>Ссылки-материалы</label>
        <div className="space-y-2">
          {refLinks.map((link, i) => (
            <div key={i} className="space-y-1.5 p-2 rounded-xl border border-slate-700/50 bg-slate-800/40">
              <div className="flex gap-2">
                <select
                  value={link.source}
                  onChange={e => updateRefLink(i, { source: e.target.value })}
                  className="px-2 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition flex-shrink-0"
                >
                  {VACANCY_LINK_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
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

      {/* 9 — Тогглы требований */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={requireComment} onChange={e => setRequireComment(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40" />
          <span className="text-xs font-semibold text-slate-300">Комментарий обязателен при отклике</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={requirePortfolio} onChange={e => setRequirePortfolio(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40" />
          <span className="text-xs font-semibold text-slate-300">Портфолио обязательно при отклике</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => { discardedRef.current = true; onClose(); }}
          className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0">
          Отмена
        </button>
        <button
          onClick={saveDraft}
          disabled={!professionOk || !titleOk || !artistOk || submitting}
          className="py-2 px-3 rounded-lg border border-slate-600/50 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 text-sm font-medium transition-colors flex-shrink-0">
          {isEdit ? 'Сохранить черновик' : 'В черновики'}
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
      </>
      )}
    </div>
  );
}
