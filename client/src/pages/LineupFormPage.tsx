import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CalendarDays, Calendar, Clock, Loader2, Minus, Plus, Send, Save, X, Sparkles,
} from 'lucide-react';
import CityPicker from '../components/CityPicker';
import AvatarComponent from '../components/Avatar';
import { artistAPI, referenceAPI } from '../lib/api';
import { getApiError } from '../lib/apiError';
import { toast } from '../stores/toastStore';
import { maskDateInput, parseMaskedDate } from '../lib/mskDate';
import { useSeo, seoTitle, ROBOTS_NOINDEX } from '../lib/seo';
import {
  lineupAPI, type FeeType, type Lineup, type LineupPayload, type SlotType,
  SLOT_TYPE_OPTIONS, FEE_TYPE_OPTIONS, maskTimeInput, parseMaskedTime, mskDateTimeToIso,
  isoToMskDate, isoToMskTime, inviteResultToast,
} from '../lib/lineups';

const MAX_GENRES = 10;
const fieldCls = 'w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5';

interface FormState {
  title: string;
  date: string; // ДД.ММ.ГГГГ (МСК)
  time: string; // ЧЧ:ММ (МСК)
  city: string;
  venue: string;
  genreIds: string[];
  slots: number;
  slotType: SlotType;
  feeType: FeeType;
  feeAmount: string;
  description: string;
  requirements: string;
}

const EMPTY: FormState = {
  title: '', date: '', time: '', city: '', venue: '', genreIds: [], slots: 1, slotType: 'any',
  feeType: 'negotiable', feeAmount: '', description: '', requirements: '',
};

function fromLineup(l: Lineup): FormState {
  return {
    title: l.title,
    date: isoToMskDate(l.eventDate),
    time: isoToMskTime(l.eventDate),
    city: l.cityName,
    venue: l.venue ?? '',
    genreIds: (l.genres ?? []).map((g) => g.id),
    slots: l.slots,
    slotType: l.slotType,
    feeType: l.feeType,
    feeAmount: l.feeAmount != null ? String(l.feeAmount) : '',
    description: l.description,
    requirements: l.requirements ?? '',
  };
}

/**
 * /lineups/new и /lineups/:id/edit — форма запроса на выступление.
 * ?artist=<artistId> — «пригласить конкретного артиста»: запрос создаётся как
 * обычно, а админам этого артиста сразу уходит персональное приглашение.
 */
