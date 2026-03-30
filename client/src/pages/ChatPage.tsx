import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Loader2, Reply, Pencil, Trash2, X, Users, Check } from 'lucide-react';
import { messageAPI } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '';

interface MsgSender {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
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
  replyTo: {
    id: string;
    content: string;
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

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reply / edit state
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

    socket.on('new_message', onNew);
    socket.on('message_edited', onEdited);
    socket.on('message_deleted', onDeleted);
    return () => {
      socket.off('new_message', onNew);
      socket.off('message_edited', onEdited);
      socket.off('message_deleted', onDeleted);
    };
  }, [conversationId]);

  // ── Send / Edit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || !conversationId || sending) return;

    setNewMessage('');
    setSending(true);

    try {
      if (editingId) {
        const res = await messageAPI.editMessage(editingId, text);
        setMessages(prev => prev.map(m => m.id === editingId ? res.data : m));
        setEditingId(null);
      } else {
        const res = await messageAPI.sendMessage(conversationId, text, replyTo?.id);
        setMessages(prev => [...prev, res.data]);
        setReplyTo(null);
      }
    } catch (err) {
      console.error('Failed:', err);
      setNewMessage(text);
    } finally {
      setSending(false);
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
  const chatName = conversation?.isGroup
    ? (conversation.name ?? 'Группа')
    : otherMember
    ? `${otherMember.firstName} ${otherMember.lastName}`
    : '...';
  const chatAvatar = conversation?.isGroup ? conversation.avatar : (otherMember?.avatar ?? null);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 size={48} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Chat Header */}
      <div className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/80 sticky top-[64px] z-30">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-purple-500/5 to-pink-500/5" />
        <div className="relative max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/messages')}
              className="group p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all border border-slate-700/50 hover:border-primary-500/50"
            >
              <ArrowLeft size={20} className="text-slate-300 group-hover:text-white transition-colors" />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              {chatAvatar ? (
                <img
                  src={`${API_URL}${chatAvatar}`}
                  alt={chatName}
                  className="w-9 h-9 rounded-xl object-cover ring-2 ring-slate-700/50"
                />
              ) : conversation.isGroup ? (
                <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50">
                  <Users size={16} className="text-white" />
                </div>
              ) : (
                <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50">
                  <span className="text-white font-bold text-sm">{chatName[0]}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-white text-sm truncate">{chatName}</h2>
                {conversation.isGroup && (
                  <p className="text-xs text-slate-400">{conversation.members.length} участников</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
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
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-3' : 'mt-1'}`}
                    >
                      {/* Avatar for group non-mine */}
                      {conversation.isGroup && !isMine && (
                        <div className="mr-2 flex-shrink-0 self-end w-7">
                          {showSender && senderInGroup ? (
                            senderInGroup.avatar ? (
                              <img
                                src={`${API_URL}${senderInGroup.avatar}`}
                                className="w-7 h-7 rounded-lg object-cover"
                                alt=""
                              />
                            ) : (
                              <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-xs font-bold">{senderInGroup.firstName[0]}</span>
                              </div>
                            )
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
                          className={`relative px-4 py-2.5 rounded-2xl ${
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
                                {msg.replyTo.deletedAt ? 'Сообщение удалено' : msg.replyTo.content}
                              </p>
                            </div>
                          )}

                          {/* Content */}
                          {msg.deletedAt ? (
                            <p className="text-sm italic opacity-70">Сообщение удалено</p>
                          ) : (
                            <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                          )}

                          {/* Time + edited */}
                          <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-primary-100' : 'text-slate-400'} text-xs`}>
                            {msg.isEdited && !msg.deletedAt && <span className="opacity-70">изм.</span>}
                            <span>{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>

                        {/* Action buttons — hover */}
                        {!msg.deletedAt && (
                          <div
                            className={`absolute top-0 ${isMine ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'} flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity`}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => startReply(msg)}
                              title="Ответить"
                              className="p-1.5 bg-slate-700/90 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white transition-all"
                            >
                              <Reply size={13} />
                            </button>
                            {isMine && (
                              <>
                                <button
                                  onClick={() => startEdit(msg)}
                                  title="Редактировать"
                                  className="p-1.5 bg-slate-700/90 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white transition-all"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(msg.id)}
                                  title="Удалить"
                                  className="p-1.5 bg-slate-700/90 hover:bg-red-500/80 rounded-lg text-slate-300 hover:text-white transition-all"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-slate-700/50 backdrop-blur-sm bg-slate-900/80 pb-20">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {/* Reply / Edit bar */}
          {(replyTo || editingId) && (
            <div className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-xl border ${
              editingId
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-primary-500/10 border-primary-500/30'
            }`}>
              {editingId ? (
                <Pencil size={14} className="text-amber-400 flex-shrink-0" />
              ) : (
                <Reply size={14} className="text-primary-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${editingId ? 'text-amber-400' : 'text-primary-400'}`}>
                  {editingId ? 'Редактирование' : `${replyTo!.sender.firstName} ${replyTo!.sender.lastName}`}
                </p>
                {replyTo && !editingId && (
                  <p className="text-xs text-slate-400 truncate">{replyTo.content}</p>
                )}
              </div>
              <button
                onClick={() => { cancelEdit(); setReplyTo(null); }}
                className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={14} className="text-slate-400" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={editingId ? 'Редактировать сообщение...' : 'Введите сообщение...'}
              className="flex-1 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 text-sm text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="group p-2.5 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-800 text-white rounded-xl transition-all disabled:cursor-not-allowed shadow-lg shadow-primary-500/25 hover:scale-105 disabled:scale-100"
            >
              {editingId ? <Check size={18} /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
