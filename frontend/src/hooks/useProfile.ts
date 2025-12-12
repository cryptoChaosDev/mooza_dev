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
      
      const meResponse = await apiMe(token);
      console.log('apiMe response:', meResponse);
      
      const profileResponse = await getProfile(token);
      console.log('getProfile response:', profileResponse);
      
      if (profileResponse && profileResponse.profile) {
        const p = profileResponse.profile;
        const hydrated: UserProfile = {
          userId: String(meResponse.id),
          firstName: p.firstName,
          lastName: p.lastName,
          name: `${p.firstName} ${p.lastName}`.trim() || meResponse.name,
          bio: p.bio || '',
          workPlace: p.workPlace || '',
          skills: Array.isArray(p.skills) ? p.skills : (p.skills ? p.skills.split(',') : []),
          interests: Array.isArray(p.interests) ? p.interests : (p.interests ? p.interests.split(',') : []),
          portfolio: p.portfolio || { text: '' },
          phone: meResponse.phone || '',
          email: meResponse.email || '',
          vkId: p.vkId || '', 
          youtubeId: p.youtubeId || '', 
          telegramId: p.telegramId || '',
          city: p.city || '',
          country: p.country || '',
          avatarUrl: p.avatarUrl || undefined,
        };
        console.log('Hydrated profile:', hydrated);
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
    console.log('Refreshing profile...');
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return { profile, setProfile, loading, error, refreshProfile };
};