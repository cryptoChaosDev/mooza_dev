import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, X, Search, ArrowRight, ArrowLeft, Globe, Mail } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { userAPI, authAPI, referenceAPI } from '../lib/api';
import CityPicker from '../components/CityPicker';

interface SelectedProfession {
  professionId: string;
  professionName: string;
  directionName?: string;
}

interface ProfessionResult {
  id: string;
  name: string;
  direction?: { name: string };
}

// ── phone helpers (shared format with RegisterPage) ────────────────────────────
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const d = digits.startsWith('7') ? digits : '7' + digits;
  let result = '+7';
  if (d.length > 1) result += ' (' + d.substring(1, Math.min(4, d.length));
  if (d.length >= 4) result += ') ' + d.substring(4, Math.min(7, d.length));
  if (d.length >= 7) result += ' ' + d.substring(7, Math.min(9, d.length));
  if (d.length >= 9) result += ' ' + d.substring(9, Math.min(11, d.length));
  return result;
}
function unformatPhone(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

// ── ProfessionFilterPicker (expanded multi-select chips) ────────────────────────
interface FilterValue { id: string; value: string; sortOrder: number; }
interface ProfessionFilter { id: string; name: string; values: FilterValue[]; }

function ProfessionFilterPicker({ professionId, onChange }: {
  professionId: string;
  onChange: (valueIds: string[]) => void;
}) {
  const [filters, setFilters] = useState<ProfessionFilter[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    referenceAPI.getProfessionFilters(professionId)
      .then(r => setFilters(r.data as ProfessionFilter[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [professionId]);

  const toggle = (valueId: string) => {
    const next = selected.includes(valueId)
      ? selected.filter(id => id !== valueId)
      : [...selected, valueId];
    setSelected(next);
    onChange(next);
  };

  if (loading) return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
      <Loader2 size={12} className="animate-spin" /> Загрузка атрибутов…
    </div>
  );
  if (!filters.length) return null;

  return (
    <div className="mt-2 rounded-2xl border border-slate-700/50 bg-slate-900/60 p-3 space-y-3 max-h-72 overflow-y-auto">
      {filters.map(filter => (
        <div key={filter.id}>
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">{filter.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {filter.values.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => toggle(v.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selected.includes(v.id)
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {v.value}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const TOTAL_STEPS = 4;

export default function VkSetupPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Skip onboarding if user already completed it (server-side flag or local fallback)
  const nextAfterSetup = (user?.onboardingCompletedAt || localStorage.getItem('mooza_tour_done'))
    ? '/'
    : '/onboarding';

  // Step 0: Name
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameTaken, setNicknameTaken] = useState(false);
  const nicknameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1: Profession
  const [profSearch, setProfSearch] = useState('');
  const [profResults, setProfResults] = useState<ProfessionResult[]>([]);
  const [profLoading, setProfLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProfs, setSelectedProfs] = useState<SelectedProfession[]>([]);
  const [profFilterValues, setProfFilterValues] = useState<Record<string, string[]>>({});
  const profTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 2: Location
  const [city, setCity] = useState(user?.city || '');
  const [country, setCountry] = useState(user?.country || '');
  const [geoLoading, setGeoLoading] = useState(false);

  // Step 3: Email (required) + phone (optional)
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone ? formatPhone(user.phone) : '');

  // Nickname check
  useEffect(() => {
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length < 2 || trimmed === user?.nickname) {
      setNicknameTaken(false);
      return;
    }
    setNicknameChecking(true);
    if (nicknameTimer.current) clearTimeout(nicknameTimer.current);
    nicknameTimer.current = setTimeout(async () => {
      try {
        const { data } = await authAPI.checkNickname(trimmed);
        setNicknameTaken(!data.available);
      } catch { setNicknameTaken(false); }
      finally { setNicknameChecking(false); }
    }, 500);
    return () => { if (nicknameTimer.current) clearTimeout(nicknameTimer.current); };
  }, [nickname, user?.nickname]);

  // Profession search
  useEffect(() => {
    const q = profSearch.trim();
    if (!q) { setProfResults([]); setShowDropdown(false); return; }
    setProfLoading(true);
    if (profTimer.current) clearTimeout(profTimer.current);
    profTimer.current = setTimeout(async () => {
      try {
        const { data } = await referenceAPI.getProfessions({ search: q, all: true });
        const filtered = (data as ProfessionResult[]).filter(p =>
          !selectedProfs.some(s => s.professionId === p.id)
        );
        setProfResults(filtered);
        setShowDropdown(true);
      } catch { setProfResults([]); }
      finally { setProfLoading(false); }
    }, 300);
    return () => { if (profTimer.current) clearTimeout(profTimer.current); };
  }, [profSearch, selectedProfs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          profInputRef.current && !profInputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addProfession = (p: ProfessionResult) => {
    if (selectedProfs.length >= 10) return;
    setSelectedProfs(prev => [...prev, { professionId: p.id, professionName: p.name }]);
    setProfSearch('');
    setProfResults([]);
    setShowDropdown(false);
    profInputRef.current?.focus();
  };

  const detectLocation = () => {
    setGeoLoading(true);
    if (!('geolocation' in navigator)) { setGeoLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=ru`);
          const d = await r.json();
          if (d.address) {
            setCountry(d.address.country || '');
            setCity(d.address.city || d.address.town || d.address.village || '');
          }
        } finally { setGeoLoading(false); }
      },
      () => setGeoLoading(false),
      { timeout: 10000 }
    );
  };

  const step0Valid = firstName.trim().length > 0 && lastName.trim().length > 0 && !nicknameTaken;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const goBack = () => { setError(''); setStep(s => Math.max(0, s - 1)); };

  // Step 0 → save name, advance
  const saveStep0 = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: any = { firstName: firstName.trim(), lastName: lastName.trim() };
      if (nickname.trim()) payload.nickname = nickname.trim();
      const { data } = await userAPI.updateMe(payload);
      setUser(data);
      setStep(1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally { setLoading(false); }
  };

  // Step 1 → save professions, advance to location
  const saveProfessions = async () => {
    if (selectedProfs.length === 0) { setStep(2); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await userAPI.updateMe({
        userProfessions: selectedProfs.map(p => ({
          professionId: p.professionId,
          selectedCustomFilterValueIds: profFilterValues[p.professionId] || [],
        })),
      });
      setUser(data);
      setStep(2);
    } catch { setStep(2); }
    finally { setLoading(false); }
  };

  // Step 3 → save location + email (required) + phone (optional), finish
  const saveFinal = async () => {
    if (!emailValid) { setError('Укажите корректный email'); return; }
    setLoading(true);
    setError('');
    try {
      const payload: any = { email: email.trim().toLowerCase() };
      if (city.trim()) payload.city = city.trim();
      if (country.trim()) payload.country = country.trim();
      const digits = unformatPhone(phone);
      if (digits.length >= 11) payload.phone = '+' + digits;
      const { data } = await userAPI.updateMe(payload);
      setUser(data);
      navigate(nextAfterSetup);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сохранить данные');
    } finally { setLoading(false); }
  };

  // ── Shell with progress + back button ──────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        {step > 0 ? (
          <button onClick={goBack} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
        ) : <div className="w-9" />}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${
              i === step ? 'w-5 h-2 bg-primary-500' :
              i < step ? 'w-2 h-2 bg-primary-500/50' : 'w-2 h-2 bg-slate-700'
            }`} />
          ))}
        </div>
        <div className="w-9" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );

  const errorBox = error && (
    <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
      {error}
    </div>
  );

  // Step 0 — Name / Nickname
  if (step === 0) return (
    <Shell>
      <div className="mb-8">
        <div className="text-4xl mb-3">👋</div>
        <h1 className="text-2xl font-bold text-white mb-2">Добро пожаловать!</h1>
        <p className="text-sm text-slate-400">Данные подтянулись из ВКонтакте — можете изменить их прямо сейчас.</p>
      </div>

      {errorBox}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Имя" required>
            <input
              value={firstName} onChange={e => setFirstName(e.target.value)}
              placeholder="Иван" autoFocus maxLength={20}
              className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
            />
          </Field>
          <Field label="Фамилия" required>
            <input
              value={lastName} onChange={e => setLastName(e.target.value)}
              placeholder="Иванов" maxLength={30}
              className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 text-sm"
            />
          </Field>
        </div>

        <Field label="Никнейм" hint="Необязательно — короткое имя для поиска">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="username"
              maxLength={20}
              className={`w-full pl-8 pr-10 py-3.5 bg-slate-800/70 border rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all text-sm ${
                nicknameTaken ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700/60 focus:ring-primary-500/50'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {nicknameChecking && <Loader2 size={15} className="animate-spin text-slate-500" />}
              {!nicknameChecking && nickname.trim().length >= 2 && !nicknameTaken && <Check size={15} className="text-emerald-400" />}
              {!nicknameChecking && nicknameTaken && <X size={15} className="text-red-400" />}
            </div>
          </div>
          {nicknameTaken && <p className="text-xs text-red-400 mt-1">Никнейм занят, введите другой</p>}
        </Field>
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={saveStep0}
          disabled={!step0Valid || loading}
          className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          Далее
        </button>
      </div>
    </Shell>
  );

  // Step 1 — Profession
  if (step === 1) return (
    <Shell>
      <div className="mb-6">
        <div className="text-4xl mb-3">🎸</div>
        <h1 className="text-2xl font-bold text-white mb-2">Ваша профессия</h1>
        <p className="text-sm text-slate-400">Укажите хотя бы одну профессию — так вас найдут нужные люди.</p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/60 rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-primary-500/50 transition-all">
            {profLoading ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 animate-spin" /> : <Search size={16} className="text-slate-500 flex-shrink-0" />}
            <input
              ref={profInputRef}
              value={profSearch}
              onChange={e => setProfSearch(e.target.value)}
              onFocus={() => profSearch.trim() && setShowDropdown(true)}
              placeholder="Начните вводить и выберите из списка"
              className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {profSearch && <button onClick={() => { setProfSearch(''); setShowDropdown(false); }}><X size={14} className="text-slate-500" /></button>}
          </div>

          {showDropdown && profResults.length > 0 && (
            <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto">
              {profResults.map(p => (
                <button key={p.id} onMouseDown={e => { e.preventDefault(); addProfession(p); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left">
                  <span className="text-sm text-white font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && !profLoading && profResults.length === 0 && profSearch.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-500 z-50">
              Профессия не найдена
            </div>
          )}
        </div>

        {selectedProfs.length > 0 && (
          <div className="space-y-3">
            {selectedProfs.map(prof => (
              <div key={prof.professionId} className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white font-medium">{prof.professionName}</span>
                  <button
                    onClick={() => setSelectedProfs(p => p.filter(x => x.professionId !== prof.professionId))}
                    className="text-slate-500 hover:text-red-400 transition-colors ml-auto"
                  >
                    <X size={13} />
                  </button>
                </div>
                <ProfessionFilterPicker
                  professionId={prof.professionId}
                  onChange={valueIds => setProfFilterValues(prev => ({ ...prev, [prof.professionId]: valueIds }))}
                />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500 bg-slate-800/30 border border-slate-700/30 rounded-xl px-4 py-3">
          Остальные профессии можно добавить в профиле (до 10). Фильтры также можно заполнить позже.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={saveProfessions}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          Далее
        </button>
        <button onClick={() => { setSelectedProfs([]); setStep(2); }} className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors">
          Пропустить
        </button>
      </div>
    </Shell>
  );

  // Step 2 — Location
  if (step === 2) return (
    <Shell>
      <div className="mb-6">
        <div className="text-4xl mb-3">📍</div>
        <h1 className="text-2xl font-bold text-white mb-2 leading-tight">Где вы находитесь?</h1>
        <p className="text-sm text-slate-400">Город помогает найти музыкантов поблизости. Можно заполнить позже.</p>
      </div>

      {errorBox}

      <div className="space-y-4">
        <button
          type="button" onClick={detectLocation} disabled={geoLoading}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-primary-500/10 border border-primary-500/25 hover:bg-primary-500/15 text-primary-300 rounded-2xl text-sm font-medium transition-all"
        >
          {geoLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          {geoLoading ? 'Определяем местоположение...' : 'Определить автоматически'}
        </button>
        <Field label="Город">
          <CityPicker city={city} country={country} onChange={(c, co) => { setCity(c); setCountry(co); }} />
        </Field>
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={() => { setError(''); setStep(3); }}
          className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <ArrowRight size={18} /> Далее
        </button>
      </div>
    </Shell>
  );

  // Step 3 — Email (required) + phone (optional)
  return (
    <Shell>
      <div className="mb-6">
        <div className="text-4xl mb-3">✉️</div>
        <h1 className="text-2xl font-bold text-white mb-2 leading-tight">Контактные данные</h1>
        <p className="text-sm text-slate-400">Email нужен для входа и восстановления доступа к аккаунту.</p>
      </div>

      {errorBox}

      <div className="space-y-4">
        <Field label="Email" required hint="Используется для входа и важных уведомлений">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="w-full pl-11 pr-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm"
            />
          </div>
        </Field>
        <Field label="Телефон" hint="Необязательно — для связи с коллегами">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            placeholder="+7 (___) ___ __ __"
            className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm"
          />
        </Field>
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={saveFinal}
          disabled={!emailValid || loading}
          className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Завершить
        </button>
      </div>
    </Shell>
  );
}
