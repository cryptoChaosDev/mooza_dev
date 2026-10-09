import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowLeft, UserSearch, Loader2, Send, Sparkles, ChevronDown, AlertCircle, Users, MapPin, Briefcase, LayoutGrid,
} from 'lucide-react';
import { requestsAPI, type RequestOverrides, type RequestChip, type CreateRequestResponse } from '../lib/requestsApi';
import { referenceAPI } from '../lib/api';
import { getApiError } from '../lib/apiError';
import { toast } from '../stores/toastStore';
import { useAuthGate } from '../components/AuthGateModal';
import SelectSheet from '../components/SelectSheet';
import RequestChips from '../components/findMusician/RequestChips';
import RequestResult from '../components/findMusician/RequestResult';
import { maskDateInput, parseMaskedDate, maskedToIsoDay, isMaskedDatePast, isoToMaskedMsk } from '../lib/mskDate';
import { plural } from '../lib/plural';
import { useSeo, seoTitle } from '../lib/seo';

const EXAMPLES = [
  'Нужен звукорежиссёр на сведение трека, онлайн',
  'Ищу барабанщика на концерт 20 ноября в Самаре',
  'Вокалистка на свадьбу в Казани, бюджет до 30 000',
  'Аранжировщик для поп-трека, удалённо, от 5 до 15 тыс',
];

const DRAFT_KEY = 'mooza_find_draft';
const MAX_LEN = 1000;
const DEBOUNCE_MS = 500;
const MAX_PROFESSIONS = 3;

// Черновик переживает вход через AuthGate (возврат на /find в той же вкладке).
function readDraft(): { text: string; overrides: RequestOverrides } {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { text: '', overrides: {} };
    const v = JSON.parse(raw);
    return {
      text: typeof v?.text === 'string' ? v.text.slice(0, MAX_LEN) : '',
      overrides: v?.overrides && typeof v.overrides === 'object' ? v.overrides : {},
    };
  } catch {
    return { text: '', overrides: {} };
  }
}

function writeDraft(text: string, overrides: RequestOverrides) {
  try {
    if (!text.trim() && Object.keys(overrides).length === 0) sessionStorage.removeItem(DRAFT_KEY);
    else sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text, overrides }));
  } catch { /* storage недоступен — без черновика */ }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const inputCls = 'w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-base text-white placeholder-slate-500 focus:outline-none focus:border-primary-500';

/**
 * «Ищу музыканта» (/find): одна фраза → разбор по справочникам → чипы →
 * заказ + личные уведомления топ-10 подходящих исполнителей.
 * Гость видит разбор и примерное число подходящих; отправка — через AuthGate.
 */
