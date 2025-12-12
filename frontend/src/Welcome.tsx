import React, { useState } from "react";
import { apiLogin, apiRegister, getProfile } from "./api";
import { useToast } from "./contexts/ToastContext";

export function WelcomePage({ onFinish }: { onFinish: (profile: any) => void }) {
  const [showLogin, setShowLogin] = useState(true);
  const [loginPending, setLoginPending] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginUsePhone, setLoginUsePhone] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  
  // Registration states
  const [regPending, setRegPending] = useState(false);
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  
  // Validation
  const validFirstName = regFirstName.length >= 2 && regFirstName.length <= 50;
  const validLastName = regLastName.length >= 2 && regLastName.length <= 50;
  const validRegEmail = regEmail.includes('@') && regEmail.includes('.') && regEmail.length <= 255;
  const validRegPhone = regPhone.replace(/\D/g, '').length >= 10;
  const passwordsMatch = regPassword === regConfirmPassword;
  
  // Password strength validation
  const getPasswordStrength = (password: string) => {
    const hasLength = password.length >= 12; // Increased minimum length
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const strength = [
      hasLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecial
    ].filter(Boolean).length;
    
    return {
      strength,
      hasLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecial
    };
  };
  
  const passwordStrength = getPasswordStrength(regPassword);
  const validRegPassword = passwordStrength.strength >= 4;
  
  // Helpers
  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('8')) return '+7' + digits.slice(1);
    if (digits.startsWith('7')) return '+7' + digits.slice(1);
    return '+' + digits;
  };

  // Handle Enter key press for form submission
  const handleKeyPress = (e: React.KeyboardEvent, formType: 'login' | 'register') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (formType === 'login' && !loginPending && 
          ((!loginUsePhone && loginEmail) || (loginUsePhone && loginPhone.replace(/\D/g,'').length >= 10)) && 
          loginPassword.length >= 8) {
        // Trigger login button click
        const loginButton = document.querySelector('[data-testid="login-button"]') as HTMLButtonElement;
        if (loginButton) loginButton.click();
      } else if (formType === 'register' && !regPending && 
                 validFirstName && validLastName && validRegEmail && validRegPhone && validRegPassword && passwordsMatch) {
        // Trigger register button click
        const registerButton = document.querySelector('[data-testid="register-button"]') as HTMLButtonElement;
        if (registerButton) registerButton.click();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-card to-dark-bg/90 flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md bg-dark-card rounded-3xl shadow-2xl p-6 sm:p-8 transition-all duration-300 animate-fade-in animate-scale-in">
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <span className="text-4xl font-bold select-none" style={{ 
              fontFamily: 'Pacifico, cursive', 
              background: 'linear-gradient(90deg,#4F8CFF,#38BDF8,#f472b6 80%)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent' 
            }}>
              Mooza
            </span>
            <div className="absolute -top-2 -right-6 text-2xl animate-pulse">✨</div>
          </div>
          
          <h1 className="text-2xl font-bold text-dark-text text-center mb-2">
            {showLogin ? 'Вход в аккаунт' : 'Создать аккаунт'}
          </h1>
          <p className="text-dark-muted text-center text-sm">
            {showLogin 
              ? 'Войдите в свой аккаунт, чтобы продолжить' 
              : 'Присоединяйтесь к сообществу музыкантов'}
          </p>
        </div>
        
        {/* Login Form */}
        {showLogin ? (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 p-1 bg-dark-bg/40 rounded-2xl">
              <button 
                type="button" 
                className={`flex-1 py-2 text-sm rounded-xl transition-all ${!loginUsePhone ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-text'}`}
                onClick={() => setLoginUsePhone(false)}
              >
                Email
              </button>
              <button 
                type="button" 
                className={`flex-1 py-2 text-sm rounded-xl transition-all ${loginUsePhone ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-text'}`}
                onClick={() => setLoginUsePhone(true)}
              >
                Телефон
              </button>
            </div>
            
            {!loginUsePhone ? (
              <div>
                <input
                  className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none"
                  placeholder="Email"
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  autoComplete="email"
                  aria-label="Email для входа"
                  onKeyDown={(e) => handleKeyPress(e, 'login')}
                />
              </div>
            ) : (
              <div>
                <input
                  className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none"
                  placeholder="Телефон"
                  value={loginPhone}
                  onChange={e => setLoginPhone(e.target.value)}
                  autoComplete="tel"
                  aria-label="Номер телефона для входа"
                  onKeyDown={(e) => handleKeyPress(e, 'login')}
                />
              </div>
            )}
            
            <div>
              <input
                className="w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none"
                placeholder="Пароль"
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="Пароль для входа"
                onKeyDown={(e) => handleKeyPress(e, 'login')}
              />
            </div>
            
            {loginError && (
              <div className="text-red-400 text-sm text-center py-2 px-3 bg-red-500/10 rounded-xl">
                {loginError}
              </div>
            )}
            
            <button
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg text-base active:scale-95 transition-all disabled:opacity-60 hover:opacity-90"
              disabled={loginPending || (!loginUsePhone && !loginEmail) || (loginUsePhone && loginPhone.replace(/\D/g,'').length < 10) || loginPassword.length < 8}
              onClick={async () => {
                try {
                  setLoginError(null);
                  setLoginPending(true);
                  const { token, user } = await apiLogin(loginUsePhone ? { phone: normalizePhone(loginPhone), password: loginPassword } : { email: loginEmail.trim(), password: loginPassword });
                  localStorage.setItem('token', token);
                  
                  // Fetch the actual profile data from the server
                  try {
                    const { profile: serverProfile } = await getProfile(token);
                    if (serverProfile) {
                      onFinish({
                        userId: String(user.id),
                        firstName: serverProfile.firstName || user.name?.split(' ')[0] || 'User',
                        lastName: serverProfile.lastName || user.name?.split(' ').slice(1).join(' ') || '',
                        name: user.name || 'User',
                        bio: serverProfile.bio || '',
                        skills: Array.isArray(serverProfile.skills) ? serverProfile.skills : (serverProfile.skills ? serverProfile.skills.split(',') : []),
                        interests: Array.isArray(serverProfile.interests) ? serverProfile.interests : (serverProfile.interests ? serverProfile.interests.split(',') : []),
                        email: user.email,
                        phone: (user as any).phone,
                        workPlace: serverProfile.workPlace || '',
                        city: serverProfile.city || '',
                        country: serverProfile.country || '',
                        avatarUrl: serverProfile.avatarUrl || '',
                      });
                    }
                  } catch (e: any) {
                    setLoginError(e?.message || 'Ошибка входа');
                  } finally {
                    setLoginPending(false);
                  }
                } catch (e: any) {
                  setLoginError(e?.message || 'Ошибка входа');
                } finally {
                  setLoginPending(false);
                }
              }}
              data-testid="login-button"
              aria-label="Войти в аккаунт"
            >
              {loginPending ? 'Входим...' : 'Войти'}
            </button>
            
            <div className="text-center pt-2">
              <button 
                className="text-dark-accent hover:underline text-sm"
                onClick={() => setShowLogin(false)}
              >
                Нет аккаунта? Создать
              </button>
            </div>
          </div>
        ) : (
          // Registration Form
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${validFirstName ? '' : 'border border-red-500'}`}
                placeholder="Имя"
                value={regFirstName}
                onChange={e => setRegFirstName(e.target.value)}
                autoComplete="given-name"
                aria-label="Имя"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${validLastName ? '' : 'border border-red-500'}`}
                placeholder="Фамилия"
                value={regLastName}
                onChange={e => setRegLastName(e.target.value)}
                autoComplete="family-name"
                aria-label="Фамилия"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
            </div>
            
            <div>
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${validRegEmail ? '' : 'border border-red-500'}`}
                placeholder="Email"
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                autoComplete="email"
                aria-label="Email для регистрации"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
            </div>
            
            <div>
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${validRegPhone ? '' : 'border border-red-500'}`}
                placeholder="Телефон"
                value={regPhone}
                onChange={e => setRegPhone(e.target.value)}
                autoComplete="tel"
                maxLength={18}
                aria-label="Номер телефона для регистрации"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
            </div>
            
            <div>
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${validRegPassword ? '' : 'border border-red-500'}`}
                placeholder="Пароль (минимум 12 символов)"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                maxLength={64}
                type="password"
                autoComplete="new-password"
                aria-label="Пароль для регистрации"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
              
              {/* Password strength indicator */}
              {regPassword && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-dark-muted">Надежность пароля</span>
                    <span className="text-xs text-dark-muted">
                      {passwordStrength.strength < 2 ? 'Слабый' : 
                       passwordStrength.strength < 4 ? 'Средний' : 'Сильный'}
                    </span>
                  </div>
                  <div className="w-full bg-dark-bg/60 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        passwordStrength.strength < 2 ? 'bg-red-500' : 
                        passwordStrength.strength < 4 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-dark-muted space-y-1">
                    <div className={passwordStrength.hasLength ? 'text-green-400' : ''}>
                      • Минимум 12 символов {passwordStrength.hasLength && '✓'}
                    </div>
                    <div className={passwordStrength.hasUpperCase ? 'text-green-400' : ''}>
                      • Заглавная буква {passwordStrength.hasUpperCase && '✓'}
                    </div>
                    <div className={passwordStrength.hasLowerCase ? 'text-green-400' : ''}>
                      • Строчная буква {passwordStrength.hasLowerCase && '✓'}
                    </div>
                    <div className={passwordStrength.hasNumbers ? 'text-green-400' : ''}>
                      • Цифра {passwordStrength.hasNumbers && '✓'}
                    </div>
                    <div className={passwordStrength.hasSpecial ? 'text-green-400' : ''}>
                      • Специальный символ {passwordStrength.hasSpecial && '✓'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <input 
                className={`w-full px-4 py-3 rounded-2xl bg-dark-bg/60 text-dark-text shadow-inner focus:ring-2 focus:ring-blue-400 text-base outline-none ${passwordsMatch ? '' : 'border border-red-500'}`}
                placeholder="Подтвердите пароль"
                value={regConfirmPassword}
                onChange={e => setRegConfirmPassword(e.target.value)}
                maxLength={64}
                type="password"
                autoComplete="new-password"
                aria-label="Подтверждение пароля"
                onKeyDown={(e) => handleKeyPress(e, 'register')}
              />
            </div>
            
            {regError && (
              <div className="text-red-400 text-sm text-center py-2 px-3 bg-red-500/10 rounded-xl">
                {regError}
              </div>
            )}
            
            <button
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg text-base active:scale-95 transition-all disabled:opacity-60 hover:opacity-90"
              disabled={regPending || !validFirstName || !validLastName || !validRegEmail || !validRegPhone || !validRegPassword || !passwordsMatch}
              onClick={async () => {
                try {
                  setRegError(null);
                  setRegPending(true);
                  const name = `${regFirstName} ${regLastName}`.trim() || 'User';
                  const payload: any = { password: regPassword, name, email: regEmail.trim(), phone: normalizePhone(regPhone) };
                  const { token, user } = await apiRegister(payload);
                  localStorage.setItem('token', token);
                  
                  // Fetch the actual profile data from the server
                  try {
                    const { profile: serverProfile } = await getProfile(token);
                    if (serverProfile) {
                      onFinish({
                        userId: String(user.id),
                        firstName: serverProfile.firstName || regFirstName,
                        lastName: serverProfile.lastName || regLastName,
                        name: `${serverProfile.firstName || regFirstName} ${serverProfile.lastName || regLastName}`.trim() || name,
                        bio: serverProfile.bio || '',
                        skills: Array.isArray(serverProfile.skills) ? serverProfile.skills : (serverProfile.skills ? serverProfile.skills.split(',') : []),
                        interests: Array.isArray(serverProfile.interests) ? serverProfile.interests : (serverProfile.interests ? serverProfile.interests.split(',') : []),
                        email: user.email,
                        phone: user.phone,
                        workPlace: serverProfile.workPlace || '',
                        city: serverProfile.city || '',
                        country: serverProfile.country || '',
                        avatarUrl: serverProfile.avatarUrl || '',
                      });
                    }
                  } catch (e: any) {
                    setRegError(e?.message || 'Ошибка регистрации');
                  } finally {
                    setRegPending(false);
                  }
                } catch (e: any) {
                  setRegError(e?.message || 'Ошибка регистрации');
                } finally {
                  setRegPending(false);
                }
              }}
              data-testid="register-button"
              aria-label="Создать аккаунт"
            >
              {regPending ? 'Создаем...' : 'Создать аккаунт'}
            </button>
            
            <div className="text-center pt-2">
              <button 
                className="text-dark-accent hover:underline text-sm"
                onClick={() => setShowLogin(true)}
              >
                Уже есть аккаунт? Войти
              </button>
            </div>
          </div>
        )}
        
        {/* Footer Stats */}
        <div className="mt-8 pt-6 border-t border-dark-bg/40 text-center">
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <div className="font-bold text-lg">1.2K+</div>
              <div className="text-dark-muted">Пользователей</div>
            </div>
            <div>
              <div className="font-bold text-lg">850+</div>
              <div className="text-dark-muted">Коллабораций</div>
            </div>
            <div>
              <div className="font-bold text-lg">24/7</div>
              <div className="text-dark-muted">Поддержка</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}