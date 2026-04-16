import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Loader2, Reply, Pencil, Trash2, X, Users, Check, CheckCheck, Settings, UserPlus, LogOut, Crown, Paperclip, FileText, Download, Smile, BadgeCheck, Ban, Search } from 'lucide-react';
import { messageAPI, friendshipAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';
import { usePresenceStore } from '../stores/presenceStore';
import { groupReactions } from '../components/ReactionBar';

const API_URL = import.meta.env.VITE_API_URL || '';

interface MsgSender {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

interface MsgReaction {
  id: string;
  emoji: string;
  userId: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isEdited: boolean;
  deletedAt: string | null;
  createdAt: string;
  sender: MsgSender;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentType?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  reactions?: MsgReaction[];
  replyTo: {
    id: string;
    content: string;
    attachmentName?: string | null;
    deletedAt: string | null;
    sender: { id: string; firstName: string; lastName: string };
  } | null;
}

interface ConvMember {
  userId: string;
  isAdmin: boolean;
  user: MsgSender;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  name: string | null;
  avatar: string | null;
  members: ConvMember[];
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuthStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reply / edit state
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Group settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [friends, setFriends] = useState<{ id: string; firstName: string; lastName: string; avatar: string | null }[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Emoji picker
  const [showEmoji, setShowEmoji] = useState(false);

  // Reaction picker
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  // Context menu (long-press)
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMoved = useRef(false);

  // Search within chat
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Attachments panel
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentsTab, setAttachmentsTab] = useState<'media' | 'files' | 'links'>('media');
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const EMOJIS = ['😊','😂','❤️','👍','👎','🔥','🎵','🎸','🎹','🎤','🙏','😍','🤔','😅','🥹','💯','✨','🚀','👏','🎉'];
  const REACTION_EMOJIS_LOCAL = ['👍','👎','👌','😢','😂','🔥','❤️'];

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distFromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Swipe gestures — DOM-ref approach (no re-renders during drag)
  const swipeEls = useRef<Record<string, HTMLDivElement | null>>({});
  const hintEls  = useRef<Record<string, HTMLDivElement | null>>({});
  const msgSwipe = useRef<{ id: string; startX: number; startY: number; locked: boolean; reachedThreshold: boolean } | null>(null);
  const backSwipe = useRef<{ startX: number; startY: number } | null>(null);

  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 80;

  const onMsgTouchStart = (e: React.TouchEvent, msgId: string) => {
    const t = e.touches[0];
    msgSwipe.current = { id: msgId, startX: t.clientX, startY: t.clientY, locked: false, reachedThreshold: false };
  };

  const onMsgTouchMove = (e: React.TouchEvent, msgId: string) => {
    const sw = msgSwipe.current;
    if (!sw || sw.id !== msgId) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.startX;
    const dy = t.clientY - sw.startY;
    if (!sw.locked) {
      if (Math.abs(dy) > Math.abs(dx) + 5) { msgSwipe.current = null; return; }
      sw.locked = true;
    }
    if (dx >= 0) return;
    // rubber-band resistance past threshold
    const clamped = dx < -SWIPE_MAX
      ? -SWIPE_MAX - Math.sqrt(Math.abs(dx) - SWIPE_MAX) * 2
      : dx;
    sw.reachedThreshold = clamped <= -SWIPE_THRESHOLD;

    const el   = swipeEls.current[msgId];
    const hint = hintEls.current[msgId];
    if (el) el.style.transform = `translateX(${clamped}px)`;
    if (hint) {
      const ratio = Math.min(1, Math.abs(clamped) / SWIPE_THRESHOLD);
      hint.style.opacity = String(ratio);
      hint.style.transform = `translateX(${sw.reachedThreshold ? 0 : (1 - ratio) * 12}px) scale(${0.6 + ratio * 0.4})`;
    }
  };

  const onMsgTouchEnd = (msg: Message) => {
    const sw = msgSwipe.current;
    msgSwipe.current = null;
    if (!sw || sw.id !== msg.id) return;

    const el   = swipeEls.current[msg.id];
    const hint = hintEls.current[msg.id];

    if (sw.reachedThreshold) startReply(msg);

    // Snap back with spring feel
    if (el) {
      el.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform  = 'translateX(0)';
      setTimeout(() => { if (el) el.style.transition = ''; }, 370);
    }
    if (hint) {
      hint.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      hint.style.opacity    = '0';
      hint.style.transform  = 'scale(0.6)';
      setTimeout(() => { if (hint) hint.style.transition = ''; }, 220);
    }
  };

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const BACK_THRESHOLD = 60;

  const onBackTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t.clientX < window.innerWidth * 0.28) {
      backSwipe.current = { startX: t.clientX, startY: t.clientY };
    }
  };
  const onBackTouchMove = (e: React.TouchEvent) => {
    const bs = backSwipe.current;
    if (!bs) return;
    const t = e.touches[0];
    const dx = t.clientX - bs.startX;
    const dy = Math.abs(t.clientY - bs.startY);
    if (dy > Math.abs(dx) + 8) { backSwipe.current = null; return; }
    if (dx <= 0) return;
    const el = chatContainerRef.current;
    if (el) el.style.transform = `translateX(${dx}px)`;
  };
  const onBackTouchEnd = (e: React.TouchEvent) => {
    const bs = backSwipe.current;
    backSwipe.current = null;
    const el = chatContainerRef.current;
    if (!bs || !el) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - bs.startX;
    if (dx > BACK_THRESHOLD) {
      el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1)';
      el.style.transform  = `translateX(100%)`;
      setTimeout(() => navigate('/messages'), 270);
    } else {
      el.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform  = 'translateX(0)';
      setTimeout(() => { if (el) el.style.transition = ''; }, 370);
    }
  };

  // ── Load chat ──────────────────────────────────────────────────────────────
  const loadChat = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const resolveRes = await messageAPI.resolve(id);
      const convId: string = resolveRes.data.conversationId;
      setConversationId(convId);

      const convRes = await messageAPI.getConversation(convId);
      setConversation(convRes.data.conversation);
      setMessages(convRes.data.messages);
    } catch (err) {
      console.error('Failed to load chat:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadChat(); }, [loadChat]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [newMessage]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (!messages.length) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      // Double-rAF: wait for browser to finish layout before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        });
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return;

    const onNew = (msg: Message) => {
      if (msg.conversationId === conversationId) {
        setMessages(prev => [...prev, msg]);
      }
    };

    const onEdited = (msg: Message) => {
      if (msg.conversationId === conversationId) {
        setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
      }
    };

    const onDeleted = ({ messageId }: { messageId: string; conversationId: string }) => {
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)
      );
    };

    const onGroupDeleted = ({ conversationId: cid }: { conversationId: string }) => {
      if (cid === conversationId) navigate('/messages');
    };

    const onReaction = ({ messageId, reaction }: { messageId: string; reaction: MsgReaction; conversationId: string }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const existing = (m.reactions ?? []).filter(r => r.userId !== reaction.userId);
        return { ...m, reactions: [...existing, reaction] };
      }));
    };

    const onReactionRemoved = ({ messageId, userId }: { messageId: string; userId: string; conversationId: string }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: (m.reactions ?? []).filter(r => r.userId !== userId) };
      }));
    };

    const onDelivered = ({ messageIds, deliveredAt }: { messageIds: string[]; deliveredAt: string }) => {
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, deliveredAt } : m));
    };

    const onRead = ({ messageIds, readAt }: { messageIds: string[]; readAt: string }) => {
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, readAt, deliveredAt: m.deliveredAt ?? readAt } : m));
    };

    socket.on('new_message', onNew);
    socket.on('message_edited', onEdited);
    socket.on('message_deleted', onDeleted);
    socket.on('group_deleted', onGroupDeleted);
    socket.on('message_reaction', onReaction);
    socket.on('message_reaction_removed', onReactionRemoved);
    socket.on('messages_delivered', onDelivered);
    socket.on('messages_read', onRead);
    return () => {
      socket.off('new_message', onNew);
      socket.off('message_edited', onEdited);
      socket.off('message_deleted', onDeleted);
      socket.off('group_deleted', onGroupDeleted);
      socket.off('message_reaction', onReaction);
      socket.off('message_reaction_removed', onReactionRemoved);
      socket.off('messages_delivered', onDelivered);
      socket.off('messages_read', onRead);
    };
  }, [conversationId]);

  // ── Send / Edit ────────────────────────────────────────────────────────────
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setPendingPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPendingPreview(null);
    }
    e.target.value = '';
  };

  const clearAttachment = () => {
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if ((!text && !pendingFile) || !conversationId || sending) return;

    const fileToSend = pendingFile;
    setNewMessage('');
    setPendingFile(null);
    setPendingPreview(null);
    setSending(true);

    try {
      if (editingId) {
        const res = await messageAPI.editMessage(editingId, text);
        setMessages(prev => prev.map(m => m.id === editingId ? res.data : m));
        setEditingId(null);
      } else {
        let attachment: { url: string; name: string; size: number; type: string } | undefined;
        if (fileToSend) {
          setUploading(true);
          const fd = new FormData();
          fd.append('file', fileToSend);
          const up = await messageAPI.uploadAttachment(conversationId, fd);
          attachment = up.data;
          setUploading(false);
        }
        const res = await messageAPI.sendMessage(conversationId, text, replyTo?.id, attachment);
        setMessages(prev => [...prev, res.data]);
        setReplyTo(null);
      }
    } catch (err) {
      console.error('Failed:', err);
      setNewMessage(text);
      if (fileToSend) setPendingFile(fileToSend);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setNewMessage(msg.content);
    setReplyTo(null);
    inputRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewMessage('');
  };

  const startReply = (msg: Message) => {
    setReplyTo(msg);
    setEditingId(null);
    inputRef.current?.focus();
  };

  const handleDelete = async (msgId: string) => {
    try {
      await messageAPI.deleteMessage(msgId);
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, deletedAt: new Date().toISOString() } : m)
      );
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    try {
      const res = await messageAPI.reactMessage(msgId, emoji);
      const reaction: MsgReaction = res.data;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const existing = (m.reactions ?? []).filter(r => r.userId !== reaction.userId);
        return { ...m, reactions: [...existing, reaction] };
      }));
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  const handleUnreact = async (msgId: string) => {
    if (!me?.id) return;
    try {
      await messageAPI.unreactMessage(msgId);
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return { ...m, reactions: (m.reactions ?? []).filter(r => r.userId !== me.id) };
      }));
    } catch (err) {
      console.error('Failed to unreact:', err);
    }
  };

  // ── Context menu (long-press) ──────────────────────────────────────────────
  const openContextMenu = (msg: Message, x: number, y: number) => {
    if (msg.deletedAt) return;
    setContextMenu({ msg, x, y });
  };

  const onMsgLongPressStart = (e: React.TouchEvent, msg: Message) => {
    if (msg.deletedAt) return;
    longPressMoved.current = false;
    const t = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      if (!longPressMoved.current) {
        openContextMenu(msg, t.clientX, t.clientY);
      }
    }, 500);
  };

  const onMsgLongPressMove = () => {
    longPressMoved.current = true;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const onMsgLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setContextMenu(null);
  };

  // ── Search within chat ─────────────────────────────────────────────────────
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || !conversationId) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await messageAPI.searchMessages(conversationId, q.trim());
      setSearchResults(res.data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openAttachments = async () => {
    setShowAttachments(true);
    if (!conversationId) return;
    setLoadingAttachments(true);
    try {
      const res = await messageAPI.getAttachments(conversationId);
      setAttachments(res.data);
    } catch {
      setAttachments([]);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const scrollToMessage = (msgId: string) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    // Small delay to let search panel close, then scroll
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary-400', 'ring-offset-1');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary-400', 'ring-offset-1'), 2000);
      }
    }, 100);
  };

  // ── Group management ───────────────────────────────────────────────────────
  const openSettings = async () => {
    setShowSettings(true);
    setLoadingFriends(true);
    try {
      const res = await friendshipAPI.getFriends();
      const memberIds = new Set(conversation?.members.map(m => m.userId) ?? []);
      const list = (res.data as any[])
        .map((f: any) => f.user)
        .filter((u: any) => !memberIds.has(u.id));
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleAddMember = async (memberId: string) => {
    if (!conversationId) return;
    try {
      await messageAPI.addMember(conversationId, memberId);
      setFriends(prev => prev.filter(f => f.id !== memberId));
      await loadChat();
    } catch (err: any) {
      console.error('Failed to add member:', err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!conversationId) return;
    try {
      await messageAPI.removeMember(conversationId, memberId);
      if (memberId === me?.id) {
        navigate('/messages');
      } else {
        await loadChat();
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleDeleteGroup = async () => {
    if (!conversationId || !window.confirm('Удалить группу для всех участников?')) return;
    try {
      await messageAPI.deleteConversation(conversationId);
      navigate('/messages');
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatTime = (s: string) =>
    new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatDate = (s: string) => {
    const d = new Date(s);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const memberMap = Object.fromEntries(
    (conversation?.members ?? []).map(m => [m.userId, m.user])
  );

  // Group messages by date
  const grouped: { dateKey: string; label: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const dk = new Date(msg.createdAt).toDateString();
    const last = grouped[grouped.length - 1];
    if (last?.dateKey === dk) last.messages.push(msg);
    else grouped.push({ dateKey: dk, label: formatDate(msg.createdAt), messages: [msg] });
  }

  // Conversation display info
  const otherMember = !conversation?.isGroup
    ? conversation?.members.find(m => m.userId !== me?.id)?.user
    : null;
  const otherOnline = otherMember ? onlineUsers.has(otherMember.id) : false;
  const chatName = conversation?.isGroup
    ? (conversation.name ?? 'Группа')
    : otherMember
    ? `${otherMember.firstName} ${otherMember.lastName}`
    : '...';
  const chatAvatar = conversation?.isGroup ? conversation.avatar : (otherMember?.avatar ?? null);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={48} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-3">Диалог не найден</p>
          <button onClick={() => navigate('/messages')} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm">
            Вернуться
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={chatContainerRef}
      className="fixed inset-x-0 top-16 z-10 lg:static lg:h-screen bg-slate-950 flex flex-col"
      style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
      onTouchStart={onBackTouchStart}
      onTouchMove={onBackTouchMove}
      onTouchEnd={onBackTouchEnd}
    >
      {/* Chat Header */}
      <div className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/80 flex-shrink-0 z-30">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-purple-500/5 to-pink-500/5" />
        <div className="relative max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/messages')}
              className="group p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all border border-slate-700/50 hover:border-primary-500/50"
            >
              <ArrowLeft size={20} className="text-slate-300 group-hover:text-white transition-colors" />
            </button>

            <div
              className={`flex items-center gap-3 flex-1 min-w-0 ${!conversation.isGroup && otherMember ? 'cursor-pointer' : ''}`}
              onClick={() => { if (!conversation.isGroup && otherMember) navigate(`/profile/${otherMember.id}`); }}
            >
              {true ? (
                <AvatarComponent src={chatAvatar} name={chatName} size={36} className="rounded-xl ring-2 ring-slate-700/50" />
              ) : (
                <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50">
                  <span className="text-white font-bold text-sm">{chatName[0]}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-semibold text-white text-sm truncate">{chatName}</h2>
                  {(otherMember as any)?.isPremium && <span title="Premium"><Crown size={13} className="text-amber-400 flex-shrink-0" /></span>}
                  {(otherMember as any)?.isVerified && <span title="Верифицирован"><BadgeCheck size={13} className="text-sky-400 flex-shrink-0" /></span>}
                  {(otherMember as any)?.isBlocked && <span title="Заблокирован"><Ban size={13} className="text-red-500 flex-shrink-0" /></span>}
                </div>
                {conversation.isGroup ? (
                  <p className="text-xs text-slate-400">{conversation.members.length} участников</p>
                ) : (
                  <p className={`text-xs flex items-center gap-1 ${otherOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${otherOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {otherOnline ? 'В сети' : 'Не в сети'}
                  </p>
                )}
              </div>
            </div>

            {/* Search button */}
            <button
              onClick={() => { setShowSearch(v => !v); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              className={`p-2 rounded-xl transition-all border flex-shrink-0 ${showSearch ? 'bg-primary-500/20 border-primary-500/50 text-primary-400' : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-slate-300'}`}
            >
              <Search size={18} />
            </button>

            {/* Attachments panel button */}
            <button
              onClick={openAttachments}
              className={`p-2 rounded-xl transition-all border flex-shrink-0 ${showAttachments ? 'bg-primary-500/20 border-primary-500/50 text-primary-400' : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-slate-300'}`}
              title="Вложения"
            >
              <Paperclip size={18} />
            </button>

            {/* Settings button for group chats */}
            {conversation.isGroup && (
              <button
                onClick={openSettings}
                className="p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all border border-slate-700/50 hover:border-primary-500/50 flex-shrink-0"
              >
                <Settings size={18} className="text-slate-300" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-900/90 z-20">
          <div className="max-w-4xl mx-auto px-4 py-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Поиск в чате..."
                className="w-full bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 pl-8 pr-8 py-2 rounded-xl focus:outline-none focus:border-primary-500/50 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300">
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Search results dropdown */}
            {searchQuery && (
              <div className="mt-1 max-h-52 overflow-y-auto rounded-xl bg-slate-800 border border-slate-700 shadow-xl">
                {searching ? (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="text-primary-500 animate-spin" /></div>
                ) : searchResults.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Ничего не найдено</p>
                ) : searchResults.map(m => (
                  <button
                    key={m.id}
                    onClick={() => scrollToMessage(m.id)}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-700/60 transition-colors border-b border-slate-700/40 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-primary-400 font-medium">{m.sender.firstName} {m.sender.lastName}</p>
                      <p className="text-sm text-slate-300 truncate">{m.content}</p>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0 mt-0.5">{formatTime(m.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group Settings Panel */}
      {showSettings && conversation.isGroup && (() => {
        const amIAdmin = conversation.members.find(m => m.userId === me?.id)?.isAdmin ?? false;
        return (
          <div className="fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
            {/* Panel */}
            <div className="relative ml-auto w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border-l border-slate-700/50 shadow-2xl flex flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-primary-400" />
                  <h3 className="font-semibold text-white text-sm">Управление группой</h3>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-slate-700/50 rounded-lg">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-24">
                {/* Group name */}
                <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-xl">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{chatName}</p>
                    <p className="text-xs text-slate-400">{conversation.members.length} участников</p>
                  </div>
                </div>

                {/* Members */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Участники</p>
                  <div className="space-y-1">
                    {conversation.members.map(m => {
                      const isMe = m.userId === me?.id;
                      return (
                        <div key={m.userId} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-700/30 transition-colors">
                          <AvatarComponent src={m.user.avatar} name={`${m.user.firstName} ${m.user.lastName}`} size={32} className="rounded-lg" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{m.user.firstName} {m.user.lastName}{isMe ? ' (Вы)' : ''}</p>
                          </div>
                          {m.isAdmin && (
                            <Crown size={13} className="text-amber-400 flex-shrink-0" />
                          )}
                          {/* Remove button: admin can remove others, anyone can leave */}
                          {(amIAdmin && !isMe) ? (
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-all flex-shrink-0"
                              title="Удалить из группы"
                            >
                              <X size={14} />
                            </button>
                          ) : isMe ? (
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                              title="Покинуть группу"
                            >
                              <LogOut size={12} />
                              <span>Выйти</span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add members */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Добавить участников</p>
                  {loadingFriends ? (
                    <div className="flex justify-center py-4"><Loader2 size={20} className="text-primary-500 animate-spin" /></div>
                  ) : friends.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-3">Все друзья уже в группе</p>
                  ) : (
                    <div className="space-y-1">
                      {friends.map(f => (
                        <div key={f.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-700/30 transition-colors">
                          <AvatarComponent src={f.avatar} name={`${f.firstName} ${f.lastName}`} size={32} className="rounded-lg" />
                          <p className="text-white text-sm flex-1 truncate">{f.firstName} {f.lastName}</p>
                          {amIAdmin && (
                            <button
                              onClick={() => handleAddMember(f.id)}
                              className="p-1.5 bg-primary-500/20 hover:bg-primary-500/40 text-primary-400 rounded-lg transition-all flex-shrink-0"
                              title="Добавить"
                            >
                              <UserPlus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delete group (admin only) */}
                {amIAdmin && (
                  <button
                    onClick={handleDeleteGroup}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-sm transition-all border border-red-500/20 hover:border-red-500/40"
                  >
                    <Trash2 size={15} />
                    Удалить группу для всех
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Attachments panel */}
      {showAttachments && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAttachments(false)} />
          <div className="relative ml-auto w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 border-l border-slate-700/50 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Paperclip size={16} className="text-primary-400" />
                <h3 className="font-semibold text-white text-sm">Вложения</h3>
              </div>
              <button onClick={() => setShowAttachments(false)} className="p-1.5 hover:bg-slate-700/50 rounded-lg">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-2 border-b border-slate-700/50 flex-shrink-0">
              {(['media', 'files', 'links'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAttachmentsTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${attachmentsTab === tab ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {tab === 'media' ? 'Медиа' : tab === 'files' ? 'Файлы' : 'Ссылки'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {loadingAttachments ? (
                <div className="flex justify-center py-8"><Loader2 size={24} className="text-primary-500 animate-spin" /></div>
              ) : (() => {
                const isImage = (type?: string | null) => type?.startsWith('image/');

                let items = attachments;
                if (attachmentsTab === 'media') items = attachments.filter(a => isImage(a.attachmentType));
                else if (attachmentsTab === 'files') items = attachments.filter(a => !isImage(a.attachmentType));
                else items = []; // Links come from message content — skip for now

                if (items.length === 0) return (
                  <div className="flex flex-col items-center py-12 text-center">
                    <FileText size={32} className="text-slate-600 mb-2" />
                    <p className="text-slate-500 text-sm">Нет вложений</p>
                  </div>
                );

                if (attachmentsTab === 'media') return (
                  <div className="grid grid-cols-3 gap-1">
                    {items.map((a: any) => (
                      <a key={a.id} href={`${API_URL}${a.attachmentUrl}`} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-slate-700 block">
                        <img src={`${API_URL}${a.attachmentUrl}`} alt={a.attachmentName || ''} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                );

                return (
                  <div className="space-y-2">
                    {items.map((a: any) => (
                      <a key={a.id} href={`${API_URL}${a.attachmentUrl}`} target="_blank" rel="noreferrer" download={a.attachmentName || true} className="flex items-center gap-3 p-3 bg-slate-700/40 hover:bg-slate-700/60 rounded-xl transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center flex-shrink-0">
                          <FileText size={18} className="text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{a.attachmentName || 'Файл'}</p>
                          <p className="text-xs text-slate-500">
                            {a.attachmentSize ? `${(a.attachmentSize / 1024 / 1024).toFixed(2)} МБ · ` : ''}
                            {a.sender.firstName} {a.sender.lastName}
                          </p>
                        </div>
                        <Download size={15} className="text-slate-400 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto relative"
        style={{ touchAction: 'pan-y' }}
        onScroll={handleMessagesScroll}
        onClick={() => inputRef.current?.blur()}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
          {grouped.length === 0 ? (
            <div className="text-center py-10">
              <div className="inline-flex p-4 bg-slate-700/30 rounded-2xl mb-4">
                <Send size={32} className="text-slate-500" />
              </div>
              <p className="text-slate-400 text-sm">Нет сообщений</p>
              <p className="text-slate-500 text-xs mt-1">Отправьте первое сообщение</p>
            </div>
          ) : grouped.map(group => (
            <div key={group.dateKey}>
              {/* Date divider */}
              <div className="text-center mb-6">
                <span className="inline-block px-3 py-1 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 text-slate-400 text-xs rounded-lg">
                  {group.label}
                </span>
              </div>

              <div className="space-y-1">
                {group.messages.map((msg, idx) => {
                  const isMine = msg.senderId === me?.id;
                  const showSender = conversation.isGroup && !isMine &&
                    (idx === 0 || group.messages[idx - 1].senderId !== msg.senderId);
                  const senderInGroup = memberMap[msg.senderId];
                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`flex items-end ${isMine ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-3' : 'mt-1'} group/row relative rounded-xl transition-shadow`}
                      onTouchStart={e => { if (!msg.deletedAt) { onMsgTouchStart(e, msg.id); onMsgLongPressStart(e, msg); } }}
                      onTouchMove={e => { if (!msg.deletedAt) { onMsgTouchMove(e, msg.id); onMsgLongPressMove(); } }}
                      onTouchEnd={() => { if (!msg.deletedAt) { onMsgTouchEnd(msg); onMsgLongPressEnd(); } }}
                      onContextMenu={e => { e.preventDefault(); openContextMenu(msg, e.clientX, e.clientY); }}
                    >
                      {/* Reply hint icon — always rendered, opacity/scale controlled via ref */}
                      <div
                        ref={el => { hintEls.current[msg.id] = el; }}
                        className={`absolute ${isMine ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-primary-500/20`}
                        style={{ opacity: 0, transform: 'scale(0.6)', pointerEvents: 'none' }}
                      >
                        <Reply size={16} className="text-primary-400" />
                      </div>

                      {/* Swipe-animated content */}
                      <div
                        ref={el => { swipeEls.current[msg.id] = el; }}
                        className="flex items-end"
                      >
                      {/* Avatar for group non-mine */}
                      {conversation.isGroup && !isMine && (
                        <div className="mr-2 flex-shrink-0 self-end w-7">
                          {showSender && senderInGroup ? (
                            <AvatarComponent src={senderInGroup.avatar} name={`${senderInGroup.firstName} ${senderInGroup.lastName}`} size={28} className="rounded-lg" />
                          ) : null}
                        </div>
                      )}

                      <div className="max-w-xs md:max-w-md lg:max-w-lg relative group/msg">
                        {/* Sender name (group) */}
                        {showSender && senderInGroup && (
                          <p className="text-xs text-slate-400 mb-1 ml-1">
                            {senderInGroup.firstName} {senderInGroup.lastName}
                          </p>
                        )}

                        {/* Bubble */}
                        <div
                          onDoubleClick={() => !msg.deletedAt && setReactionPickerMsgId(msg.id)}
                          className={`relative px-4 py-2.5 rounded-2xl cursor-default ${
                            isMine
                              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-md shadow-lg shadow-primary-500/25'
                              : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 backdrop-blur-sm border border-slate-600/50 text-white rounded-tl-md shadow-lg'
                          } ${msg.deletedAt ? 'opacity-60' : ''}`}
                        >
                          {/* Reply quote */}
                          {msg.replyTo && (
                            <div className={`mb-2 pl-2 border-l-2 ${isMine ? 'border-white/50' : 'border-primary-500/70'} text-xs`}>
                              <p className={`font-semibold ${isMine ? 'text-white/80' : 'text-primary-400'}`}>
                                {msg.replyTo.sender.firstName} {msg.replyTo.sender.lastName}
                              </p>
                              <p className={`truncate ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
                                {msg.replyTo.deletedAt ? 'Сообщение удалено' : (msg.replyTo.content || (msg.replyTo.attachmentName ? `📎 ${msg.replyTo.attachmentName}` : '📎 Вложение'))}
                              </p>
                            </div>
                          )}

                          {/* Content */}
                          {msg.deletedAt ? (
                            <p className="text-sm italic opacity-70">Сообщение удалено</p>
                          ) : (
                            <>
                              {msg.attachmentUrl && (() => {
                                const isImage = msg.attachmentType?.startsWith('image/');
                                return isImage ? (
                                  <a href={`${API_URL}${msg.attachmentUrl}`} target="_blank" rel="noreferrer" className="block mb-1">
                                    <img src={`${API_URL}${msg.attachmentUrl}`} alt={msg.attachmentName || 'image'} className="rounded-lg max-w-full max-h-60 object-cover" />
                                  </a>
                                ) : (
                                  <a href={`${API_URL}${msg.attachmentUrl}`} target="_blank" rel="noreferrer" download={msg.attachmentName || true} className={`flex items-center gap-2 mb-1 px-3 py-2 rounded-lg ${isMine ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-600/50 hover:bg-slate-600'} transition-colors`}>
                                    <FileText size={16} className="flex-shrink-0" />
                                    <span className="text-xs truncate flex-1">{msg.attachmentName || 'Файл'}</span>
                                    <Download size={14} className="flex-shrink-0 opacity-60" />
                                  </a>
                                );
                              })()}
                              {/* Time meta — floated right so it sits inline with last text line */}
                              {(() => {
                                const timeMeta = (
                                  <span className={`inline-flex items-center gap-0.5 text-[11px] select-none align-bottom ${isMine ? 'text-primary-100/70' : 'text-slate-400'}`} style={{ float: 'right', marginLeft: '6px', marginBottom: '-1px', marginTop: '2px' }}>
                                    {msg.isEdited && <span className="opacity-70">изм.</span>}
                                    <span>{formatTime(msg.createdAt)}</span>
                                    {isMine && (() => {
                                      if (msg.readAt) return <CheckCheck size={12} className="text-emerald-400 flex-shrink-0" />;
                                      if (msg.deliveredAt) return <CheckCheck size={12} className="opacity-60 flex-shrink-0" />;
                                      return <Check size={12} className="opacity-60 flex-shrink-0" />;
                                    })()}
                                  </span>
                                );
                                return msg.content ? (
                                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap overflow-hidden">
                                    {timeMeta}{msg.content}
                                  </p>
                                ) : (
                                  <div className={`flex items-center justify-end gap-0.5 text-[11px] mt-0.5 ${isMine ? 'text-primary-100/70' : 'text-slate-400'}`}>
                                    {msg.isEdited && <span className="opacity-70">изм.</span>}
                                    <span>{formatTime(msg.createdAt)}</span>
                                    {isMine && (() => {
                                      if (msg.readAt) return <CheckCheck size={12} className="text-emerald-400 flex-shrink-0" />;
                                      if (msg.deliveredAt) return <CheckCheck size={12} className="opacity-60 flex-shrink-0" />;
                                      return <Check size={12} className="opacity-60 flex-shrink-0" />;
                                    })()}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                          {/* Time for deleted messages */}
                          {msg.deletedAt && (
                            <div className={`flex items-center justify-end gap-0.5 text-[11px] mt-0.5 ${isMine ? 'text-primary-100/70' : 'text-slate-400'}`}>
                              <span>{formatTime(msg.createdAt)}</span>
                            </div>
                          )}
                        </div>

                        {/* Inline reaction bubbles (below bubble) */}
                        {(msg.reactions?.length ?? 0) > 0 && !msg.deletedAt && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {groupReactions(msg.reactions ?? []).map(({ emoji, count, userIds }) => {
                              const isMyReaction = userIds.includes(me?.id ?? '');
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => isMyReaction ? handleUnreact(msg.id) : handleReact(msg.id, emoji)}
                                  className={`flex items-center gap-0.5 text-sm px-2 py-0.5 rounded-full border transition-colors ${
                                    isMyReaction
                                      ? 'bg-indigo-600/40 border-indigo-500/60 text-white'
                                      : 'bg-slate-700/80 border-slate-600/60 text-slate-300 hover:bg-slate-600/80'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  {count > 1 && <span className="text-xs font-medium">{count}</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Action icons under bubble */}
                        {!msg.deletedAt && (
                          <div className={`flex items-center gap-1 mt-1 opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <button
                              onClick={() => setReactionPickerMsgId(msg.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-slate-700/60 transition-colors"
                              title="Реакция"
                            >
                              <Smile size={14} />
                            </button>
                            <button
                              onClick={() => startReply(msg)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                              title="Ответить"
                            >
                              <Reply size={14} />
                            </button>
                            {isMine && (
                              <>
                                <button
                                  onClick={() => startEdit(msg)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                                  title="Редактировать"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(msg.id)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Удалить"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      </div>{/* end swipe-animated content */}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-10 h-10 rounded-full bg-slate-800 border border-slate-700 shadow-lg flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 9 12 14 7" />
          </svg>
        </button>
      )}

      {/* Context menu overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute bg-slate-800 border border-slate-700 rounded-2xl py-1.5 shadow-2xl min-w-[180px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 300),
            }}
            onClick={e => e.stopPropagation()}
          >
            {[
              { label: 'Ответить', icon: '↩️', action: () => { startReply(contextMenu.msg); setContextMenu(null); } },
              contextMenu.msg.content ? { label: 'Скопировать', icon: '📋', action: () => copyText(contextMenu.msg.content) } : null,
              contextMenu.msg.attachmentUrl && contextMenu.msg.attachmentType?.startsWith('image/')
                ? { label: 'Сохранить фото', icon: '🖼️', action: () => { const a = document.createElement('a'); a.href = `${API_URL}${contextMenu.msg.attachmentUrl}`; a.download = contextMenu.msg.attachmentName || 'photo'; a.click(); setContextMenu(null); } }
                : null,
              contextMenu.msg.senderId === me?.id
                ? { label: 'Редактировать', icon: '✏️', action: () => { startEdit(contextMenu.msg); setContextMenu(null); } }
                : null,
              contextMenu.msg.senderId === me?.id
                ? { label: 'Удалить', icon: '🗑️', danger: true, action: () => { handleDelete(contextMenu.msg.id); setContextMenu(null); } }
                : null,
            ].filter(Boolean).map((item: any, i) => (
              <button
                key={i}
                onClick={item.action}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-200 hover:bg-slate-700/60'}`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reaction picker overlay */}
      {reactionPickerMsgId && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setReactionPickerMsgId(null)}
        >
          <div
            className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex gap-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {REACTION_EMOJIS_LOCAL.map(emoji => {
              const msg = messages.find(m => m.id === reactionPickerMsgId);
              const myReaction = msg?.reactions?.find(r => r.userId === me?.id);
              return (
                <button
                  key={emoji}
                  onClick={() => {
                    if (myReaction?.emoji === emoji) handleUnreact(reactionPickerMsgId);
                    else handleReact(reactionPickerMsgId, emoji);
                    setReactionPickerMsgId(null);
                  }}
                  className={`text-3xl hover:scale-125 transition-transform leading-none ${myReaction?.emoji === emoji ? 'ring-2 ring-indigo-500 rounded-full' : ''}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={pickFile} />

      {/* Input area */}
      <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800">
        {/* Reply / Edit bar */}
        {(replyTo || editingId) && (
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${
            editingId ? 'bg-amber-500/10 border-amber-500/20' : 'bg-primary-500/10 border-primary-500/20'
          }`}>
            {editingId ? <Pencil size={13} className="text-amber-400 flex-shrink-0" /> : <Reply size={13} className="text-primary-400 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${editingId ? 'text-amber-400' : 'text-primary-400'}`}>
                {editingId ? 'Редактирование' : `${replyTo!.sender.firstName} ${replyTo!.sender.lastName}`}
              </p>
              {replyTo && !editingId && (
                <p className="text-xs text-slate-400 truncate">{replyTo.content || (replyTo.attachmentName ? `📎 ${replyTo.attachmentName}` : '')}</p>
              )}
            </div>
            <button onClick={() => { cancelEdit(); setReplyTo(null); }} className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors flex-shrink-0">
              <X size={13} className="text-slate-400" />
            </button>
          </div>
        )}

        {/* Attachment preview */}
        {pendingFile && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-800/40">
            {pendingPreview ? (
              <img src={pendingPreview} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                <FileText size={16} className="text-slate-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{pendingFile.name}</p>
              <p className="text-xs text-slate-500">{(pendingFile.size / 1024 / 1024).toFixed(2)} МБ</p>
            </div>
            <button onClick={clearAttachment} className="p-1 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0">
              <X size={13} className="text-slate-400" />
            </button>
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map(e => (
                <button key={e} type="button"
                  onClick={() => { setNewMessage(p => p + e); setShowEmoji(false); inputRef.current?.focus(); }}
                  className="text-xl hover:scale-125 transition-transform p-0.5"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message form */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 px-2 py-2">
          {/* Attach — standalone left */}
          {!editingId && (
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Прикрепить файл"
              className="p-2 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
              <Paperclip size={22} />
            </button>
          )}

          {/* Input bubble — emoji inside right */}
          <div className="flex-1 flex items-end bg-slate-800 border border-slate-700 rounded-2xl focus-within:border-primary-500/50 transition-colors overflow-hidden">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={editingId ? 'Редактировать...' : 'Сообщение...'}
              className="flex-1 bg-transparent text-sm text-white px-3 py-2.5 focus:outline-none placeholder-slate-500 resize-none overflow-y-auto"
              style={{ height: '40px', maxHeight: '160px', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            />
            <button type="button" onClick={() => setShowEmoji(p => !p)}
              className={`p-2.5 transition-colors flex-shrink-0 ${showEmoji ? 'text-primary-400' : 'text-slate-500 hover:text-slate-300'}`}>
              <Smile size={20} />
            </button>
          </div>

          {/* Send */}
          <button
            type="submit"
            disabled={(!newMessage.trim() && !pendingFile) || sending || uploading}
            className="p-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 text-white rounded-full transition-all disabled:cursor-not-allowed flex-shrink-0"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : editingId ? <Check size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
