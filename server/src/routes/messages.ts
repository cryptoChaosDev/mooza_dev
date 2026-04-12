import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { emitToUser, notifyUser, isUserOnline } from '../socket';
import { uploadChatAttachment } from '../middleware/upload';
import { messageLimiter } from '../middleware/rateLimiter';

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

/** Find or create a 1-to-1 conversation between two users */
async function findOrCreateDM(userAId: string, userBId: string) {
  const all = await db.conversation.findMany({
    where: { isGroup: false },
    include: { members: true },
  });

  const found = all.find((c: any) => {
    const ids = c.members.map((m: any) => m.userId);
    return ids.includes(userAId) && ids.includes(userBId) && ids.length === 2;
  });

  if (found) {
    return db.conversation.findUnique({
      where: { id: found.id },
      include: { members: { include: MEMBER_USER } },
    });
  }

  return db.conversation.create({
    data: {
      isGroup: false,
      members: { create: [{ userId: userAId }, { userId: userBId }] },
    },
    include: { members: { include: MEMBER_USER } },
  });
}

// ─── GET /unread/count ───────────────────────────────────────────────────────
router.get('/unread/count', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const memberships = await db.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let total = 0;
    for (const m of memberships) {
      const count = await db.message.count({
        where: {
          conversationId: m.conversationId,
          senderId: { not: userId },
          deletedAt: null,
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      total += count;
    }

    res.json({ count: total });
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
      where: { userId },
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

    const withUnread = await Promise.all(
      memberships.map(async (m: any) => {
        const conv = m.conversation;
        const lastMsg = conv.messages[0] ?? null;
        const others = conv.members.filter((mem: any) => mem.userId !== userId);

        const unreadCount = await db.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            deletedAt: null,
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        });

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
        };
      })
    );

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
      include: { members: { include: MEMBER_USER } },
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

    const conv = await findOrCreateDM(userId, otherUser.id);
    res.json({ conversationId: conv.id, conversation: conv });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve conversation' });
  }
});

