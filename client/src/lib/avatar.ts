const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Returns a display-ready avatar URL.
 * If avatar is already an absolute URL (e.g. from VK/Telegram), use as-is.
 * Otherwise, prepend the API base URL (local uploads).
 */
export function avatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
  return `${API_URL}${avatar}`;
}
