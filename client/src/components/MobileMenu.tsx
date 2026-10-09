import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, ChevronRight, UserSearch, CalendarDays, Gift, Zap, Settings, ShieldCheck, Info, LifeBuoy, Smartphone,
} from 'lucide-react';
import BottomSheet from './BottomSheet';
import InfoModal from './InfoModal';
import { APP_VERSION } from '../lib/changelog';
import { useSiteSettings } from '../lib/siteSettings';
import { ANDROID_APK_URL, isAndroidBrowser } from '../lib/androidApp';
import { reachGoal } from '../lib/metrika';

// Мобильная шапка: второстепенные кнопки (админка, «Информация», «Пригласить»)
// собраны в бургер, чтобы шапка не была перегружена. Колокольчик остаётся в шапке —
// счётчик непрочитанного должен быть виден сразу.
export default function MobileMenu({ isAdmin }: { isAdmin?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const { androidApkEnabled } = useSiteSettings();
  const offerApk = androidApkEnabled && isAndroidBrowser();

  const go = (path: string) => { setOpen(false); navigate(path); };

  const items: { icon: typeof Menu; label: string; hint?: string; onClick: () => void; accent?: boolean }[] = [
    { icon: UserSearch, label: 'Ищу музыканта', hint: 'Запрос одной фразой', onClick: () => go('/find'), accent: true },
    { icon: CalendarDays, label: 'Лайнапы', hint: 'Артисты на концерты', onClick: () => go('/lineups') },
    { icon: Gift, label: 'Пригласить друзей', onClick: () => go('/invite') },
    { icon: Zap, label: 'Moooza Pro', onClick: () => go('/pro') },
    { icon: Settings, label: 'Приватность и уведомления', onClick: () => go('/settings/privacy') },
    ...(isAdmin ? [{ icon: ShieldCheck, label: 'Администрирование', onClick: () => go('/admin') }] : []),
    ...(offerApk ? [{ icon: Smartphone, label: 'Приложение для Android', hint: 'Скачать APK', onClick: () => {
      setOpen(false); reachGoal('android_apk_click', { from: 'menu' }); window.location.href = ANDROID_APK_URL;
    } }] : []),
    { icon: Info, label: 'О приложении', hint: `Версия ${APP_VERSION} · что нового`, onClick: () => { setOpen(false); setShowInfo(true); } },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Меню"
        aria-haspopup="dialog"
        className="-mr-2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
      >
        <Menu size={22} strokeWidth={2} />
      </button>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Меню" height="auto">
        <nav className="px-2 pb-2">
          {items.map(({ icon: Icon, label, hint, onClick, accent }) => (
            <button
              key={label}
              onClick={onClick}
              className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl hover:bg-slate-800/70 active:bg-slate-800 transition-colors text-left"
            >
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accent ? 'bg-primary-500/15 text-primary-300' : 'bg-slate-800 text-slate-300'}`}>
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-white leading-tight">{label}</span>
                {hint && <span className="block text-xs text-slate-500 leading-tight mt-0.5">{hint}</span>}
              </span>
              <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
            </button>
          ))}
          <a
            href="https://t.me/mooozahelpbot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl hover:bg-slate-800/70 transition-colors"
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-800 text-slate-300">
              <LifeBuoy size={18} strokeWidth={2} />
            </span>
            <span className="flex-1 text-[15px] font-medium text-white">Помощь</span>
            <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
          </a>
        </nav>
      </BottomSheet>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}
