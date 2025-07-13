import React, { useState } from "react";
import { InterestSelector } from "./InterestSelector";

function SocialLinkEdit({ label, icon, value, onChange, placeholder }: { label: string, icon: string, value: string, onChange: (v: string) => void, placeholder: string }) {
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
      <button className="text-blue-500 text-xs px-2" onClick={() => { if (input.trim()) { onChange(input.trim()); } }} title="Сохранить"><span style={{fontSize: '1.2em'}}>💾</span></button>
    </div>
  );
}

export function WelcomePage({ onFinish }: { onFinish: (profile: any) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    name: "",
    city: "",
    vk: "",
    youtube: "",
    telegram: "",
    interests: [] as string[],
  });
  // Новый порядок этапов: 0 - приветствие, 1 - профиль, 2 - интересы, 3 - соцсети, 4 - готово
  const steps = [
    "Добро пожаловать!",
    "Профиль",
    "Интересы",
    "Соцсети",
    "Готово!"
  ];
  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep(s => Math.max(s - 1, 0));
  // --- UI ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-dark-bg via-dark-card to-dark-bg/80 animate-fade-in" style={{minHeight: '100dvh'}}>
      <div className="w-full max-w-md bg-dark-card rounded-2xl shadow-2xl p-8 flex flex-col gap-8 animate-fade-in animate-scale-in">
        <div className="flex flex-col items-center gap-2">
          <div className="w-full flex items-center gap-2 mb-4">
            {steps.map((t, i) => (
              <div key={i} className={`flex-1 h-2 rounded-full transition-all ${i <= step ? 'bg-gradient-to-r from-blue-400 to-pink-400' : 'bg-dark-bg/40'}`}></div>
            ))}
          </div>
        </div>
        {step === 0 && (
          <div className="relative flex flex-col items-center gap-8 animate-fade-in">
            {/* SVG фоновые волны */}
            <svg
              className="absolute -top-24 left-0 w-full h-[220px] pointer-events-none select-none z-0"
              viewBox="0 0 600 220"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{filter: 'blur(0.5px)'}}
            >
              <defs>
                <linearGradient id="wave1" x1="0" y1="0" x2="600" y2="220" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4F8CFF"/>
                  <stop offset="1" stopColor="#f472b6"/>
                </linearGradient>
                <linearGradient id="wave2" x1="0" y1="0" x2="600" y2="220" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38BDF8"/>
                  <stop offset="1" stopColor="#a78bfa"/>
                </linearGradient>
              </defs>
              <path d="M0 120 Q150 180 300 120 T600 120 V220 H0Z" fill="url(#wave1)" fillOpacity="0.18"/>
              <path d="M0 160 Q200 100 400 160 T600 160 V220 H0Z" fill="url(#wave2)" fillOpacity="0.13"/>
            </svg>
            {/* Логотип Mooza с Pacifico и градиентом */}
            <div className="flex flex-col items-center gap-2 w-full z-10">
              <span
                className="text-5xl font-bold mb-2 select-none"
                style={{
                  fontFamily: 'Pacifico, cursive',
                  letterSpacing: '0.04em',
                  background: 'linear-gradient(90deg,#4F8CFF,#38BDF8,#f472b6 80%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: 'inline-block',
                }}
              >
                Mooza
              </span>
              <span className="text-lg text-dark-accent font-semibold tracking-wide mt-6 animate-fade-in" style={{letterSpacing: '0.03em'}}>Музыкальная соцсеть нового поколения</span>
            </div>
            {/* Иллюстрация или иконка */}
            <div className="w-full flex justify-center z-10">
              <span className="block text-[80px] md:text-[100px] select-none animate-bounce-slow" role="img" aria-label="music">🎸🎤🎧</span>
            </div>
            {/* Эмоциональное приветствие */}
            <div className="text-dark-muted text-center text-base mb-4 max-w-md animate-fade-in z-10">
              <span className="font-semibold text-dark-accent">Mooza</span> — это место, где музыканты, продюсеры и меломаны находят единомышленников, создают коллаборации и вдохновляются друг другом.<br/>
              <span className="text-dark-accent">Создайте свой музыкальный профиль и начните знакомство с сообществом!</span>
            </div>
            <button className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-pink-400 text-white font-bold shadow-lg text-xl active:scale-95 transition-all animate-fade-in animate-scale-in mt-2 z-10" onClick={next} style={{letterSpacing: '0.04em'}}>Начать</button>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Ваш профиль</div>
            {/* Кнопки OAuth */}
            <div className="flex flex-col gap-3 mb-2">
              <button
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#2787F5] text-white font-semibold shadow hover:opacity-90 active:scale-95 transition-all text-base justify-center"
                onClick={() => alert('OAuth VK: интеграция в демо-версии не реализована. Введите данные вручную.')}
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2787F5"/><text x="7" y="16" fontSize="10" fill="#fff">VK</text></svg>
                Войти через VK
              </button>
              <button
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#229ED9] text-white font-semibold shadow hover:opacity-90 active:scale-95 transition-all text-base justify-center"
                onClick={() => alert('OAuth Telegram: интеграция в демо-версии не реализована. Введите данные вручную.')}
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><text x="5" y="16" fontSize="10" fill="#fff">TG</text></svg>
                Войти через Telegram
              </button>
              <button
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#FFCC00] text-black font-semibold shadow hover:opacity-90 active:scale-95 transition-all text-base justify-center"
                onClick={() => alert('OAuth Yandex: интеграция в демо-версии не реализована. Введите данные вручную.')}
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FFCC00"/><text x="4" y="16" fontSize="10" fill="#000">Яндекс</text></svg>
                Войти через Яндекс
              </button>
            </div>
            <div className="text-dark-muted text-xs text-center mb-2">Или заполните данные вручную</div>
            <input
              className="px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base"
              placeholder="Имя и фамилия"
              value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              maxLength={40}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-3 rounded-xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base"
                placeholder="Город"
                value={profile.city}
                onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                maxLength={40}
              />
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
                  navigator.geolocation.getCurrentPosition(async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    try {
                      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ru`);
                      const data = await resp.json();
                      const city = data.address.city || data.address.town || data.address.village || data.address.settlement || data.address.state || '';
                      if (city) {
                        setProfile(prev => ({ ...prev, city }));
                      } else {
                        alert('Не удалось определить город по координатам');
                      }
                    } catch {
                      alert('Ошибка при определении города');
                    }
                  }, (err) => {
                    alert('Не удалось получить геолокацию: ' + err.message);
                  });
                }}
              >
                📍
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform text-lg" onClick={next} disabled={!profile.name || !profile.city}>Далее</button>
              <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform text-lg" onClick={prev}>Назад</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Выберите интересы <span className="text-pink-400">*</span></div>
            <div className="text-dark-muted text-sm mb-2">На основе интересов Mooza подбирает для вас лучших собеседников и рекомендации. Выберите хотя бы 3 интереса!</div>
            <InterestSelector selected={profile.interests} onChange={interests => setProfile(p => ({ ...p, interests }))} profileInterests={[]} disableMineMode={true} />
            <div className="flex gap-2 mt-2">
              <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform text-lg" onClick={next} disabled={profile.interests.length < 3}>Далее</button>
              <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform text-lg" onClick={prev}>Назад</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="text-xl font-bold text-dark-text mb-2">Привяжите соцсети</div>
            <SocialLinkEdit label="VK" icon="🟦" value={profile.vk} onChange={vk => setProfile(p => ({ ...p, vk }))} placeholder="Ссылка на VK" />
            <SocialLinkEdit label="YouTube" icon="▶️" value={profile.youtube} onChange={youtube => setProfile(p => ({ ...p, youtube }))} placeholder="Ссылка на YouTube" />
            <SocialLinkEdit label="Telegram" icon="✈️" value={profile.telegram} onChange={telegram => setProfile(p => ({ ...p, telegram }))} placeholder="Ссылка на Telegram" />
            <div className="flex gap-2 mt-2">
              <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform text-lg" onClick={next}>Далее</button>
              <button className="flex-1 py-3 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform text-lg" onClick={prev}>Назад</button>
            </div>
          </div>
        )}
        {step === 4 && (
          <InviteStep onFinish={() => onFinish(profile)} />
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