import { useState } from 'react';
import { avatarUrl } from '../lib/avatar';

// Палитра градиентов — назначается детерминированно по имени
const GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-sky-500 to-indigo-500',
];

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}

interface AvatarProps {
  /** raw avatar value from DB/API (absolute URL or /uploads/... path) */
  src?: string | null;
  /** used for initials and gradient color */
  name?: string | null;
  size?: number;        // px, default 40
  className?: string;
  textClassName?: string;
}

export default function Avatar({ src, name, size = 40, className = '', textClassName = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const resolved = src ? avatarUrl(src) : null;

  // Telegram URLs always 404 — skip immediately
  const isTelegram = resolved?.includes('t.me/');
  const showImage = resolved && !isTelegram && !failed;

  const label = name?.trim() || '?';
  const gradient = gradientFor(label);
  const fontSize = Math.max(10, Math.round(size * 0.38));

  return (
    <div
      className={`relative flex-shrink-0 flex items-center justify-center rounded-full overflow-hidden bg-gradient-to-br ${gradient} ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={resolved!}
          alt={label}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className={`font-bold text-white select-none ${textClassName}`}
          style={{ fontSize }}
        >
          {initials(label)}
        </span>
      )}
    </div>
  );
}
