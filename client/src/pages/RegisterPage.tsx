import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, AlertCircle, Loader2,
  Check, Globe, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { authAPI } from '../lib/api';
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

// ── input ─────────────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">{label}</label>
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

// ── step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    emoji: '👋',
    title: 'Добро пожаловать\nв Moooza',
    why: 'Moooza — это сеть для музыкантов. Email и пароль нужны, чтобы войти с любого устройства и защитить ваш аккаунт.',
    optional: false,
  },
  {
    emoji: '🎵',
    title: 'Как вас зовут?',
    why: 'Ваше имя видят другие участники, когда ищут коллег, получают приглашение в группу или смотрят ваш профиль.',
    optional: false,
  },
  {
    emoji: '📍',
    title: 'Где вы\nнаходитесь?',
    why: 'Город помогает найти музыкантов поблизости и появиться в локальных поисках. Можно заполнить позже.',
    optional: true,
  },
];

// ── main component ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState(0); // 0-based
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  // email verification
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const t = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
  };

  const validate = (): boolean => {
    setError('');
    if (step === 0) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Укажите корректный email'); return false; }
      if (password.length < 8) { setError('Пароль — минимум 8 символов'); return false; }
    }
    if (step === 1) {
      if (!firstName.trim()) { setError('Укажите имя'); return false; }
      if (!lastName.trim()) { setError('Укажите фамилию'); return false; }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => { setError(''); setStep(s => s - 1); };

  const handleSubmit = async () => {
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
    } finally {
      setLoading(false);
    }
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
            placeholder="000000"
            autoFocus
            className="w-full text-center text-4xl font-bold tracking-[18px] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white placeholder-slate-700 focus:outline-none focus:border-primary-500 mb-4"
          />

          {verifyError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{verifyError}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || verifyCode.length < 6}
            className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base mb-3"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Подтвердить
          </button>

          <button
            onClick={handleResend} disabled={resendCooldown > 0}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
          >
            {resendCooldown > 0 ? `Повторный код через ${resendCooldown} с` : 'Отправить код повторно'}
          </button>
        </div>
      </div>
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────
  const stepDef = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const stepContent = () => {
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

    if (step === 1) return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Имя">
            <Input value={firstName} onChange={setFirstName} placeholder="Иван" autoFocus />
          </Field>
          <Field label="Фамилия">
            <Input value={lastName} onChange={setLastName} placeholder="Иванов" />
          </Field>
        </div>
        <Field label="Никнейм" hint="Необязательно — короткое имя для поиска">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">@</span>
            <input
              value={nickname} onChange={e => setNickname(e.target.value)}
              placeholder="username"
              className="w-full pl-8 pr-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm"
            />
          </div>
        </Field>
      </div>
    );

    if (step === 2) return (
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
          <Input
            type="tel" value={phone}
            onChange={v => setPhone(formatPhone(v))}
            placeholder="+7 (___) ___ __ __"
          />
        </Field>
      </div>
    );
  };

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
          <Link to="/login" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            Войти
          </Link>
        )}
        {/* step dots */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? 'w-5 h-2 bg-primary-500' :
                i < step ? 'w-2 h-2 bg-primary-500/50' :
                'w-2 h-2 bg-slate-700'
              }`}
            />
          ))}
        </div>
        <div className="w-9" />
      </div>

      {/* content */}
      <div className="flex-1 flex flex-col px-5 pt-6 pb-8 overflow-y-auto">

        {/* hero */}
        <div className="mb-8">
          <div className="text-4xl mb-3">{stepDef.emoji}</div>
          <h1 className="text-2xl font-bold text-white leading-tight whitespace-pre-line mb-3">
            {stepDef.title}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            {stepDef.why}
          </p>
        </div>

        {/* form */}
        <div className="flex-1">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{error}
            </div>
          )}
          {stepContent()}
        </div>

        {/* action */}
        <div className="mt-8 space-y-3">
          {isLast ? (
            <>
              <button
                onClick={handleSubmit} disabled={loading}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Создаём аккаунт...' : 'Создать аккаунт'}
              </button>
              <button
                onClick={handleSubmit} disabled={loading}
                className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Пропустить и создать
              </button>
            </>
          ) : (
            <button
              onClick={next}
              className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors text-base"
            >
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
