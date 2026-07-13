import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { ArrowLeft, Briefcase, Search, Loader2, Save, Plus, X, Zap } from 'lucide-react';
import { userAPI, referenceAPI } from '../lib/api';
import { yoNorm } from '../lib/search';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import PublicConsentGate from '../components/PublicConsentGate';

const inputCls = 'w-full min-w-0 px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-white placeholder-slate-500';
const labelCls = 'block text-xs font-semibold mb-1 text-slate-400';
const onlyDigits = (v: string) => v.replace(/[^\d]/g, '');
const isLevelFilter = (f: { name: string }) => f.name.trim().toLowerCase() === 'уровень';

// Серверная услуга → payload-элемент PUT /users/me/services (для «остальных» услуг списка)
function serverToPayload(us: any) {
  return {
    professionId: us.professionId,
    serviceId: us.serviceId,
    name: us.name || undefined,
    genreIds: (us.genres ?? []).map((g: any) => g.id),
    workFormatIds: (us.workFormats ?? []).map((g: any) => g.id),
    employmentTypeIds: (us.employmentTypes ?? []).map((g: any) => g.id),
    skillLevelIds: (us.skillLevels ?? []).map((g: any) => g.id),
    availabilityIds: (us.availabilities ?? []).map((g: any) => g.id),
    geographyIds: (us.geographies ?? []).map((g: any) => g.id),
    priceFrom: us.priceFrom ?? undefined,
    priceTo: us.priceTo ?? undefined,
    deadlineFrom: us.deadlineFrom ?? undefined,
    deadlineTo: us.deadlineTo ?? undefined,
    description: us.description || undefined,
    customFilterValueIds: (us.selectedCustomFilterValues ?? []).map((v: any) => v.id),
    status: us.status,
    priceItems: (us.priceItems ?? []).length > 0 ? us.priceItems : undefined,
  };
}

/**
 * Страница создания/редактирования Услуги — /services/new и
 * /services/edit/:catalogServiceId. Полный перенос формы из модалки профиля:
 * тот же контракт сохранения (PUT /users/me/services, полный список), тот же
 * подбор каталога, «Уровень» single-select, авто-préfill значений из профессий,
 * гейт согласия 152-ФЗ перед публикацией и диалог «Опубликовать в Потоке?».
 */
