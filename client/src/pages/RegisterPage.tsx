import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Phone, Mail, User, Lock, Eye, EyeOff, AlertCircle, Loader2,
  Briefcase, Check, Search, Globe, Star, Building2, Music,
  ChevronRight, ChevronLeft, UserCircle, Mic2,
} from 'lucide-react';
import { authAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface ProfessionEntry {
  professionId: string;
  professionName: string;
  fieldName: string;
  features: string[];
}

interface FormData {
  country: string;
  city: string;
  phone: string;
  email: string;
  lastName: string;
  firstName: string;
  nickname: string;
  fieldOfActivityId: string;
  fieldOfActivityName: string;
  directionId: string;
  directionName: string;
  userProfessions: ProfessionEntry[];
  artistIds: string[];
  artistNames: string[];
  employerId: string;
  employerName: string;
  password: string;
  passwordConfirm: string;
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
  {
    icon: Briefcase,
    title: 'Ваша профессия',
    sub: 'Укажите сферу — вас начнут находить нужные люди.',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    icon: Music,
    title: 'Ваши профессии',
    sub: 'Добавьте профессии в своей сфере. Чем точнее — тем лучше.',
    color: 'from-orange-500 to-amber-600',
  },
  {
    icon: Star,
    title: 'Связи и вдохновение',
    sub: 'Укажите артистов и работодателя — это подчёркивает ваш опыт.',
    color: 'from-pink-500 to-rose-600',
  },
];

const TOTAL_STEPS = STEPS.length;

function Input({
  icon: Icon, type = 'text', value, onChange, placeholder, right, autoFocus,
}: {
  icon: any; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; right?: React.ReactNode; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full pl-10 pr-10 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/40 transition-all text-sm"
      />
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
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
    country: '', city: '', phone: '', email: '',
    lastName: '', firstName: '', nickname: '',
    fieldOfActivityId: '', fieldOfActivityName: '',
    directionId: '', directionName: '',
    userProfessions: [], artistIds: [], artistNames: [],
    employerId: '', employerName: '', password: '', passwordConfirm: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [directions, setDirections] = useState<any[]>([]);
  const [professions, setProfessions] = useState<any[]>([]);
  const [professionFeatures, setProfessionFeatures] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [employers, setEmployers] = useState<any[]>([]);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchEmployer, setSearchEmployer] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    referenceAPI.getFieldsOfActivity().then(r => setFieldsOfActivity(r.data));
    referenceAPI.getProfessionFeatures().then(r => setProfessionFeatures(r.data));
  }, []);

  useEffect(() => {
    if (formData.fieldOfActivityId) {
      referenceAPI.getDirections({ fieldOfActivityId: formData.fieldOfActivityId })
        .then(r => setDirections(r.data));
      setFormData(prev => ({ ...prev, directionId: '', directionName: '', userProfessions: [] }));
      setProfessions([]);
    }
  }, [formData.fieldOfActivityId]);

  useEffect(() => {
    if (formData.directionId) {
      referenceAPI.getProfessions({ directionId: formData.directionId })
        .then(r => setProfessions(r.data));
    }
  }, [formData.directionId]);

  useEffect(() => {
    referenceAPI.getArtists({ search: searchArtist }).then(r => setArtists(r.data));
  }, [searchArtist]);

  useEffect(() => {
    referenceAPI.getEmployers({ search: searchEmployer }).then(r => setEmployers(r.data));
  }, [searchEmployer]);

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
      if (formData.fieldOfActivityId) payload.fieldOfActivityId = formData.fieldOfActivityId;
      if (formData.userProfessions.length > 0)
        payload.userProfessions = formData.userProfessions.map(up => ({ professionId: up.professionId, features: up.features }));
      if (formData.artistIds.length > 0) payload.artistIds = formData.artistIds;
      if (formData.employerId) payload.employerId = formData.employerId;

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

  const toggleProfession = (prof: any) => {
    setFormData(prev => {
      const exists = prev.userProfessions.find(up => up.professionId === prof.id);
      if (exists) return { ...prev, userProfessions: prev.userProfessions.filter(up => up.professionId !== prof.id) };
      return { ...prev, userProfessions: [...prev.userProfessions, { professionId: prof.id, professionName: prof.name, fieldName: '', features: [] }] };
    });
  };

  const toggleFeature = (professionId: string, featureName: string) => {
    setFormData(prev => ({
      ...prev,
      userProfessions: prev.userProfessions.map(up => {
        if (up.professionId !== professionId) return up;
        const has = up.features.includes(featureName);
        return { ...up, features: has ? up.features.filter(f => f !== featureName) : [...up.features, featureName] };
      }),
    }));
  };

  const toggleArtist = (artist: any) => {
    setFormData(prev => {
      const idx = prev.artistIds.indexOf(artist.id);
      if (idx >= 0) return { ...prev, artistIds: prev.artistIds.filter(id => id !== artist.id), artistNames: prev.artistNames.filter((_, i) => i !== idx) };
      return { ...prev, artistIds: [...prev.artistIds, artist.id], artistNames: [...prev.artistNames, artist.name] };
    });
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
      active
        ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:border-slate-600'
    }`;

  const stepInfo = STEPS[step - 1];
  const StepIcon = stepInfo.icon;
  const progress = (step / TOTAL_STEPS) * 100;

  const renderContent = () => {
    switch (step) {
      /* ── 1: Account ── */
      case 1: return (
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input icon={Mail} type="email" value={formData.email} onChange={v => setFormData(p => ({ ...p, email: v }))} placeholder="you@example.com" autoFocus />
          </div>
          <div>
            <Label>Пароль</Label>
            <Input
              icon={Lock} type={showPassword ? 'text' : 'password'}
              value={formData.password} onChange={v => setFormData(p => ({ ...p, password: v }))}
              placeholder="Минимум 6 символов"
              right={
                <button type="button" onClick={() => setShowPassword(p => !p)} className="text-slate-400 hover:text-slate-300">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>
          <div>
            <Label>Повтор пароля</Label>
            <Input
              icon={Lock} type={showConfirm ? 'text' : 'password'}
              value={formData.passwordConfirm} onChange={v => setFormData(p => ({ ...p, passwordConfirm: v }))}
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

      /* ── 2: Name ── */
      case 2: return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Имя</Label>
              <Input icon={User} value={formData.firstName} onChange={v => setFormData(p => ({ ...p, firstName: v }))} placeholder="Иван" autoFocus />
            </div>
            <div>
              <Label>Фамилия</Label>
              <Input icon={User} value={formData.lastName} onChange={v => setFormData(p => ({ ...p, lastName: v }))} placeholder="Иванов" />
            </div>
          </div>
          <div>
            <Label optional>Никнейм</Label>
            <Input icon={Mic2} value={formData.nickname} onChange={v => setFormData(p => ({ ...p, nickname: v }))} placeholder="@username" />
          </div>
        </div>
      );

      /* ── 3: Location ── */
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
            <Label optional>Страна</Label>
            <Input icon={MapPin} value={formData.country} onChange={v => setFormData(p => ({ ...p, country: v }))} placeholder="Россия" />
          </div>
          <div>
            <Label optional>Город</Label>
            <Input icon={MapPin} value={formData.city} onChange={v => setFormData(p => ({ ...p, city: v }))} placeholder="Москва" />
          </div>
          <div>
            <Label optional>Телефон</Label>
            <Input
              icon={Phone} type="tel"
              value={formData.phone}
              onChange={v => setFormData(p => ({ ...p, phone: formatPhone(v) }))}
              placeholder="+7 (___) ___ __ __"
            />
          </div>
        </div>
      );

      /* ── 4: Field / Direction ── */
      case 4: return (
        <div className="space-y-4">
          <div>
            <Label>Сфера деятельности</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {fieldsOfActivity.map(f => (
                <button key={f.id} type="button" onClick={() => setFormData(p => ({ ...p, fieldOfActivityId: f.id, fieldOfActivityName: f.name }))}
                  className={chip(formData.fieldOfActivityId === f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          {directions.length > 0 && (
            <div>
              <Label>Направление</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {directions.map(d => (
                  <button key={d.id} type="button" onClick={() => setFormData(p => ({ ...p, directionId: d.id, directionName: d.name }))}
                    className={chip(formData.directionId === d.id)}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );

      /* ── 5: Professions ── */
      case 5: return (
        <div className="space-y-3">
          {professions.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {professions.map(p => {
                  const active = !!formData.userProfessions.find(up => up.professionId === p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProfession(p)}
                      className={chip(active)}>
                      {active && <Check size={11} className="inline mr-1" />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {formData.userProfessions.length > 0 && professionFeatures.length > 0 && (
                <div className="space-y-3 pt-1">
                  {formData.userProfessions.map(up => (
                    <div key={up.professionId}>
                      <p className="text-xs text-slate-400 mb-1.5">Особенности <span className="text-primary-400">{up.professionName}</span></p>
                      <div className="flex flex-wrap gap-1.5">
                        {professionFeatures.map(f => (
                          <button key={f.id} type="button" onClick={() => toggleFeature(up.professionId, f.name)}
                            className={chip(up.features.includes(f.name))}>
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500 text-sm text-center py-4">
              {formData.fieldOfActivityId ? 'Выберите направление на предыдущем шаге' : 'Сначала выберите сферу деятельности'}
            </p>
          )}
        </div>
      );

      /* ── 6: Artist / Employer ── */
      case 6: return (
        <div className="space-y-4">
          <div>
            <Label optional>Артист / группа</Label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" value={searchArtist} onChange={e => setSearchArtist(e.target.value)}
                placeholder="Поиск артиста..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60 text-sm"
              />
            </div>
            {formData.artistNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.artistNames.map((name, i) => (
                  <span key={i} className="px-2.5 py-1 bg-primary-500/20 border border-primary-500/40 text-primary-300 rounded-lg text-xs">
                    <Star size={10} className="inline mr-1" />{name}
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-28 overflow-y-auto space-y-1">
              {artists.slice(0, 10).map(a => (
                <button key={a.id} type="button" onClick={() => toggleArtist(a)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${formData.artistIds.includes(a.id) ? 'bg-primary-500/15 text-primary-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {formData.artistIds.includes(a.id) && <Check size={12} className="inline mr-1.5 text-primary-400" />}
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label optional>Работодатель</Label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" value={searchEmployer} onChange={e => setSearchEmployer(e.target.value)}
                placeholder="Поиск работодателя..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/60 text-sm"
              />
            </div>
            {formData.employerName && (
              <div className="mb-2">
                <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs">
                  <Building2 size={10} className="inline mr-1" />{formData.employerName}
                </span>
              </div>
            )}
            <div className="max-h-28 overflow-y-auto space-y-1">
              {employers.slice(0, 10).map(e => (
                <button key={e.id} type="button"
                  onClick={() => setFormData(p => ({ ...p, employerId: e.id, employerName: e.name }))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${formData.employerId === e.id ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {formData.employerId === e.id && <Check size={12} className="inline mr-1.5 text-emerald-400" />}
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      {/* ambient */}
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
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <StepIcon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white/70 text-xs font-medium">Шаг {step} из {TOTAL_STEPS}</p>
                  <h2 className="text-white font-bold text-base leading-tight">{stepInfo.title}</h2>
                </div>
              </div>
              {/* step dots */}
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
            {/* Error */}
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

        {/* Skip hint for optional steps */}
        {(step === 3 || step === 5 || step === 6) && (
          <p className="text-center text-slate-600 text-xs mt-3">
            Этот шаг можно заполнить позже в профиле
          </p>
        )}
      </div>
    </div>
  );
}
