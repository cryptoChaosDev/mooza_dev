// Уведомления модерации артистов (верификация).
//
//  - Заявка на верификацию → чат команды в Telegram (tgLog) и каждому админу
//    платформы через notify(): колокольчик → push → личный Telegram-бот, если
//    админ его подключил (index.ts: tgNotifyFromRow).
//  - Решение модератора и отзыв заявки → отметка в чате команды, чтобы остальные
//    админы видели, что заявка уже разобрана.
//  Результат самому артисту шлёт routes/admin.ts (notifyMany → push).
//
// В чат команды — без ФИО (152-ФЗ): только артист (публичная сущность) и ссылки.
import { prisma } from '../index';
import { tgEvent } from '../utils/telegram';
import { notifyMany } from '../utils/notify';
import { ARTIST_TYPE_LABELS } from '../seo/render/labels';
import logger from '../utils/logger';

/** Вкладка «Модерация» админки (client/src/pages/AdminPage.tsx читает ?tab=). */
export const ADMIN_MODERATION_PATH = '/admin?tab=moderation';

const appUrl = () => (process.env.APP_URL || 'https://moooza.ru').replace(/\/+$/, '');

type ArtistForRequest = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  verificationProofUrl: string | null;
};

/** Новая заявка на верификацию. Never throws. */
export async function notifyVerificationRequested(
  artist: ArtistForRequest,
  requesterId: string,
  confirmedMembers: number,
): Promise<void> {
  try {
    await tgEvent.artistVerificationRequest({
      name: artist.name,
      type: artist.type ? (ARTIST_TYPE_LABELS[artist.type] ?? artist.type) : null,
      city: artist.city,
      members: confirmedMembers,
      proofUrl: artist.verificationProofUrl,
      artistUrl: `${appUrl()}/artist/${artist.id}`,
      moderationUrl: `${appUrl()}${ADMIN_MODERATION_PATH}`,
    });

    // Подавший заявку админ платформы сам себе уведомление не получает.
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, id: { not: requesterId } },
      select: { id: true },
    });
    await notifyMany(admins.map((a) => a.id), {
      actorId: requesterId,
      type: 'admin_artist_verification',
      title: 'Заявка на верификацию',
      body: `«${artist.name}» ждёт проверки в разделе «Модерация».`,
      link: ADMIN_MODERATION_PATH,
    });
  } catch (err: any) {
    logger.warn(`[artistModeration] request notify failed for ${artist.id}: ${err?.message}`);
  }
}

export type VerificationDecision = 'verified' | 'rejected' | 'withdrawn';

/** Решение модератора или отзыв заявки — отметка в чате команды. Never throws. */
export async function notifyVerificationDecision(
  artist: { id: string; name: string },
  decision: VerificationDecision,
  reason?: string | null,
): Promise<void> {
  try {
    await tgEvent.artistModeration(decision, artist.name, `${appUrl()}/artist/${artist.id}`, reason ?? undefined);
  } catch (err: any) {
    logger.warn(`[artistModeration] decision notify failed for ${artist.id}: ${err?.message}`);
  }
}
