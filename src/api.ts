const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export type LoginResponse = { token: string; user: { id: number; email?: string; phone?: string; name: string } };

export async function apiRegister(data: { email?: string; phone?: string; password: string; name: string }): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Регистрация не удалась';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function apiLogin(data: { email?: string; phone?: string; password: string }): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Неверные данные для входа';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function apiMe(token: string): Promise<{ id: number; email?: string; phone?: string; name: string }> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось получить профиль');
  return res.json();
}

export type ProfilePayload = {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  bio?: string;
  workPlace?: string;
  skills?: string[];
  interests?: string[];
  portfolio?: { text?: string; fileUrl?: string } | null;
  city?: string;
  country?: string;
};

export async function getProfile(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/profile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return res.json();
}

export async function updateProfile(token: string, payload: ProfilePayload): Promise<any> {
  const res = await fetch(`${API_URL}/profile/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Не удалось сохранить профиль');
  return res.json();
}

// New function to fetch all users
export async function getAllUsers(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return res.json();
}