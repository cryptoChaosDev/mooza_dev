import React, { useState } from 'react';
import { InterestSelector } from '../InterestSelector';
import { UserProfile } from '../types';
import { useToast } from '../contexts/ToastContext';
import { updateProfile } from '../api';
import { useNavigate } from 'react-router-dom';

export function SkillsInterests({ profile, setProfile }: {
  profile: UserProfile,
  setProfile: (p: UserProfile) => void,
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<string[]>(profile.skills || []);
  const [interests, setInterests] = useState<string[]>(profile.interests || []);
  const [saving, setSaving] = useState(false);

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

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md px-4">
        <div className="bg-dark-card rounded-3xl shadow-card p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark-text">Навыки и интересы</h2>
            <button className="text-sm text-dark-muted" onClick={() => navigate(-1)}>Назад</button>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <div className="text-sm text-dark-muted font-semibold mb-2">Навыки</div>
              <InterestSelector selected={skills} onChange={setSkills} />
            </div>

            <div>
              <div className="text-sm text-dark-muted font-semibold mb-2">Интересы</div>
              <InterestSelector selected={interests} onChange={setInterests} />
            </div>

            <div className="pt-3">
              <button
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SkillsInterests;
