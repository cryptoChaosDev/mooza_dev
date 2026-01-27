import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, MoreVertical, Loader2 } from 'lucide-react';
import { messageAPI } from '../lib/api';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
}

export default function ChatPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userId) {
      loadChat();
    }
  }, [userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChat = async () => {
    try {
      setLoading(true);
      const response = await messageAPI.getMessages(userId!);
      setUser(response.data.user);
      setMessages(response.data.messages);
    } catch (error) {
      console.error('Failed to load chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    try {
      const response = await messageAPI.sendMessage(userId, newMessage.trim());
      setMessages([...messages, response.data]);
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
      });
    }
  };

  // Group messages by date
  const groupedMessages: Record<string, Message[]> = {};
  messages.forEach(message => {
    const dateKey = new Date(message.createdAt).toDateString();
    if (!groupedMessages[dateKey]) {
      groupedMessages[dateKey] = [];
    }
    groupedMessages[dateKey].push(message);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 size={48} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
            <MoreVertical size={64} className="text-slate-500" />
          </div>
          <p className="text-slate-400 text-lg">Пользователь не найден</p>
          <button
            onClick={() => navigate('/messages')}
            className="mt-4 bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl transition-all"
          >
            Вернуться к сообщениям
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Chat Header */}
      <div className="relative border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/80 sticky top-[64px] z-30">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="relative max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/messages')}
              className="group p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all duration-300 border border-slate-700/50 hover:border-primary-500/50"
            >
              <ArrowLeft size={20} className="text-slate-300 group-hover:text-white transition-colors" />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              {user.avatar ? (
                <img
                  src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                  alt={`${user.firstName} ${user.lastName}`}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-slate-700/50 hover:ring-primary-500/40 transition-all duration-300"
                />
              ) : (
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50">
                  <span className="text-white font-bold text-lg">
                    {user.firstName[0]}{user.lastName[0]}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-white text-lg truncate">
                  {user.firstName} {user.lastName}
                </h2>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <p className="text-xs text-slate-400">онлайн</p>
                </div>
              </div>
            </div>

            <button className="p-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all duration-300 border border-slate-700/50 hover:border-primary-500/50">
              <MoreVertical size={20} className="text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
          {Object.entries(groupedMessages).length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <Send size={64} className="text-slate-500" />
              </div>
              <p className="text-slate-400 text-lg">Нет сообщений</p>
              <p className="text-slate-500 text-sm mt-2">Отправьте первое сообщение</p>
            </div>
          ) : (
            Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
              <div key={dateKey}>
                <div className="text-center mb-6">
                  <span className="inline-block px-4 py-2 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 text-slate-300 text-sm rounded-xl font-medium shadow-lg">
                    {formatDate(dateMessages[0].createdAt)}
                  </span>
                </div>

                <div className="space-y-4">
                  {dateMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderId === userId ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className="max-w-xs md:max-w-md lg:max-w-lg">
                        <div
                          className={`group relative px-4 py-3 rounded-2xl ${
                            message.senderId === userId
                              ? 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 backdrop-blur-sm border border-slate-600/50 text-white rounded-tl-md shadow-lg'
                              : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-md shadow-lg shadow-primary-500/25'
                          }`}
                        >
                          <p className="text-sm leading-relaxed break-words">{message.content}</p>
                          <p
                            className={`text-xs mt-2 ${
                              message.senderId === userId ? 'text-slate-400' : 'text-primary-100'
                            }`}
                          >
                            {formatTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="border-t border-slate-700/50 backdrop-blur-sm bg-slate-900/80 pb-20">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSendMessage}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Введите сообщение..."
                className="flex-1 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 text-white rounded-2xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="group relative p-3 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-800 text-white rounded-2xl transition-all duration-300 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105 disabled:shadow-none disabled:scale-100"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-400/0 via-white/20 to-primary-400/0 opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
                <Send size={20} className="relative z-10" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}