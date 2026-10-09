import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Loader2, Check, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { authAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { isValidEmail, passwordChecks, passwordProblem } from '../lib/authHelpers';

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
      toast.error(getApiError(err, 'Ошибка отправки'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = () => {
    if (!isValidEmail(email)) {
      setError('Укажите корректный email');
      return;
    }
    sendCode();
  };

  // Требования те же, что при регистрации (сервер проверяет ту же схему).
  const pw = passwordChecks(password);

  const backToCode = () => { setError(''); setStage('code'); };

  const handleReset = async () => {
    setError('');
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      setStage('done');
    } catch (err: any) {
      const errCode = err?.response?.data?.code;
      toast.error(getApiError(err, 'Ошибка сброса пароля'));
      // Код неверный/истёк — проверяется только здесь, поэтому возвращаем к вводу кода.
      if (errCode === 'CODE_INVALID' || errCode === 'CODE_EXPIRED') {
        setCode('');
        setStage('code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center px-5">
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
                Мы отправили 8-значный код на<br />
                <span className="text-white font-medium">{email}</span>
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text" inputMode="numeric" maxLength={8}
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && code.length === 8 && setStage('password')}
                placeholder="00000000"
                autoFocus
                className="w-full text-center text-3xl font-bold tracking-[8px] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-5 text-white placeholder-slate-700 focus:outline-none focus:border-primary-500"
              />

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={() => { setError(''); setStage('password'); }}
                disabled={code.length < 8}
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

              <button
                onClick={() => { setError(''); setCode(''); setStage('email'); }}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Изменить email
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
              <p className="text-slate-400 text-sm">Придумайте надёжный пароль: минимум 8 символов, цифра и спецсимвол.</p>
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
              <div className="flex flex-wrap gap-x-3 gap-y-1 -mt-2">
                {([['8+ символов', pw.longEnough], ['цифра', pw.hasDigit], ['спецсимвол', pw.hasSpecial]] as [string, boolean][]).map(([lbl, ok]) => (
                  <span key={lbl} className={`text-[11px] flex items-center gap-1 ${ok ? 'text-green-400' : 'text-slate-500'}`}>
                    {ok ? <Check size={11} /> : <span className="w-[10px] h-[10px] rounded-full border border-slate-600 inline-block" />}{lbl}
                  </span>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={15} className="flex-shrink-0" />{error}
                </div>
              )}

              <button
                onClick={handleReset} disabled={loading || !pw.strong}
                className="w-full py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                {loading ? 'Сохраняем...' : 'Сохранить пароль'}
              </button>

              <button
                onClick={backToCode} disabled={loading}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft size={14} /> Назад к коду
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
