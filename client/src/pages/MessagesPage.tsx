import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Loader2 } from 'lucide-react';
import { messageAPI } from '../lib/api';

interface Conversation {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await messageAPI.getConversations();
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const truncateMessage = (message: string, maxLength: number = 50) => {
    return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        {/* Header with gradient backdrop */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
          <div className="relative max-w-4xl mx-auto px-4 pt-6 pb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary-500/20 rounded-2xl">
                  <MessageCircle size={28} className="text-primary-400" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Сообщения
                </h1>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        <div className="max-w-4xl mx-auto px-4 pb-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-700/50 rounded-2xl"></div>
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-slate-700/50 rounded-lg w-1/3"></div>
                  <div className="h-4 bg-slate-700/50 rounded-lg w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header with gradient backdrop */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-4xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-500/20 rounded-2xl">
                <MessageCircle size={28} className="text-primary-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Сообщения
              </h1>
            </div>
            <button className="group p-3 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 rounded-xl transition-all duration-300 border border-slate-700/50 hover:border-primary-500/50">
              <Search size={20} className="text-slate-300 group-hover:text-primary-400 transition-colors" />
            </button>
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {conversations.length === 0 ? (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="relative text-center py-16 px-6">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <MessageCircle size={64} className="text-slate-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Нет сообщений</h3>
              <p className="text-slate-400 text-lg">Начните общение с другими музыкантами</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <div
                key={conversation.user.id}
                onClick={() => navigate(`/messages/${conversation.user.id}`)}
                className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 cursor-pointer hover:scale-[1.02] shadow-lg hover:shadow-primary-500/10"
              >
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <div className="relative flex items-center gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0 relative">
                    {conversation.user.avatar ? (
                      <div className="relative">
                        <img
                          src={`${import.meta.env.VITE_API_URL}${conversation.user.avatar}`}
                          alt={`${conversation.user.firstName} ${conversation.user.lastName}`}
                          className="w-16 h-16 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/40 transition-all duration-300"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/40 transition-all duration-300 group-hover:scale-105">
                        <span className="text-white font-bold text-xl">
                          {conversation.user.firstName[0]}{conversation.user.lastName[0]}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Message Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <h3 className="font-bold text-white text-lg truncate group-hover:text-primary-300 transition-colors">
                        {conversation.user.firstName} {conversation.user.lastName}
                      </h3>
                      <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors whitespace-nowrap">
                        {formatTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 group-hover:text-slate-200 truncate transition-colors leading-relaxed">
                      {truncateMessage(conversation.lastMessage)}
                    </p>
                  </div>

                  {/* Unread Badge */}
                  {conversation.unreadCount > 0 && (
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary-500 rounded-full blur-md opacity-50"></div>
                        <div className="relative bg-gradient-to-br from-primary-500 to-primary-600 text-white text-xs font-bold rounded-full min-w-[28px] h-7 px-2 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:scale-110 transition-transform">
                          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}