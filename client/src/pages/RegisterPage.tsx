import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, EyeOff, AlertCircle, Loader2,
  Check, Globe, ArrowRight, ArrowLeft, X, Search,
} from 'lucide-react';
import { authAPI, referenceAPI, referralAPI, artistAPI, siteSettingsAPI } from '../lib/api';
import CityPicker from '../components/CityPicker';
import VkLoginButton from '../components/VkLoginButton';

// Temporarily hide VK login/registration. Set back to true to restore.
const SHOW_VK = false;
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
  type = 'text', value, onChange, placeholder, autoFocus, right, disabled, maxLength,
}: {
  type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; autoFocus?: boolean; right?: React.ReactNode; disabled?: boolean; maxLength?: number;
}) {
  return (
    <div className="relative">
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} disabled={disabled} maxLength={maxLength}
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
}

interface ProfessionResult {
  id: string;
  name: string;
  direction?: { name: string };
}

// ── ProfessionFilterPicker ────────────────────────────────────────────────────

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

  // All filters expanded at once — each is a label + a wrap of multi-select chips.
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

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { emoji: '👋', title: 'Добро пожаловать\nв Moooza', why: 'Email и пароль нужны, чтобы войти с любого устройства и защитить ваш аккаунт.', optional: false },
  { emoji: '🎵', title: 'Как вас зовут?', why: 'Ваше имя видят другие участники, когда ищут коллег или смотрят ваш профиль.', optional: false },
  { emoji: '🎸', title: 'Ваша профессия', why: 'Укажите хотя бы одну профессию — без этого не продолжить. Так вас найдут нужные люди.', optional: false },
  { emoji: '📍', title: 'Где вы\nнаходитесь?', why: 'Город помогает найти музыкантов поблизости. Можно заполнить позже.', optional: true },
];

