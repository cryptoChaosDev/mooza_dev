import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2, Check, Send, ArrowLeft } from 'lucide-react';
import { authAPI, siteSettingsAPI, AUTH_NOTICE_KEY } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { isTourDone } from '../lib/authHelpers';
import { consumeReturnTo } from '../lib/authReturn';
import { reachGoal } from '../lib/metrika';
import { useSeo, authPageRobots } from '../lib/seo';
import { useSiteSettings } from '../lib/siteSettings';
import VkLoginButton from '../components/VkLoginButton';

// Temporarily hide VK login/registration. Set back to true to restore.
const SHOW_VK = false;

// Согласие с документами теперь спрашивается один раз — при регистрации.
// На входе осталась только справочная сноска со ссылками (/terms, /privacy).

const TG_POLL_TIMEOUT_MS = 120_000;

// Куда вести после успешного входа: онбординг (если не пройден) — он сам
// вернёт на сохранённую страницу в конце; иначе — сразу на возврат или главную.
// Возврат забирается ДО setAuth (одноразово, см. lib/authReturn).
function afterLoginTarget(user: any): string {
  const tourDone = isTourDone(user);
  if (tourDone) localStorage.setItem('mooza_tour_done', '1');
  return tourDone ? (consumeReturnTo() ?? '/') : '/onboarding';
}

// VK: незавершённая настройка → /vk-setup (оттуда — онбординг/возврат).
function afterVkTarget(user: any, isNew?: boolean): string {
  return (isNew || !user?.onboardingCompletedAt) ? '/vk-setup' : (consumeReturnTo() ?? '/');
}

