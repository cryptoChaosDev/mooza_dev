import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Phone, Mail, User, Lock, Eye, EyeOff, AlertCircle, Loader2,
  Check, Globe, ChevronRight, ChevronLeft, UserCircle, Mic2,
} from 'lucide-react';
import { authAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface FormData {
  email: string;
  password: string;
  passwordConfirm: string;
  firstName: string;
  lastName: string;
  nickname: string;
  country: string;
  city: string;
  phone: string;
}

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

const STEPS = [
  {
    icon: Lock,
    title: 'Создайте аккаунт',
    sub: 'Займёт меньше минуты. Email и пароль — и вы внутри.',
    color: 'from-primary-500 to-purple-600',
  },
  {
    icon: UserCircle,
    title: 'Как вас зовут?',
    sub: 'Другие участники будут видеть ваше имя в профиле.',
    color: 'from-purple-500 to-pink-600',
  },
  {
    icon: MapPin,
    title: 'Где вы находитесь?',
    sub: 'Помогает находить коллег рядом. Можно пропустить.',
    color: 'from-blue-500 to-cyan-600',
  },
];

const TOTAL_STEPS = STEPS.length;

function InputField({
  icon: Icon, type = 'text', value, onChange, placeholder, right, autoFocus,
}: {
  icon: any; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; right?: React.ReactNode; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus}
        className="w-full pl-10 pr-10 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/40 transition-all text-sm"
      />
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
      {children}
      {optional && <span className="normal-case font-normal text-slate-600 tracking-normal">(необязательно)</span>}
    </label>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    email: '', password: '', passwordConfirm: '',
    firstName: '', lastName: '', nickname: '',
    country: '', city: '', phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const set = (field: keyof FormData) => (v: string) =>
    setFormData(p => ({ ...p, [field]: v }));

  const detectLocation = useCallback(() => {
    setGeoLoading(true);
    if (!('geolocation' in navigator)) { setGeoLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ru`
          );
          const data = await res.json();
          if (data.address) {
            setFormData(prev => ({
              ...prev,
              country: data.address.country || '',
              city: data.address.city || data.address.town || data.address.village || '',
            }));
          }
        } finally { setGeoLoading(false); }
      },
      () => setGeoLoading(false),
      { timeout: 10000 }
    );
  }, []);

  const validate = (): boolean => {
    setError('');
    if (step === 1) {
      if (!formData.email) { setError('Укажите email'); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setError('Некорректный email'); return false; }
      if (!formData.password || formData.password.length < 6) { setError('Пароль — минимум 6 символов'); return false; }
      if (formData.password !== formData.passwordConfirm) { setError('Пароли не совпадают'); return false; }
    }
    if (step === 2) {
      if (!formData.firstName.trim()) { setError('Укажите имя'); return false; }
      if (!formData.lastName.trim()) { setError('Укажите фамилию'); return false; }
    }
    return true;
  };

  const next = () => { if (validate()) setStep(s => Math.min(s + 1, TOTAL_STEPS)); };
  const prev = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
      };
      if (formData.nickname.trim()) payload.nickname = formData.nickname.trim();
      if (formData.phone) {
        const d = unformatPhone(formData.phone);
        if (d.length >= 11) payload.phone = '+' + d;
      }
      if (formData.country) payload.country = formData.country;
      if (formData.city) payload.city = formData.city;

      const { data } = await authAPI.register(payload);
      setAuth(data.user, data.token);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(typeof msg === 'string' ? msg : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const stepInfo = STEPS[step - 1];
  const StepIcon = stepInfo.icon;
  const progress = (step / TOTAL_STEPS) * 100;

  const renderContent = () => {
    switch (step) {
      case 1: return (
        <div className="space-y-3">
          <div>
            <FieldLabel>Email</FieldLabel>
            <InputField icon={Mail} type="email" value={formData.email} onChange={set('email')} placeholder="you@example.com" autoFocus />
          </div>
          <div>
            <FieldLabel>Пароль</FieldLabel>
            <InputField
              icon={Lock} type={showPassword ? 'text' : 'password'}
              value={formData.password} onChange={set('password')}
              placeholder="Минимум 6 символов"
              right={
                <button type="button" onClick={() => setShowPassword(p => !p)} className="text-slate-400 hover:text-slate-300">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>
          <div>
            <FieldLabel>Повтор пароля</FieldLabel>
            <InputField
              icon={Lock} type={showConfirm ? 'text' : 'password'}
              value={formData.passwordConfirm} onChange={set('passwordConfirm')}
              placeholder="Повторите пароль"
              right={
                <button type="button" onClick={() => setShowConfirm(p => !p)} className="text-slate-400 hover:text-slate-300">
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>
        </div>
      );

      case 2: return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Имя</FieldLabel>
              <InputField icon={User} value={formData.firstName} onChange={set('firstName')} placeholder="Иван" autoFocus />
            </div>
            <div>
              <FieldLabel>Фамилия</FieldLabel>
              <InputField icon={User} value={formData.lastName} onChange={set('lastName')} placeholder="Иванов" />
            </div>
          </div>
          <div>
            <FieldLabel optional>Никнейм</FieldLabel>
            <InputField icon={Mic2} value={formData.nickname} onChange={set('nickname')} placeholder="@username" />
          </div>
        </div>
      );

      case 3: return (
        <div className="space-y-3">
          <button
            type="button" onClick={detectLocation} disabled={geoLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-500/10 border border-primary-500/30 hover:bg-primary-500/15 text-primary-300 rounded-xl text-sm transition-all"
          >
            {geoLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            {geoLoading ? 'Определяем...' : 'Определить автоматически'}
          </button>
          <div>
            <FieldLabel optional>Страна</FieldLabel>
            <InputField icon={MapPin} value={formData.country} onChange={set('country')} placeholder="Россия" />
          </div>
          <div>
            <FieldLabel optional>Город</FieldLabel>
            <InputField icon={MapPin} value={formData.city} onChange={set('city')} placeholder="Москва" />
          </div>
          <div>
            <FieldLabel optional>Телефон</FieldLabel>
            <InputField
              icon={Phone} type="tel"
              value={formData.phone}
              onChange={v => set('phone')(formatPhone(v))}
              placeholder="+7 (___) ___ __ __"
            />
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Progress bar */}
        <div className="h-1 bg-slate-800 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/60 rounded-2xl overflow-hidden shadow-2xl">

          {/* Step header */}
          <div className={`bg-gradient-to-r ${stepInfo.color} p-5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                  <StepIcon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/70 text-xs font-medium">Шаг {step} из {TOTAL_STEPS}</p>
                  <h2 className="text-white font-bold text-base leading-tight">{stepInfo.title}</h2>
                </div>
              </div>
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <div key={i} className={`rounded-full transition-all ${i + 1 === step ? 'w-4 h-2 bg-white' : i + 1 < step ? 'w-2 h-2 bg-white/60' : 'w-2 h-2 bg-white/25'}`} />
                ))}
              </div>
            </div>
            <p className="text-white/70 text-xs mt-2">{stepInfo.sub}</p>
          </div>

          {/* Content */}
          <div className="p-5">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
                <AlertCircle size={15} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="min-h-[200px]">
              {renderContent()}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800/60">
              {step > 1 ? (
                <button type="button" onClick={prev}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800/60 transition-all text-sm">
                  <ChevronLeft size={16} /> Назад
                </button>
              ) : (
                <Link to="/login" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                  Уже есть аккаунт
                </Link>
              )}

              {step < TOTAL_STEPS ? (
                <button type="button" onClick={next}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-primary-900/30">
                  Далее <ChevronRight size={16} />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {loading ? 'Создаём...' : 'Создать аккаунт'}
                </button>
              )}
            </div>
          </div>
        </div>

        {step === 3 && (
          <p className="text-center text-slate-600 text-xs mt-3">
            Местоположение можно заполнить позже в профиле
          </p>
        )}
      </div>
    </div>
  );
}
