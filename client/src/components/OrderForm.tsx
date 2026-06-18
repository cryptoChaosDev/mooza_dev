import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X, Briefcase, Loader2, Search, Calendar, Music2, Plus, Save,
  Image as ImageIcon,
} from 'lucide-react';
import { orderAPI, referenceAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { yoNorm } from '../lib/search';

function formatBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
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

export default function OrderForm({ onClose, order }: { onClose: () => void; order?: any }) {
  const isEdit = !!order;
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
  const [existingFiles, setExistingFiles] = useState<any[]>([]); // server-side reference files (edit mode)
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

  // YYYY-MM-DD (native date input) → ISO midnight UTC (or null).
  const parseDeadline = (): string | null => {
    if (!deadlineEnabled || !deadlineDate) return null;
    const m = deadlineDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const [, y, mo, d] = m;
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

  // Edit mode — prefill all fields once from the passed order.
  useEffect(() => {
    if (!isEdit) return;
    // Never silently autosave a draft on unmount in edit mode (would clone the order).
    discardedRef.current = true;

    setTitle(order.title || '');
    setServiceId(order.service?.id || order.serviceId || '');
    setServiceName(order.service?.name || '');
    setSectionName(order.service?.section?.name || '');
    setBudgetFrom(order.budgetFrom != null ? String(order.budgetFrom) : '');
    setBudgetTo(order.budgetTo != null ? String(order.budgetTo) : '');
    if (order.deadline) {
      setDeadlineEnabled(true);
      setDeadlineDate(String(order.deadline).slice(0, 10)); // ISO → YYYY-MM-DD
    }
    setDescription(order.description ?? '');
    setRefLinks((order.referenceLinks || []).map((l: any) => ({ url: l.url, title: l.title, source: l.source })));
    setExistingFiles(order.referenceFiles || []);

    // Pull the selected service's filter options + group the picked values into filterSel.
    const sid = order.service?.id || order.serviceId;
    if (sid) {
      setLoadingDetail(true);
      referenceAPI.getServiceDetail(sid)
        .then(({ data }: any) => {
          setFilters(data.filters || []);
          const sel: Record<string, string[]> = {};
          for (const v of (order.selectedCustomFilterValues || [])) {
            (sel[v.filter.id] = sel[v.filter.id] || []).push(v.id);
          }
          setFilterSel(sel);
        })
        .catch(() => {})
        .finally(() => setLoadingDetail(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete a server-side reference file (edit mode).
  const removeExistingFile = async (f: any) => {
    try {
      await orderAPI.deleteReference(order.id, f.id);
      setExistingFiles(prev => prev.filter(x => x.id !== f.id));
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось удалить файл'));
    }
  };

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
      const saved = isEdit
        ? await orderAPI.update(order.id, buildPayload('active'))
        : await orderAPI.create(buildPayload('active'));
      const newId = isEdit ? order.id : saved.data.id;
      await uploadRefs(newId);
      queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['order', order.id] });
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
      const saved = isEdit
        ? await orderAPI.update(order.id, buildPayload('draft'))
        : await orderAPI.create(buildPayload('draft'));
      const newId = isEdit ? order.id : saved.data.id;
      await uploadRefs(newId);
      queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['order', order.id] });
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
      <p className="text-sm font-semibold text-white">{isEdit ? 'Редактирование заказа' : 'Новый заказ'}</p>

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
              type="date"
              value={deadlineDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDeadlineDate(e.target.value)}
              style={{ colorScheme: 'dark' }}
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
    </div>
  );
}