// ── main component ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get('ref') || undefined;
  // Role-bound artist invite link (/register?artistInvite=token).
  const artistInvite = searchParams.get('artistInvite') || undefined;
  // Already-logged-in visitors get an accept screen instead of the signup form.
  const isAuthed = !!localStorage.getItem('token');

  useEffect(() => { document.title = 'Регистрация — Moooza'; }, []);

  useEffect(() => { document.title = 'Регистрация — Moooza'; }, []);

  // Resolve the ref code (single-use link code OR legacy userId) → owner id.
  const [referrerId, setReferrerId] = useState<string | undefined>(undefined);
  const [refUsed, setRefUsed] = useState(false);

  // Registration may be closed site-wide. In referral-only mode a valid referral
  // link (or an artist invite) still lets people register; otherwise → login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ownerId: string | null = null;
      let used = false;
      if (refCode) {
        try {
          const { data } = await referralAPI.resolve(refCode);
          used = !!data?.used;
          ownerId = data?.ownerId ?? null;
          if (!cancelled) {
            if (used) setRefUsed(true);
            else if (ownerId) setReferrerId(ownerId);
          }
        } catch { /* ignore */ }
      }
      try {
        const { data } = await siteSettingsAPI.get();
        const s = data as Record<string, string>;
        if (s?.registrationEnabled === 'false') {
          const invited = (s?.referralRegistrationEnabled === 'true' && !!ownerId && !used) || !!artistInvite;
          if (!invited && !cancelled) navigate('/login', { replace: true });
        }
      } catch { /* on error, don't hard-block */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refCode, artistInvite, navigate]);

  // Resolve the artist-invite token → preview (artist name + roles) for the banner.
  const [artistInvitePreview, setArtistInvitePreview] = useState<{ artist: { name: string }; roles: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    if (!artistInvite) return;
    artistAPI.getInvite(artistInvite)
      .then(({ data }) => setArtistInvitePreview(data))
      .catch(() => setArtistInvitePreview(null));
  }, [artistInvite]);

  // ── Accept-invite flow for users who are ALREADY logged in ──────────────────
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  // A logged-in user who lands on /register without an invite has nothing here.
  useEffect(() => {
    if (isAuthed && !artistInvite) navigate('/', { replace: true });
  }, [isAuthed, artistInvite, navigate]);

  const handleAcceptInvite = async () => {
    if (!artistInvite) return;
    setAccepting(true);
    setAcceptError('');
    try {
      const { data } = await artistAPI.acceptInvite(artistInvite);
      navigate(`/artist/${data.artistId}`, { replace: true });
    } catch (err: any) {
      setAcceptError(err.response?.data?.error || 'Не удалось принять приглашение');
      setAccepting(false);
    }
  };

  const [step, setStep] = useState(0);

  // Step 0
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToPD, setAgreedToPD] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');           // ISO YYYY-MM-DD (validation/payload)
  const [birthDateInput, setBirthDateInput] = useState(''); // masked ДД.ММ.ГГГГ (display)
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameTaken, setNicknameTaken] = useState(false);
  const nicknameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 — Profession
  const [profSearch, setProfSearch] = useState('');
  const [profResults, setProfResults] = useState<ProfessionResult[]>([]);
  const [profLoading, setProfLoading] = useState(false);
  const [showProfDropdown, setShowProfDropdown] = useState(false);
  const [selectedProfs, setSelectedProfs] = useState<SelectedProfession[]>([]);
  const [profFilterValues, setProfFilterValues] = useState<Record<string, string[]>>({});
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

  // ── Email availability ────────────────────────────────────────────────────
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  useEffect(() => {
    const e = email.trim().toLowerCase();
    if (!emailValid) { setEmailTaken(false); setEmailChecking(false); return; }
    setEmailChecking(true);
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      try {
        const { data } = await authAPI.checkEmail(e);
        setEmailTaken(data.valid && !data.available);
      } catch { setEmailTaken(false); }
      finally { setEmailChecking(false); }
    }, 500);
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current); };
  }, [email, emailValid]);

  // ── Password strength: min 8 + at least one digit + one special char ───────
  const pwLongEnough = password.length >= 8;
  const pwHasDigit = /\d/.test(password);
  const pwHasSpecial = /[^A-Za-z0-9]/.test(password);
  const pwStrong = pwLongEnough && pwHasDigit && pwHasSpecial;

  // ── Profession search ─────────────────────────────────────────────────────
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
    }]);
    setProfSearch('');
    setProfResults([]);
    setShowProfDropdown(false);
    profInputRef.current?.focus();
  };

  const removeProfession = (id: string) => {
    setSelectedProfs(prev => prev.filter(p => p.professionId !== id));
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const step1Valid = firstName.trim().length > 0 && lastName.trim().length > 0 && !!birthDate && !nicknameTaken;

  const validate = (): boolean => {
    setError('');
    if (step === 0) {
      if (!emailValid) { setError('Укажите корректный email'); return false; }
      if (emailTaken) { setError('Этот email уже занят'); return false; }
      if (!pwLongEnough) { setError('Пароль — минимум 8 символов'); return false; }
      if (!pwHasDigit) { setError('Пароль должен содержать хотя бы одну цифру'); return false; }
      if (!pwHasSpecial) { setError('Пароль должен содержать спецсимвол (например ! @ # $)'); return false; }
    }
    if (step === 1) {
      if (!firstName.trim()) { setError('Укажите имя'); return false; }
      if (!lastName.trim()) { setError('Укажите фамилию'); return false; }
      if (!birthDate) { setError(birthDateInput.trim() ? 'Дата рождения — в формате ДД.ММ.ГГГГ' : 'Укажите дату рождения'); return false; }
      const birth = new Date(birthDate);
      if (isNaN(birth.getTime())) { setError('Некорректная дата рождения'); return false; }
      const age = (Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 16) { setError('Для регистрации необходимо быть старше 16 лет'); return false; }
      if (age > 120) { setError('Проверьте дату рождения'); return false; }
      if (nicknameTaken) { setError('Никнейм занят, введите другой'); return false; }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => { setError(''); setStep(s => s - 1); };

  // ── VK auth ───────────────────────────────────────────────────────────────
  const handleVkAuth = useCallback((vkUser: any, token: string, isNew?: boolean) => {
    setAuth(vkUser, token);
    localStorage.setItem('termsAgreed', '1');
    // Show the VK setup wizard for brand-new users AND for any VK account that
    // hasn't finished onboarding yet (e.g. created earlier but never completed).
    const needsSetup = isNew || !vkUser?.onboardingCompletedAt;
    navigate(needsSetup ? '/vk-setup' : '/');
  }, [setAuth, navigate]);
  const handleVkError = (msg: string) => { if (msg) setError(msg); };

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
      if (birthDate) payload.birthDate = new Date(birthDate).toISOString();
      if (nickname.trim()) payload.nickname = nickname.trim();
      if (city.trim()) payload.city = city.trim();
      if (country.trim()) payload.country = country.trim();
      const digits = unformatPhone(phone);
      if (digits.length >= 11) payload.phone = '+' + digits;
      if (referrerId) payload.referrerId = referrerId;
      if (refCode) payload.referralCode = refCode;
      if (artistInvite) payload.artistInviteToken = artistInvite;
      if (!skipProfs && selectedProfs.length > 0) {
        payload.userProfessions = selectedProfs.map(p => ({
          professionId: p.professionId,
          selectedCustomFilterValueIds: profFilterValues[p.professionId] || [],
        }));
      }

      const { data } = await authAPI.register(payload);
      if (data.pendingVerification) {
        setPendingEmail(data.email);
        startCooldown();
      } else {
        setAuth(data.user, data.token);
        navigate('/onboarding');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(typeof msg === 'string' ? msg : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingEmail || verifyCode.length < 8) return;
    setLoading(true);
    setVerifyError('');
    try {
      const { data } = await authAPI.verifyEmail(pendingEmail, verifyCode.trim());
      setAuth(data.user, data.token);
      // Hard navigation: bypasses React Router concurrent-mode race condition where
      // the router resolves the URL during Zustand state transition and ends up at '/'.
      window.location.href = '/onboarding';
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || 'Неверный код');
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendCooldown > 0) return;
    try {
      await authAPI.resendVerification(pendingEmail);
      startCooldown();
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setVerifyError(msg || 'Не удалось отправить код. Проверьте почту или попробуйте позже.');
    }
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

  // ── Logged-in visitor opened an artist invite link → confirm & join ─────────
  if (isAuthed && artistInvite) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">🎤</div>
          <h2 className="text-2xl font-bold text-white mb-2">Приглашение в артиста</h2>
          {artistInvitePreview ? (
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Вас приглашают присоединиться к{' '}
              <span className="text-white font-medium">{artistInvitePreview.artist.name}</span>
              {artistInvitePreview.roles?.length
                ? <> в роли <span className="text-white font-medium">{artistInvitePreview.roles.map(r => r.name).join(', ')}</span></>
                : null}.
            </p>
          ) : (
            <p className="text-slate-500 text-sm mb-6">Загрузка приглашения…</p>
          )}
          {acceptError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{acceptError}
            </div>
          )}
          <button onClick={handleAcceptInvite} disabled={accepting || !artistInvitePreview}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base mb-3">
            {accepting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Принять приглашение
          </button>
          <button onClick={() => navigate('/', { replace: true })}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Не сейчас
          </button>
        </div>
      </div>
    );
  }

  // ── Email verification screen ─────────────────────────────────────────────
  if (pendingEmail) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">📬</div>
            <h2 className="text-2xl font-bold text-white mb-2">Проверьте почту</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Мы отправили 8-значный код на<br />
              <span className="text-white font-medium">{pendingEmail}</span>
            </p>
          </div>
          <input
            type="text" inputMode="numeric" maxLength={8}
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
            placeholder="00000000" autoFocus
            className="w-full text-center text-3xl font-bold tracking-[8px] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white placeholder-slate-700 focus:outline-none focus:border-primary-500 mb-4"
          />
          {verifyError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{verifyError}
            </div>
          )}
          <button onClick={handleVerify} disabled={loading || verifyCode.length < 8}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base mb-3">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Подтвердить
          </button>
          <button onClick={handleResend} disabled={resendCooldown > 0}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors">
            {resendCooldown > 0 ? `Повторный код через ${resendCooldown} с` : 'Отправить код повторно'}
          </button>
          <p className="mt-4 text-center text-xs text-slate-600 leading-relaxed">
            Код не приходит?{' '}
            <a href="https://t.me/mooozahelpbot" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">Поддержка в Telegram</a>
            {' · '}
            <a href="mailto:support@moooza.ru" className="text-primary-400 hover:text-primary-300">support@moooza.ru</a>
          </p>
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
        {/* VK registration (temporarily disabled; flip SHOW_VK to restore) */}
        {SHOW_VK && (
          <>
            <VkLoginButton onAuth={handleVkAuth} onError={handleVkError} disabled={loading} />
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-xs text-slate-500 uppercase tracking-wide">или по email</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
          </>
        )}
        {refUsed && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            <span>Эта пригласительная ссылка уже использована. Вы можете зарегистрироваться, но она не будет засчитана пригласившему.</span>
          </div>
        )}
        {artistInvitePreview && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-primary-500/10 border border-primary-500/30 text-primary-200 text-xs leading-relaxed">
            <Check size={15} className="flex-shrink-0 mt-0.5 text-primary-400" />
            <span>
              Приглашение в артиста <b className="text-white">{artistInvitePreview.artist.name}</b>
              {artistInvitePreview.roles?.length ? <> в роли <b className="text-white">{artistInvitePreview.roles.map(r => r.name).join(', ')}</b></> : null}.
              После регистрации вы автоматически станете участником.
            </span>
          </div>
        )}
        <Field label="Email" hint="Используется для входа и восстановления пароля">
          <Input type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus
            right={emailChecking
              ? <Loader2 size={15} className="animate-spin text-slate-500" />
              : (emailValid && !emailTaken ? <Check size={15} className="text-green-400" /> : undefined)} />
          {email.trim() && !emailValid && <p className="text-xs text-amber-400 mt-1">Некорректный email</p>}
          {emailTaken && <p className="text-xs text-red-400 mt-1">Этот email уже занят — войдите или используйте другой</p>}
        </Field>
        <Field label="Пароль">
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
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {([['8+ символов', pwLongEnough], ['цифра', pwHasDigit], ['спецсимвол', pwHasSpecial]] as [string, boolean][]).map(([lbl, ok]) => (
              <span key={lbl} className={`text-[11px] flex items-center gap-1 ${ok ? 'text-green-400' : 'text-slate-500'}`}>
                {ok ? <Check size={11} /> : <span className="w-[10px] h-[10px] rounded-full border border-slate-600 inline-block" />}{lbl}
              </span>
            ))}
          </div>
        </Field>

        {/* Checkboxes */}
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${agreedToPD ? 'bg-primary-600 border-primary-600' : 'border-slate-600 group-hover:border-slate-500'}`}
              onClick={() => setAgreedToPD(v => !v)}>
              {agreedToPD && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className="text-xs text-slate-400 leading-relaxed">
              Я даю согласие на обработку{' '}
              <a href="/privacy" className="text-primary-400 hover:text-primary-300 underline" onClick={e => e.stopPropagation()}>персональных данных</a>
              {' '}и принимаю{' '}
              <a href="/terms" className="text-primary-400 hover:text-primary-300 underline" onClick={e => e.stopPropagation()}>пользовательское соглашение</a>
              {' '}<span className="text-red-400">*</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${agreeMarketing ? 'bg-primary-600 border-primary-600' : 'border-slate-600 group-hover:border-slate-500'}`}
              onClick={() => setAgreeMarketing(v => !v)}>
              {agreeMarketing && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <span className="text-xs text-slate-500 leading-relaxed">
              Я согласен получать рекламные рассылки и новости платформы
            </span>
          </label>
          <p className="text-[11px] text-slate-600">Регистрация доступна с 16 лет. Финансовые операции — с 18 лет.</p>
        </div>
      </div>
    );

    // Step 1 — Name & Nickname
    if (step === 1) return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Имя" required>
            <Input value={firstName} onChange={setFirstName} placeholder="Иван" autoFocus maxLength={20} />
          </Field>
          <Field label="Фамилия" required>
            <Input value={lastName} onChange={setLastName} placeholder="Иванов" maxLength={30} />
          </Field>
        </div>
        <Field label="Никнейм" hint="Необязательно — короткое имя для поиска">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">@</span>
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
              {nicknameChecking && nickname.trim().length >= 2 && <Loader2 size={15} className="animate-spin text-slate-500" />}
              {!nicknameChecking && nickname.trim().length >= 2 && !nicknameTaken && <Check size={15} className="text-emerald-400" />}
              {!nicknameChecking && nicknameTaken && <X size={15} className="text-red-400" />}
            </div>
          </div>
          {nicknameTaken && <p className="text-xs text-red-400 mt-1">Никнейм занят, введите другой</p>}
        </Field>
        <Field label="Дата рождения" required hint="Необходима для подтверждения возраста (от 16 лет)">
          <input
            type="text"
            inputMode="numeric"
            placeholder="ДД.ММ.ГГГГ"
            maxLength={10}
            value={birthDateInput}
            onChange={e => {
              let v = e.target.value.replace(/\D/g, '');
              if (v.length >= 3) v = v.slice(0, 2) + '.' + v.slice(2);
              if (v.length >= 6) v = v.slice(0, 5) + '.' + v.slice(5);
              v = v.slice(0, 10);
              setBirthDateInput(v);
              setBirthDate(v.length === 10 ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}` : '');
            }}
            className="w-full min-w-0 px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
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
              className="flex-1 min-w-0 bg-transparent text-white text-sm placeholder-slate-500 focus:outline-none"
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
              <div key={prof.professionId} className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white font-medium">{prof.professionName}</span>
                  <button onClick={() => removeProfession(prof.professionId)} className="text-slate-500 hover:text-red-400 transition-colors ml-auto">
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
        <Field label="Город">
          <CityPicker city={city} country={country} onChange={(c, co) => { setCity(c); setCountry(co); }} />
        </Field>
        <Field label="Телефон" hint="Необязательно — для связи с коллегами">
          <Input type="tel" value={phone} onChange={v => setPhone(formatPhone(v))} placeholder="+7 (___) ___ __ __" />
        </Field>
      </div>
    );
  };

  // Button logic
  const nextDisabled =
    (step === 0 && (!agreedToPD || !emailValid || emailTaken || emailChecking || !pwStrong)) ||
    (step === 1 && !step1Valid);

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
              {selectedProfs.length === 0 && (
                <p className="text-center text-xs text-slate-500">Выберите хотя бы одну профессию, чтобы продолжить</p>
              )}
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

        </div>
      </div>
    </div>
  );
}
