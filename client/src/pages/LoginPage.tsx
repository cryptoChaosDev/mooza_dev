import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Check, Send } from 'lucide-react';
import { authAPI, siteSettingsAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import VkLoginButton from '../components/VkLoginButton';

// Temporarily hide VK login/registration. Set back to true to restore.
const SHOW_VK = false;

// Согласие с документами теперь спрашивается один раз — при регистрации.
// На входе осталась только справочная сноска со ссылками (/terms, /privacy).

export default function LoginPage() {
  useEffect(() => { document.title = 'Вход — Moooza'; }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // email verification
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
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

  // Handle VK server-side OAuth callback: ?vk_token=JWT or ?vk_error=reason
  useEffect(() => {
    const vkToken = searchParams.get('vk_token');
    const vkError = searchParams.get('vk_error');
    if (vkToken) {
      const isNew = searchParams.get('is_new') === '1';
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      fetch(`${apiUrl}/api/users/me`, { headers: { Authorization: `Bearer ${vkToken}` } })
        .then(r => r.json())
        .then(u => {
          setAuth(u, vkToken);
          setUser(u);
          localStorage.setItem('termsAgreed', '1');
          navigate((isNew || !u?.onboardingCompletedAt) ? '/vk-setup' : '/');
        })
        .catch(() => setError('Ошибка авторизации через ВКонтакте'));
    } else if (vkError) {
      const msgs: Record<string, string> = {
        cancelled: 'Вы отменили авторизацию через ВКонтакте',
        state: 'Ошибка безопасности. Попробуйте ещё раз',
        token: 'VK не выдал токен. Попробуйте ещё раз',
        userinfo: 'Не удалось получить данные профиля VK',
        server: 'Ошибка сервера при входе через ВКонтакте',
      };
      setError(msgs[vkError] || 'Ошибка входа через ВКонтакте');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const handleVkAuth = useCallback(async (user: any, token: string, isNew?: boolean) => {
    setAuth(user, token);
    localStorage.setItem('termsAgreed', '1');
    navigate((isNew || !user?.onboardingCompletedAt) ? '/vk-setup' : '/');
  }, [setAuth, navigate]);

  const handleSocialError = (msg: string) => {
    if (msg) setError(msg);
  };

  // ── Вход через Telegram: deep-link на бота + поллинг подтверждения ─────────
  const [tgWaiting, setTgWaiting] = useState(false);
  const tgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (tgTimerRef.current) clearInterval(tgTimerRef.current); }, []);
  const finishLogin = useCallback((user: any, token: string) => {
    setAuth(user, token);
    localStorage.setItem('termsAgreed', '1');
    const tourDone = user.onboardingCompletedAt || localStorage.getItem('mooza_tour_done');
    if (tourDone) localStorage.setItem('mooza_tour_done', '1');
    navigate(tourDone ? '/' : '/onboarding');
  }, [setAuth, navigate]);

  const stopTgPoll = () => {
    if (tgTimerRef.current) { clearInterval(tgTimerRef.current); tgTimerRef.current = null; }
    setTgWaiting(false);
  };

  const tgLogin = async () => {
    setError('');
    try {
      const { data } = await authAPI.telegramToken();
      if (!data?.url) { setError('Вход через Telegram временно недоступен'); return; }
      window.open(data.url, '_blank', 'noopener');
      setTgWaiting(true);
      const startedAt = Date.now();
      tgTimerRef.current = setInterval(async () => {
        if (Date.now() - startedAt > 120_000) { stopTgPoll(); return; }
        try {
          const { data: p } = await authAPI.telegramPoll(data.token);
          if (p?.status === 'ok') {
            stopTgPoll();
            finishLogin(p.user, p.token);
          }
        } catch (e: any) {
          const st = e?.response?.status;
          if (st === 403 || st === 404) {
            stopTgPoll();
            setError(e.response?.data?.error || (st === 404 ? 'Ссылка устарела — попробуйте ещё раз' : 'Вход через Telegram недоступен'));
          }
        }
      }, 2500);
    } catch {
      setError('Не удалось начать вход через Telegram');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authAPI.login(email, password);
      setAuth(data.user, data.token);
      localStorage.setItem('termsAgreed', '1');

      // Show onboarding on first login — server-side flag wins, localStorage is fallback
      const tourDone = data.user.onboardingCompletedAt || localStorage.getItem('mooza_tour_done');
      if (tourDone) localStorage.setItem('mooza_tour_done', '1');
      navigate(tourDone ? '/' : '/onboarding');
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.error === 'EMAIL_NOT_VERIFIED' && errData?.email) {
        setPendingEmail(errData.email);
        setResendCooldown(60);
        const interval = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; }), 1000);
      } else {
        setError(errData?.error || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingEmail || verifyCode.length < 8) return;
    setLoading(true);
    setVerifyError('');
    try {
      const { data } = await authAPI.verifyEmail(pendingEmail, verifyCode.trim());
      setAuth(data.user, data.token);
      localStorage.setItem('termsAgreed', '1');
      // Fresh email verification → trust ONLY the server flag.
      // localStorage may hold stale 'mooza_tour_done' from a previous account on the same device.
      // Hard navigation to bypass React Router concurrent-mode race condition
      if (data.user?.onboardingCompletedAt) {
        localStorage.setItem('mooza_tour_done', '1');
        window.location.href = '/';
      } else {
        window.location.href = '/onboarding';
      }
    } catch (err: any) {
      setVerifyError(err.response?.data?.error || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendCooldown > 0) return;
    try {
      await authAPI.resendVerification(pendingEmail);
      setResendCooldown(60);
      const interval = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; }), 1000);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(msg || 'Не удалось отправить код. Попробуйте позже.');
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
              Мы отправили 8-значный код на<br />
              <span className="text-white font-medium">{pendingEmail}</span>
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
          {verifyError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-red-400 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              {verifyError}
            </div>
          )}
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
            {resendCooldown > 0 ? `Повторный код через ${resendCooldown}с` : 'Отправить код повторно'}
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

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

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
