import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
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
    } else if (diffInHours < 48) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }
  };

  const truncateMessage = (message: string, maxLength: number = 50) => {
    return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
  };

  const filteredConversations = conversations.filter(conv => 
    `${conv.user.firstName} ${conv.user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        {/* Header with gradient backdrop */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
          <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-500/20 rounded-2xl">
                <MessageCircle size={28} className="text-primary-400" />
              </div>
              <div className="h-10 bg-slate-700/50 rounded-lg w-48 animate-pulse"></div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-24 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-700/50 rounded-2xl"></div>
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-slate-700/50 rounded-lg w-1/3"></div>
                  <div className="h-3 bg-slate-700/50 rounded-lg w-2/3"></div>
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
        <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-500/20 rounded-2xl">
              <MessageCircle size={28} className="text-primary-400" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Сообщения
            </h2>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-6">
        {/* Search */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl blur-xl"></div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени..."
              className="w-full pl-12 pr-4 py-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all"
            />
          </div>
        </div>

        {/* Conversations List */}
        {filteredConversations.length > 0 ? (
          <div className="space-y-3">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.user.id}
                onClick={() => navigate(`/messages/${conversation.user.id}`)}
                className="w-full group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10 text-left"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {conversation.user.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${conversation.user.avatar}`}
                        alt={`${conversation.user.firstName} ${conversation.user.lastName}`}
                        className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                        <span className="text-white font-bold text-lg">
                          {conversation.user.firstName[0]}{conversation.user.lastName[0]}
                        </span>
                      </div>
                    )}
                    {conversation.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-semibold shadow-lg">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-white truncate">
                        {conversation.user.firstName} {conversation.user.lastName}
                      </p>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {formatTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${
                      conversation.unreadCount > 0 ? 'text-white font-medium' : 'text-slate-400'
                    }`}>
                      {truncateMessage(conversation.lastMessage)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery ? (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="relative text-center py-16 px-6">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <Search size={64} className="text-slate-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Ничего не найдено</h3>
              <p className="text-slate-400 text-lg">Попробуйте изменить запрос</p>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="relative text-center py-16 px-6">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <MessageCircle size={64} className="text-slate-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Нет сообщений</h3>
              <p className="text-slate-400 text-lg">Начните общение с друзьями</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
