import { Router, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser, isUserOnline } from '../socket';
import { uploadChatAttachment } from '../middleware/upload';
import { messageLimiter } from '../middleware/rateLimiter';
import { yoNorm } from '../utils/search';
import { tgLog } from '../utils/telegram';
import { notify, isNotificationEnabled } from '../utils/notify';

const router = Router();
// Lazy proxy — avoids circular-import TDZ when this module loads before prisma is initialized
const db: any = new Proxy({} as any, { get: (_: any, key: string | symbol) => (prisma as any)[key] });

// ─── Helpers ────────────────────────────────────────────────────────────────

const MSG_INCLUDE = {
  sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      attachmentName: true,
      deletedAt: true,
      sender: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  reactions: { select: { id: true, emoji: true, userId: true } },
};

const MEMBER_USER = {
  user: { select: { id: true, firstName: true, lastName: true, avatar: true, isPremium: true, isVerified: true, isBlocked: true } },
};

const CONV_INCLUDE = { members: { include: MEMBER_USER } };

// Лимиты
const GROUP_MAX_MEMBERS = 50;        // включая создателя
const GROUP_NAME_MAX = 100;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const CHAT_MAX_FILE_MB = 20;         // = limits.fileSize в uploadChatAttachment

/**
 * Удалённое сообщение (deletedAt) никогда не отдаёт клиенту текст, вложение,
 * расшифровку и реакции; цитата удалённого сообщения в replyTo — тоже пустая.
 * contentNorm — служебная колонка поиска (копия текста), наружу не отдаётся.
 */
function sanitizeMessage<T extends Record<string, any> | null | undefined>(m: T): T {
  if (!m) return m;
  const out: any = { ...m };
  delete out.contentNorm;
  if (out.deletedAt) {
    out.content = '';
    out.attachmentUrl = null;
    out.attachmentName = null;
    out.attachmentSize = null;
    out.attachmentType = null;
    out.transcript = null;
    out.reactions = [];
    out.replyTo = null;
  }
  if (out.replyTo) {
    out.replyTo = { ...out.replyTo };
    if (out.replyTo.deletedAt) {
      out.replyTo.content = '';
      out.replyTo.attachmentName = null;
    }
  }
  return out;
}

/** Не заблокирован ли пользователь (та же логика, что в middleware/auth). */
function notBlockedWhere(now = new Date()) {
  return { OR: [{ blockedUntil: { lt: now } }, { blockedUntil: null, isBlocked: false }] };
}

async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!m;
}

// ─── Вложения чата ───────────────────────────────────────────────────────────
// Принимаем ТОЛЬКО файлы, загруженные через /conversations/:id/upload
// (uploads/chat/chat-*), которые реально существуют на диске. Иначе в
// attachmentUrl можно подсунуть `@evil.com/x.png` (на клиенте превращается в
// https://moooza.ru@evil.com/... — фишинг/трекинг IP) или `javascript:`.
const CHAT_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'chat');
const CHAT_FILE_RE = /^chat-[\w.-]+$/;
const CHAT_URL_RE = /^\/uploads\/chat\/(chat-[\w.-]+)$/;

async function resolveChatAttachment(url: unknown): Promise<{ url: string; fileName: string; filePath: string; size: number } | null> {
  if (typeof url !== 'string') return null;
  const m = CHAT_URL_RE.exec(url);
  if (!m) return null;
  const filePath = path.resolve(CHAT_UPLOAD_DIR, m[1]);
  if (path.dirname(filePath) !== CHAT_UPLOAD_DIR) return null;
  try {
    const st = await fs.promises.stat(filePath);
    if (!st.isFile()) return null;
    return { url, fileName: m[1], filePath, size: st.size };
  } catch {
    return null;
  }
}

// Тип вложения определяется сервером по расширению сохранённого файла.
// Для «двойственных» контейнеров (webm/mp4/ogg…) подсказка клиента решает
// только audio/* vs video/* — так голосовые webm/m4a остаются аудио.
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.amr': 'audio/amr', '.weba': 'audio/webm',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.3gp': 'video/3gpp', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
};
const AV_CONTAINER: Record<string, string> = {
  '.webm': 'webm', '.weba': 'webm', '.mp4': 'mp4', '.m4a': 'mp4', '.m4v': 'mp4',
  '.3gp': '3gpp', '.ogg': 'ogg', '.oga': 'ogg', '.opus': 'ogg',
};

function detectChatMime(fileName: string, hint?: unknown): string {
  const ext = path.extname(fileName).toLowerCase();
  const h = typeof hint === 'string' ? hint.toLowerCase().split(';')[0].trim() : '';
  const container = AV_CONTAINER[ext];
  if (container && h.startsWith('audio/')) return `audio/${container}`;
  if (container && h.startsWith('video/')) return `video/${container}`;
  return EXT_MIME[ext] || 'application/octet-stream';
}

function cleanAttachmentName(name: unknown, fallback: string): string {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return (s || fallback).slice(0, 255);
}

