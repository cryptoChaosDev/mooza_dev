import React, { useState } from "react";
import { InterestSelector } from "./InterestSelector";

function SocialLinkEdit({ label, icon, value, onChange, placeholder }: { label: string, icon: React.ReactNode, value: string, onChange: (v: string) => void, placeholder: string }) {
  const [input, setInput] = useState(value || "");
  React.useEffect(() => { setInput(value || ""); }, [value]);
  if (value) {
    return (
      <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
        <span className="text-xl">{icon}</span>
        <a href={value} target="_blank" rel="noopener noreferrer" className="flex-1 text-blue-400 underline text-sm truncate">{value}</a>
        <button className="text-red-500 text-xs px-2" onClick={() => onChange("")} title="Отвязать"><span style={{fontSize: '1.2em'}}>✖</span></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-dark-bg/60 rounded-xl px-3 py-2 shadow-inner">
      <span className="text-xl">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none text-base text-dark-text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
    </div>
  );
}

export function WelcomePage({ onFinish }: { onFinish: (profile: any) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    country: '',
    city: '',
    workPlace: '',
    skills: [] as string[],
    interests: [] as string[],
    portfolio: { text: '', fileUrl: undefined as string | undefined },
    phone: '',
    email: '',
    vk: '',
    youtube: '',
    telegram: '',
    avatarUrl: undefined as string | undefined,
  });
  const [errors, setErrors] = useState<any>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  // --- Соцсети: локальные состояния для input ---
  const [vkInput, setVkInput] = useState('');
  const [ytInput, setYtInput] = useState('');
  const [tgInput, setTgInput] = useState('');
  // Синхронизируем локальные input соцсетей с profile при открытии шага
  React.useEffect(() => {
    if (step === 9) {
      setVkInput(profile.vk || '');
      setYtInput(profile.youtube || '');
      setTgInput(profile.telegram || '');
    }
  }, [step]);

  // --- Валидация полей ---
  function validateField(field: string, value: any) {
    switch (field) {
      case 'firstName':
      case 'lastName':
        if (!value) return 'Обязательное поле';
        if (!/^[А-Яа-яA-Za-z\- ]{2,}$/.test(value)) return 'Только буквы, минимум 2 символа';
        return '';
      case 'country':
      case 'city':
        if (!value) return 'Обязательное поле';
        if (value.length < 2) return 'Минимум 2 символа';
        return '';
      case 'skills':
        if (!value || value.length < 1) return 'Выберите хотя бы 1 навык';
        return '';
      case 'interests':
        if (!value || value.length < 3) return 'Выберите хотя бы 3 интереса';
        return '';
      case 'portfolioText':
        if (value.length > 500) return 'Максимум 500 символов';
        return '';
      case 'phone':
        if (!value) return 'Обязательное поле';
        if (!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value)) return 'Формат: +7 (XXX) XXX-XX-XX';
        return '';
      case 'email':
        if (!value) return 'Обязательное поле';
        if (!/^\S+@\S+\.\S+$/.test(value)) return 'Некорректный email';
        return '';
      case 'vk':
      case 'youtube':
      case 'telegram':
        if (value && !/^https?:\/\//.test(value)) return 'Введите ссылку, начиная с https://';
        return '';
      default:
        return '';
    }
  }

  // --- Прогресс заполнения ---
  const fieldsToCheck = [
    { key: 'firstName', value: profile.firstName },
    { key: 'lastName', value: profile.lastName },
    { key: 'country', value: profile.country },
    { key: 'city', value: profile.city },
    { key: 'skills', value: profile.skills },
    { key: 'interests', value: profile.interests },
    { key: 'portfolioText', value: profile.portfolio.text },
    { key: 'phone', value: profile.phone },
    { key: 'email', value: profile.email },
  ];
  let validCount = 0;
  let filledCount = 0;
  fieldsToCheck.forEach(f => {
    if (f.value && !validateField(f.key, f.value)) validCount++;
    if (f.value && (Array.isArray(f.value) ? f.value.length > 0 : String(f.value).trim().length > 0)) filledCount++;
  });
  const progress = filledCount === 0 ? 0 : Math.round((validCount / fieldsToCheck.length) * 100);

  const steps = [
    'Приветствие',
    'Аватар',
    'Имя и фамилия',
    'Город и страна',
    'Место работы',
    'Навыки',
    'Интересы',
    'Портфолио',
    'Контакты',
    'Соцсети',
    'Готово',
  ];
  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));
  // --- UI ---
  // SVG-иконки соцсетей
  const VKIcon = (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2787F5"/><text x="7" y="16" fontSize="10" fill="#fff">VK</text></svg>
  );
  const TGIcon = (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><text x="5" y="16" fontSize="10" fill="#fff">TG</text></svg>
  );
  const YTIcon = (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" fill="#FF0000"/><polygon points="10,8 16,12 10,16" fill="#fff"/></svg>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-dark-bg via-dark-card to-dark-bg/80 animate-fade-in" style={{minHeight: '100dvh'}}>
      <div className="w-full max-w-md bg-dark-card rounded-2xl shadow-2xl p-8 flex flex-col gap-8 animate-fade-in animate-scale-in">
        {/* Прогресс-бар */}
        <div className="w-full flex flex-col items-center gap-2 mb-2">
          <div className="w-full h-3 bg-dark-bg/30 rounded-full overflow-hidden">
            <div className="h-3 bg-gradient-to-r from-blue-400 to-pink-400 transition-all" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="text-xs text-dark-muted mt-1">Профиль заполнен на {progress}%</div>
        </div>
        {/* Шаги */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-full flex items-center gap-2 mb-4">
            {steps.map((t, i) => (
              <div key={i} className={`flex-1 h-2 rounded-full transition-all ${i <= step ? 'bg-gradient-to-r from-blue-400 to-pink-400' : 'bg-dark-bg/40'}`}></div>
            ))}
          </div>
        </div>
        {step === 0 && (
          <div className="flex flex-col items-center gap-8 animate-fade-in">
            <span className="text-5xl font-bold mb-2 select-none" style={{fontFamily: 'Pacifico, cursive', letterSpacing: '0.04em', background: 'linear-gradient(90deg,#4F8CFF,#38BDF8,#f472b6 80%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block'}}>Mooza</span>
            <span className="text-lg text-dark-accent font-semibold tracking-wide mt-6 animate-fade-in" style={{letterSpacing: '0.03em'}}>Музыкальная соцсеть нового поколения</span>
            <span className="block text-[80px] md:text-[100px] select-none animate-bounce-slow" role="img" aria-label="music">🎸🎤🎧</span>
            <div className="text-dark-muted text-center text-base mb-4 max-w-md animate-fade-in z-10">
              <span className="font-semibold text-dark-accent">Mooza</span> — это место, где музыканты, продюсеры и меломаны находят единомышленников, создают коллаборации и вдохновляются друг другом.<br/>
              <span className="text-dark-accent">Создайте свой музыкальный профиль и начните знакомство с сообществом!</span>
            </div>
            <button className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-pink-400 text-white font-bold shadow-lg text-xl active:scale-95 transition-all animate-fade-in animate-scale-in mt-2 z-10" onClick={next} style={{letterSpacing: '0.04em'}}>Начать</button>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col items-center gap-8 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Загрузите аватар</div>
            <div className="relative w-28 h-28 mb-2">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-dark-bg/80 flex items-center justify-center">
                {avatarFile ? (
                  <img src={URL.createObjectURL(avatarFile)} alt="avatar" className="w-full h-full object-cover rounded-full" />
                ) : profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span role="img" aria-label="avatar" className="text-5xl">👤</span>
                )}
                {/* Иконка камеры для загрузки */}
                <label className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 hover:bg-black/30 transition" title="Загрузить аватар">
                  <svg width="44" height="44" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="11" fill="url(#moozagrad)"/>
                    <defs>
                      <linearGradient id="moozagrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#4F8CFF"/>
                        <stop offset="1" stopColor="#f472b6"/>
                      </linearGradient>
                    </defs>
                    <path d="M8 12.5a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm8-4V7a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v1.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" onChange={e => {
                    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                    if (file && file.size > 3 * 1024 * 1024) {
                      alert('Максимальный размер файла 3 МБ');
                      return;
                    }
                    if (file && !['image/jpeg','image/png','image/jpg'].includes(file.type)) {
                      alert('Только JPG, JPEG или PNG');
                      return;
                    }
                    setAvatarFile(file);
                    setProfile(p => ({ ...p, avatarUrl: URL.createObjectURL(file!) }));
                  }} />
                </label>
                {/* Крестик для удаления аватара */}
                {(avatarFile || profile.avatarUrl) && (
                  <button
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 shadow transition"
                    style={{zIndex: 2}}
                    onClick={() => { setAvatarFile(null); setProfile(p => ({ ...p, avatarUrl: undefined })); }}
                    title="Удалить аватар"
                  >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff" fillOpacity=".15"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                )}
              </div>
            </div>
            <div className="text-xs text-dark-muted">JPG, PNG, до 3 МБ</div>
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Как вас зовут?</div>
            <input className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.firstName ? 'border border-red-500' : ''}`} placeholder="Имя" value={profile.firstName} onChange={e => {
              setProfile(p => ({ ...p, firstName: e.target.value }));
              setErrors((err: any) => ({ ...err, firstName: validateField('firstName', e.target.value) }));
            }} maxLength={40} autoFocus />
            {errors.firstName && <div className="text-xs text-red-500 -mt-2">{errors.firstName}</div>}
            <input className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.lastName ? 'border border-red-500' : ''}`} placeholder="Фамилия" value={profile.lastName} onChange={e => {
              setProfile(p => ({ ...p, lastName: e.target.value }));
              setErrors((err: any) => ({ ...err, lastName: validateField('lastName', e.target.value) }));
            }} maxLength={40} />
            {errors.lastName && <div className="text-xs text-red-500 -mt-2">{errors.lastName}</div>}
            <div className="text-dark-muted text-xs">Только буквы, минимум 2 символа</div>
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!validateField('firstName', profile.firstName) || !!validateField('lastName', profile.lastName)}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Где вы живёте?</div>
            <input className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.country ? 'border border-red-500' : ''}`} placeholder="Страна" value={profile.country} onChange={e => {
              setProfile(p => ({ ...p, country: e.target.value }));
              setErrors((err: any) => ({ ...err, country: validateField('country', e.target.value) }));
            }} maxLength={40} autoComplete="country" />
            {errors.country && <div className="text-xs text-red-500 -mt-2">{errors.country}</div>}
            <div className="flex gap-2">
              <input className={`flex-1 px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.city ? 'border border-red-500' : ''}`} placeholder="Город" value={profile.city} onChange={e => {
                setProfile(p => ({ ...p, city: e.target.value }));
                setErrors((err: any) => ({ ...err, city: validateField('city', e.target.value) }));
              }} maxLength={40} />
              <button
                className="px-3 py-2 rounded-xl bg-dark-accent text-white font-semibold shadow active:scale-95 transition-all text-sm"
                style={{minWidth: 0}}
                type="button"
                title="Определить по геолокации"
                onClick={async () => {
                  if (!navigator.geolocation) {
                    alert('Геолокация не поддерживается вашим браузером');
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                      const { latitude, longitude } = pos.coords;
                      try {
                        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ru`);
                        const data = await resp.json();
                        const city = data.address.city || data.address.town || data.address.village || data.address.settlement || data.address.state || '';
                        const country = data.address.country || '';
                        if (city || country) {
                          setProfile(prev => ({ ...prev, city, country }));
                        } else {
                          alert('Не удалось определить город/страну по координатам');
                        }
                      } catch {
                        alert('Ошибка при определении города');
                      }
                    },
                    (err) => {
                      alert('Не удалось получить геолокацию: ' + err.message);
                    }
                  );
                }}
              >
                📍
              </button>
            </div>
            {errors.city && <div className="text-xs text-red-500 -mt-2">{errors.city}</div>}
            <div className="text-dark-muted text-xs">Укажите город и страну проживания</div>
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!validateField('country', profile.country) || !!validateField('city', profile.city)}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Место работы</div>
            <input className="px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base" placeholder="Место работы" value={profile.workPlace} onChange={e => setProfile(p => ({ ...p, workPlace: e.target.value }))} maxLength={60} />
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Ваши навыки</div>
            <div className="text-dark-muted text-sm mb-2">Выберите хотя бы 1 навык, который вас характеризует как музыканта или специалиста.</div>
            <InterestSelector selected={profile.skills} onChange={skills => {
              setProfile(p => ({ ...p, skills }));
              setErrors((err: any) => ({ ...err, skills: validateField('skills', skills) }));
            }} />
            {errors.skills && <div className="text-xs text-red-500 -mt-2">{errors.skills}</div>}
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!validateField('skills', profile.skills)}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Ваши интересы</div>
            <div className="text-dark-muted text-sm mb-2">Выберите хотя бы 3 интереса — это поможет Mooza подобрать для вас лучших собеседников и рекомендации.</div>
            <InterestSelector selected={profile.interests} onChange={interests => {
              setProfile(p => ({ ...p, interests }));
              setErrors((err: any) => ({ ...err, interests: validateField('interests', interests) }));
            }} />
            {errors.interests && <div className="text-xs text-red-500 -mt-2">{errors.interests}</div>}
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!validateField('interests', profile.interests)}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 7 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Резюме / портфолио</div>
            <textarea className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base resize-none ${errors.portfolioText ? 'border border-red-500' : ''}`} placeholder="Расскажите о себе, опыте, достижениях, прикрепите ссылку или файл..." value={profile.portfolio.text} onChange={e => {
              setProfile(p => ({ ...p, portfolio: { ...p.portfolio, text: e.target.value } }));
              setErrors((err: any) => ({ ...err, portfolioText: validateField('portfolioText', e.target.value) }));
            }} rows={3} maxLength={500} />
            {errors.portfolioText && <div className="text-xs text-red-500 -mt-2">{errors.portfolioText}</div>}
            <div className="text-dark-muted text-xs">Максимум 500 символов. Можно прикрепить файл (JPG, PNG, PDF, до 3 МБ).</div>
            {/* Кнопка добавления вложения */}
            <label className="inline-flex items-center gap-2 cursor-pointer p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:opacity-90 transition-colors self-start" title="Добавить вложение">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
              </svg>
              <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
                const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                if (file && file.size > 3 * 1024 * 1024) {
                  alert('Максимальный размер файла 3 МБ');
                  return;
                }
                if (file && !['image/jpeg','image/png','application/pdf'].includes(file.type)) {
                  alert('Только JPG, PNG или PDF');
                  return;
                }
                if (file) {
                  const url = URL.createObjectURL(file);
                  setProfile(prev => ({ ...prev, portfolio: { ...prev.portfolio, fileUrl: url } }));
                }
              }} className="hidden" />
            </label>
            {profile.portfolio.fileUrl && (
              <a href={profile.portfolio.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs mt-1">Скачать вложение</a>
            )}
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 8 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Контактная информация</div>
            <input className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.phone ? 'border border-red-500' : ''}`} placeholder="Телефон (+7 ...)" value={profile.phone} onChange={e => {
              let val = e.target.value.replace(/\D/g, '');
              if (val.length > 11) val = val.slice(0, 11);
              let formatted = '+7';
              if (val.length > 1) formatted += ' (' + val.slice(1, 4);
              if (val.length >= 4) formatted += ') ' + val.slice(4, 7);
              if (val.length >= 7) formatted += '-' + val.slice(7, 9);
              if (val.length >= 9) formatted += '-' + val.slice(9, 11);
              setProfile(p => ({ ...p, phone: formatted }));
              setErrors((err: any) => ({ ...err, phone: validateField('phone', formatted) }));
            }} maxLength={18} />
            {errors.phone && <div className="text-xs text-red-500 -mt-2">{errors.phone}</div>}
            <div className="text-dark-muted text-xs">Формат: +7 (XXX) XXX-XX-XX</div>
            <input className={`px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base ${errors.email ? 'border border-red-500' : ''}`} placeholder="Email" value={profile.email} onChange={e => {
              setProfile(p => ({ ...p, email: e.target.value }));
              setErrors((err: any) => ({ ...err, email: validateField('email', e.target.value) }));
            }} maxLength={60} type="email" autoComplete="email" />
            {errors.email && <div className="text-xs text-red-500 -mt-2">{errors.email}</div>}
            <div className="text-dark-muted text-xs">Введите корректный email</div>
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!validateField('phone', profile.phone) || !!validateField('email', profile.email)}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 9 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Привяжите соцсети</div>
            <SocialLinkEdit label="VK" icon={VKIcon} value={vkInput} onChange={v => setVkInput(v)} placeholder="Ссылка на VK" />
            {errors.vk && <div className="text-xs text-red-500 -mt-2">{errors.vk}</div>}
            <SocialLinkEdit label="YouTube" icon={YTIcon} value={ytInput} onChange={v => setYtInput(v)} placeholder="Ссылка на YouTube" />
            {errors.youtube && <div className="text-xs text-red-500 -mt-2">{errors.youtube}</div>}
            <SocialLinkEdit label="Telegram" icon={TGIcon} value={tgInput} onChange={v => setTgInput(v)} placeholder="Ссылка на Telegram" />
            {errors.telegram && <div className="text-xs text-red-500 -mt-2">{errors.telegram}</div>}
            <div className="text-dark-muted text-xs">Введите ссылку на профиль, начиная с https://</div>
            {/* Стрелки навигации */}
            <div className="flex items-center justify-center gap-8 mt-2">
              <button onClick={prev} className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow hover:scale-110 transition" title="Назад">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={() => { setProfile(p => ({ ...p, vk: vkInput.trim(), youtube: ytInput.trim(), telegram: tgInput.trim() })); next(); }} className="p-2 rounded-full bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow hover:scale-110 transition" title="Далее" disabled={!!errors.vk || !!errors.youtube || !!errors.telegram}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        {step === 10 && (
          <div className="flex flex-col gap-6 items-center animate-fade-in">
            <div className="text-2xl font-bold text-dark-text mb-2">Профиль готов!</div>
            <div className="text-dark-muted text-center text-base mb-4 max-w-md animate-fade-in z-10">Теперь вы можете пользоваться всеми возможностями Mooza.<br/>Проверьте данные и начните знакомство с сообществом!</div>
            <button className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-pink-400 text-white font-bold shadow-lg text-xl active:scale-95 transition-all animate-fade-in animate-scale-in mt-2 z-10" onClick={() => onFinish({ ...profile, vk: vkInput.trim(), youtube: ytInput.trim(), telegram: tgInput.trim(), vkId: vkInput.trim(), youtubeId: ytInput.trim(), telegramId: tgInput.trim() })} style={{letterSpacing: '0.04em'}}>В профиль</button>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteStep({ onFinish }: { onFinish: () => void }) {
  const [invited, setInvited] = React.useState(false);
  const [skipped, setSkipped] = React.useState(false);
  return (
    <div className="flex flex-col items-center gap-8 animate-fade-in">
      <div className="text-2xl font-bold text-dark-text mb-2">Почти готово!</div>
      <div className="text-dark-muted text-center text-base mb-2 max-w-md">
        Пригласите друзей из своих контактов и получите <span className="text-dark-accent font-semibold">бонус: +10 Mooзиков</span> за каждого приглашённого!<br/>
        Это поможет быстрее найти единомышленников и сделать Mooza ещё интереснее.
      </div>
      {!invited && !skipped && (
        <>
          <button
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-pink-400 text-white font-semibold shadow active:scale-95 transition-all text-lg"
            onClick={() => { alert('Импорт контактов доступен только в мобильном приложении или при интеграции.'); setInvited(true); }}
          >
            Пригласить из контактов
          </button>
          <button
            className="px-6 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-all text-lg mt-2"
            onClick={() => setSkipped(true)}
          >
            Пропустить
          </button>
        </>
      )}
      {(invited || skipped) && (
        <button
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg text-xl active:scale-95 transition-all animate-fade-in animate-scale-in mt-2"
          onClick={onFinish}
        >
          Завершить
        </button>
      )}
    </div>
  );
} 