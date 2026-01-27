import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, User } from 'lucide-react';
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
      <div className="pt-16 pb-24 max-w-lg mx-auto px-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <div className="bg-slate-700 rounded-full w-12 h-12"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-700 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-700 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 pb-24 max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Сообщения</h1>
          <button className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors">
            <Search className="w-5 h-5 text-slate-300" />
          </button>
        </div>
        
        {conversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Нет сообщений</h3>
            <p className="text-slate-400">Начните общение с другими музыкантами</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.user.id}
                onClick={() => navigate(`/messages/${conversation.user.id}`)}
                className="bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  {conversation.user.avatar ? (
                    <img
                      src={conversation.user.avatar}
                      alt={`${conversation.user.firstName} ${conversation.user.lastName}`}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-semibold text-white truncate">
                        {conversation.user.firstName} {conversation.user.lastName}
                      </h3>
                      <span className="text-xs text-slate-400 ml-2">
                        {formatTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 truncate mt-1">
                      {truncateMessage(conversation.lastMessage)}
                    </p>
                  </div>
                  
                  {conversation.unreadCount > 0 && (
                    <div className="bg-primary-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
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