import type { Request } from 'express';
import { prisma } from '../index';

/**
 * Журнал согласий (152-ФЗ): каждая выдача и отзыв — запись ConsentEvent.
 * Запись best-effort: сбой журнала никогда не ломает основной сценарий
 * (регистрацию, выдачу/отзыв согласия).
 */

export type ConsentType = 'pd_public' | 'pd' | 'marketing' | 'terms';
export type ConsentAction = 'grant' | 'revoke';

// Редакции документов (client/public/legal/*.html — «Редакция от 31 мая 2026 г.»).
export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  pd_public: '2026-05-31',
  pd: '2026-05-31',
  marketing: '2026-05-31',
  terms: '2026-05-31',
};

const MAX_UA = 512;
const MAX_SOURCE = 32;

/** Источник из тела запроса: только [a-z_-], до 32 символов; иначе fallback. */
export function sanitizeConsentSource(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z_-]{1,32}$/.test(s) ? s : fallback;
}

export function requestMeta(req?: Request | null): { ip: string | null; userAgent: string | null } {
  if (!req) return { ip: null, userAgent: null };
  const ua = typeof req.get === 'function' ? req.get('user-agent') : undefined;
  return {
    ip: req.ip ? String(req.ip).slice(0, 64) : null,
    userAgent: ua ? String(ua).slice(0, MAX_UA) : null,
  };
}

export interface ConsentEventInput {
  userId: string;
  type: ConsentType;
  action: ConsentAction;
  version?: string | null;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordConsentEvent(input: ConsentEventInput): Promise<void> {
  try {
    await prisma.consentEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        action: input.action,
        version: input.version ?? CONSENT_VERSIONS[input.type] ?? null,
        source: input.source ? String(input.source).slice(0, MAX_SOURCE) : null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ? String(input.userAgent).slice(0, MAX_UA) : null,
      },
    });
  } catch (err) {
    console.error('[consent] failed to record ConsentEvent:', err);
  }
}
