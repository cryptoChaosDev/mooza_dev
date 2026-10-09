import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useSiteSettings } from '../lib/siteSettings';
import { consumeReturnTo, type GateReason } from '../lib/authReturn';
import { useSeo, ROBOTS_NOINDEX } from '../lib/seo';
import { AuthGatePanel } from './AuthGateModal';

// Уровни доступа маршрутов (план, раздел A):
//   public          — гостю видно всегда (лендинг, лента, документы);
//   public-limited  — гостю видно, только когда включён guestBrowsingEnabled
//                     (<PublicRoute>); иначе — как приватный;
//   private         — только после входа (<RequireAuth>);
//   guest-only      — только гостю (<GuestOnly>: вход, регистрация, сброс пароля).

function PageSpinner() {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-950">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

/**
 * Экран «Войдите, чтобы…» вместо приватной страницы. URL сохраняется для
 * возврата после входа в момент нажатия «Войти»/«Зарегистрироваться»
 * (а не при рендере — иначе случайный кадр без токена перезаписал бы возврат).
 */
export function LoginRequired({ reason = 'page' }: { reason?: GateReason }) {
  useSeo({ title: 'Вход в Moooza', robots: ROBOTS_NOINDEX });
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-slate-900/80 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="flex justify-center pt-7">
          <div className="w-12 h-12 rounded-2xl bg-primary-500/15 border border-primary-500/30 flex items-center justify-center">
            <Lock size={22} className="text-primary-400" />
          </div>
        </div>
        <AuthGatePanel reason={reason} variant="page" />
        <div className="pb-5 text-center">
          <Link to="/feed" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Смотреть ленту</Link>
        </div>
      </div>
    </div>
  );
}

/** Приватный маршрут: без токена — экран входа с CTA, без редиректа. */
export function RequireAuth({ reason = 'page', children }: { reason?: GateReason; children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <LoginRequired reason={reason} />;
  return <>{children}</>;
}

/**
 * Публичный маршрут с урезанным гостевым видом. Гостевой режим выключен
 * (guestBrowsingEnabled !== 'true') — ведёт себя как приватный: гость видит
 * только лендинг, ленту и вход (поведение «как раньше»).
 */
export function PublicRoute({ reason = 'page', children }: { reason?: GateReason; children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const { guestBrowsingEnabled, isLoading } = useSiteSettings();
  if (token || guestBrowsingEnabled) return <>{children}</>;
  if (isLoading) return <PageSpinner />;
  return <LoginRequired reason={reason} />;
}

function RedirectToReturn() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const from = location.pathname;
    // Через тик и с проверкой адреса: если экран входа сам уводит после
    // успешного входа (navigate на возврат/онбординг), этот редирект не должен
    // его перебить — к этому моменту адрес уже другой, или компонент размонтирован.
    const t = setTimeout(() => {
      if (window.location.pathname !== from) return;
      navigate(consumeReturnTo() ?? '/', { replace: true });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Только для гостя (/login, /register, /forgot-password). Вошедший уходит на
 * сохранённый возврат или на главную. `allowAuthed` — исключение (например,
 * /register?artistInvite=… у вошедшего показывает экран принятия приглашения).
 *
 * Гонки setAuth()+navigate() больше нет: дерево маршрутов одно, и обновление
 * токена в zustand и смена URL попадают в один батч рендера — экран входа
 * размонтируется вместе со сменой адреса, этот редирект не срабатывает
 * (а на случай промежуточного кадра он отложен и сверяет адрес, см. выше).
 */
export function GuestOnly({ children, allowAuthed }: { children: ReactNode; allowAuthed?: (search: URLSearchParams) => boolean }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (token && !allowAuthed?.(new URLSearchParams(location.search))) return <RedirectToReturn />;
  return <>{children}</>;
}