export default function LoginPage() {
  const { seoIndexable } = useSiteSettings();
  useSeo({ title: 'Вход — Moooza', robots: authPageRobots(seoIndexable) });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // email verification
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth, setUser } = useAuthStore();

  // Registration may be closed site-wide — hide the "Зарегистрироваться" link.
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  useEffect(() => {
    siteSettingsAPI.get()
      .then(({ data }) => setRegistrationEnabled((data as Record<string, string>)?.registrationEnabled !== 'false'))
      .catch(() => {});
  }, []);

  // Message left by a forced logout (expired session, blocked account, …).
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem(AUTH_NOTICE_KEY);
      if (notice) {
        sessionStorage.removeItem(AUTH_NOTICE_KEY);
        toast.info(notice);
      }
    } catch { /* storage unavailable */ }
  }, []);

  // Handle VK server-side OAuth callback: #vk_token=JWT (legacy: ?vk_token=) or ?vk_error=reason
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const vkToken = hash.get('vk_token') || searchParams.get('vk_token');
    const vkError = searchParams.get('vk_error');
    const isNew = (hash.get('is_new') || searchParams.get('is_new')) === '1';
    // The JWT must not stay in the address bar / history (screenshots, shared links).
    if (vkToken || vkError) window.history.replaceState(null, '', '/login');
    if (vkToken) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      fetch(`${apiUrl}/api/users/me`, { headers: { Authorization: `Bearer ${vkToken}` } })
        .then(async r => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body?.error || 'Ошибка авторизации через ВКонтакте');
          return body;
        })
        .then(u => {
          const target = afterVkTarget(u, isNew);
          setAuth(u, vkToken);
          setUser(u);
          localStorage.setItem('termsAgreed', '1');
          reachGoal('login_success', { source: 'vk' });
          navigate(target);
        })
        .catch((e: any) => toast.error(e?.message || 'Ошибка авторизации через ВКонтакте'));
    } else if (vkError) {
      const msgs: Record<string, string> = {
        cancelled: 'Вы отменили авторизацию через ВКонтакте',
        state: 'Ошибка безопасности. Попробуйте ещё раз',
        token: 'VK не выдал токен. Попробуйте ещё раз',
        userinfo: 'Не удалось получить данные профиля VK',
        server: 'Ошибка сервера при входе через ВКонтакте',
        closed: 'Регистрация сейчас доступна только по приглашению',
        login_disabled: 'Вход временно отключён. Попробуйте позже.',
        blocked: 'Аккаунт заблокирован. Обратитесь в поддержку.',
      };
      toast.error(msgs[vkError] || 'Ошибка входа через ВКонтакте');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const handleVkAuth = useCallback(async (user: any, token: string, isNew?: boolean) => {
    const target = afterVkTarget(user, isNew);
    setAuth(user, token);
    localStorage.setItem('termsAgreed', '1');
    reachGoal('login_success', { source: 'vk' });
    navigate(target);
  }, [setAuth, navigate]);

  const handleSocialError = (msg: string) => {
    if (msg) toast.error(msg);
  };

  // ── Вход через Telegram: deep-link на бота + поллинг подтверждения ─────────
  const [tgWaiting, setTgWaiting] = useState(false);
  const tgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tgInFlightRef = useRef(false);
  useEffect(() => () => { if (tgTimerRef.current) clearInterval(tgTimerRef.current); }, []);
  const finishLogin = useCallback((user: any, token: string) => {
    const target = afterLoginTarget(user);
    setAuth(user, token);
    localStorage.setItem('termsAgreed', '1');
    reachGoal('login_success', { source: 'telegram' });
    navigate(target);
  }, [setAuth, navigate]);

  const stopTgPoll = () => {
    if (tgTimerRef.current) { clearInterval(tgTimerRef.current); tgTimerRef.current = null; }
    tgInFlightRef.current = false;
    setTgWaiting(false);
  };

  const tgLogin = async () => {
    try {
      const { data } = await authAPI.telegramToken();
      if (!data?.url) { toast.error('Вход через Telegram временно недоступен'); return; }
      window.open(data.url, '_blank', 'noopener');
      setTgWaiting(true);
      const startedAt = Date.now();
      tgTimerRef.current = setInterval(async () => {
        if (Date.now() - startedAt > TG_POLL_TIMEOUT_MS) {
          stopTgPoll();
          toast.error('Время ожидания подтверждения в Telegram истекло — попробуйте ещё раз');
          return;
        }
        // Не накладываем запросы друг на друга, если сеть медленная.
        if (tgInFlightRef.current) return;
        tgInFlightRef.current = true;
        try {
          const { data: p } = await authAPI.telegramPoll(data.token);
          if (p?.status === 'ok' && tgTimerRef.current) {
            stopTgPoll();
            finishLogin(p.user, p.token);
          }
        } catch (e: any) {
          const st = e?.response?.status;
          if (st === 429) {
            stopTgPoll();
            toast.error(getApiError(e, 'Слишком много попыток входа через Telegram. Подождите несколько минут.'));
          } else if (st === 403 || st === 404) {
            stopTgPoll();
            toast.error(getApiError(e, st === 404 ? 'Ссылка устарела — попробуйте ещё раз' : 'Вход через Telegram недоступен'));
          }
          // Таймаут отдельного запроса / обрыв сети — временно, продолжаем ждать.
        } finally {
          tgInFlightRef.current = false;
        }
      }, 2500);
    } catch (e) {
      toast.error(getApiError(e, 'Не удалось начать вход через Telegram'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await authAPI.login(email, password);
      // Show onboarding on first login — server-side flag is the source of truth
      const target = afterLoginTarget(data.user);
      setAuth(data.user, data.token);
      localStorage.setItem('termsAgreed', '1');
      reachGoal('login_success', { source: 'email' });
      navigate(target);
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.error === 'EMAIL_NOT_VERIFIED' && errData?.email) {
        // Код при входе НЕ отправляется — даём запросить его сразу, без таймера.
        setPendingEmail(errData.email);
        setVerifyCode('');
        setResendCooldown(0);
      } else {
        toast.error(getApiError(err, 'Ошибка входа'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingEmail || verifyCode.length < 8) return;
    setLoading(true);
    try {
      const { data } = await authAPI.verifyEmail(pendingEmail, verifyCode.trim());
      // Fresh email verification → trust ONLY the server flag.
      // localStorage may hold stale 'mooza_tour_done' from a previous account on the same device.
      let target = '/onboarding';
      if (data.user?.onboardingCompletedAt) {
        localStorage.setItem('mooza_tour_done', '1');
        target = consumeReturnTo() ?? '/';
      }
      setAuth(data.user, data.token);
      localStorage.setItem('termsAgreed', '1');
      reachGoal('login_success', { source: 'email_verify' });
      // Раньше здесь был жёсткий переход (window.location.href) — обход гонки
      // двух деревьев маршрутов. Дерево теперь одно: setAuth и navigate попадают
      // в один рендер, а жёсткий переход конфликтовал бы с редиректом GuestOnly.
      navigate(target, { replace: true });
    } catch (err: any) {
      toast.error(getApiError(err, 'Неверный код'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendCooldown > 0) return;
    try {
      await authAPI.resendVerification(pendingEmail);
      toast.success('Код отправлен — проверьте почту');
      setResendCooldown(60);
      const interval = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; }), 1000);
    } catch (err: any) {
      toast.error(getApiError(err, 'Не удалось отправить код. Попробуйте позже.'));
    }
  };

  if (pendingEmail) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary-600/20 flex items-center justify-center mb-4">
              <Mail size={26} className="text-primary-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Подтвердите email</h2>
            <p className="text-slate-400 text-sm">
              Email <span className="text-white font-medium">{pendingEmail}</span> ещё не подтверждён.<br />
              Введите 8-значный код из письма или запросите новый.
            </p>
          </div>
          <div className="mb-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="00000000"
              className="w-full text-center text-3xl font-bold tracking-[8px] bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-primary-500"
              autoFocus
            />
          </div>
          <button
            onClick={handleVerify}
            disabled={loading || verifyCode.length < 8}
            className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors mb-3"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Подтвердить
          </button>
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="w-full py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            {resendCooldown > 0 ? `Повторный код через ${resendCooldown}с` : 'Отправить код'}
          </button>
          <button
            onClick={() => { setPendingEmail(null); setVerifyCode(''); }}
            className="w-full py-2 text-sm text-slate-500 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} /> Назад ко входу
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

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary-600/10 blur-[120px]" />
        <div className="absolute -bottom-60 -right-40 w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Moooza" className="h-16 w-auto mx-auto mb-3" />
          <p className="text-slate-400">Социальная сеть для музыкантов</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-slate-800/50 shadow-xl">
          <h2 className="text-2xl font-semibold text-white mb-6">С возвращением</h2>

          {/* Social login — VK (temporarily disabled; flip SHOW_VK to restore) */}
          {SHOW_VK && (
            <>
              <div className="mb-5">
                <VkLoginButton onAuth={handleVkAuth} onError={handleSocialError} disabled={loading} />
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-slate-700" />
                <span className="text-xs text-slate-500 uppercase tracking-wide">или войти по email</span>
                <div className="flex-1 h-px bg-slate-700" />
              </div>
            </>
          )}

          {/* Вход через Telegram — deep-link на бота + ожидание подтверждения */}
          <div className="mb-5">
            {tgWaiting ? (
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#229ED9]/10 border border-[#229ED9]/30 rounded-xl">
                <span className="flex items-center gap-2 text-sm text-[#4db8e8] min-w-0">
                  <Loader2 size={16} className="animate-spin flex-shrink-0" />
                  Нажмите Start в Telegram — ждём…
                </span>
                <button type="button" onClick={stopTgPoll} className="text-xs text-slate-500 hover:text-white transition-colors flex-shrink-0">
                  Отмена
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={tgLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-[#229ED9] hover:bg-[#1a8bc4] disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-lg shadow-[#229ED9]/20"
              >
                <Send size={18} />
                Войти через Telegram
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500 uppercase tracking-wide">или по email</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-400 hover:to-purple-400 disabled:from-slate-700 disabled:to-slate-600 disabled:text-slate-500 text-white font-semibold py-3.5 px-4 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? 'Вход...' : 'Войти'}
            </button>

            {/* Согласие даётся при регистрации; на входе — только справочная сноска */}
            <p className="text-[11px] text-slate-600 text-center leading-relaxed -mt-1">
              Входя, вы подтверждаете согласие с{' '}
              <a href="/terms" className="text-slate-500 hover:text-slate-400 underline">условиями</a>
              {' '}и{' '}
              <a href="/privacy" className="text-slate-500 hover:text-slate-400 underline">политикой конфиденциальности</a>
            </p>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2">
            <a href="/forgot-password" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Забыли пароль?
            </a>
            {registrationEnabled ? (
              <p className="text-slate-400 text-sm">
                Нет аккаунта?{' '}
                <a href="/register" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
                  Зарегистрироваться
                </a>
              </p>
            ) : (
              <p className="text-slate-500 text-sm">Регистрация временно закрыта</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