// ─── Личные диалоги ──────────────────────────────────────────────────────────

function dmWhere(a: string, b: string) {
  return {
    isGroup: false,
    AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }],
    members: { every: { userId: { in: [a, b] } } },
  };
}

/**
 * Find or create a 1-to-1 conversation between two users.
 * Поиск — по паре участников (а не перебором всех DM в БД). Создание — в
 * транзакции под advisory-lock пары, поэтому двойной тап/два параллельных
 * запроса не плодят дубли. Если дубли уже есть в БД — берётся самый «живой»
 * (последний updatedAt), детерминированно для обоих собеседников.
 * hiddenForB: собеседник не видит пустой диалог в списке до первого сообщения
 * (POST /messages снимает deletedAt со всех участников).
 */
async function findOrCreateDM(
  userAId: string,
  userBId: string,
  opts: { hiddenForB?: boolean } = {},
): Promise<{ conv: any; created: boolean }> {
  const existing = await db.conversation.findFirst({
    where: dmWhere(userAId, userBId),
    orderBy: { updatedAt: 'desc' },
    include: CONV_INCLUDE,
  });
  if (existing) return { conv: existing, created: false };

  const pairKey = [userAId, userBId].sort().join(':');
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${pairKey}))) AS l`;
    const again = await tx.conversation.findFirst({
      where: dmWhere(userAId, userBId),
      orderBy: { updatedAt: 'desc' },
      include: CONV_INCLUDE,
    });
    if (again) return { conv: again, created: false };
    const conv = await tx.conversation.create({
      data: {
        isGroup: false,
        members: {
          create: [
            { userId: userAId },
            { userId: userBId, ...(opts.hiddenForB ? { deletedAt: new Date() } : {}) },
          ],
        },
      },
      include: CONV_INCLUDE,
    });
    return { conv, created: true };
  });

  // В лог команды — только факт, без имён участников (ПДн / тайна переписки).
  if (result.created) tgLog(`💬 <b>Новый диалог</b>`);
  return result;
}

/**
 * Пометить беседу прочитанной пользователем: Message.readAt у чужих
 * непрочитанных + событие messages_read авторам (галочки), lastReadAt
 * участника (бейдж), уведомления о сообщениях этой беседы в колокольчике.
 * Вызывающий обязан проверить членство.
 */
async function markConversationRead(conversationId: string, userId: string): Promise<{ now: Date; readIds: Set<string> }> {
  const now = new Date();
  const unread: { id: string; senderId: string }[] = await db.message.findMany({
    where: { conversationId, senderId: { not: userId }, readAt: null, deletedAt: null },
    select: { id: true, senderId: true },
  });
  const readIds = new Set<string>(unread.map((m) => m.id));
  if (unread.length > 0) {
    const ids = unread.map((m) => m.id);
    await db.message.updateMany({ where: { id: { in: ids } }, data: { readAt: now } });
    await db.message.updateMany({ where: { id: { in: ids }, deliveredAt: null }, data: { deliveredAt: now } });

    // Notify each sender that their messages were read
    const bySender = new Map<string, string[]>();
    for (const m of unread) {
      const list = bySender.get(m.senderId) ?? [];
      list.push(m.id);
      bySender.set(m.senderId, list);
    }
    for (const [senderId, messageIds] of bySender) {
      emitToUser(senderId, 'messages_read', { messageIds, readAt: now.toISOString() });
    }
  }

  // Mark conversation as read (for unread count badge)
  await db.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: now },
  });

  // Mark message notifications for this conversation as read in the bell,
  // and tell the client to refresh its notification badge/list.
  const link = `/messages/${conversationId}`;
  const cleared = await db.notification.updateMany({
    where: { userId, type: 'message', link, read: false },
    data: { read: true },
  });
  if (cleared.count > 0) emitToUser(userId, 'notifications_read', { link });

  return { now, readIds };
}

/**
 * Колокольчик: ОДНА запись на беседу. Пока есть непрочитанная запись по этой
 * беседе — она обновляется (последний отправитель/превью/время), иначе
 * создаётся новая; старые прочитанные записи этой беседы удаляются. Так
 * таблица Notification не растёт на каждое сообщение.
 */
async function upsertMessageNotification(receiverId: string, actorId: string, conversationId: string, title: string, body: string) {
  const link = `/messages/${conversationId}`;
  const include = { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } };
  const existing = await db.notification.findFirst({
    where: { userId: receiverId, type: 'message', link, read: false },
    select: { id: true },
  });
  let notification;
  if (existing) {
    notification = await db.notification.update({
      where: { id: existing.id },
      data: { actorId, title, body, createdAt: new Date() },
      include,
    });
  } else {
    await db.notification.deleteMany({ where: { userId: receiverId, type: 'message', link, read: true } });
    notification = await db.notification.create({
      data: { userId: receiverId, actorId, type: 'message', title, body, link },
      include,
    });
  }
  emitToUser(receiverId, 'new_notification', notification);
}

// ─── GET /unread/count ───────────────────────────────────────────────────────
router.get('/unread/count', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Single aggregate query (was N+1: one count() per conversation in a loop).
    // The per-member lastReadAt threshold is applied inside the JOIN, so all
    // conversations are summed in one round-trip. Parameterized → injection-safe.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "Message" m
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
      WHERE cm."deletedAt" IS NULL
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
    `;
    res.json({ count: Number(rows[0]?.count ?? 0) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ─── GET /conversations ──────────────────────────────────────────────────────
router.get('/conversations', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const memberships = await db.conversationMember.findMany({
      where: { userId, deletedAt: null },
      include: {
        conversation: {
          include: {
            members: { include: MEMBER_USER },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { id: true, firstName: true, lastName: true } }, },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    // Unread counts for ALL of the user's conversations in ONE grouped query
    // (was N+1: a count() per conversation inside Promise.all). Parameterized.
    const unreadRows = await prisma.$queryRaw<{ conversationId: string; count: number }[]>`
      SELECT m."conversationId" AS "conversationId", COUNT(*)::int AS count
      FROM "Message" m
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
      WHERE cm."deletedAt" IS NULL
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
      GROUP BY m."conversationId"
    `;
    const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

    const withUnread = memberships.map((m: any) => {
        const conv = m.conversation;
        const lastMsg = conv.messages[0] ?? null;
        const others = conv.members.filter((mem: any) => mem.userId !== userId);

        const unreadCount = unreadMap.get(conv.id) ?? 0;

        return {
          id: conv.id,
          isGroup: conv.isGroup,
          name: conv.isGroup
            ? conv.name
            : `${others[0]?.user?.firstName ?? ''} ${others[0]?.user?.lastName ?? ''}`.trim(),
          avatar: conv.isGroup ? conv.avatar : (others[0]?.user?.avatar ?? null),
          members: conv.members,
          otherUser: conv.isGroup ? null : (others[0]?.user ?? null),
          lastMessage: lastMsg
            ? {
                content: lastMsg.deletedAt ? 'Сообщение удалено' : (lastMsg.content || (lastMsg.attachmentName ? `📎 ${lastMsg.attachmentName}` : '📎 Вложение')),
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
                senderName: `${lastMsg.sender.firstName} ${lastMsg.sender.lastName}`,
              }
            : null,
          unreadCount,
          updatedAt: conv.updatedAt,
          isPinned: m.isPinned,
          isArchived: m.isArchived,
          type: conv.isGroup ? 'group' : (m.type ?? 'personal'),
        };
    });

    res.json(withUnread);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// ─── GET /resolve/:id — resolves userId OR conversationId ────────────────────
router.get('/resolve/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // 1. Try as conversationId
    const asConv = await db.conversation.findUnique({
      where: { id },
      include: CONV_INCLUDE,
    });
    if (asConv) {
      const isMember = asConv.members.some((m: any) => m.userId === userId);
      if (!isMember) return res.status(403).json({ error: 'Not a member' });
      return res.json({ conversationId: asConv.id, conversation: asConv });
    }

    // 2. Try as userId → find or create DM
    const otherUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    if (!otherUser) return res.status(404).json({ error: 'Not found' });

    // «Написать себе» → «Избранное» (иначе DM с двумя одинаковыми участниками)
    if (otherUser.id === userId) {
      const savedId = await getOrCreateSavedConversation(userId);
      const saved = await db.conversation.findUnique({ where: { id: savedId }, include: CONV_INCLUDE });
      return res.json({ conversationId: savedId, conversation: saved });
    }

    // Открытие чата по userId не создаёт видимый собеседнику пустой диалог:
    // у него беседа появится с первым сообщением.
    const { conv } = await findOrCreateDM(userId, otherUser.id, { hiddenForB: true });
    // Тот, кто открывает диалог, видит его у себя (снять своё «удаление»).
    await db.conversationMember.updateMany({
      where: { conversationId: conv.id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    res.json({ conversationId: conv.id, conversation: conv });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve conversation' });
  }
});

// ─── POST /services/:userServiceId/contact ──────────────────────────────────
// Ensures a direct conversation between the buyer and the service provider,
// notifies the provider that the buyer is interested in the service, and
// returns the conversation id. The conversation + notification are created
// even if the buyer never sends a message, so the provider can write first.
router.post('/services/:userServiceId/contact', authenticate, async (req: AuthRequest, res) => {
  try {
    const buyerId = req.userId!;
    const { userServiceId } = req.params;

    const us = await prisma.userService.findUnique({
      where: { id: userServiceId },
      include: {
        service: { select: { name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!us) return res.status(404).json({ error: 'Service not found' });

    const providerId = us.user.id;
    if (providerId === buyerId) return res.status(400).json({ error: 'Cannot contact your own service' });

    // Ensure a direct (personal) conversation exists between buyer and provider.
    const { conv } = await findOrCreateDM(buyerId, providerId);
    // Диалог должен быть виден обоим (мог быть создан ранее скрытым).
    await db.conversationMember.updateMany({
      where: { conversationId: conv.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    // Notify the provider about the interest (link to the service page).
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { firstName: true, lastName: true },
    });
    const buyerName = `${buyer?.firstName ?? ''} ${buyer?.lastName ?? ''}`.trim();
    const serviceName = us.service?.name ?? '';
    const text = `${buyerName} заинтересовался услугой «${serviceName}»`;
    await notify({
      userId: providerId,
      actorId: buyerId,
      type: 'service_inquiry',
      title: text,
      body: text,
      link: `/services/${us.id}`,
    });

    res.json({ conversationId: conv.id });
  } catch (error) {
    console.error('Service contact error:', error);
    res.status(500).json({ error: 'Failed to contact provider' });
  }
});

// ─── POST /conversations/group ───────────────────────────────────────────────
router.post('/conversations/group', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { memberIds } = req.body;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (!name) return res.status(400).json({ error: 'Group name is required' });
    if (name.length > GROUP_NAME_MAX) {
      return res.status(400).json({ error: `Название — не длиннее ${GROUP_NAME_MAX} символов` });
    }
    if (!Array.isArray(memberIds) || memberIds.length < 1) {
      return res.status(400).json({ error: 'At least 1 member required' });
    }

    const requested = [...new Set(
      memberIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64),
    )].filter((id) => id !== userId);
    if (requested.length < 1) return res.status(400).json({ error: 'At least 1 member required' });
    if (requested.length + 1 > GROUP_MAX_MEMBERS) {
      return res.status(400).json({ error: `В группе может быть не более ${GROUP_MAX_MEMBERS} участников` });
    }

    // Только существующие и не заблокированные пользователи
    const valid: { id: string }[] = await prisma.user.findMany({
      where: { id: { in: requested }, ...notBlockedWhere() },
      select: { id: true },
    });
    if (valid.length === 0) {
      return res.status(400).json({ error: 'Не найдено ни одного доступного участника' });
    }

    const allMembers: string[] = [userId, ...valid.map((u) => u.id)];
    const now = new Date();

    const conv = await db.conversation.create({
      data: {
        isGroup: true,
        name,
        members: {
          create: allMembers.map((uid: string) => ({ userId: uid, isAdmin: uid === userId, lastReadAt: now })),
        },
      },
      include: CONV_INCLUDE,
    });

    for (const memberId of allMembers) {
      if (memberId !== userId) emitToUser(memberId, 'group_created', { conversation: conv });
    }

    res.status(201).json(conv);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ─── Избранное (saved messages) — личный чат с самим собой ───────────────────
// Разговор с ЕДИНСТВЕННЫМ участником (member.type='saved'). Вложения, ответы,
// поиск и реакции работают как в обычном чате; уведомления не шлются (нет
// других участников). Схемы БД не меняет — используется существующее поле type.
async function getOrCreateSavedConversation(userId: string) {
  const membership = await db.conversationMember.findFirst({
    where: { userId, type: 'saved' },
    select: { conversationId: true },
  });
  if (membership) {
    // Если пользователь когда-то «удалил» чат — восстановить членство.
    await db.conversationMember.updateMany({
      where: { conversationId: membership.conversationId, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return membership.conversationId;
  }
  const conv = await db.conversation.create({
    data: {
      isGroup: false,
      name: 'Избранное',
      members: { create: [{ userId, isAdmin: true, type: 'saved' }] },
    },
  });
  return conv.id;
}

// GET /saved → { id } — id чата «Избранное» (создаётся при первом обращении)
router.get('/saved', authenticate, async (req: AuthRequest, res) => {
  try {
    const id = await getOrCreateSavedConversation(req.userId!);
    res.json({ id });
  } catch (error) {
    console.error('Get saved conversation error:', error);
    res.status(500).json({ error: 'Failed to get saved conversation' });
  }
});

// POST /messages/:id/save — переслать сообщение (своё или чужое) себе в «Избранное».
// Копируется текст и вложение; требование — быть участником исходного диалога.
router.post('/messages/:id/save', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const src = await db.message.findUnique({
      where: { id: req.params.id },
      include: { conversation: { select: { members: { select: { userId: true } } } } },
    });
    if (!src || src.deletedAt) return res.status(404).json({ error: 'Message not found' });
    const isMember = src.conversation?.members.some((m: any) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: 'Forbidden' });

    const savedId = await getOrCreateSavedConversation(userId);
    const message = await db.message.create({
      data: {
        conversationId: savedId,
        senderId: userId,
        content: src.content,
        ...(src.attachmentUrl
          ? {
              attachmentUrl: src.attachmentUrl,
              attachmentName: src.attachmentName,
              attachmentSize: src.attachmentSize,
              attachmentType: src.attachmentType,
            }
          : {}),
      },
      include: MSG_INCLUDE,
    });
    await db.conversation.update({ where: { id: savedId }, data: { updatedAt: new Date() } });
    res.status(201).json(sanitizeMessage(message));
  } catch (error) {
    console.error('Save message to favorites error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// ─── POST /messages/:id/transcribe — голосовое → текст (Vosk) ─────────────────
// Расшифровка считается один раз и сохраняется в Message.transcript;
// повторный запрос отдаёт сохранённый текст. Доступ — участникам диалога.
// Лимит на пользователя + один общий прогон на сообщение (параллельные запросы
// одного и того же голосового ждут уже запущенную расшифровку).
const transcribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.userId || ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Слишком много запросов на расшифровку. Подождите несколько минут.' });
  },
});

class SttBusyError extends Error {}
const transcribeInFlight = new Map<string, Promise<string>>();

async function runTranscription(filePath: string): Promise<string> {
  const sttUrl = process.env.STT_URL || 'http://stt:5005';
  // Асинхронное чтение — readFileSync файла до 20МБ блокировал event loop.
  const buf = await fs.promises.readFile(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'audio');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const resp = await fetch(`${sttUrl}/transcribe`, { method: 'POST', body: fd, signal: ctrl.signal });
    if (resp.status === 503) throw new SttBusyError('stt busy');
    if (!resp.ok) throw new Error(`stt ${resp.status}`);
    const data: any = await resp.json();
    return String(data?.text ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

router.post('/messages/:id/transcribe', authenticate, transcribeLimiter, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const msg = await db.message.findUnique({
      where: { id: req.params.id },
      include: { conversation: { select: { members: { select: { userId: true } } } } },
    });
    if (!msg || msg.deletedAt) return res.status(404).json({ error: 'Message not found' });
    if (!msg.conversation?.members.some((m: any) => m.userId === userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!msg.attachmentUrl || !msg.attachmentType?.startsWith('audio/')) {
      return res.status(400).json({ error: 'Not an audio message' });
    }
    if (msg.transcript != null && msg.transcript !== '') {
      return res.json({ transcript: msg.transcript });
    }

    // attachmentUrl = /uploads/chat/<file> → путь строго внутри каталога чата
    // (path.resolve + сравнение каталога: `uploads/chat/../..` не пройдёт).
    const file = await resolveChatAttachment(msg.attachmentUrl);
    if (!file) return res.status(404).json({ error: 'Audio file not found' });

    let job = transcribeInFlight.get(msg.id);
    if (!job) {
      job = (async () => {
        const text = await runTranscription(file.filePath);
        if (text) await db.message.update({ where: { id: msg.id }, data: { transcript: text } });
        return text;
      })().finally(() => transcribeInFlight.delete(msg.id));
      transcribeInFlight.set(msg.id, job);
    }
    const text = await job;

    if (!text) {
      return res.status(422).json({ error: 'Не удалось распознать речь — попробуйте ещё раз' });
    }
    res.json({ transcript: text });
  } catch (error) {
    if (error instanceof SttBusyError) {
      return res.status(503).json({ error: 'Распознавание сейчас занято — попробуйте через минуту' });
    }
    console.error('Transcribe message error:', error);
    res.status(500).json({ error: 'Не удалось распознать речь' });
  }
});

// ─── POST /conversations/:id/upload ──────────────────────────────────────────
// Членство проверяется ДО того, как multer запишет файл на диск; ошибки multer
// (превышен размер, запрещённое расширение) — понятные 413/400, а не 500.
async function requireUploadMembership(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const conversationId = req.params.id;
    if (await isConversationMember(conversationId, req.userId!)) return next();
    const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    return res.status(403).json({ error: 'Not a member' });
  } catch (err) {
    next(err);
  }
}

function chatUploadSingle(req: AuthRequest, res: Response, next: NextFunction) {
  uploadChatAttachment.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Файл слишком большой — максимум ${CHAT_MAX_FILE_MB} МБ` });
      }
      return res.status(400).json({ error: 'Не удалось загрузить файл' });
    }
    if (err?.message === 'Executable files are not allowed') {
      return res.status(400).json({ error: 'Исполняемые файлы отправлять нельзя' });
    }
    return next(err);
  });
}

router.post('/conversations/:id/upload', authenticate, requireUploadMembership, chatUploadSingle, async (req: AuthRequest, res) => {
  const uploaded = req.file;
  try {
    if (!uploaded) return res.status(400).json({ error: 'No file uploaded' });

    // Имя на диске должно проходить проверку при отправке сообщения
    // (CHAT_URL_RE): расширение с не-ASCII символами и т.п. — вычищаем.
    let fileName = uploaded.filename;
    if (!CHAT_FILE_RE.test(fileName)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext).replace(/[^\w.-]/g, '') || `chat-${Date.now()}`;
      const safeExt = ext.replace(/[^\w.]/g, '').slice(0, 16);
      fileName = `${base.startsWith('chat-') ? base : `chat-${base}`}${safeExt.length > 1 ? safeExt : ''}`;
      await fs.promises.rename(uploaded.path, path.join(CHAT_UPLOAD_DIR, fileName));
    }

    // multer/busboy декодирует имя файла как latin1 — кириллица приходит
    // кракозябрами. Перечитываем как UTF-8 (для ASCII это no-op).
    let originalName = uploaded.originalname;
    try {
      const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
      if (!decoded.includes('�')) originalName = decoded;
    } catch {}

    res.json({
      url: `/uploads/chat/${fileName}`,
      name: cleanAttachmentName(originalName, fileName),
      size: uploaded.size,
      type: detectChatMime(fileName, uploaded.mimetype),
    });
  } catch (error) {
    console.error('Upload chat attachment error:', error);
    if (uploaded?.path) fs.promises.unlink(uploaded.path).catch(() => {});
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ─── GET /conversations/:id ──────────────────────────────────────────────────
// Курсорная пагинация: последние `limit` сообщений (по умолчанию 50), более
// ранние — `?before=<messageId>`. Ответ: { conversation, messages (по
// возрастанию времени), hasMore }. Прочтение отмечается только при загрузке
// последней страницы и если клиент не передал markRead=0 (вкладка скрыта).
router.get('/conversations/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
    const limitRaw = parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), PAGE_MAX) : PAGE_DEFAULT;
    const shouldMarkRead = !before && req.query.markRead !== '0';

    const conv = await db.conversation.findUnique({
      where: { id },
      include: CONV_INCLUDE,
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const isMember = conv.members.some((m: any) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    if (before) {
      const cursorMsg = await db.message.findFirst({ where: { id: before, conversationId: id }, select: { id: true } });
      if (!cursorMsg) return res.status(400).json({ error: 'Invalid cursor' });
    }

    const rows = await db.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      take: limit + 1,
      include: MSG_INCLUDE,
    });
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();

    if (shouldMarkRead) {
      const { now, readIds } = await markConversationRead(id, userId);
      // Update local message objects so response reflects the new state
      for (const m of messages) {
        if (readIds.has(m.id)) { m.readAt = now; m.deliveredAt = m.deliveredAt ?? now; }
      }
    }

    res.json({ conversation: conv, messages: messages.map(sanitizeMessage), hasMore });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// ─── GET /conversations/:id/attachments — list all attachments ───────────────
router.get('/conversations/:id/attachments', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { members: { select: { userId: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (!conv.members.some((m: any) => m.userId === userId)) return res.status(403).json({ error: 'Forbidden' });

    const messages = await db.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        attachmentUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentSize: true,
        attachmentType: true,
        createdAt: true,
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to get attachments' });
  }
});

// ─── GET /conversations/:id/search?q= — search messages in conversation ──────
router.get('/conversations/:id/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const q = (req.query.q as string ?? '').trim();
    if (!q) return res.json([]);

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { members: { select: { userId: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (!conv.members.some((m: any) => m.userId === userId)) return res.status(403).json({ error: 'Forbidden' });

    const results = await db.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        contentNorm: { contains: yoNorm(q) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.json(results.map(sanitizeMessage));
  } catch {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── POST /conversations/:id/messages ────────────────────────────────────────
router.post('/conversations/:id/messages', authenticate, messageLimiter, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const { content, replyToId, attachmentUrl, attachmentName, attachmentType } = req.body;
    const text = typeof content === 'string' ? content.trim() : '';

    // Вложение — только ранее загруженный файл из uploads/chat; размер и тип
    // определяет сервер (значения из тела запроса не доверяем).
    let attachment: { url: string; name: string; size: number; type: string } | null = null;
    if (attachmentUrl != null && attachmentUrl !== '') {
      const file = await resolveChatAttachment(attachmentUrl);
      if (!file) return res.status(400).json({ error: 'Недопустимое вложение' });
      attachment = {
        url: file.url,
        name: cleanAttachmentName(attachmentName, file.fileName),
        size: file.size,
        type: detectChatMime(file.fileName, attachmentType),
      };
    }

    if (!text && !attachment) return res.status(400).json({ error: 'Content or attachment is required' });

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const isMember = conv.members.some((m: any) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    // Ответить можно только на сообщение ЭТОЙ беседы (иначе через replyTo
    // утекал бы текст чужой переписки).
    let replyId: string | null = null;
    if (replyToId != null && replyToId !== '') {
      if (typeof replyToId !== 'string') return res.status(400).json({ error: 'Invalid replyToId' });
      const replyTo = await db.message.findUnique({ where: { id: replyToId }, select: { id: true, conversationId: true } });
      if (!replyTo || replyTo.conversationId !== conversationId) {
        return res.status(400).json({ error: 'Сообщение для ответа не найдено' });
      }
      replyId = replyTo.id;
    }

    const otherMemberIds = conv.members.filter((m: any) => m.userId !== userId).map((m: any) => m.userId);

    // Determine if any recipient is online → set deliveredAt immediately
    const anyOnline = otherMemberIds.some((id: string) => isUserOnline(id));
    const now = new Date();

    const message = await db.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: text,
        ...(replyId ? { replyToId: replyId } : {}),
        ...(attachment
          ? { attachmentUrl: attachment.url, attachmentName: attachment.name, attachmentSize: attachment.size, attachmentType: attachment.type }
          : {}),
        ...(anyOnline ? { deliveredAt: now } : {}),
      },
      include: MSG_INCLUDE,
    });

    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await db.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    // Restore conversation for members who had deleted it
    await db.conversationMember.updateMany({
      where: { conversationId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, avatar: true },
    });
    const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'Сообщение';
    const preview = text
      ? (text.length > 80 ? text.slice(0, 80) + '…' : text)
      : (attachment ? `📎 ${attachment.name}` : '📎 Вложение');

    const payload = sanitizeMessage({ ...message, conversationId });
    const otherMembers = conv.members.filter((m: any) => m.userId !== userId);
    for (const member of otherMembers) {
      // Сокет new_message идёт ВСЕГДА (живое обновление открытого чата);
      // push-баннер — только если получатель не отключил «Сообщения» и
      // событие не подтвердило открытое на экране окно (см. notifyUser).
      if (await isNotificationEnabled(member.userId, 'message')) {
        void notifyUser(
          member.userId,
          'new_message',
          payload,
          {
            title: conv.isGroup ? `${conv.name} — ${senderName}` : senderName,
            body: preview,
            link: `/messages/${conversationId}`,
            tag: `conv-${conversationId}`,
            renotify: true,
          },
        );
      } else {
        emitToUser(member.userId, 'new_message', payload);
      }
    }

    // DM notification (DB record for notification centre) — одна запись на беседу
    if (!conv.isGroup && otherMembers.length === 1 && (await isNotificationEnabled(otherMembers[0].userId, 'message'))) {
      try {
        await upsertMessageNotification(otherMembers[0].userId, userId, conversationId, senderName, preview);
      } catch (e) {
        console.error('Message notification error:', e);
      }
    }

    res.status(201).json(payload);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── PATCH /conversations/:id/read ──────────────────────────────────────────
// То же, что делает GET при открытии чата: readAt у сообщений + messages_read
// авторам (галочки), lastReadAt (бейдж), уведомления беседы в колокольчике.
router.patch('/conversations/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const conversationId = req.params.id;
    if (!(await isConversationMember(conversationId, userId))) {
      return res.status(403).json({ error: 'Not a member' });
    }
    await markConversationRead(conversationId, userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ─── POST /conversations/:id/members ─────────────────────────────────────────
router.post('/conversations/:id/members', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const { memberId } = req.body;
    if (typeof memberId !== 'string' || !memberId || memberId.length > 64) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv?.isGroup) return res.status(400).json({ error: 'Not a group conversation' });

    const me = conv.members.find((m: any) => m.userId === userId);
    if (!me?.isAdmin) return res.status(403).json({ error: 'Only admins can add members' });

    const already = conv.members.some((m: any) => m.userId === memberId);
    if (already) return res.status(400).json({ error: 'Already a member' });
    if (conv.members.length >= GROUP_MAX_MEMBERS) {
      return res.status(400).json({ error: `В группе может быть не более ${GROUP_MAX_MEMBERS} участников` });
    }

    const target = await prisma.user.findFirst({
      where: { id: memberId, ...notBlockedWhere() },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден или недоступен' });

    try {
      // lastReadAt = сейчас: история до вступления не считается непрочитанной
      await db.conversationMember.create({ data: { conversationId, userId: memberId, lastReadAt: new Date() } });
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ error: 'Already a member' });
      throw e;
    }
    const updated = await db.conversation.findUnique({ where: { id: conversationId }, include: CONV_INCLUDE });
    emitToUser(memberId, 'group_created', { conversation: updated });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ─── DELETE /conversations/:id — delete entire group ─────────────────────────
router.delete('/conversations/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const conv = await db.conversation.findUnique({
      where: { id },
      include: { members: { select: { userId: true, isAdmin: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Not found' });

    // DM — soft delete only for the current user
    if (!conv.isGroup) {
      const member = conv.members.find((m: any) => m.userId === userId);
      if (!member) return res.status(403).json({ error: 'Not a member' });
      await db.conversationMember.update({
        where: { conversationId_userId: { conversationId: id, userId } },
        data: { deletedAt: new Date(), isPinned: false, isArchived: false },
      });
      return res.json({ ok: true });
    }

    // Group — hard delete, admin only
    const me = conv.members.find((m: any) => m.userId === userId);
    if (!me?.isAdmin) return res.status(403).json({ error: 'Only admins can delete the group' });

    for (const m of conv.members) {
      if (m.userId !== userId) emitToUser(m.userId, 'group_deleted', { conversationId: id });
    }

    await db.conversation.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ─── DELETE /conversations/:id/members/:memberId ─────────────────────────────
router.delete('/conversations/:id/members/:memberId', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId, memberId } = req.params;

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv?.isGroup) return res.status(400).json({ error: 'Not a group conversation' });

    const me = conv.members.find((m: any) => m.userId === userId);
    if (!me?.isAdmin && memberId !== userId) return res.status(403).json({ error: 'Not allowed' });

    await db.conversationMember.deleteMany({ where: { conversationId, userId: memberId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ─── PATCH /conversations/:id/pin — toggle pin ───────────────────────────────
router.patch('/conversations/:id/pin', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(404).json({ error: 'Conversation not found' });
    const updated = await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned: !member.isPinned },
    });
    res.json({ isPinned: updated.isPinned });
  } catch {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// ─── PATCH /conversations/:id/archive — toggle archive ───────────────────────
router.patch('/conversations/:id/archive', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(404).json({ error: 'Conversation not found' });
    const updated = await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isArchived: !member.isArchived, isPinned: member.isArchived ? member.isPinned : false },
    });
    res.json({ isArchived: updated.isArchived });
  } catch {
    res.status(500).json({ error: 'Failed to toggle archive' });
  }
});

// ─── PATCH /conversations/:id/type — set conversation type (personal/business) ─
router.patch('/conversations/:id/type', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const { type } = req.body;
    if (!['personal', 'business'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) return res.status(404).json({ error: 'Conversation not found' });
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { type },
    });
    res.json({ type });
  } catch {
    res.status(500).json({ error: 'Failed to update type' });
  }
});

// ─── PATCH /messages/:id — edit message ──────────────────────────────────────
router.patch('/messages/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { content } = req.body;

    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'Content is required' });

    const msg = await db.message.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.senderId !== userId) return res.status(403).json({ error: 'Not your message' });
    if (msg.deletedAt) return res.status(400).json({ error: 'Message is deleted' });

    const updated = sanitizeMessage(await db.message.update({
      where: { id },
      data: { content: content.trim(), isEdited: true },
      include: MSG_INCLUDE,
    }));

    if (msg.conversationId) {
      const members = await db.conversationMember.findMany({
        where: { conversationId: msg.conversationId },
        select: { userId: true },
      });
      for (const m of members) {
        if (m.userId !== userId) emitToUser(m.userId, 'message_edited', updated);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// ─── DELETE /messages/:id — soft delete ──────────────────────────────────────
router.delete('/messages/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const msg = await db.message.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.senderId !== userId) return res.status(403).json({ error: 'Not your message' });

    await db.message.update({ where: { id }, data: { deletedAt: new Date() } });

    if (msg.conversationId) {
      const members = await db.conversationMember.findMany({
        where: { conversationId: msg.conversationId },
        select: { userId: true },
      });
      for (const m of members) {
        if (m.userId !== userId) {
          emitToUser(m.userId, 'message_deleted', { messageId: id, conversationId: msg.conversationId });
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ─── POST /messages/:id/reactions — react to a message ──────────────────────
// Только участник беседы и только на неудалённое сообщение.
router.post('/messages/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });
    if (emoji.length > 32) return res.status(400).json({ error: 'Invalid emoji' });

    const msg = await db.message.findUnique({
      where: { id: req.params.id },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!msg || !msg.conversationId) return res.status(404).json({ error: 'Message not found' });
    if (!(await isConversationMember(msg.conversationId, userId))) {
      return res.status(403).json({ error: 'Not a member' });
    }
    if (msg.deletedAt) return res.status(400).json({ error: 'Message is deleted' });

    const reaction = await db.messageReaction.upsert({
      where: { userId_messageId: { userId, messageId: msg.id } },
      update: { emoji },
      create: { emoji, userId, messageId: msg.id },
    });

    // Notify conversation members
    const members = await db.conversationMember.findMany({
      where: { conversationId: msg.conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId !== userId) {
        emitToUser(m.userId, 'message_reaction', { messageId: msg.id, reaction, conversationId: msg.conversationId });
      }
    }

    res.json(reaction);
  } catch (error) {
    console.error('Message reaction error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// ─── DELETE /messages/:id/reactions — remove reaction ────────────────────────
router.delete('/messages/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const msg = await db.message.findUnique({
      where: { id: req.params.id },
      select: { id: true, conversationId: true },
    });
    if (!msg || !msg.conversationId) return res.status(404).json({ error: 'Message not found' });
    if (!(await isConversationMember(msg.conversationId, userId))) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const removed = await db.messageReaction.deleteMany({
      where: { userId, messageId: msg.id },
    });

    if (removed.count > 0) {
      const members = await db.conversationMember.findMany({
        where: { conversationId: msg.conversationId },
        select: { userId: true },
      });
      for (const m of members) {
        if (m.userId !== userId) {
          emitToUser(m.userId, 'message_reaction_removed', { messageId: msg.id, userId, conversationId: msg.conversationId });
        }
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Remove message reaction error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// ─── Legacy GET /:userId — resolves to DM conversationId ─────────────────────
router.get('/:userId', authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const otherId = req.params.userId;

    const otherUser = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!otherUser) return res.status(404).json({ error: 'User not found' });

    if (otherId === currentUserId) {
      return res.json({ conversationId: await getOrCreateSavedConversation(currentUserId) });
    }

    const { conv } = await findOrCreateDM(currentUserId, otherId, { hiddenForB: true });
    res.json({ conversationId: conv.id });
  } catch (error) {
    console.error('Legacy get messages error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