export default function ServiceFormPage() {
  const { serviceId: editCatalogId } = useParams<{ serviceId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!editCatalogId;

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['service-form-me'],
    queryFn: async () => { const { data } = await userAPI.getMe(); return data as any; },
  });

  // Форма
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<{ serviceId: string; serviceName: string; sectionName: string; professionId: string } | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [filters, setFilters] = useState<any[]>([]);
  const [filterSel, setFilterSel] = useState<Record<string, string[]>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [description, setDescription] = useState('');
  const [priceItems, setPriceItems] = useState<Array<{ name: string; price: string; from?: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  const [locallyConsented, setLocallyConsented] = useState(false);
  const [postDialog, setPostDialog] = useState<{ userServiceId: string | null } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { referenceAPI.getSections().then(r => setSections(r.data as any[])).catch(() => {}); }, []);

  // Edit-инициализация из профиля
  useEffect(() => {
    if (!isEdit || !me || hydrated) return;
    const us = (me.userServices ?? []).find((u: any) => u.serviceId === editCatalogId);
    if (!us) return;
    setHydrated(true);
    setName(us.name || '');
    setPriceFrom(us.priceFrom != null ? String(us.priceFrom) : '');
    setPriceTo(us.priceTo != null ? String(us.priceTo) : '');
    setDeadlineFrom(us.deadlineFrom != null ? String(us.deadlineFrom) : '');
    setDeadlineTo(us.deadlineTo != null ? String(us.deadlineTo) : '');
    setDescription(us.description || '');
    setPriceItems((us.priceItems ?? []).map((it: any) => ({ name: it.name || '', price: String(it.price ?? ''), from: !!it.from })));
    setChosen({
      serviceId: us.serviceId,
      serviceName: us.service?.name || '',
      sectionName: us.service?.section?.name || '',
      professionId: us.professionId,
    });
    // Фильтры услуги + маппинг выбранных значений
    setLoadingDetail(true);
    referenceAPI.getServiceDetail(us.serviceId)
      .then(({ data }) => {
        const fs: any[] = data.filters || [];
        setFilters(fs);
        const selectedIds = new Set((us.selectedCustomFilterValues ?? []).map((v: any) => v.id));
        const sel: Record<string, string[]> = {};
        fs.forEach((f: any) => {
          const picked = f.values.filter((v: any) => selectedIds.has(v.id)).map((v: any) => v.id);
          if (picked.length) sel[f.id] = picked;
        });
        setFilterSel(sel);
      })
      .catch(() => { setFilters([]); setFilterSel({}); })
      .finally(() => setLoadingDetail(false));
  }, [isEdit, me, editCatalogId, hydrated]);

  // Тексты значений, выбранных в профессиях — для авто-préfill (как в модалке)
  const ownedFilterValueTexts: string[] = (me?.userProfessions ?? [])
    .flatMap((up: any) => (up.selectedCustomFilterValues ?? []).map((cfv: any) => cfv.value))
    .filter(Boolean);

  const catalogServices: { id: string; name: string; sectionId: string; sectionName: string }[] =
    sections.flatMap((sec: any) => (sec.services ?? []).map((s: any) => ({ id: s.id, name: s.name, sectionId: sec.id, sectionName: sec.name })));

  const selectCatalogService = async (svc: { id: string; name: string; sectionId: string; sectionName: string }) => {
    setLoadingDetail(true);
    setFilters([]); setFilterSel({}); setCatalogSearch('');
    try {
      const { data } = await referenceAPI.getServiceDetail(svc.id);
      const linked: { id: string; name: string }[] = data.professions || [];
      const ownedProf = linked.find(lp => (me?.userProfessions ?? []).some((mp: any) => mp.professionId === lp.id));
      const professionId = ownedProf?.id || linked[0]?.id || '';
      const fs: any[] = data.filters || [];
      setChosen({ serviceId: svc.id, serviceName: data.name || svc.name, sectionName: svc.sectionName, professionId });
      setFilters(fs);
      const prefill: Record<string, string[]> = {};
      fs.forEach((f: any) => {
        if (isLevelFilter(f)) return;
        const matched = f.values.filter((v: any) => ownedFilterValueTexts.includes(v.value)).map((v: any) => v.id);
        if (matched.length) prefill[f.id] = matched;
      });
      setFilterSel(prefill);
    } catch {
      setChosen({ serviceId: svc.id, serviceName: svc.name, sectionName: svc.sectionName, professionId: '' });
      setFilters([]); setFilterSel({});
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleFilter = (filterId: string, valueId: string) =>
    setFilterSel(prev => {
      const cur = prev[filterId] || [];
      return { ...prev, [filterId]: cur.includes(valueId) ? cur.filter(v => v !== valueId) : [...cur, valueId] };
    });
  const setLevelValue = (filterId: string, valueId: string) =>
    setFilterSel(prev => ({ ...prev, [filterId]: (prev[filterId] || [])[0] === valueId ? [] : [valueId] }));

  // Валидация — как в модалке
  const nameOk = name.trim().length > 0 && name.length <= 50;
  const serviceOk = !!chosen?.serviceId;
  const priceInvalid = priceFrom !== '' && priceTo !== '' && Number(priceFrom) > Number(priceTo);
  const deadlineInvalid = deadlineFrom !== '' && deadlineTo !== '' && Number(deadlineFrom) > Number(deadlineTo);
  const canSave = nameOk && serviceOk && !priceInvalid && !deadlineInvalid;

  const query = yoNorm(catalogSearch.trim());
  const matches = query
    ? catalogServices
        .filter(s => yoNorm(s.name).includes(query))
        .filter(s => !(me?.userServices ?? []).some((us: any) => us.serviceId === s.id && s.id !== editCatalogId))
        .slice(0, 12)
    : [];

  const levelFilter = filters.find(isLevelFilter);
  const otherFilters = filters.filter(f => !isLevelFilter(f));

  const doSave = async (mode: 'publish' | 'draft') => {
    if (!chosen || !me) return;
    setSaving(true);
    try {
      // При редактировании сохраняем существующие связи (жанры/форматы/гео и т.п.) —
      // форма их не редактирует, но терять их нельзя.
      const orig = (me.userServices ?? []).find((us: any) => us.serviceId === chosen.serviceId);
      const entryPayload = {
        professionId: chosen.professionId,
        serviceId: chosen.serviceId,
        name: name || undefined,
        genreIds: (orig?.genres ?? []).map((g: any) => g.id),
        workFormatIds: (orig?.workFormats ?? []).map((g: any) => g.id),
        employmentTypeIds: (orig?.employmentTypes ?? []).map((g: any) => g.id),
        skillLevelIds: (orig?.skillLevels ?? []).map((g: any) => g.id),
        availabilityIds: (orig?.availabilities ?? []).map((g: any) => g.id),
        geographyIds: (orig?.geographies ?? []).map((g: any) => g.id),
        priceFrom: priceFrom !== '' ? Number(priceFrom) : undefined,
        priceTo: priceTo !== '' ? Number(priceTo) : undefined,
        deadlineFrom: deadlineFrom !== '' ? Number(deadlineFrom) : undefined,
        deadlineTo: deadlineTo !== '' ? Number(deadlineTo) : undefined,
        description: description || undefined,
        customFilterValueIds: Object.values(filterSel).flat(),
        status: mode === 'draft' ? 'draft' : 'active',
        priceItems: priceItems.length > 0 ? priceItems : undefined,
      };
      const others = (me.userServices ?? [])
        .filter((us: any) => us.serviceId !== chosen.serviceId)
        .map(serverToPayload);
      const { data } = await userAPI.updateServices([...others, entryPayload] as any);
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['service-form-me'] });
      if (mode === 'draft') {
        toast.success('Сохранено в черновики');
        navigate('/profile');
        return;
      }
      const saved = Array.isArray(data) ? data.find((s: any) => s.serviceId === chosen.serviceId || s.service?.id === chosen.serviceId) : null;
      setPostDialog({ userServiceId: saved?.id ?? null });
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось сохранить услугу'));
    } finally {
      setSaving(false);
    }
  };

  const hasConsent = !!me?.publicConsentAt || locallyConsented;
  const publish = () => { if (hasConsent) doSave('publish'); else setNeedConsent(true); };
  const acceptConsent = async () => {
    try { await userAPI.givePublicConsent(); } catch { /* best-effort */ }
    setLocallyConsented(true);
    setNeedConsent(false);
    doSave('publish');
  };

  if (meLoading || (isEdit && !hydrated && !me)) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <Briefcase size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">{isEdit ? 'Редактирование услуги' : 'Новая услуга'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
          {/* 1 — Название */}
          <div>
            <label className={labelCls}>Название услуги <span className="text-red-400">*</span></label>
            <input type="text" value={name} maxLength={50} onChange={e => setName(e.target.value)}
              placeholder="Например: Сведение трека" className={inputCls} />
            <p className="text-right text-[11px] text-slate-600 mt-1">{name.length}/50</p>
          </div>

          {/* 2 — Раздел каталога */}
          <div>
            <label className={labelCls}>Раздел каталога <span className="text-red-400">*</span></label>
            {chosen ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800/60 border border-primary-500/40 rounded-xl">
                <Briefcase size={13} className="text-primary-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{chosen.serviceName}</p>
                  {chosen.sectionName && <p className="text-[10px] text-slate-500 truncate">{chosen.sectionName}</p>}
                </div>
                {loadingDetail && <Loader2 size={13} className="text-slate-400 animate-spin flex-shrink-0" />}
                {!isEdit && (
                  <button type="button" onClick={() => { setChosen(null); setFilters([]); setFilterSel({}); }}
                    className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="Поиск услуги в каталоге..."
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition" />
                {query && matches.length === 0 && <p className="text-xs text-slate-500 mt-1.5">Ничего не найдено</p>}
                {matches.length > 0 && (
                  <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900/90 divide-y divide-slate-800/60">
                    {matches.map(s => (
                      <button key={s.id} type="button" disabled={loadingDetail} onClick={() => selectCatalogService(s)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary-500/10 transition-colors disabled:opacity-50">
                        <span className="text-sm text-white truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">{s.sectionName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3 — «Уровень» (single-select) */}
          {levelFilter && (
            <div>
              <label className={labelCls}>{levelFilter.name}</label>
              <div className="flex flex-wrap gap-1.5">
                {levelFilter.values.map((v: any) => {
                  const on = (filterSel[levelFilter.id] || [])[0] === v.id;
                  return (
                    <button key={v.id} type="button" onClick={() => setLevelValue(levelFilter.id, v.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${on ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'}`}>
                      {v.value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4 — Остальные фильтры */}
          {otherFilters.map((filter: any) => (
            <div key={filter.id}>
              <label className={labelCls}>{filter.name}</label>
              <div className="flex flex-wrap gap-1.5">
                {filter.values.map((v: any) => {
                  const on = (filterSel[filter.id] || []).includes(v.id);
                  return (
                    <button key={v.id} type="button" onClick={() => toggleFilter(filter.id, v.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${on ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'}`}>
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
                <input type="number" inputMode="numeric" min={0} value={priceFrom}
                  onChange={e => setPriceFrom(onlyDigits(e.target.value))}
                  placeholder="0" className={`${inputCls} ${priceInvalid ? '!border-red-500/60' : ''}`} />
              </div>
              <div>
                <label className={labelCls}>Стоимость «до», ₽</label>
                <input type="number" inputMode="numeric" min={0} value={priceTo}
                  onChange={e => setPriceTo(onlyDigits(e.target.value))}
                  placeholder="0" className={`${inputCls} ${priceInvalid ? '!border-red-500/60' : ''}`} />
              </div>
            </div>
            {priceInvalid && <p className="text-[11px] text-red-400 mt-1">«Стоимость от» не может быть больше «Стоимость до»</p>}
            {priceFrom === '' && priceTo === '' && (
              <p className="text-[11px] text-slate-500 mt-1">Если оставить пустым, стоимость будет указана как «По договорённости».</p>
            )}
          </div>

          {/* 6 — Прайс-лист */}
          <div>
            <label className={labelCls}>Прайс-лист</label>
            <div className="space-y-2">
              {priceItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_6.5rem_auto] gap-2 items-center">
                  <input type="text" value={item.name} maxLength={100}
                    onChange={e => setPriceItems(prev => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                    placeholder="Название позиции" className={`${inputCls} min-w-0`} />
                  <button type="button"
                    onClick={() => setPriceItems(prev => prev.map((it, idx) => idx === i ? { ...it, from: !it.from } : it))}
                    aria-pressed={!!item.from}
                    className={`px-2.5 py-2.5 rounded-xl text-xs font-medium border transition-all flex-shrink-0 ${item.from ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:border-primary-500/40'}`}>
                    от
                  </button>
                  <input type="number" inputMode="numeric" min={0} value={item.price}
                    onChange={e => setPriceItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: onlyDigits(e.target.value) } : it))}
                    placeholder="Цена ₽" className={`${inputCls} min-w-0 text-center`} />
                  <button type="button" onClick={() => setPriceItems(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2.5 rounded-xl border border-slate-700/50 text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPriceItems(prev => [...prev, { name: '', price: '', from: false }])}
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
                <input type="number" inputMode="numeric" min={0} value={deadlineFrom}
                  onChange={e => setDeadlineFrom(onlyDigits(e.target.value))}
                  placeholder="0" className={`${inputCls} ${deadlineInvalid ? '!border-red-500/60' : ''}`} />
              </div>
              <div>
                <label className={labelCls}>Срок «до», дней</label>
                <input type="number" inputMode="numeric" min={0} value={deadlineTo}
                  onChange={e => setDeadlineTo(onlyDigits(e.target.value))}
                  placeholder="0" className={`${inputCls} ${deadlineInvalid ? '!border-red-500/60' : ''}`} />
              </div>
            </div>
            {deadlineInvalid && <p className="text-[11px] text-red-400 mt-1">«Срок от» не может быть больше «Срок до»</p>}
            <p className="text-[11px] text-slate-500 mt-1">Укажите срок в днях.</p>
          </div>

          {/* 8 — Описание */}
          <div>
            <label className={labelCls}>Описание</label>
            <textarea value={description} rows={4} onChange={e => setDescription(e.target.value)}
              placeholder="Опишите услугу..." className={`${inputCls} resize-none`} />
          </div>
        </div>

        {/* Действия */}
        <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-slate-950/95 border-t border-slate-800/60 flex flex-col gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)} className="flex-1 py-2 px-3 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              Отмена
            </button>
            <button onClick={() => doSave('draft')} disabled={!canSave || saving}
              className="flex-1 py-2 px-3 rounded-lg border border-slate-600/50 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50 text-sm font-medium transition-colors">
              В черновики
            </button>
          </div>
          <button onClick={publish} disabled={!canSave || saving}
            className="w-full py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isEdit ? 'Сохранить изменения' : 'Добавить услугу'}
          </button>
        </div>
      </div>

      {needConsent && (
        <PublicConsentGate onAccept={acceptConsent} onClose={() => setNeedConsent(false)} />
      )}

      {/* «Опубликовать в Потоке?» — после сохранения */}
      {postDialog && createPortal(
        <>
          <div className="fixed inset-0 z-[80] bg-black/60" onClick={() => { setPostDialog(null); navigate(chosen ? '/profile' : '/profile'); }} />
          <div className="fixed inset-x-4 bottom-8 z-[81] max-w-sm mx-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-start gap-3 mb-1">
              <div className="p-2 bg-primary-500/15 rounded-xl flex-shrink-0">
                <Zap size={18} className="text-primary-400" />
              </div>
              <div className="pt-0.5">
                <p className="text-sm font-semibold text-white">{isEdit ? 'Обновить пост в Потоке?' : 'Опубликовать в Потоке?'}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Услуга сохранена и видна в профиле. Можно дополнительно рассказать о ней в Потоке.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { const id = postDialog.userServiceId; setPostDialog(null); navigate(id ? `/services/${id}` : '/profile'); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors">
                Только услугу
              </button>
              <button
                onClick={() => { const id = postDialog.userServiceId; setPostDialog(null); navigate(`/create-post?type=service${id ? `&serviceId=${id}` : ''}`); }}
                className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors">
                Рассказать
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