export default function LineupFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(!isEdit);
  const [inviteArtistId, setInviteArtistId] = useState<string | null>(() => (isEdit ? null : sp.get('artist')));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useSeo({ title: seoTitle(isEdit ? 'Редактирование запроса' : 'Новый запрос на выступление'), robots: ROBOTS_NOINDEX });

  const { data: existing, isLoading: loadingExisting, error: loadError } = useQuery({
    queryKey: ['lineup', id],
    queryFn: async () => (await lineupAPI.get(id!)).data as Lineup,
    enabled: isEdit,
    retry: false,
  });

  useEffect(() => {
    if (existing && !seeded) {
      setForm(fromLineup(existing));
      setSeeded(true);
    }
  }, [existing, seeded]);

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => (await referenceAPI.getGenres()).data as Array<{ id: string; name: string }>,
    staleTime: 10 * 60 * 1000,
  });

  const { data: inviteArtist } = useQuery({
    queryKey: ['artist', inviteArtistId],
    queryFn: async () => (await artistAPI.getArtist(inviteArtistId!)).data as any,
    enabled: !!inviteArtistId,
    retry: false,
  });

  // Город и жанры приглашённого артиста — подсказка для формы (только пустые поля).
  useEffect(() => {
    if (!inviteArtist || isEdit) return;
    setForm((f) => ({
      ...f,
      city: f.city || inviteArtist.city || '',
      genreIds: f.genreIds.length ? f.genreIds : (inviteArtist.genres ?? []).map((g: any) => g.id).slice(0, MAX_GENRES),
    }));
  }, [inviteArtist, isEdit]);

  // ── Проверки на клиенте (сервер проверяет то же самое) ────────────────────
  const eventIso = mskDateTimeToIso(form.date, form.time);
  const dateBad = form.date.length === 10 && !parseMaskedDate(form.date);
  const timeBad = form.time.length === 5 && !parseMaskedTime(form.time);
  const eventPast = !!eventIso && new Date(eventIso).getTime() <= Date.now();
  const feeNeedsAmount = form.feeType === 'fixed' || form.feeType === 'percent';
  const feeNum = form.feeAmount.trim() ? Number(form.feeAmount.replace(/\s/g, '')) : null;

  const errors = useMemo(() => {
    const e: Partial<Record<keyof FormState | 'event', string>> = {};
    if (form.title.trim().length < 3) e.title = 'Название — от 3 символов';
    if (!eventIso) e.event = 'Укажите дату (ДД.ММ.ГГГГ) и время начала (ЧЧ:ММ)';
    else if (eventPast) e.event = 'Дата и время события должны быть в будущем';
    if (!form.city.trim()) e.city = 'Выберите город';
    if (feeNeedsAmount) {
      if (feeNum == null || !Number.isInteger(feeNum) || feeNum <= 0) e.feeAmount = form.feeType === 'fixed' ? 'Укажите сумму гонорара' : 'Укажите процент';
      else if (form.feeType === 'percent' && feeNum > 100) e.feeAmount = 'Процент — от 1 до 100';
    }
    if (form.description.trim().length < 10) e.description = 'Опишите событие — от 10 символов';
    return e;
  }, [form, eventIso, eventPast, feeNeedsAmount, feeNum]);
  const hasErrors = Object.keys(errors).length > 0;

  const payload = (status: 'active' | 'draft'): LineupPayload => ({
    title: form.title.trim(),
    eventDate: eventIso!,
    cityName: form.city.trim(),
    venue: form.venue.trim() || null,
    genreIds: form.genreIds,
    slots: form.slots,
    slotType: form.slotType,
    feeType: form.feeType,
    feeAmount: feeNeedsAmount ? feeNum : null,
    description: form.description.trim(),
    requirements: form.requirements.trim() || null,
    status,
    inviteArtistId: inviteArtistId || null,
  });

  const saveMut = useMutation({
    mutationFn: async (status: 'active' | 'draft') => {
      const body = payload(status);
      return (isEdit ? await lineupAPI.update(id!, body) : await lineupAPI.create(body)).data as Lineup;
    },
    onSuccess: (saved, status) => {
      qc.invalidateQueries({ queryKey: ['lineups'] });
      qc.setQueryData(['lineup', saved.id], saved);
      toast.success(status === 'draft' ? 'Черновик сохранён' : isEdit ? 'Запрос обновлён' : 'Запрос опубликован');
      const inv = inviteResultToast(saved.invite);
      if (inv) toast[inv.type](inv.text);
      navigate(`/lineups/${saved.id}`, { replace: true });
    },
    onError: (e) => toast.error(getApiError(e, 'Не удалось сохранить запрос')),
  });

  const submit = (status: 'active' | 'draft') => {
    setTouched(true);
    if (hasErrors) {
      toast.error(Object.values(errors)[0] ?? 'Проверьте поля формы');
      return;
    }
    saveMut.mutate(status);
  };

  const toggleGenre = (gid: string) => setForm((f) => {
    if (f.genreIds.includes(gid)) return { ...f, genreIds: f.genreIds.filter((x) => x !== gid) };
    if (f.genreIds.length >= MAX_GENRES) { toast.info(`Не больше ${MAX_GENRES} жанров`); return f; }
    return { ...f, genreIds: [...f.genreIds, gid] };
  });

  if (isEdit && loadingExisting) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 size={26} className="animate-spin text-primary-400" /></div>;
  }
  if (isEdit && (loadError || !existing)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-slate-400">{getApiError(loadError, 'Запрос не найден')}</p>
        <button onClick={() => navigate('/lineups')} className="text-primary-400 text-sm">К лайнапам</button>
      </div>
    );
  }
  if (isEdit && existing && (!existing.isAuthor || existing.status === 'closed')) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-slate-400">{existing.isAuthor ? 'Запрос закрыт — редактирование недоступно' : 'Редактировать запрос может только его автор'}</p>
        <button onClick={() => navigate(`/lineups/${existing.id}`)} className="text-primary-400 text-sm">К запросу</button>
      </div>
    );
  }

  const showErr = (k: keyof typeof errors) => touched && errors[k] ? <p className="text-[11px] text-red-400 mt-1">{errors[k]}</p> : null;
  const canDraft = !inviteArtistId && (!isEdit || existing?.status === 'draft');

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      <div className="sticky top-app z-10 bg-slate-950/95 border-b border-slate-800/60" style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors" aria-label="Назад">
            <ArrowLeft size={22} />
          </button>
          <CalendarDays size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">{isEdit ? 'Редактирование запроса' : 'Запрос на выступление'}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Приглашение конкретного артиста */}
        {inviteArtistId && (
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-600/10 border border-primary-500/30 rounded-2xl">
            <Sparkles size={16} className="text-primary-400 flex-shrink-0" />
            {inviteArtist && <AvatarComponent src={inviteArtist.avatar} name={inviteArtist.name} size={28} />}
            <p className="text-xs text-slate-200 flex-1 min-w-0">
              Приглашение для <span className="font-semibold text-white">«{inviteArtist?.name ?? '…'}»</span>: после публикации админы артиста получат персональное уведомление.
              Запрос увидят и другие артисты.
            </p>
            <button onClick={() => setInviteArtistId(null)} className="p-1 text-slate-500 hover:text-white flex-shrink-0" aria-label="Не приглашать">
              <X size={14} />
            </button>
          </div>
        )}

        <div>
          <label className={labelCls}>Название события *</label>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={120}
            placeholder="Например: Осенний рок-фест в «Точке»"
            className={fieldCls}
          />
          {showErr('title')}
        </div>

        {/* Дата + время начала (МСК) */}
        <div>
          <label className={labelCls}>Дата и время начала (МСК) *</label>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                inputMode="numeric"
                placeholder="ДД.ММ.ГГГГ"
                maxLength={10}
                value={form.date}
                onChange={(e) => set('date', maskDateInput(e.target.value))}
                className={`${fieldCls} pl-8 ${dateBad || (touched && errors.event) ? 'border-red-500/60' : ''}`}
              />
            </div>
            <div className="relative">
              <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                inputMode="numeric"
                placeholder="ЧЧ:ММ"
                maxLength={5}
                value={form.time}
                onChange={(e) => set('time', maskTimeInput(e.target.value))}
                className={`${fieldCls} pl-8 ${timeBad || (touched && errors.event) ? 'border-red-500/60' : ''}`}
              />
            </div>
          </div>
          {dateBad && <p className="text-[11px] text-red-400 mt-1">Введите существующую дату в формате ДД.ММ.ГГГГ</p>}
          {timeBad && <p className="text-[11px] text-red-400 mt-1">Время — в формате ЧЧ:ММ, от 00:00 до 23:59</p>}
          {!dateBad && !timeBad && eventPast && <p className="text-[11px] text-red-400 mt-1">Это время уже прошло — укажите будущее</p>}
          {!dateBad && !timeBad && !eventPast && showErr('event')}
        </div>

        <div>
          <label className={labelCls}>Город *</label>
          <CityPicker city={form.city} country="" onChange={(c) => set('city', c)} />
          {showErr('city')}
        </div>

        <div>
          <label className={labelCls}>Площадка</label>
          <input value={form.venue} onChange={(e) => set('venue', e.target.value)} maxLength={200} placeholder="Клуб, бар, open-air…" className={fieldCls} />
        </div>

        {/* Сколько артистов и какой слот */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Сколько артистов нужно</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => set('slots', Math.max(1, form.slots - 1))} disabled={form.slots <= 1}
                className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center disabled:opacity-40" aria-label="Меньше">
                <Minus size={16} />
              </button>
              <span className="w-10 text-center text-lg font-bold text-white">{form.slots}</span>
              <button type="button" onClick={() => set('slots', Math.min(10, form.slots + 1))} disabled={form.slots >= 10}
                className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center disabled:opacity-40" aria-label="Больше">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>Слот</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SLOT_TYPE_OPTIONS.map((o) => (
                <button key={o.id} type="button" onClick={() => set('slotType', o.id)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.slotType === o.id ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Гонорар */}
        <div>
          <label className={labelCls}>Гонорар</label>
          <div className="grid grid-cols-2 gap-1.5">
            {FEE_TYPE_OPTIONS.map((o) => (
              <button key={o.id} type="button" onClick={() => set('feeType', o.id)}
                className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.feeType === o.id ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {feeNeedsAmount && (
            <div className="relative mt-2">
              <input
                type="text"
                inputMode="numeric"
                value={form.feeAmount}
                onChange={(e) => set('feeAmount', e.target.value.replace(/\D/g, '').slice(0, form.feeType === 'percent' ? 3 : 9))}
                placeholder={form.feeType === 'percent' ? 'Процент от входа' : 'Сумма'}
                className={`${fieldCls} pr-10`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{form.feeType === 'percent' ? '%' : '₽'}</span>
            </div>
          )}
          {showErr('feeAmount')}
        </div>

        {/* Жанры */}
        <div>
          <label className={labelCls}>
            Жанры <span className="font-normal text-slate-500">— подходящие артисты получат уведомление</span>
            {form.genreIds.length > 0 && <span className="ml-1 text-slate-500 font-normal">({form.genreIds.length}/{MAX_GENRES})</span>}
          </label>
          {genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto overscroll-contain pr-1">
              {genres.map((g) => {
                const on = form.genreIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGenre(g.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${on ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'}`}>
                    {g.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Загрузка жанров…</p>
          )}
        </div>

        <div>
          <label className={labelCls}>Описание *</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Что за событие, аудитория, формат вечера, кто уже в лайнапе…"
            className={`${fieldCls} resize-y min-h-[110px]`}
          />
          {showErr('description')}
        </div>

        <div>
          <label className={labelCls}>Требования</label>
          <textarea
            value={form.requirements}
            onChange={(e) => set('requirements', e.target.value)}
            maxLength={3000}
            rows={3}
            placeholder="Бэклайн, длительность сета, саундчек, райдер…"
            className={`${fieldCls} resize-y`}
          />
        </div>

        {/* Действия — липкий низ */}
        <div
          className="sticky bottom-app -mx-4 px-4 pt-3 pb-2 bg-slate-950/95 border-t border-slate-800/60 flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {canDraft && (
            <button
              onClick={() => submit('draft')}
              disabled={saveMut.isPending}
              className="flex-1 py-3 text-sm text-slate-300 hover:text-white border border-slate-700 rounded-2xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save size={14} /> Черновик
            </button>
          )}
          <button
            onClick={() => submit('active')}
            disabled={saveMut.isPending}
            className="flex-[2] py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isEdit && existing?.status === 'active' ? 'Сохранить' : 'Опубликовать'}
          </button>
        </div>
      </div>
    </div>
  );
}
