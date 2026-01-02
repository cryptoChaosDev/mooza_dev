import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRegister, apiLogin, getProfile } from '../api';

const Registration = () => {
  const [step, setStep] = useState(1); // 1: Registration, 2: Profile
  const [formData, setFormData] = useState({
    profileType: '',
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    country: '',
    city: '',
    myGroup: '',
    workPlace: '',
    bio: '',
    education: '',
    interests: '',
    isSeller: false,
    isEmployer: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.profileType) newErrors.profileType = 'Тип профиля обязателен';
    if (!formData.firstName) newErrors.firstName = 'Имя обязательно';
    if (!formData.lastName) newErrors.lastName = 'Фамилия обязательна';
    if (!formData.email && !formData.phone) newErrors.contact = 'Email или телефон обязательны';
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Некорректный email';
    if (formData.phone && !/^(\+7|8)[\s-]?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/.test(formData.phone)) newErrors.phone = 'Некорректный телефон';
    if (!formData.password) newErrors.password = 'Пароль обязателен';
    if (formData.password.length < 6) newErrors.password = 'Пароль должен быть не менее 6 символов';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Пароли не совпадают';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.country) newErrors.country = 'Страна обязательна';
    if (!formData.city) newErrors.city = 'Город обязателен';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep2()) return;

    setLoading(true);
    try {
      // Register user
      const result = await apiRegister({
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        password: formData.password,
        name: `${formData.firstName} ${formData.lastName}`.trim()
      });

      // Store token in localStorage
      localStorage.setItem('token', result.token);

      // Login user automatically
      const loginResult = await apiLogin({
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        password: formData.password
      });
      
      // Store token again to make sure it's updated
      localStorage.setItem('token', loginResult.token);

      // Navigate to profile completion
      navigate('/profile');
    } catch (error: any) {
      setErrors({ general: error.message || 'Ошибка регистрации' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Simulate geolocation for country/city (in real app, use actual geolocation)
  React.useEffect(() => {
    if (step === 2) {
      // In a real app, you would use navigator.geolocation API
      setFormData(prev => ({
        ...prev,
        country: 'Россия', // Default to Russia
        city: 'Москва'     // Default to Moscow
      }));
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-bg to-dark-card flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-dark-text mb-2">
              {step === 1 ? 'Создание аккаунта' : 'Дополнительная информация'}
            </h1>
            <p className="text-dark-muted">
              {step === 1 ? 'Заполните основные данные' : 'Расскажите немного о себе'}
            </p>
          </div>

          {errors.general && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
              {errors.general}
            </div>
          )}

          <form onSubmit={step === 1 ? handleNext : handleRegister} className="space-y-4">
            {step === 1 ? (
              <>
                {/* Profile Type */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Тип профиля *</label>
                  <select
                    name="profileType"
                    value={formData.profileType}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.profileType ? 'border border-red-500' : ''}`}
                  >
                    <option value="">Выберите тип профиля</option>
                    <option value="individual">Физ.лицо</option>
                    <option value="band">Музыкальный коллектив</option>
                    <option value="legal">Юр.лицо</option>
                  </select>
                  {errors.profileType && <p className="text-red-400 text-xs mt-1">{errors.profileType}</p>}
                </div>

                {/* First Name */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Имя *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.firstName ? 'border border-red-500' : ''}`}
                    placeholder="Иван"
                  />
                  {errors.firstName && <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>}
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Фамилия *</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.lastName ? 'border border-red-500' : ''}`}
                    placeholder="Иванов"
                  />
                  {errors.lastName && <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>}
                </div>

                {/* Middle Name */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Отчество</label>
                  <input
                    type="text"
                    name="middleName"
                    value={formData.middleName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    placeholder="Иванович"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">E-mail *</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.email ? 'border border-red-500' : ''}`}
                    placeholder="example@email.com"
                  />
                  {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Телефон *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.phone ? 'border border-red-500' : ''}`}
                    placeholder="+7 (XXX) XXX-XX-XX"
                  />
                  {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Пароль *</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.password ? 'border border-red-500' : ''}`}
                    placeholder="••••••••"
                  />
                  {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Подтвердите пароль *</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.confirmPassword ? 'border border-red-500' : ''}`}
                    placeholder="••••••••"
                  />
                  {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              </>
            ) : (
              <>
                {/* Country/City (auto-detected) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-muted mb-2">Страна *</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.country ? 'border border-red-500' : ''}`}
                      placeholder="Россия"
                    />
                    {errors.country && <p className="text-red-400 text-xs mt-1">{errors.country}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-muted mb-2">Город *</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm ${errors.city ? 'border border-red-500' : ''}`}
                      placeholder="Москва"
                    />
                    {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
                  </div>
                </div>

                {/* My Group */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Моя группа</label>
                  <input
                    type="text"
                    name="myGroup"
                    value={formData.myGroup}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    placeholder="Название группы"
                  />
                </div>

                {/* Work Place */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Мой работодатель</label>
                  <input
                    type="text"
                    name="workPlace"
                    value={formData.workPlace}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    placeholder="Компания"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">О себе</label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    rows={3}
                    placeholder="Расскажите немного о себе..."
                  />
                </div>

                {/* Education */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Образование</label>
                  <textarea
                    name="education"
                    value={formData.education}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    rows={2}
                    placeholder="Где и что изучали"
                  />
                </div>

                {/* Interests */}
                <div>
                  <label className="block text-sm font-medium text-dark-muted mb-2">Мои интересы</label>
                  <textarea
                    name="interests"
                    value={formData.interests}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                    rows={2}
                    placeholder="Ваши интересы"
                  />
                </div>

                {/* Seller/Employer checkboxes */}
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="isSeller"
                      checked={formData.isSeller}
                      onChange={handleChange}
                      className="w-5 h-5 text-blue-500 bg-dark-bg/60 border-dark-border rounded focus:ring-blue-400"
                    />
                    <label className="ml-3 text-sm text-dark-text">Являюсь продавцом</label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="isEmployer"
                      checked={formData.isEmployer}
                      onChange={handleChange}
                      className="w-5 h-5 text-blue-500 bg-dark-bg/60 border-dark-border rounded focus:ring-blue-400"
                    />
                    <label className="ml-3 text-sm text-dark-text">Являюсь работодателем</label>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold text-lg shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {step === 1 ? 'Проверка...' : 'Создание...'}
                </div>
              ) : step === 1 ? (
                'Продолжить'
              ) : (
                'Создать аккаунт'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => step === 1 ? navigate('/login') : setStep(1)}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              {step === 1 ? 'Уже есть аккаунт? Войти' : 'Назад к регистрации'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Registration;