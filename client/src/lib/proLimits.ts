// Pro limits — mirror of server/src/utils/pro.ts. Keep both in sync.

export interface ProLimits {
  portfolioFiles: number;
  portfolioFileMB: number;
  channels: number;
  bioChars: number;
  gifAvatar: boolean;
  feedPresets: number;
}

export const PRO_LIMITS: { free: ProLimits; pro: ProLimits } = {
  free: { portfolioFiles: 10, portfolioFileMB: 20, channels: 1,        bioChars: 100, gifAvatar: false, feedPresets: 1 },
  pro:  { portfolioFiles: 20, portfolioFileMB: 50, channels: Infinity, bioChars: 200, gifAvatar: true,  feedPresets: Infinity },
};

export interface ProUserLike {
  isPro?: boolean | null;
  proUntil?: string | Date | null;
}

/** Effective Pro = manual flag OR unexpired proUntil. */
export function isProActive(u: ProUserLike | null | undefined): boolean {
  if (!u) return false;
  if (u.isPro) return true;
  return !!(u.proUntil && new Date(u.proUntil).getTime() > Date.now());
}

/** Resolve the effective limit set for a user (or a boolean pro flag). */
export function limitsFor(u: ProUserLike | boolean): ProLimits {
  const pro = typeof u === 'boolean' ? u : isProActive(u);
  return PRO_LIMITS[pro ? 'pro' : 'free'];
}
