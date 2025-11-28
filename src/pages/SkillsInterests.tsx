import React, { useState, useEffect } from 'react';
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
                <InterestSelector selected={skills} onChange={setSkills} />
              </div>
            ) : (
              <div>
                <div className="text-sm text-dark-muted font-semibold mb-3 sm:text-base">Выберите ваши интересы</div>
                <InterestSelector selected={interests} onChange={setInterests} />
              </div>
            )}
          </div>

          {/* Selected items preview */}
          {validSkills.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-dark-muted mb-2 uppercase tracking-wider">Выбранные навыки</div>
              <div className="flex flex-wrap gap-2">
                {validSkills.map((skill, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-none shadow-sm">
                    {getInterestPath(skill)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {validInterests.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-dark-muted mb-2 uppercase tracking-wider">Выбранные интересы</div>
              <div className="flex flex-wrap gap-2">
                {validInterests.map((interest, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-dark-bg/60 text-dark-text border-none shadow-sm">
                    {getInterestPath(interest)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3">
            <button
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all sm:py-5 sm:text-lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SkillsInterests;