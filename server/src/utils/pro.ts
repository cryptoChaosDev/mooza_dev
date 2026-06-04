import { prisma } from '../index';
import { notify } from './notify';
import logger from './logger';

/**
 * Pro-account core.
 *
 * Effective Pro = manual override `isPro` OR an unexpired `proUntil`.
 * Pro time is granted one month at a time (donation or referral), always added
 * to the current expiry (or now, if lapsed), capped at MAX_PRO_MONTHS ahead.
 */

export const MAX_PRO_MONTHS = 6;

export interface ProUser {
  isPro?: boolean | null;
  proUntil?: Date | string | null;
}

/** True if the user currently has Pro (manual flag or unexpired subscription). */
export function isProActive(u: ProUser | null | undefined): boolean {
  if (!u) return false;
  if (u.isPro) return true;
  return !!(u.proUntil && new Date(u.proUntil).getTime() > Date.now());
}

/** Add `n` whole months to a date, clamping the day to the target month's length. */
export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

// ── Pro limits (mirror of client/src/lib/proLimits.ts) ──────────────────────
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

/** Resolve the effective limit set for a user (or a boolean pro flag). */
export function limitsFor(u: ProUser | boolean): ProLimits {
  const pro = typeof u === 'boolean' ? u : isProActive(u);
  return PRO_LIMITS[pro ? 'pro' : 'free'];
}

export type ProGrantSource = 'donation' | 'referral' | 'admin';

/**
 * Grant one month of Pro to a user.
 *
 * proUntil = min( max(proUntil, now) + 1 month , now + MAX_PRO_MONTHS ).
 * Returns the new expiry. Sends an in-app + push notification (unless silent).
 * Never throws on the notification path.
 */
export async function grantProMonth(
  userId: string,
  source: ProGrantSource,
  opts: { notifyUser?: boolean } = {},
): Promise<Date> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { proUntil: true } });
  if (!user) throw new Error(`grantProMonth: user ${userId} not found`);

  const now = new Date();
  const base = user.proUntil && user.proUntil.getTime() > now.getTime() ? user.proUntil : now;
  const next = addMonths(base, 1);
  const cap = addMonths(now, MAX_PRO_MONTHS);
  const proUntil = next.getTime() > cap.getTime() ? cap : next;

  await prisma.user.update({ where: { id: userId }, data: { proUntil } });

  if (opts.notifyUser !== false) {
    try {
      await notify({
        userId,
        type: 'pro_activated',
        title: 'Pro-аккаунт активирован',
        body: 'Спасибо, что поддерживаешь Moooza 🎵',
        link: '/pro',
      });
    } catch (err: any) {
      logger.warn(`grantProMonth: notify failed for ${userId}: ${err?.message}`);
    }
  }

  logger.info(`grantProMonth: ${userId} +1mo (${source}) -> ${proUntil.toISOString()}`);
  return proUntil;
}

/**
 * Referral → Pro reward: every 10 users a referrer brings in grants 1 month of
 * Pro automatically (capped at MAX_PRO_MONTHS concurrently by grantProMonth).
 *
 * Idempotent: `User.proMonthsFromReferrals` remembers how many referral-months
 * have already been granted, so the same registrations are never double-counted.
 * Never throws into the caller — safe to fire after signup.
 */
export const REFERRALS_PER_PRO_MONTH = 10;

export async function applyReferralProGrants(referrerId: string | null | undefined): Promise<void> {
  if (!referrerId) return;
  try {
    const referrer = await prisma.user.findUnique({
      where: { id: referrerId },
      select: { proMonthsFromReferrals: true },
    });
    if (!referrer) return;

    const count = await prisma.user.count({ where: { referrerId } });
    const earned = Math.floor(count / REFERRALS_PER_PRO_MONTH);
    const already = referrer.proMonthsFromReferrals;
    const delta = earned - already;
    if (delta <= 0) return;

    for (let i = 0; i < delta; i++) {
      await grantProMonth(referrerId, 'referral');
    }
    await prisma.user.update({
      where: { id: referrerId },
      data: { proMonthsFromReferrals: earned },
    });
    logger.info(`applyReferralProGrants: ${referrerId} ${already}->${earned} referral pro-month(s) (count=${count})`);
  } catch (err: any) {
    logger.error(`applyReferralProGrants failed for ${referrerId}: ${err?.message}`);
  }
}

// ── Donation code generation ────────────────────────────────────────────────
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars (0/O, 1/I)

/** Random 4-char donation code suffix, e.g. "K7Qd" -> "MOOOZA-K7Q4". */
export function genDonationCode(): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `MOOOZA-${suffix}`;
}
