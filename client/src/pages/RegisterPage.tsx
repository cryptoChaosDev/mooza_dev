import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Briefcase } from 'lucide-react';
import { authAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import ProfessionSelector from '../components/ProfessionSelector';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    professions: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showProfessionSelector, setShowProfessionSelector] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authAPI.register(formData);
      setAuth(data.user, data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-400 mb-2">Mooza</h1>
          <p className="text-slate-400">Создайте аккаунт</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-slate-700/50">
          <h2 className="text-2xl font-semibold text-white mb-6">Регистрация</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Имя</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="Иван"
                    autoComplete="given-name"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Фамилия</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Иванов"
                    autoComplete="family-name"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Минимум 6 символов</p>
            </div>

            {/* Professions Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Профессии (необязательно)
              </label>
              <button
                type="button"
                onClick={() => setShowProfessionSelector(true)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-left transition-all hover:bg-slate-700/70 hover:border-primary-500/50 group"
              >
                <div className="flex items-center gap-3">
                  <Briefcase className="text-slate-400 group-hover:text-primary-400 transition-colors" size={20} />
                  <div className="flex-1 min-w-0">
                    {formData.professions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {formData.professions.slice(0, 3).map((prof) => (
                          <span
                            key={prof}
                            className="inline-block px-2 py-0.5 bg-primary-500/20 text-primary-300 rounded text-xs font-medium"
                          >
                            {prof}
                          </span>
                        ))}
                        {formData.professions.length > 3 && (
                          <span className="inline-block px-2 py-0.5 bg-primary-500/20 text-primary-300 rounded text-xs font-medium">
                            +{formData.professions.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">Выберите профессии...</span>
                    )}
                  </div>
                </div>
              </button>
              {formData.professions.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Выбрано: {formData.professions.length}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="mt-6 text-center text-slate-400">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Войти
            </Link>
          </p>
        </div>
      </div>

      {/* Profession Selector Modal */}
      <ProfessionSelector
        isOpen={showProfessionSelector}
        onClose={() => setShowProfessionSelector(false)}
        selectedProfessions={formData.professions}
        onUpdate={(professions) => setFormData({ ...formData, professions })}
      />
    </div>
  );
}
