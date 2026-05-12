import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, EyeOff, AlertCircle, Loader2,
  Check, Globe, ArrowRight, ArrowLeft, X, Search,
} from 'lucide-react';
import { authAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Input({
  type = 'text', value, onChange, placeholder, autoFocus, right, disabled,
}: {
  type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; autoFocus?: boolean; right?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} disabled={disabled}
        className={`w-full pl-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all text-sm disabled:opacity-50 ${right ? 'pr-12' : 'pr-4'}`}
      />
      {right && <div className="absolute right-4 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedProfession {
  professionId: string;
  professionName: string;
  directionName?: string;
  features: string[];
}

interface ProfessionResult {
  id: string;
  name: string;
  direction?: { name: string };
}

interface Feature {
  id: string;
  name: string;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { emoji: '👋', title: 'Добро пожаловать\nв Moooza', why: 'Email и пароль нужны, чтобы войти с любого устройства и защитить ваш аккаунт.', optional: false },
  { emoji: '🎵', title: 'Как вас зовут?', why: 'Ваше имя видят другие участники, когда ищут коллег или смотрят ваш профиль.', optional: false },
  { emoji: '🎸', title: 'Ваша профессия', why: 'Укажите хотя бы одну профессию — так вас найдут нужные люди.', optional: false },
  { emoji: '📍', title: 'Где вы\nнаходитесь?', why: 'Город помогает найти музыкантов поблизости. Можно заполнить позже.', optional: true },
];

// ── main component ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [searchParams] = useSearchParams();
  const referrerId = searchParams.get('ref') || undefined;

  const [step, setStep] = useState(0);

  // Step 0
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameTaken, setNicknameTaken] = useState(false);
  const nicknameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 — Profession
  const [profSearch, setProfSearch] = useState('');
  const [profResults, setProfResults] = useState<ProfessionResult[]>([]);
  const [profLoading, setProfLoading] = useState(false);
  const [showProfDropdown, setShowProfDropdown] = useState(false);
  const [selectedProfs, setSelectedProfs] = useState<SelectedProfession[]>([]);
  const [profFeatures, setProfFeatures] = useState<Feature[]>([]);
  const profTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Step 3
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const t = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
  };

  // ── Nickname uniqueness ───────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = nickname.trim();
    if (!trimmed || trimmed.length < 2) { setNicknameTaken(false); return; }
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
  }, [nickname]);

  // ── Profession search ─────────────────────────────────────────────────────
  useEffect(() => {
    // Load features once
    referenceAPI.getProfessionFeatures().then(r => setProfFeatures(r.data));
  }, []);

  useEffect(() => {
    const q = profSearch.trim();
    if (!q) { setProfResults([]); setShowProfDropdown(false); return; }
    setProfLoading(true);
    if (profTimer.current) clearTimeout(profTimer.current);
    profTimer.current = setTimeout(async () => {
      try {
        const { data } = await referenceAPI.getProfessions({ search: q, all: true });
        const filtered = (data as ProfessionResult[]).filter(p =>
          !selectedProfs.some(s => s.professionId === p.id)
        );
        setProfResults(filtered);
        setShowProfDropdown(true);
      } catch { setProfResults([]); }
      finally { setProfLoading(false); }
    }, 300);
    return () => { if (profTimer.current) clearTimeout(profTimer.current); };
  }, [profSearch, selectedProfs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          profInputRef.current && !profInputRef.current.contains(e.target as Node)) {
        setShowProfDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addProfession = (p: ProfessionResult) => {
    if (selectedProfs.length >= 10) return;
    setSelectedProfs(prev => [...prev, {
      professionId: p.id,
      professionName: p.name,
      directionName: p.direction?.name,
      features: [],
    }]);
    setProfSearch('');
    setProfResults([]);
    setShowProfDropdown(false);
    profInputRef.current?.focus();
  };

  const removeProfession = (id: string) => {
    setSelectedProfs(prev => prev.filter(p => p.professionId !== id));
  };

  const toggleFeature = (profId: string, featureId: string) => {
    setSelectedProfs(prev => prev.map(p => {
      if (p.professionId !== profId) return p;
      const has = p.features.includes(featureId);
      return { ...p, features: has ? p.features.filter(f => f !== featureId) : [...p.features, featureId] };
    }));
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const step1Valid = firstName.trim().length > 0 && lastName.trim().length > 0 && !nicknameTaken;

  const validate = (): boolean => {
    setError('');
    if (step === 0) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Укажите корректный email'); return false; }
      if (password.length < 8) { setError('Пароль — минимум 8 символов'); return false; }
    }
    if (step === 1) {
      if (!firstName.trim()) { setError('Укажите имя'); return false; }
      if (!lastName.trim()) { setError('Укажите фамилию'); return false; }
      if (nicknameTaken) { setError('Никнейм занят, введите другой'); return false; }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => { setError(''); setStep(s => s - 1); };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (skipProfs = false) => {
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      if (nickname.trim()) payload.nickname = nickname.trim();
      if (city.trim()) payload.city = city.trim();
      if (country.trim()) payload.country = country.trim();
      const digits = unformatPhone(phone);
      if (digits.length >= 11) payload.phone = '+' + digits;
      if (referrerId) payload.referrerId = referrerId;
      if (!skipProfs && selectedProfs.length > 0) {
        payload.userProfessions = selectedProfs.map(p => ({
          professionId: p.professionId,
          features: p.features,
        }));
      }

      const { data } = await authAPI.register(payload);
      if (data.pendingVerification) {
        setPendingEmail(data.email);
        startCooldown();
      } else {
        setAuth(data.user, data.token);
        navigate('/');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(typeof msg === 'string' ? msg : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingEmail || verifyCode.length < 6) return;
    setLoading(true);
    setVerifyError('');
    try {
      const { data } = await authAPI.verifyEmail(pendingEmail, verifyCode.trim());
      setAuth(data.user, data.token);
      navigate('/');
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || 'Неверный код');
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendCooldown > 0) return;
    try { await authAPI.resendVerification(pendingEmail); startCooldown(); } catch {}
  };

  const detectLocation = useCallback(() => {
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
  }, []);

  // ── Email verification screen ─────────────────────────────────────────────
  if (pendingEmail) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">📬</div>
            <h2 className="text-2xl font-bold text-white mb-2">Проверьте почту</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Мы отправили 6-значный код на<br />
              <span className="text-white font-medium">{pendingEmail}</span>
            </p>
          </div>
          <input
            type="text" inputMode="numeric" maxLength={6}
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000" autoFocus
            className="w-full text-center text-4xl font-bold tracking-[18px] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white placeholder-slate-700 focus:outline-none focus:border-primary-500 mb-4"
          />
          {verifyError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{verifyError}
            </div>
          )}
          <button onClick={handleVerify} disabled={loading || verifyCode.length < 6}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base mb-3">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Подтвердить
          </button>
          <button onClick={handleResend} disabled={resendCooldown > 0}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors">
            {resendCooldown > 0 ? `Повторный код через ${resendCooldown} с` : 'Отправить код повторно'}
          </button>
        </div>
      </div>
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────
  const stepDef = STEPS[step];
  const isProfStep = step === 2;
  const isLast = step === STEPS.length - 1;

  const stepContent = () => {
    // Step 0 — Email & Password
    if (step === 0) return (
      <div className="space-y-4">
        <Field label="Email" hint="Используется для входа и восстановления пароля">
          <Input type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
        </Field>
        <Field label="Пароль" hint="Минимум 8 символов">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password} onChange={setPassword}
            placeholder="Придумайте пароль"
            right={
              <button type="button" onClick={() => setShowPassword(p => !p)} className="text-slate-500 hover:text-slate-300 transition-colors">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          />
        </Field>
      </div>
    );

    // Step 1 — Name & Nickname
    if (step === 1) return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Имя" required>
            <Input value={firstName} onChange={setFirstName} placeholder="Иван" autoFocus />
          </Field>
          <Field label="Фамилия" required>
            <Input value={lastName} onChange={setLastName} placeholder="Иванов" />
          </Field>
        </div>
        <Field label="Никнейм" hint="Необязательно — короткое имя для поиска">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">@</span>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="username"
              className={`w-full pl-8 pr-10 py-3.5 bg-slate-800/70 border rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all text-sm ${
                nicknameTaken ? 'border-red-500/60 focus:ring-red-500/30' : 'border-slate-700/60 focus:ring-primary-500/50'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {nicknameChecking && nickname.trim().length >= 2 && <Loader2 size={15} className="animate-spin text-slate-500" />}
              {!nicknameChecking && nickname.trim().length >= 2 && !nicknameTaken && <Check size={15} className="text-emerald-400" />}
              {!nicknameChecking && nicknameTaken && <X size={15} className="text-red-400" />}
            </div>
          </div>
          {nicknameTaken && <p className="text-xs text-red-400 mt-1">Никнейм занят, введите другой</p>}
        </Field>
      </div>
    );

    // Step 2 — Profession
    if (step === 2) return (
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/60 rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500/50 transition-all">
            {profLoading ? <Loader2 size={16} className="text-slate-500 flex-shrink-0 animate-spin" /> : <Search size={16} className="text-slate-500 flex-shrink-0" />}
            <input
              ref={profInputRef}
              value={profSearch}
              onChange={e => setProfSearch(e.target.value)}
              onFocus={() => profSearch.trim() && setShowProfDropdown(true)}
              placeholder="Начните вводить и выберите из списка"
              className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {profSearch && <button onClick={() => { setProfSearch(''); setShowProfDropdown(false); }} className="text-slate-500 hover:text-white"><X size={14} /></button>}
          </div>

          {/* Dropdown */}
          {showProfDropdown && profResults.length > 0 && (
            <div ref={dropdownRef} className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto">
              {profResults.map(p => (
                <button
                  key={p.id}
                  onMouseDown={e => { e.preventDefault(); addProfession(p); }}
                  className="w-full flex items-start gap-2 px-4 py-2.5 hover:bg-slate-700/50 transition-colors text-left"
                >
                  <span className="text-sm text-white font-medium">{p.name}</span>
                  {p.direction && <span className="text-xs text-slate-500 mt-0.5 ml-auto flex-shrink-0">{p.direction.name}</span>}
                </button>
              ))}
            </div>
          )}
          {showProfDropdown && !profLoading && profResults.length === 0 && profSearch.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-500 z-50">
              Профессия не найдена
            </div>
          )}
        </div>

        {/* Selected professions */}
        {selectedProfs.length > 0 && (
          <div className="space-y-3">
            {selectedProfs.map(prof => (
              <div key={prof.professionId} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{prof.professionName}</p>
                    {prof.directionName && <p className="text-xs text-slate-500">{prof.directionName}</p>}
                  </div>
                  <button onClick={() => removeProfession(prof.professionId)} className="text-slate-500 hover:text-red-400 p-1 transition-colors flex-shrink-0">
                    <X size={15} />
                  </button>
                </div>
                {/* Features */}
                {profFeatures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profFeatures.map(f => {
                      const active = prof.features.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleFeature(prof.professionId, f.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? 'bg-primary-600/30 border-primary-500/50 text-primary-300'
                              : 'bg-slate-700/40 border-slate-600/40 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info */}
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl px-4 py-3 space-y-1">
          <p className="text-xs text-slate-400">
            Добавьте хотя бы одну профессию — это поможет вас найти.
          </p>
          <p className="text-xs text-slate-500">
            Если у вас несколько профессий, остальные можно добавить в профиле (до 10 профессий). Фильтры также можно заполнить позже.
          </p>
        </div>
      </div>
    );

    // Step 3 — Location
    if (step === 3) return (
      <div className="space-y-4">
        <button
          type="button" onClick={detectLocation} disabled={geoLoading}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-primary-500/10 border border-primary-500/25 hover:bg-primary-500/15 text-primary-300 rounded-2xl text-sm font-medium transition-all"
        >
          {geoLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          {geoLoading ? 'Определяем местоположение...' : 'Определить автоматически'}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Город">
            <Input value={city} onChange={setCity} placeholder="Москва" />
          </Field>
          <Field label="Страна">
            <Input value={country} onChange={setCountry} placeholder="Россия" />
          </Field>
        </div>
        <Field label="Телефон" hint="Необязательно — для связи с коллегами">
          <Input type="tel" value={phone} onChange={v => setPhone(formatPhone(v))} placeholder="+7 (___) ___ __ __" />
        </Field>
      </div>
    );
  };

  // Button logic
  const nextDisabled = step === 1 && !step1Valid;

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        {step > 0 ? (
          <button onClick={prev} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link to="/login" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Войти</Link>
        )}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${
              i === step ? 'w-5 h-2 bg-primary-500' :
              i < step ? 'w-2 h-2 bg-primary-500/50' : 'w-2 h-2 bg-slate-700'
            }`} />
          ))}
        </div>
        <div className="w-9" />
      </div>

      {/* content */}
      <div className="flex-1 flex flex-col px-5 pt-6 pb-8 overflow-y-auto">
        <div className="mb-6">
          <div className="text-4xl mb-3">{stepDef.emoji}</div>
          <h1 className="text-2xl font-bold text-white leading-tight whitespace-pre-line mb-2">{stepDef.title}</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{stepDef.why}</p>
        </div>

        <div className="flex-1">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{error}
            </div>
          )}
          {stepContent()}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          {isProfStep ? (
            <>
              <button
                onClick={() => { setStep(s => s + 1); }}
                disabled={selectedProfs.length === 0}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base"
              >
                <Check size={18} /> Сохранить
              </button>
              <button
                onClick={() => { setSelectedProfs([]); setStep(s => s + 1); }}
                className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Пропустить
              </button>
            </>
          ) : isLast ? (
            <>
              <button onClick={() => handleSubmit(false)} disabled={loading}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Создаём аккаунт...' : 'Создать аккаунт'}
              </button>
              <button onClick={() => handleSubmit(false)} disabled={loading}
                className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors">
                Пропустить и создать
              </button>
            </>
          ) : (
            <button onClick={next} disabled={nextDisabled}
              className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base">
              Далее <ArrowRight size={18} />
            </button>
          )}

          {step === 0 && (
            <p className="text-center text-xs text-slate-600">
              Регистрируясь, вы принимаете{' '}
              <a href="/terms" className="text-slate-500 hover:text-slate-400 underline">условия использования</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
