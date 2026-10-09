// Ссылки-приглашения в артиста (ArtistInvite): проверка срока/лимита и
// вступление по ссылке. Используется в routes/artists.ts (POST
// /api/artists/invite/:token/accept) и должно использоваться в routes/auth.ts
// (регистрация по ссылке /register?artistInvite=… и её «потребление» после
// подтверждения email) — чтобы истёкшая/исчерпанная ссылка не работала нигде.
import type { ArtistInvite } from '@prisma/client';
import { prisma } from '../index';
import { notifyMany } from '../utils/notify';
import { artistAdminIds, isUniqueViolation } from './artistAccess';

/** Срок жизни новой ссылки-приглашения. */
export const ARTIST_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ArtistInviteError = {
  ok: false;
  status: 400 | 404 | 409 | 410;
  code: 'BAD_TOKEN' | 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED' | 'JOIN_REQUEST_PENDING';
  error: string;
};

export type ArtistInviteCheck = { ok: true; invite: ArtistInvite } | ArtistInviteError;

function inviteState(invite: Pick<ArtistInvite, 'expiresAt' | 'maxUses' | 'usedCount'>, now = new Date()): 'ok' | 'EXPIRED' | 'EXHAUSTED' {
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return 'EXHAUSTED';
  return 'ok';
}

/**
 * Проверка ссылки-приглашения: существует, не истекла, не исчерпана.
 * Ничего не меняет (для превью и «можно ли регистрироваться по приглашению»).
 */
export async function validateArtistInvite(token: unknown): Promise<ArtistInviteCheck> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return { ok: false, status: 400, code: 'BAD_TOKEN', error: 'Некорректная ссылка-приглашение' };
  }
  const invite = await prisma.artistInvite.findUnique({ where: { token } });
  if (!invite) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Приглашение не найдено' };
  const state = inviteState(invite);
  if (state === 'EXPIRED') {
    return { ok: false, status: 410, code: 'EXPIRED', error: 'Срок действия приглашения истёк — попросите новую ссылку' };
  }
  if (state === 'EXHAUSTED') {
    return { ok: false, status: 410, code: 'EXHAUSTED', error: 'Ссылка-приглашение уже использована — попросите новую' };
  }
  return { ok: true, invite };
}

export type ArtistInviteAcceptResult =
  | { ok: true; artistId: string; alreadyMember: boolean }
  | ArtistInviteError;

/**
 * Вступление пользователя в артиста по ссылке (уже существующий пользователь
 * или только что подтвердивший email). Атомарно расходует одно использование
 * ссылки и создаёт ACCEPTED-участие с ролями из ссылки.
 *
 *  - уже подтверждённый участник → no-op (использование не тратится);
 *  - есть ПРИГЛАШЕНИЕ админа (PENDING, invitedById) → принимается (это согласие
 *    приглашённого, как PATCH /memberships/:id/confirm);
 *  - есть собственная ЗАЯВКА (PENDING, invitedById = null) → 409: заявку решает
 *    админ артиста, ссылка её в обход одобрения не подтверждает;
 *  - DECLINED/ARCHIVED-история не мешает: создаётся новое участие.
 */
export async function acceptArtistInvite(token: unknown, userId: string): Promise<ArtistInviteAcceptResult> {
  const check = await validateArtistInvite(token);
  if (!check.ok) return check;
  const invite = check.invite;

  const live = await prisma.userArtist.findFirst({
    where: { artistId: invite.artistId, userId, inviteStatus: { in: ['PENDING', 'ACCEPTED'] } },
    select: { id: true, inviteStatus: true, invitedById: true },
  });
  if (live?.inviteStatus === 'ACCEPTED') return { ok: true, artistId: invite.artistId, alreadyMember: true };
  if (live && !live.invitedById) {
    return {
      ok: false,
      status: 409,
      code: 'JOIN_REQUEST_PENDING',
      error: 'Ваша заявка на участие уже на рассмотрении у администраторов артиста',
    };
  }

  // Роли из ссылки могли удалить из каталога после её создания — берём живые.
  const roleIds = invite.roleIds.length
    ? (await prisma.role.findMany({
        where: { id: { in: invite.roleIds }, context: 'COLLECTIVE' },
        select: { id: true },
      })).map((r) => r.id)
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      // Атомарный расход использования: истёкшая/исчерпанная (в т.ч. гонкой
      // параллельных запросов) ссылка не пройдёт.
      const used = await tx.$executeRaw`
        UPDATE "ArtistInvite"
           SET "usedCount" = "usedCount" + 1
         WHERE "id" = ${invite.id}
           AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
           AND ("expiresAt" IS NULL OR "expiresAt" > NOW())`;
      if (used === 0) throw new InviteExhausted();

      if (live) {
        await tx.userArtist.update({ where: { id: live.id }, data: { inviteStatus: 'ACCEPTED' } });
      } else {
        await tx.userArtist.create({
          data: {
            userId,
            artistId: invite.artistId,
            professionId: null,
            isOwner: false,
            isAdmin: false,
            inviteStatus: 'ACCEPTED',
            participationStatus: invite.participationStatus,
            roles: roleIds.length ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof InviteExhausted) {
      return { ok: false, status: 410, code: 'EXHAUSTED', error: 'Ссылка-приглашение больше не действует — попросите новую' };
    }
    // Параллельный запрос того же пользователя уже создал участие.
    if (isUniqueViolation(e)) return { ok: true, artistId: invite.artistId, alreadyMember: true };
    throw e;
  }

  // Уведомить админов/владельца артиста о новом участнике.
  try {
    const [artist, user] = await Promise.all([
      prisma.artist.findUnique({ where: { id: invite.artistId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
    ]);
    const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Пользователь';
    const recipients = (await artistAdminIds(invite.artistId)).filter((id) => id !== userId);
    await notifyMany(recipients, {
      actorId: userId,
      type: 'artist_member_joined_link',
      title: artist?.name ?? 'Артист',
      body: `${name} вступил(а) в «${artist?.name ?? ''}» по ссылке-приглашению.`,
      link: `/artist/${invite.artistId}`,
    });
  } catch { /* уведомление не должно ломать вступление */ }

  return { ok: true, artistId: invite.artistId, alreadyMember: false };
}

class InviteExhausted extends Error {}
