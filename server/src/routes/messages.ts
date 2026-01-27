import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get conversations (distinct users who have messaged with current user)
router.get('/conversations', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    // Get all messages where user is either sender or receiver
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    // Group messages by conversation partner
    const conversations = new Map();
    
    messages.forEach(msg => {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const otherUser = msg.senderId === userId ? msg.receiver : msg.sender;
      
      if (!conversations.has(otherUserId)) {
        conversations.set(otherUserId, {
          user: otherUser,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: msg.receiverId === userId && !msg.readAt ? 1 : 0
        });
      } else {
        const conv = conversations.get(otherUserId);
        if (msg.createdAt > conv.lastMessageTime) {
          conv.lastMessage = msg.content;
          conv.lastMessageTime = msg.createdAt;
        }
        if (msg.receiverId === userId && !msg.readAt) {
          conv.unreadCount += 1;
        }
      }
    });

    // Convert to array and sort by last message time
    const result = Array.from(conversations.values())
      .sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());

    res.json(result);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Get messages with a specific user
router.get('/:userId', authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId;
    const otherUserId = req.params.userId;

    // Verify the other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, firstName: true, lastName: true, avatar: true }
    });

    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get messages between these two users
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { 
            senderId: currentUserId,
            receiverId: otherUserId
          },
          {
            senderId: otherUserId,
            receiverId: currentUserId
          }
        ]
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    res.json({
      user: otherUser,
      messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send a message
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.userId;

    if (!receiverId || !content) {
      return res.status(400).json({ error: 'Receiver ID and content are required' });
    }

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true }
    });

    if (!receiver) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId: senderId!,
        receiverId,
        content
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get unread message count
router.get('/unread/count', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.message.count({
      where: {
        receiverId: req.userId,
        readAt: null
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;