// Profile completion meter — 10 equally-weighted fields (10% each). Shown on the
// owner's own profile to nudge completion; hidden once the profile is 100% filled.

interface Props {
  profile: any;
}

const FIELDS: { key: string; hint: string; filled: (p: any) => boolean }[] = [
  { key: 'avatar', hint: 'Добавьте фото профиля', filled: (p) => !!p?.avatar },
  { key: 'firstName', hint: 'Укажите имя', filled: (p) => !!p?.firstName },
  { key: 'lastName', hint: 'Укажите фамилию', filled: (p) => !!p?.lastName },
  { key: 'nickname', hint: 'Придумайте никнейм', filled: (p) => !!p?.nickname },
  { key: 'city', hint: 'Укажите город', filled: (p) => !!p?.city },
  { key: 'bio', hint: 'Расскажите о себе', filled: (p) => !!(p?.bio && String(p.bio).trim()) },
  { key: 'professions', hint: 'Добавьте профессию', filled: (p) => (p?.userProfessions?.length ?? 0) > 0 },
  { key: 'services', hint: 'Добавьте услугу', filled: (p) => (p?.userServices?.length ?? 0) > 0 },
  {
    key: 'portfolio',
    hint: 'Добавьте работы в портфолио',
    filled: (p) => (p?.portfolioFiles?.length ?? 0) > 0 || (p?.portfolioLinks?.length ?? 0) > 0,
  },
  {
    key: 'contacts',
    hint: 'Добавьте контакты или соцсети',
    filled: (p) => {
      const s = (p?.socialLinks as Record<string, string>) || {};
      return Object.values(s).some(Boolean) || !!p?.phone || !!p?.email;
    },
  },
];

// Profile completion as a 0–100 percentage (10 equally-weighted fields).
// Reused for the avatar completion ring.
export function profileCompletion(profile: any): number {
  if (!profile) return 0;
  const filled = FIELDS.filter((f) => f.filled(profile)).length;
  return Math.round((filled / FIELDS.length) * 100);
}

export default function ProfileProgressBar({ profile }: Props) {
  if (!profile) return null;
  const filledCount = FIELDS.filter((f) => f.filled(profile)).length;
  const pct = profileCompletion(profile);
  if (pct >= 100) return null; // nothing to nudge — keep a complete profile clean

  const nextHint = FIELDS.find((f) => !f.filled(profile))?.hint;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">Профиль заполнен на {pct}%</span>
        <span className="text-xs text-slate-500">{filledCount}/{FIELDS.length}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {nextHint && <p className="text-xs text-slate-400 mt-2">Следующий шаг: {nextHint}</p>}
    </div>
  );
}
