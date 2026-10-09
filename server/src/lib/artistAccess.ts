// Права на артиста — ЕДИНСТВЕННЫЙ источник истины: подтверждённая (ACCEPTED)
// строка UserArtist. Владелец (isOwner) ≥ админ (isAdmin) — после передачи
// владения у владельца может не быть флага isAdmin, но права у него есть.
// Системный админ сайта прав на чужого артиста НЕ имеет; Artist.submittedById
// (кто когда-то подал заявку) прав не даёт.
import { Prisma } from '@prisma/client';
import { prisma } from '../index';

export interface ArtistAccess {
  membershipId: string | null;
  isOwner: boolean;
  isAdmin: boolean; // true и для владельца
}

export async function getArtistAccess(artistId: string, userId: string | undefined | null): Promise<ArtistAccess> {
  if (!userId) return { membershipId: null, isOwner: false, isAdmin: false };
  const ua = await prisma.userArtist.findFirst({
    where: { artistId, userId, inviteStatus: 'ACCEPTED', OR: [{ isAdmin: true }, { isOwner: true }] },
    select: { id: true, isOwner: true },
    orderBy: { isOwner: 'desc' },
  });
  if (!ua) return { membershipId: null, isOwner: false, isAdmin: false };
  return { membershipId: ua.id, isOwner: ua.isOwner, isAdmin: true };
}

/** Подтверждённый админ ИЛИ владелец артиста. */
export async function isArtistAdmin(artistId: string, userId: string | undefined | null): Promise<boolean> {
  return (await getArtistAccess(artistId, userId)).isAdmin;
}

/** id всех подтверждённых админов и владельцев артиста (для уведомлений). */
export async function artistAdminIds(artistId: string): Promise<string[]> {
  const rows = await prisma.userArtist.findMany({
    where: { artistId, inviteStatus: 'ACCEPTED', OR: [{ isAdmin: true }, { isOwner: true }] },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** id подтверждённых владельцев артиста. */
export async function artistOwnerIds(artistId: string): Promise<string[]> {
  const rows = await prisma.userArtist.findMany({
    where: { artistId, inviteStatus: 'ACCEPTED', isOwner: true },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * Проверяет набор id ролей каталога: все существуют и относятся к нужному
 * контексту. Возвращает дедуплицированный список либо null (невалидно).
 */
export async function resolveRoleIds(
  raw: unknown,
  context: 'COLLECTIVE' | 'RELEASE' | 'CLIP',
  max = 20,
): Promise<string[] | null> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.some((r) => typeof r !== 'string' || !r || r.length > 64)) return null;
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > max) return null;
  if (!ids.length) return [];
  const found = await prisma.role.count({ where: { id: { in: ids }, context } });
  return found === ids.length ? ids : null;
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export function isFkViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2003' || e.code === 'P2025');
}
