import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Phone, Mail, User, Lock, Eye, EyeOff, AlertCircle, Loader2,
  Briefcase, ChevronLeft, ChevronRight, Check, Search, X, Globe, Star, Building2, Music
} from 'lucide-react';
import { authAPI, referenceAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

const TOTAL_STEPS = 7;

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

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8 overflow-x-auto py-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center flex-shrink-0">
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all duration-300 ${
              i + 1 < current
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                : i + 1 === current
                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30 scale-110'
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            {i + 1 < current ? <Check size={14} className="sm:w-4 sm:h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-4 sm:w-6 h-0.5 mx-1 sm:mx-2 transition-all duration-300 ${
              i + 1 < current ? 'bg-green-500' : 'bg-slate-700'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

const STEP_TITLES = [
  'Местоположение',
  'Контакты',
  'Личные данные',
  'Сфера деятельности',
  'Мои профессии',
  'Артист и работодатель',
  'Проверка и пароль',
];

const STEP_DESCRIPTIONS = [
  'Укажите вашу страну и город',
  'Телефон и электронная почта',
  'Как к вам обращаться',
  'Выберите вашу основную сферу',
  'Добавьте профессии и особенности',
  'Укажите артиста/группу и работодателя',
  'Проверьте данные и создайте пароль',
];

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    country: '',
    city: '',
    phone: '',
    email: '',
    lastName: '',
    firstName: '',
    nickname: '',
    fieldOfActivityId: '',
    fieldOfActivityName: '',
    userProfessions: [],
    artistIds: [],
    artistNames: [],
    employerId: '',
    employerName: '',
    password: '',
    passwordConfirm: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [fieldsOfActivity, setFieldsOfActivity] = useState<any[]>([]);
  const [professions, setProfessions] = useState<any[]>([]);
  const [professionFeatures, setProfessionFeatures] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [employers, setEmployers] = useState<any[]>([]);
  const [searchArtist, setSearchArtist] = useState('');
  const [searchEmployer, setSearchEmployer] = useState('');
  const [searchProfession, setSearchProfession] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  useEffect(() => {
    referenceAPI.getFieldsOfActivity().then(r => setFieldsOfActivity(r.data));
    referenceAPI.getProfessionFeatures().then(r => setProfessionFeatures(r.data));
  }, []);

  useEffect(() => {
    if (formData.fieldOfActivityId) {
      referenceAPI.getProfessions({ fieldOfActivityId: formData.fieldOfActivityId })
        .then(r => setProfessions(r.data));
    }
  }, [formData.fieldOfActivityId]);

  useEffect(() => {
    referenceAPI.getArtists({ search: searchArtist }).then(r => setArtists(r.data));
  }, [searchArtist]);

  useEffect(() => {
    referenceAPI.getEmployers({ search: searchEmployer }).then(r => setEmployers(r.data));
  }, [searchEmployer]);

  const detectLocation = useCallback(() => {
    setGeoLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ru`
            );
            const data = await response.json();
            if (data.address) {
              setFormData(prev => ({
                ...prev,
                country: data.address.country || '',
                city: data.address.city || data.address.town || data.address.village || '',
              }));
            }
          } catch {
          } finally {
            setGeoLoading(false);
          }
        },
        () => {
          setGeoLoading(false);
        },
        { timeout: 10000 }
      );
    } else {
      setGeoLoading(false);
    }
  }, []);

  const validateStep = (): boolean => {
    setError('');
    switch (step) {
      case 1:
        return true;
      case 2:
        if (!formData.email) {
          setError('Укажите email');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setError('Некорректный email');
          return false;
        }
        return true;
      case 3:
        if (!formData.firstName.trim()) {
          setError('Укажите имя');
          return false;
        }
        if (!formData.lastName.trim()) {
          setError('Укажите фамилию');
          return false;
        }
        return true;
      case 4:
        return true;
      case 5:
        return true;
      case 6:
        return true;
      case 7:
        if (!formData.password || formData.password.length < 6) {
          setError('Пароль должен быть не менее 6 символов');
          return false;
        }
        if (formData.password !== formData.passwordConfirm) {
          setError('Пароли не совпадают');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(s => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const prevStep = () => {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
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
        const digits = unformatPhone(formData.phone);
        if (digits.length >= 11) payload.phone = '+' + digits;
      }
      if (formData.country) payload.country = formData.country;
      if (formData.city) payload.city = formData.city;
      if (formData.fieldOfActivityId) payload.fieldOfActivityId = formData.fieldOfActivityId;
      if (formData.userProfessions.length > 0) {
        payload.userProfessions = formData.userProfessions.map(up => ({
          professionId: up.professionId,
          features: up.features,
        }));
      }
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
      if (exists) {
        return {
          ...prev,
          userProfessions: prev.userProfessions.filter(up => up.professionId !== prof.id),
        };
      }
      return {
        ...prev,
        userProfessions: [
          ...prev.userProfessions,
          {
            professionId: prof.id,
            professionName: prof.name,
            fieldName: prof.fieldOfActivity?.name || '',
            features: [],
          },
        ],
      };
    });
  };

  const toggleFeature = (professionId: string, featureName: string) => {
    setFormData(prev => ({
      ...prev,
      userProfessions: prev.userProfessions.map(up => {
        if (up.professionId !== professionId) return up;
        const has = up.features.includes(featureName);
        return {
          ...up,
          features: has
            ? up.features.filter(f => f !== featureName)
            : [...up.features, featureName],
        };
      }),
    }));
  };

  const toggleArtist = (artist: any) => {
    setFormData(prev => {
      const idx = prev.artistIds.indexOf(artist.id);
      if (idx >= 0) {
        return {
          ...prev,
          artistIds: prev.artistIds.filter(id => id !== artist.id),
          artistNames: prev.artistNames.filter((_, i) => i !== idx),
        };
      }
      return {
        ...prev,
        artistIds: [...prev.artistIds, artist.id],
        artistNames: [...prev.artistNames, artist.name],
      };
    });
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 sm:space-y-5">
            <button
              type="button"
              onClick={detectLocation}
              disabled={geoLoading}
              className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 sm:py-3.5 bg-primary-500/10 border border-primary-500/30 hover:border-primary-500/50 text-primary-300 rounded-xl transition-all hover:bg-primary-500/20 text-sm sm:text-base"
            >
              {geoLoading ? (
                <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
              ) : (
                <Globe size={18} className="sm:w-5 sm:h-5" />
              )}
              {geoLoading ? 'Определяем...' : 'Определить автоматически'}
            </button>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Страна</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Россия"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Город</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Москва"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Телефон</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    const formatted = formatPhone(e.target.value);
                    setFormData({ ...formData, phone: formatted });
                  }}
                  placeholder="+7 (___) ___ __ __"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                  required
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Фамилия <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Иванов"
                  autoComplete="family-name"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Имя <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Иван"
                  autoComplete="given-name"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Никнейм <span className="text-slate-500">(необязательно)</span>
              </label>
              <div className="relative">
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  placeholder="nickname"
                  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-3 sm:space-y-4">
            <p className="text-sm text-slate-400 mb-2">Выберите вашу основную сферу деятельности:</p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
              {fieldsOfActivity.map((field: any) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    fieldOfActivityId: formData.fieldOfActivityId === field.id ? '' : field.id,
                    fieldOfActivityName: formData.fieldOfActivityId === field.id ? '' : field.name,
                    userProfessions: formData.fieldOfActivityId === field.id ? [] : formData.userProfessions,
                  })}
                  className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 rounded-xl border transition-all text-left ${
                    formData.fieldOfActivityId === field.id
                      ? 'bg-primary-500/20 border-primary-500/50 text-primary-300 shadow-lg shadow-primary-500/10'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600/50'
                  }`}
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    formData.fieldOfActivityId === field.id
                      ? 'bg-primary-500/30'
                      : 'bg-slate-700/50'
                  }`}>
                    <Briefcase className={formData.fieldOfActivityId === field.id ? 'text-primary-400 w-5 h-5 sm:w-[22px] sm:h-[22px]' : 'text-slate-400 w-5 h-5 sm:w-[22px] sm:h-[22px]'} />
                  </div>
                  <span className="font-medium text-sm sm:text-base">{field.name}</span>
                  {formData.fieldOfActivityId === field.id && (
                    <Check className="ml-auto text-primary-400 w-5 h-5 sm:w-[22px] sm:h-[22px] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            {!formData.fieldOfActivityId ? (
              <div className="text-center py-8 text-slate-400">
                <Briefcase className="mx-auto mb-3 opacity-50 w-10 h-10 sm:w-12 sm:h-12" />
                <p className="text-sm sm:text-base">Сначала выберите сферу деятельности на предыдущем шаге</p>
                <button
                  type="button"
                  onClick={prevStep}
                  className="mt-3 text-primary-400 hover:text-primary-300 text-sm font-medium"
                >
                  Вернуться назад
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={searchProfession}
                    onChange={(e) => setSearchProfession(e.target.value)}
                    placeholder="Поиск профессии..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm"
                  />
                </div>

                <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto pr-1">
                  {professions
                    .filter((p: any) => !searchProfession || p.name.toLowerCase().includes(searchProfession.toLowerCase()))
                    .map((prof: any) => {
                      const selected = formData.userProfessions.find(up => up.professionId === prof.id);
                      return (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => toggleProfession(prof)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                            selected
                              ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
                              : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                            selected ? 'bg-primary-500 border-primary-500' : 'border-slate-500'
                          }`}>
                            {selected && <Check size={14} className="text-white" />}
                          </div>
                          <span className="text-sm font-medium">{prof.name}</span>
                        </button>
                      );
                    })}
                </div>

                {formData.userProfessions.length > 0 && (
                  <div className="mt-4 space-y-4">
                    <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Star size={16} className="text-primary-400" />
                      Особенности профессий
                    </h4>
                    {formData.userProfessions.map(up => (
                      <div key={up.professionId} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                        <p className="text-sm font-medium text-white mb-3">{up.professionName}</p>
                        <div className="flex flex-wrap gap-2">
                          {professionFeatures.map((feat: any) => {
                            const isSelected = up.features.includes(feat.name);
                            return (
                              <button
                                key={feat.id}
                                type="button"
                                onClick={() => toggleFeature(up.professionId, feat.name)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  isSelected
                                    ? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
                                    : 'bg-slate-700/50 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:bg-slate-600/50'
                                }`}
                              >
                                {feat.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 6:
        return (
          <div className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Music size={16} className="text-primary-400" />
                Мой артист / Моя группа
              </label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchArtist}
                  onChange={(e) => setSearchArtist(e.target.value)}
                  placeholder="Поиск артиста или группы..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              {formData.artistNames.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.artistNames.map((name, idx) => (
                    <span
                      key={formData.artistIds[idx]}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/20 text-primary-300 rounded-lg text-sm font-medium border border-primary-500/30"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => toggleArtist({ id: formData.artistIds[idx], name })}
                        className="hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1 max-h-36 sm:max-h-40 overflow-y-auto">
                {artists.map((artist: any) => {
                  const selected = formData.artistIds.includes(artist.id);
                  return (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => toggleArtist(artist)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-left text-sm ${
                        selected
                          ? 'bg-primary-500/15 text-primary-300'
                          : 'text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        selected ? 'bg-primary-500 border-primary-500' : 'border-slate-500'
                      }`}>
                        {selected && <Check size={14} className="text-white" />}
                      </div>
                      <span className="truncate">{artist.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Building2 size={16} className="text-primary-400" />
                Мой работодатель
              </label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchEmployer}
                  onChange={(e) => setSearchEmployer(e.target.value)}
                  placeholder="Поиск по названию, ИНН или ОГРН..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              {formData.employerName && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg text-sm font-medium border border-green-500/30">
                    {formData.employerName}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, employerId: '', employerName: '' })}
                      className="hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </span>
                </div>
              )}

              <div className="space-y-1 max-h-36 sm:max-h-40 overflow-y-auto">
                {employers.map((emp: any) => {
                  const selected = formData.employerId === emp.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        employerId: selected ? '' : emp.id,
                        employerName: selected ? '' : emp.name,
                      })}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg transition-all text-left text-sm ${
                        selected
                          ? 'bg-green-500/15 text-green-300'
                          : 'text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          selected ? 'bg-green-500 border-green-500' : 'border-slate-500'
                        }`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                        <span className="truncate">{emp.name}</span>
                      </div>
                      {emp.inn && (
                        <span className="text-xs text-slate-500 flex-shrink-0">ИНН: {emp.inn}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-4 sm:space-y-5">
            <div className="bg-slate-800/50 rounded-xl p-4 sm:p-5 border border-slate-700/30 space-y-3">
              <h4 className="text-sm font-bold text-white mb-3">Ваши данные</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {formData.country && (
                  <>
                    <span className="text-slate-400">Страна:</span>
                    <span className="text-white">{formData.country}</span>
                  </>
                )}
                {formData.city && (
                  <>
                    <span className="text-slate-400">Город:</span>
                    <span className="text-white">{formData.city}</span>
                  </>
                )}
                {formData.phone && (
                  <>
                    <span className="text-slate-400">Телефон:</span>
                    <span className="text-white">{formData.phone}</span>
                  </>
                )}
                <span className="text-slate-400">Email:</span>
                <span className="text-white">{formData.email}</span>
                <span className="text-slate-400">Фамилия:</span>
                <span className="text-white">{formData.lastName}</span>
                <span className="text-slate-400">Имя:</span>
                <span className="text-white">{formData.firstName}</span>
                {formData.nickname && (
                  <>
                    <span className="text-slate-400">Никнейм:</span>
                    <span className="text-white">{formData.nickname}</span>
                  </>
                )}
                {formData.fieldOfActivityName && (
                  <>
                    <span className="text-slate-400">Сфера:</span>
                    <span className="text-white">{formData.fieldOfActivityName}</span>
                  </>
                )}
                {formData.employerName && (
                  <>
                    <span className="text-slate-400">Работодатель:</span>
                    <span className="text-white">{formData.employerName}</span>
                  </>
                )}
              </div>

              {formData.userProfessions.length > 0 && (
                <div className="pt-2 border-t border-slate-600/30">
                  <p className="text-slate-400 text-sm mb-2">Профессии:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.userProfessions.map(up => (
                      <span key={up.professionId} className="px-2.5 py-1 bg-primary-500/20 text-primary-300 rounded-lg text-xs font-medium">
                        {up.professionName}
                        {up.features.length > 0 && (
                          <span className="text-primary-400/70"> ({up.features.join(', ')})</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {formData.artistNames.length > 0 && (
                <div className="pt-2 border-t border-slate-600/30">
                  <p className="text-slate-400 text-sm mb-2">Артисты/Группы:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.artistNames.map((name, i) => (
                      <span key={i} className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-xs font-medium">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-primary-400 hover:text-primary-300 mt-2 transition-colors"
              >
                Редактировать данные
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Пароль <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Минимум 6 символов"
                  autoComplete="new-password"
                  className="w-full pl-10 sm:pl-12 pr-12 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Подтверждение пароля <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type={showPasswordConfirm ? 'text' : 'password'}
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                  className="w-full pl-10 sm:pl-12 pr-12 py-3 sm:py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm sm:text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors p-1"
                >
                  {showPasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.password && formData.passwordConfirm && formData.password === formData.passwordConfirm && (
                <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                  <Check size={14} /> Пароли совпадают
                </p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 shadow-glow mb-3">
            <Music className="text-white w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1">Mooza</h1>
          <p className="text-slate-400 text-sm sm:text-base">Регистрация нового аккаунта</p>
        </div>

        <StepIndicator current={step} total={TOTAL_STEPS} />

        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-5 sm:p-6 md:p-8 border border-slate-800/50 shadow-xl">
          <div className="mb-5 sm:mb-6">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase text-primary-400 bg-primary-500/10 border border-primary-500/20 mb-2 sm:mb-3">
              Шаг {step} из {TOTAL_STEPS}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white">{STEP_TITLES[step - 1]}</h2>
            <p className="text-slate-400 text-sm mt-1">{STEP_DESCRIPTIONS[step - 1]}</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-4 flex items-center gap-2 text-sm animate-fade-in">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {renderStep()}

          <div className="flex items-center justify-between mt-6 sm:mt-8 gap-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded-xl transition-all text-sm font-medium"
              >
                <ChevronLeft size={18} />
                Назад
              </button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-400 hover:to-purple-400 text-white rounded-xl transition-all text-sm font-semibold shadow-lg shadow-primary-500/25"
              >
                Далее
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-xl transition-all text-sm font-semibold shadow-lg shadow-green-500/25 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Регистрация...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Зарегистрироваться
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-slate-500 text-sm">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
