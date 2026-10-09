import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, LogOut } from 'lucide-react';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

/**
 * Обязательный выбор профессии при входе. Гейтятся ТОЛЬКО пользователи,
 * зарегистрированные после даты-отсечки и не указавшие ни одной профессии —
 * существующих пользователей без профессии не трогаем.
 *
 * Пока профессия не выбрана, приложение закрыто полноэкранным оверлеем;
 * доступны только страницы /professions/* (там и происходит выбор).
 */
const PROFESSION_REQUIRED_SINCE = '2026-07-16T15:00:00Z';

/**
 * Задуманный поток для новичка: гейт «Укажите профессию» → /professions/new →
 * слайды /onboarding → профиль. Форма профессии после сохранения уводит на
 * /profile, и раньше слайды так и не показывались (onboardingCompletedAt
 * оставался пустым). Флаг ставится при уходе из гейта на выбор профессии и
 * снимается, когда профессия сохранена: тогда гейт сам ведёт на /onboarding.
 */
const GATE_ONBOARDING_KEY = 'mooza_gate_onboarding';

function readGateFlag(): boolean {
  try { return sessionStorage.getItem(GATE_ONBOARDING_KEY) === '1'; } catch { return false; }
}
function setGateFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(GATE_ONBOARDING_KEY, '1');
    else sessionStorage.removeItem(GATE_ONBOARDING_KEY);
  } catch { /* storage unavailable — onboarding prompt in the feed stays as a fallback */ }
}

export default function ProfessionGate() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Локальный отсев без запроса: гейт возможен только у залогиненного,
  // у которого в сторе нет профессий (свежие данные проверяем ниже).
  const maybeGated = !!user && (user.userProfessions?.length ?? 0) === 0;

  const { data: me } = useQuery({
    queryKey: ['profession-gate-me'],
    queryFn: async () => (await userAPI.getMe()).data,
    enabled: maybeGated,
    staleTime: 60_000,
  });

  // Профессия выбрана из гейта → показать слайды онбординга (один раз).
  const hasProfession = (me?.userProfessions?.length ?? 0) > 0 || (user?.userProfessions?.length ?? 0) > 0;
  const onboardingDone = !!(me?.onboardingCompletedAt || user?.onboardingCompletedAt);
  useEffect(() => {
    if (!user || !readGateFlag() || !hasProfession) return;
    // Ещё на форме профессии — ждём, пока она сохранит и уведёт со страницы.
    if (location.pathname.startsWith('/professions')) return;
    setGateFlag(false);
    if (!onboardingDone && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [user, hasProfession, onboardingDone, location.pathname, navigate]);

  if (!maybeGated || !me) return null;
  if ((me.userProfessions?.length ?? 0) > 0) return null;
  if (!me.createdAt || new Date(me.createdAt) < new Date(PROFESSION_REQUIRED_SINCE)) return null;
  // На страницах профессий гейт не перекрывает контент — там и выбирают.
  if (location.pathname.startsWith('/professions')) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950 flex flex-col items-center justify-center px-6 text-center"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <img src="/logo.png" alt="Moooza" className="h-10 mb-8" />
      <div className="w-14 h-14 rounded-2xl bg-primary-500/15 border border-primary-500/30 flex items-center justify-center mb-4">
        <BriefcaseBusiness size={26} className="text-primary-400" />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Укажите вашу профессию</h1>
      <p className="text-sm text-slate-400 leading-relaxed max-w-xs mb-6">
        Moooza — сообщество музыкантов и профессионалов индустрии. Выберите хотя бы
        одну профессию, чтобы вас могли найти в каталоге, — и продолжайте.
      </p>
      <button
        onClick={() => {
          // Новичок ещё не видел слайдов — после сохранения профессии покажем их.
          if (!me.onboardingCompletedAt) setGateFlag(true);
          navigate('/professions/new');
        }}
        className="w-full max-w-xs py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
      >
        Выбрать профессию
      </button>
      <button
        onClick={() => { setGateFlag(false); logout(); navigate('/login'); }}
        className="flex items-center gap-1.5 mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <LogOut size={12} /> Выйти из аккаунта
      </button>
    </div>
  );
}
