import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { authAPI, userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
      >
        <span className="text-sm font-medium text-slate-300">{title}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 py-4 bg-slate-900/50 max-h-60 overflow-y-auto text-xs text-slate-400 space-y-3 leading-relaxed border-t border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth, setUser } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError('Необходимо принять соглашения для входа');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const { data } = await authAPI.login(email, password);
      setAuth(data.user, data.token);

      if (!data.user.termsAgreedAt) {
        try {
          const { data: updatedUser } = await userAPI.agreeToTerms();
          setUser(updatedUser);
        } catch {
          // Non-critical
        }
      }

      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
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

            {/* Documents */}
            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Перед входом ознакомьтесь с документами</p>

              <DocSection title="Пользовательское соглашение">
                <p className="font-medium text-slate-300">1. Предмет соглашения</p>
                <p>Moooza — профессиональная социальная сеть для участников музыкальной индустрии. Используя платформу, вы принимаете условия настоящего соглашения.</p>

                <p className="font-medium text-slate-300">2. Регистрация и аккаунт</p>
                <p>Вы обязаны указывать достоверные данные, хранить данные аккаунта в тайне и не передавать доступ третьим лицам. Допускается один аккаунт на человека. Минимальный возраст — 14 лет.</p>

                <p className="font-medium text-slate-300">3. Правила поведения</p>
                <p>Запрещено: размещать незаконный контент, нарушать авторские права, осуществлять спам, выдавать себя за других лиц, использовать автоматические инструменты для сбора данных.</p>

                <p className="font-medium text-slate-300">4. Контент пользователя</p>
                <p>Вы сохраняете права на свой контент и предоставляете платформе право на его хранение и отображение в рамках её работы. Вы несёте ответственность за размещаемые материалы.</p>

                <p className="font-medium text-slate-300">5. Ограничение ответственности</p>
                <p>Платформа предоставляется «как есть». Мы не несём ответственности за действия пользователей и технические сбои, не зависящие от нас.</p>

                <p className="font-medium text-slate-300">6. Контакты</p>
                <p>По вопросам: support@moooza.ru. Полная версия: <a href="/terms" target="_blank" className="text-primary-400 underline">moooza.ru/terms</a></p>
              </DocSection>

              <DocSection title="Политика обработки персональных данных">
                <p className="font-medium text-slate-300">1. Общие положения</p>
                <p>Политика разработана в соответствии с ФЗ № 152-ФЗ «О персональных данных». Используя платформу, вы даёте согласие на обработку данных в соответствии с настоящей Политикой.</p>

                <p className="font-medium text-slate-300">2. Состав данных</p>
                <p>Мы обрабатываем: имя, email, телефон, город, фото профиля, информацию о профессии и деятельности, переписку, публикации, а также техническую информацию (IP, браузер, cookies).</p>

                <p className="font-medium text-slate-300">3. Цели обработки</p>
                <p>Обеспечение работы платформы, идентификация, коммуникация между пользователями, улучшение сервиса, соблюдение законодательства РФ.</p>

                <p className="font-medium text-slate-300">4. Хранение и защита</p>
                <p>Данные хранятся на серверах в России. Мы применяем шифрование и ограничение доступа. Срок хранения — весь период действия аккаунта + 3 года после удаления.</p>

                <p className="font-medium text-slate-300">5. Ваши права</p>
                <p>Вы вправе: запросить доступ к данным, исправить их, потребовать удаления, отозвать согласие. Запросы направляйте на support@moooza.ru.</p>

                <p className="font-medium text-slate-300">6. Контакты</p>
                <p>Оператор персональных данных: администрация Moooza. Полная версия: <a href="/privacy" target="_blank" className="text-primary-400 underline">moooza.ru/privacy</a></p>
              </DocSection>
            </div>

            {/* Agreement checkbox */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => { setAgreed(a => !a); if (error) setError(''); }}
                className="flex-shrink-0 mt-0.5"
                aria-label="Принять соглашения"
              >
                <div className={`w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
                  agreed ? 'bg-primary-500 border-primary-500' : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                }`}>
                  {agreed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
              <span className="text-sm text-slate-400 leading-snug">
                Я ознакомился(ась) с документами выше и принимаю их условия
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !agreed}
              className="w-full bg-gradient-to-r from-primary-500 to-purple-500 hover:from-primary-400 hover:to-purple-400 disabled:from-slate-700 disabled:to-slate-600 disabled:text-slate-500 text-white font-semibold py-3.5 px-4 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <p className="mt-6 text-center text-slate-400">
            Нет аккаунта?{' '}
            <span className="text-slate-500 font-medium cursor-default" title="Скоро, скоро..">
              Скоро, скоро..
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