// ─── POST /conversations/group ───────────────────────────────────────────────
router.post('/conversations/group', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, memberIds } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Group name is required' });
    if (!Array.isArray(memberIds) || memberIds.length < 1) {
      return res.status(400).json({ error: 'At least 1 member required' });
    }

    const allMembers: string[] = [...new Set([userId, ...memberIds])] as string[];

    const conv = await db.conversation.create({
      data: {
        isGroup: true,
        name: name.trim(),
        members: {
          create: allMembers.map((uid: string) => ({ userId: uid, isAdmin: uid === userId })),
        },
      },
      include: { members: { include: MEMBER_USER } },
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

// ─── POST /conversations/:id/upload ──────────────────────────────────────────
router.post('/conversations/:id/upload', authenticate, uploadChatAttachment.single('file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (!conv.members.some((m: any) => m.userId === userId)) {
      return res.status(403).json({ error: 'Not a member' });
    }

    res.json({
      url: `/uploads/chat/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload chat attachment error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ─── GET /conversations/:id ──────────────────────────────────────────────────
router.get('/conversations/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const conv = await db.conversation.findUnique({
      where: { id },
      include: { members: { include: MEMBER_USER } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const isMember = conv.members.some((m: any) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    const messages = await db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      include: MSG_INCLUDE,
    });

    // Set readAt on all unread messages sent by others
    const now = new Date();
    const unread = messages.filter((m: any) => m.senderId !== userId && !m.readAt && !m.deletedAt);
    if (unread.length > 0) {
      await db.message.updateMany({
        where: { id: { in: unread.map((m: any) => m.id) } },
        data: { readAt: now, deliveredAt: now },
      });
      // Update local message objects so response reflects the new state
      for (const m of unread) { m.readAt = now; m.deliveredAt = m.deliveredAt ?? now; }

      // Notify each sender that their messages were read
      const bySender = new Map<string, string[]>();
      for (const m of unread) {
        const ids = bySender.get(m.senderId) ?? [];
        ids.push(m.id);
        bySender.set(m.senderId, ids);
      }
      for (const [senderId, messageIds] of bySender) {
        emitToUser(senderId, 'messages_read', { messageIds, readAt: now.toISOString() });
      }
    }

    // Mark conversation as read (for unread count badge)
    await db.conversationMember.updateMany({
      where: { conversationId: id, userId },
      data: { lastReadAt: now },
    });

    // Mark message notifications for this conversation as read in the bell
    await db.notification.updateMany({
      where: { userId, type: 'message', link: `/messages/${id}`, read: false },
      data: { read: true },
    });

    res.json({ conversation: conv, messages });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// ─── POST /conversations/:id/messages ────────────────────────────────────────
router.post('/conversations/:id/messages', authenticate, messageLimiter, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const { content, replyToId, attachmentUrl, attachmentName, attachmentSize, attachmentType } = req.body;

    if (!content?.trim() && !attachmentUrl) return res.status(400).json({ error: 'Content or attachment is required' });

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const isMember = conv.members.some((m: any) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });

    const otherMemberIds = conv.members.filter((m: any) => m.userId !== userId).map((m: any) => m.userId);

    // Determine if any recipient is online → set deliveredAt immediately
    const anyOnline = otherMemberIds.some((id: string) => isUserOnline(id));
    const now = new Date();

    const message = await db.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: content?.trim() || '',
        ...(replyToId ? { replyToId } : {}),
        ...(attachmentUrl ? { attachmentUrl, attachmentName: attachmentName || null, attachmentSize: attachmentSize ? Number(attachmentSize) : null, attachmentType: attachmentType || null } : {}),
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

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, avatar: true },
    });
    const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'Сообщение';
    const rawContent = content?.trim() || '';
    const preview = rawContent
      ? (rawContent.length > 80 ? rawContent.slice(0, 80) + '…' : rawContent)
      : (attachmentName ? `📎 ${attachmentName}` : '📎 Вложение');

    const otherMembers = conv.members.filter((m: any) => m.userId !== userId);
    for (const member of otherMembers) {
      notifyUser(
        member.userId,
        'new_message',
        { ...message, conversationId },
        {
          title: conv.isGroup ? `${conv.name} — ${senderName}` : senderName,
          body: preview,
          link: `/messages/${conversationId}`,
        },
      );
    }

    // DM notification (DB record for notification centre)
    if (!conv.isGroup && otherMembers.length === 1) {
      const receiverId = otherMembers[0].userId;
      const notification = await db.notification.create({
        data: {
          userId: receiverId,
          actorId: userId,
          type: 'message',
          title: senderName,
          body: preview,
          link: `/messages/${conversationId}`,
        },
        include: { actor: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });
      emitToUser(receiverId, 'new_notification', notification);
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── PATCH /conversations/:id/read ──────────────────────────────────────────
router.patch('/conversations/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    await db.conversationMember.updateMany({
      where: { conversationId: req.params.id, userId: req.userId },
      data: { lastReadAt: new Date() },
    });
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

    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv?.isGroup) return res.status(400).json({ error: 'Not a group conversation' });

    const me = conv.members.find((m: any) => m.userId === userId);
    if (!me?.isAdmin) return res.status(403).json({ error: 'Only admins can add members' });

    const already = conv.members.some((m: any) => m.userId === memberId);
    if (already) return res.status(400).json({ error: 'Already a member' });

    await db.conversationMember.create({ data: { conversationId, userId: memberId } });
    emitToUser(memberId, 'group_created', { conversation: conv });
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
    if (!conv.isGroup) return res.status(400).json({ error: 'Not a group' });

    const me = conv.members.find((m: any) => m.userId === userId);
    if (!me?.isAdmin) return res.status(403).json({ error: 'Only admins can delete the group' });

    for (const m of conv.members) {
      if (m.userId !== userId) emitToUser(m.userId, 'group_deleted', { conversationId: id });
    }

    await db.conversation.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
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

// ─── PATCH /messages/:id — edit message ──────────────────────────────────────
router.patch('/messages/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { content } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const msg = await db.message.findUnique({ where: { id } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.senderId !== userId) return res.status(403).json({ error: 'Not your message' });
    if (msg.deletedAt) return res.status(400).json({ error: 'Message is deleted' });

    const updated = await db.message.update({
      where: { id },
      data: { content: content.trim(), isEdited: true },
      include: MSG_INCLUDE,
    });

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
router.post('/messages/:id/reactions', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const msg = await db.message.findUnique({
      where: { id: req.params.id },
      include: { conversation: { include: { members: { select: { userId: true } } } } },
    });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const reaction = await db.messageReaction.upsert({
      where: { userId_messageId: { userId, messageId: req.params.id } },
      update: { emoji },
      create: { emoji, userId, messageId: req.params.id },
    });

    // Notify conversation members
    if (msg.conversationId && msg.conversation) {
      for (const m of msg.conversation.members) {
        if (m.userId !== userId) {
          emitToUser(m.userId, 'message_reaction', { messageId: req.params.id, reaction, conversationId: msg.conversationId });
        }
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
      include: { conversation: { include: { members: { select: { userId: true } } } } },
    });

    await db.messageReaction.deleteMany({
      where: { userId, messageId: req.params.id },
    });

    if (msg?.conversationId && msg.conversation) {
      for (const m of msg.conversation.members) {
        if (m.userId !== userId) {
          emitToUser(m.userId, 'message_reaction_removed', { messageId: req.params.id, userId, conversationId: msg.conversationId });
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

    const conv = await findOrCreateDM(currentUserId, otherId);
    res.json({ conversationId: conv.id });
  } catch (error) {
    console.error('Legacy get messages error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
