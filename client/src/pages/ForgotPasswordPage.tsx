import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Loader2, Check, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { authAPI } from '../lib/api';

type Stage = 'email' | 'code' | 'password' | 'done';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const t = setInterval(() => setResendCooldown(c => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
  };

  const sendCode = async (emailVal = email) => {
    setLoading(true);
    setError('');
    try {
      await authAPI.forgotPassword(emailVal.trim().toLowerCase());
      setStage('code');
      startCooldown();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка отправки');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Укажите корректный email');
      return;
    }
    sendCode();
  };

  const handleReset = async () => {
    setError('');
    if (password.length < 8) { setError('Пароль минимум 8 символов'); return; }
    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      setStage('done');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сброса пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm">

        {/* Back */}
        {stage !== 'done' && (
          <Link to="/login" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors">
            <ArrowLeft size={15} /> Войти
          </Link>
        )}

        {/* ── Stage: email ── */}
        {stage === 'email' && (
          <>
            <div className="mb-8">
              <div className="text-4xl mb-3">🔑</div>
              <h1 className="text-2xl font-bold text-white mb-2">Забыли пароль?</h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Введите email от вашего аккаунта — мы пришлём код для сброса пароля.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-4 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={handleEmailSubmit} disabled={loading}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? 'Отправляем...' : 'Отправить код'}
              </button>
            </div>
          </>
        )}

        {/* ── Stage: code ── */}
        {stage === 'code' && (
          <>
            <div className="mb-8">
              <div className="text-4xl mb-3">📬</div>
              <h1 className="text-2xl font-bold text-white mb-2">Введите код</h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Мы отправили 6-значный код на<br />
                <span className="text-white font-medium">{email}</span>
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text" inputMode="numeric" maxLength={6}
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && code.length === 6 && setStage('password')}
                placeholder="000000"
                autoFocus
                className="w-full text-center text-4xl font-bold tracking-[18px] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white placeholder-slate-700 focus:outline-none focus:border-primary-500"
              />

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={() => { setError(''); setStage('password'); }}
                disabled={code.length < 6}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                Продолжить
              </button>

              <button
                onClick={() => sendCode()}
                disabled={resendCooldown > 0 || loading}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
              >
                {resendCooldown > 0 ? `Повторный код через ${resendCooldown} с` : 'Отправить код повторно'}
              </button>
            </div>
          </>
        )}

        {/* ── Stage: new password ── */}
        {stage === 'password' && (
          <>
            <div className="mb-8">
              <div className="text-4xl mb-3">🔒</div>
              <h1 className="text-2xl font-bold text-white mb-2">Новый пароль</h1>
              <p className="text-slate-400 text-sm">Придумайте надёжный пароль — минимум 6 символов.</p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleReset()}
                  placeholder="Новый пароль"
                  autoFocus
                  className="w-full pl-4 pr-12 py-3.5 bg-slate-800/70 border border-slate-700/60 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={handleReset} disabled={loading || password.length < 8}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Сохраняем...' : 'Сохранить пароль'}
              </button>
            </div>
          </>
        )}

        {/* ── Stage: done ── */}
        {stage === 'done' && (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-white mb-2">Пароль изменён</h1>
            <p className="text-slate-400 text-sm mb-8">Теперь вы можете войти с новым паролем.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-semibold transition-colors"
            >
              Войти
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
