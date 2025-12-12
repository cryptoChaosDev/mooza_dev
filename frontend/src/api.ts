export const API_URL = process.env.REACT_APP_API_URL || 'http://147.45.166.246';

export type LoginResponse = { token: string; user: { id: number; email?: string; phone?: string; name: string } };

export async function apiRegister(data: { email?: string; phone?: string; password: string; name: string }): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
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
  const res = await fetch(`${API_URL}/api/auth/login`, {
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
  const res = await fetch(`${API_URL}/api/auth/me`, {
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
  skills?: string;
  interests?: string;
  portfolio?: { text?: string; fileUrl?: string } | null;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
};

export async function getProfile(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return res.json();
}

export async function updateProfile(token: string, payload: ProfilePayload): Promise<any> {
  // Convert arrays to comma-separated strings if needed
  const processedPayload = {
    ...payload,
    skills: Array.isArray(payload.skills) ? payload.skills.join(',') : payload.skills,
    interests: Array.isArray(payload.interests) ? payload.interests.join(',') : payload.interests
  };

  const res = await fetch(`${API_URL}/api/profile/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(processedPayload),
  });
  if (!res.ok) throw new Error('Не удалось сохранить профиль');
  return res.json();
}

// New function to fetch all users
export async function getAllUsers(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return res.json();
}

// Friendships API functions using the new endpoints
export async function addFriend(token: string, userId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/friends/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = 'Не удалось добавить в друзья';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function removeFriend(token: string, userId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/friends/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = 'Не удалось удалить из друзей';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function getFriends(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/friends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить список друзей');
  return res.json();
}

// Posts API functions
export async function createPost(token: string, content: string, tags: string[], attachmentUrl?: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/posts`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ content, tags: tags.join(','), attachmentUrl }),
  });
  if (!res.ok) {
    let msg = 'Не удалось создать пост';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function getMyPosts(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/posts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить посты');
  return res.json();
}

export async function getAllPosts(token: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/posts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось загрузить посты');
  return res.json();
}

export async function updatePost(token: string, postId: number, content: string, tags: string[], attachmentUrl?: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/posts/${postId}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json', 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ content, tags: tags.join(','), attachmentUrl }),
  });
  if (!res.ok) {
    let msg = 'Не удалось обновить пост';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function deletePost(token: string, postId: number): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/me/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = 'Не удалось удалить пост';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function togglePostLike(token: string, postId: number): Promise<any> {
  const res = await fetch(`${API_URL}/api/profile/posts/${postId}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = 'Не удалось изменить статус лайка';
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}