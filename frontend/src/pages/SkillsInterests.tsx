import React, { useState } from 'react';
import { InterestSelector } from '../InterestSelector';
import { UserProfile } from '../types';
import { useToast } from '../contexts/ToastContext';
import { updateProfile } from '../api';
import { useNavigate } from 'react-router-dom';
import { getInterestPath } from '../utils';

export function SkillsInterests({ profile, setProfile }: {
  profile: UserProfile,
  setProfile: (p: UserProfile) => void,
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<string[]>(profile.skills || []);
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'skills' | 'interests'>('skills');

  const handleSave = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast('Ошибка авторизации');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        skills,
        interests,
      };
      const res = await updateProfile(token, payload as any);
      if (res && res.profile) {
        const updated = {
          ...profile,
          ...res.profile,
          skills: res.profile.skills || skills,
          interests: res.profile.interests || interests,
        } as UserProfile;
        setProfile(updated);
        toast('Навыки и интересы сохранены');
        navigate('/profile');
      } else {
        throw new Error('Некорректный ответ сервера');
      }
    } catch (err) {
      console.error('Error saving skills/interests', err);
      toast('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  // Filter out empty or invalid skills/interests
  const validSkills = skills.filter(skill => skill && typeof skill === 'string');
  const validInterests = interests.filter(interest => interest && typeof interest === 'string');

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md px-4">
        <div className="bg-dark-card rounded-3xl shadow-card p-6 mt-4 sm:p-7">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-dark-text sm:text-2xl">Навыки и интересы</h2>
            <button className="text-sm text-dark-muted hover:underline sm:text-base" onClick={() => navigate(-1)}>Назад</button>
          </div>

          {/* Progress indicator */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-dark-muted mb-2">
              <span>Заполненность профиля</span>
              <span>{Math.round(((validSkills.length + validInterests.length) / 20) * 100)}%</span>
            </div>
            <div className="h-2 bg-dark-bg/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(((validSkills.length + validInterests.length) / 20) * 100, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Tabs for Skills and Interests */}
          <div className="flex mb-6 bg-dark-bg/40 rounded-2xl p-1">
            <button
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'skills' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-muted'}`}
              onClick={() => setActiveTab('skills')}
            >
              Навыки
            </button>
            <button
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'interests' ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' : 'text-dark-muted'}`}
              onClick={() => setActiveTab('interests')}
            >
              Интересы
            </button>
          </div>

          {/* Content based on active tab */}
          <div className="mb-6">
            {activeTab === 'skills' ? (
              <div>
                <div className="text-sm text-dark-muted font-semibold mb-3 sm:text-base">Выберите ваши навыки</div>
                <InterestSelector 
                  selected={skills} 
                  onChange={setSkills} 
                  placeholder="Начните вводить навыки (например, гитара, вокал, продюсирование)..."
                />
              </div>
            ) : (
              <div>
                <div className="text-sm text-dark-muted font-semibold mb-3 sm:text-base">Выберите ваши интересы</div>
                <InterestSelector 
                  selected={interests} 
                  onChange={setInterests} 
                  placeholder="Начните вводить интересы (например, рок, джаз, электроника)..."
                />
              </div>
            )}
          </div>

          {/* Selected items preview with visual enhancements */}
          {(validSkills.length > 0 || validInterests.length > 0) && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-dark-muted mb-3 uppercase tracking-wider">Выбрано</div>
              <div className="flex flex-wrap gap-2">
                {validSkills.map((skill, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-2xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm flex items-center gap-1">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {getInterestPath(skill)}
                  </span>
                ))}
                {validInterests.map((interest, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-2xl text-sm font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-400/30 shadow-sm flex items-center gap-1">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {getInterestPath(interest)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tips section */}
          <div className="mb-6 bg-dark-bg/40 rounded-2xl p-4">
            <div className="text-sm font-semibold text-dark-muted mb-2 flex items-center gap-2">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Совет
            </div>
            <p className="text-sm text-dark-text">
              {activeTab === 'skills' 
                ? 'Добавьте навыки, которые характеризуют вашу профессиональную деятельность в музыке.'
                : 'Добавьте интересы, которые помогут найти единомышленников.'}
            </p>
          </div>

          <div className="pt-3">
            <button
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all sm:py-5 sm:text-lg flex items-center justify-center gap-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Сохранение...
                </>
              ) : (
                <>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Сохранить
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SkillsInterests;