export default function FindMusicianPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gate = useAuthGate();

  useSeo({
    title: seoTitle('Ищу музыканта'),
    description: 'Опишите одной фразой, кого ищете, — Moooza разберёт запрос и сразу отправит его подходящим музыкантам и специалистам.',
  });

  const initial = useMemo(readDraft, []);
  const [text, setText] = useState(initial.text);
  const [overrides, setOverrides] = useState<RequestOverrides>(initial.overrides);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);
  const [sheet, setSheet] = useState<null | 'profession' | 'city' | 'service'>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [dateTouched, setDateTouched] = useState(false);
  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [budgetTouched, setBudgetTouched] = useState(false);

  useEffect(() => { writeDraft(text, overrides); }, [text, overrides]);

  const debouncedText = useDebounced(text.trim(), DEBOUNCE_MS);
  const canParse = debouncedText.length >= 3;

  const parseQ = useQuery({
    queryKey: ['request-parse', debouncedText, overrides],
    queryFn: async () => (await requestsAPI.parse(debouncedText, overrides)).data,
    enabled: canParse && !result,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  const data = canParse ? parseQ.data : undefined;
  const parsed = data?.parsed;

  const quotaQ = useQuery({
    queryKey: ['request-quota'],
    queryFn: async () => (await requestsAPI.quota()).data,
    enabled: gate.isAuthed,
    staleTime: 30_000,
  });
  const quotaLeft = quotaQ.data?.remaining;

  const professionsQ = useQuery({
    queryKey: ['references', 'professions', 'all'],
    queryFn: async () => (await referenceAPI.getProfessions({ all: true })).data as Array<{ id: string; name: string; userCount?: number }>,
    enabled: sheet === 'profession',
    staleTime: 10 * 60_000,
  });
  const citiesQ = useQuery({
    queryKey: ['references', 'cities'],
    queryFn: async () => (await referenceAPI.getCities()).data as Array<{ id: string; name: string }>,
    enabled: sheet === 'city',
    staleTime: 10 * 60_000,
  });

  // Поля «Уточнить детали» повторяют разбор, пока пользователь их не трогал.
  useEffect(() => {
    if (!dateTouched) setDateInput(parsed?.date ? isoToMaskedMsk(parsed.date) : '');
  }, [parsed?.date, dateTouched]);
  useEffect(() => {
    if (budgetTouched) return;
    setBudgetFrom(parsed?.budgetFrom != null ? String(parsed.budgetFrom) : '');
    setBudgetTo(parsed?.budgetTo != null && !parsed.isFree ? String(parsed.budgetTo) : '');
  }, [parsed?.budgetFrom, parsed?.budgetTo, parsed?.isFree, budgetTouched]);

  const patch = (p: RequestOverrides) => setOverrides((o) => ({ ...o, ...p }));
  // Смена профессий сбрасывает выбранный вручную раздел каталога (он мог быть от прежней профессии).
  const setProfessions = (ids: string[]) => setOverrides((o) => {
    const rest = { ...o };
    delete rest.serviceId;
    return { ...rest, professionIds: ids.slice(0, MAX_PROFESSIONS) };
  });

  const removeChip = (chip: RequestChip) => {
    if (!parsed) return;
    switch (chip.kind) {
      case 'profession': setProfessions(parsed.professionIds.filter((id) => id !== chip.id)); break;
      case 'genre': patch({ genreIds: parsed.genreIds.filter((id) => id !== chip.id) }); break;
      case 'city': patch({ city: null }); break;
      case 'remote': patch({ isRemote: false }); break;
      case 'date': patch({ date: null }); setDateTouched(true); setDateInput(''); break;
      case 'dateHint': patch({ dateHint: null }); break;
      case 'budget': patch({ budget: null }); setBudgetTouched(true); setBudgetFrom(''); setBudgetTo(''); break;
      default: break;
    }
  };

  const dateError = dateInput.length === 10
    ? (!parseMaskedDate(dateInput) ? 'Некорректная дата' : isMaskedDatePast(dateInput) ? 'Эта дата уже прошла' : null)
    : null;

  const onDateChange = (raw: string) => {
    const v = maskDateInput(raw);
    setDateInput(v);
    setDateTouched(true);
    if (!v) patch({ date: null });
    else if (parseMaskedDate(v) && !isMaskedDatePast(v)) patch({ date: maskedToIsoDay(v) });
  };

  const budgetError = budgetFrom && budgetTo && Number(budgetFrom) > Number(budgetTo)
    ? '«От» не может быть больше «до»'
    : null;

  const onBudgetChange = (which: 'from' | 'to', raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 9);
    const from = which === 'from' ? clean : budgetFrom;
    const to = which === 'to' ? clean : budgetTo;
    if (which === 'from') setBudgetFrom(clean); else setBudgetTo(clean);
    setBudgetTouched(true);
    const f = from ? Number(from) : null;
    const t = to ? Number(to) : null;
    if (f != null && t != null && f > t) return;
    patch({ budget: f == null && t == null ? null : { from: f, to: t } });
  };

  const createMut = useMutation({
    mutationFn: async () => (await requestsAPI.create(text.trim(), overrides)).data,
    onSuccess: (res) => {
      setResult(res);
      writeDraft('', {});
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['request-quota'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      toast.error(getApiError(e, 'Не удалось отправить запрос. Попробуйте ещё раз.'));
      queryClient.invalidateQueries({ queryKey: ['request-quota'] });
    },
  });

  const reset = () => {
    setResult(null);
    setText('');
    setOverrides({});
    setDateTouched(false);
    setBudgetTouched(false);
    setDetailsOpen(false);
    writeDraft('', {});
  };

  const quotaExhausted = gate.isAuthed && quotaLeft === 0;
  const canSubmit = !!data && !data.needsProfession && data.errors.length === 0 && !dateError && !budgetError
    && text.trim().length >= 3 && !createMut.isPending && !quotaExhausted;

  const submit = () => {
    if (!canSubmit) return;
    gate.ensure('create', { type: 'find_musician' }, () => createMut.mutate());
  };

  const overridesCount = Object.keys(overrides).length;
  const estimated = data?.estimatedMatches ?? 0;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 pb-28">
      <div
        className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Назад" className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <UserSearch size={18} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Ищу музыканта</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {result ? (
          <RequestResult result={result} onReset={reset} />
        ) : (
          <>
            <p className="text-sm text-slate-400 leading-relaxed">
              Напишите одной фразой, кого ищете, — мы разберём запрос, создадим заказ и сразу отправим его подходящим исполнителям.
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <label htmlFor="find-text" className="block text-sm font-semibold text-white">Опишите, кого ищете</label>
              <textarea
                id="find-text"
                value={text}
                onChange={(e) => {
                  const v = e.target.value.slice(0, MAX_LEN);
                  setText(v);
                  // Поле очищено — новый запрос: прежние правки чипов не тянем.
                  if (!v.trim()) { setOverrides({}); setDateTouched(false); setBudgetTouched(false); }
                }}
                rows={3}
                maxLength={MAX_LEN}
                placeholder="Например: нужен барабанщик на концерт 20 ноября в Самаре, метал, бюджет 10 000"
                className="w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-base text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5 min-h-[16px]">
                  {canParse && parseQ.isFetching && <><Loader2 size={12} className="animate-spin" /> Разбираем…</>}
                </span>
                <span>{text.length}/{MAX_LEN}</span>
              </div>

              {!text.trim() && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Sparkles size={12} /> Например:</p>
                  <div className="flex flex-col gap-1.5">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => { setText(ex); setOverrides({}); setDateTouched(false); setBudgetTouched(false); }}
                        className="text-left text-sm text-primary-300 hover:text-primary-200 bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/15 rounded-xl px-3 py-2 transition-colors"
                      >
                        «{ex}»
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {canParse && parseQ.isError && !data && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertCircle size={14} /> {getApiError(parseQ.error, 'Не удалось разобрать запрос')}
              </p>
            )}

            {data && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Мы поняли так</p>
                  {overridesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => { setOverrides({}); setDateTouched(false); setBudgetTouched(false); }}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Сбросить правки
                    </button>
                  )}
                </div>

                <RequestChips
                  chips={data.chips}
                  onRemove={removeChip}
                  onServiceClick={data.serviceOptions.length > 1 ? () => setSheet('service') : undefined}
                />

                {data.needsProfession ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-200 flex items-center gap-1.5">
                      <AlertCircle size={15} /> Уточните профессию
                    </p>
                    <p className="text-xs text-amber-100/70 leading-relaxed">
                      {parsed?.unknownTokens.length
                        ? `Не поняли, кого вы ищете («${parsed.unknownTokens.slice(0, 3).join('», «')}»). Выберите из списка.`
                        : 'Не поняли, кого вы ищете. Выберите из списка.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSheet('profession')}
                      className="w-full py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Briefcase size={15} /> Выбрать профессию
                    </button>
                  </div>
                ) : (
                  <>
                    {parsed && parsed.unknownTokens.length > 0 && (
                      <p className="text-xs text-slate-500">Не учли: {parsed.unknownTokens.slice(0, 5).join(', ')}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setSheet('profession')}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                    >
                      Изменить профессию
                    </button>
                  </>
                )}

                {data.errors.length > 0 && (
                  <p className="text-xs text-red-400">{data.errors.join('. ')}</p>
                )}

                {!data.needsProfession && (
                  <p className="text-sm text-slate-300 flex items-start gap-2">
                    <Users size={15} className="text-primary-400 flex-shrink-0 mt-0.5" />
                    <span>
                      {estimated > 0
                        ? <>Подходящих исполнителей: <span className="font-semibold text-white">{estimated}</span>. Уведомим до 10 самых подходящих.</>
                        : 'Пока нет исполнителей с этой профессией — заказ всё равно увидят в Потоке.'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {data && !data.needsProfession && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-slate-200 hover:bg-slate-800/40 transition-colors"
                  aria-expanded={detailsOpen}
                >
                  Уточнить детали
                  <ChevronDown size={16} className={`text-slate-500 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </button>
                {detailsOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Город</p>
                      <button
                        type="button"
                        onClick={() => setSheet('city')}
                        className={`${inputCls} text-left flex items-center gap-2`}
                      >
                        <MapPin size={15} className="text-slate-500 flex-shrink-0" />
                        <span className={parsed?.cityName ? 'text-white' : 'text-slate-500'}>{parsed?.cityName || 'Любой'}</span>
                      </button>
                      <label className="mt-2 flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!parsed?.isRemote}
                          onChange={(e) => patch({ isRemote: e.target.checked })}
                          className="w-4 h-4 accent-primary-500"
                        />
                        Можно онлайн / удалённо
                      </label>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Дата (ДД.ММ.ГГГГ)</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={dateInput}
                        onChange={(e) => onDateChange(e.target.value)}
                        placeholder={parsed?.dateHint ? `Без точной даты: ${parsed.dateHint}` : 'Без даты'}
                        className={inputCls}
                      />
                      {dateError && <p className="text-xs text-red-400 mt-1">{dateError}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Бюджет, ₽</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" inputMode="numeric" value={budgetFrom} onChange={(e) => onBudgetChange('from', e.target.value)} placeholder="от" className={inputCls} />
                        <input type="text" inputMode="numeric" value={budgetTo} onChange={(e) => onBudgetChange('to', e.target.value)} placeholder={parsed?.isFree ? 'бесплатно' : 'до'} className={inputCls} />
                      </div>
                      {budgetError && <p className="text-xs text-red-400 mt-1">{budgetError}</p>}
                    </div>
                    {data.serviceOptions.length > 1 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Раздел каталога</p>
                        <button type="button" onClick={() => setSheet('service')} className={`${inputCls} text-left flex items-center gap-2`}>
                          <LayoutGrid size={15} className="text-slate-500 flex-shrink-0" />
                          <span className="truncate">{data.service?.name ?? 'Выбрать'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:hover:bg-primary-600 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
              >
                {createMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
                Найти и отправить запрос
              </button>
              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                {quotaExhausted
                  ? 'Лимит — 5 запросов в сутки. Попробуйте завтра или создайте заказ через форму.'
                  : gate.isAuthed && quotaLeft != null
                    ? `Создадим заказ в Потоке и уведомим подходящих исполнителей. Осталось сегодня: ${quotaLeft} ${plural(quotaLeft, 'запрос', 'запроса', 'запросов')}.`
                    : 'Создадим заказ в Потоке и уведомим подходящих исполнителей.'}
              </p>
            </div>
          </>
        )}
      </div>

      {sheet === 'profession' && (
        <SelectSheet
          isOpen
          onClose={() => setSheet(null)}
          title="Кого вы ищете?"
          mode="multiple"
          showConfirm
          options={(professionsQ.data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            subtitle: p.userCount ? `${p.userCount} ${plural(p.userCount, 'исполнитель', 'исполнителя', 'исполнителей')}` : undefined,
          }))}
          selectedIds={parsed?.professionIds ?? []}
          onSelect={(ids) => setProfessions(Array.isArray(ids) ? ids : [ids])}
          searchPlaceholder="Поиск профессии…"
          emptyText={professionsQ.isLoading ? 'Загрузка…' : 'Ничего не найдено'}
        />
      )}
      {sheet === 'city' && (
        <SelectSheet
          isOpen
          onClose={() => setSheet(null)}
          title="Город"
          options={[{ id: '', name: 'Любой город' }, ...(citiesQ.data ?? []).map((c) => ({ id: c.name, name: c.name }))]}
          selectedIds={parsed?.cityName ?? ''}
          onSelect={(id) => patch({ city: (Array.isArray(id) ? id[0] : id) || null })}
          searchPlaceholder="Поиск города…"
          emptyText={citiesQ.isLoading ? 'Загрузка…' : 'Ничего не найдено'}
        />
      )}
      {sheet === 'service' && data && (
        <SelectSheet
          isOpen
          onClose={() => setSheet(null)}
          title="Раздел каталога"
          options={data.serviceOptions.map((s) => ({ id: s.id, name: s.name, subtitle: s.sectionName ?? undefined }))}
          selectedIds={data.service?.id ?? ''}
          onSelect={(id) => { const v = Array.isArray(id) ? id[0] : id; if (v) patch({ serviceId: v }); }}
          searchable={data.serviceOptions.length > 8}
        />
      )}
    </div>
  );
}
