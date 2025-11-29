import { useState, useEffect, useCallback } from 'react';
import { apiMe, getProfile } from '../api';
import { UserProfile } from '../types';

export const useProfile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      setProfile(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const me = await apiMe(token);
      const { id, email, phone } = me;
      const { profile: p } = await getProfile(token);
      
      if (p) {
        const hydrated: UserProfile = {
          userId: String(id),
          firstName: p.firstName,
          lastName: p.lastName,
          name: `${p.firstName} ${p.lastName}`.trim(),
          bio: p.bio || '',
          workPlace: p.workPlace || '',
          skills: p.skills || [],
          interests: p.interests || [],
          portfolio: p.portfolio || { text: '' },
          phone: phone,
          email: email,
          vkId: '', youtubeId: '', telegramId: '',
          city: p.city || '',
          country: p.country || '',
          avatarUrl: p.avatarUrl || undefined,
        };
        setProfile(hydrated);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Failed to load profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return { profile, setProfile, loading, error, refreshProfile };
};