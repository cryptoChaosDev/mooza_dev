import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, User, MoreVertical } from 'lucide-react';
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
      <div className="pt-16 pb-24 max-w-lg mx-auto px-4">
        <div className="animate-pulse">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-slate-700 rounded-full w-10 h-10"></div>
            <div className="h-4 bg-slate-700 rounded w-1/3"></div>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-end">
                <div className="bg-slate-700 rounded-2xl rounded-br-md h-12 w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pt-16 pb-24 max-w-lg mx-auto px-4 flex items-center justify-center">
        <div className="text-center">
          <User className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Пользователь не найден</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 pb-24 max-w-lg mx-auto px-4 flex flex-col h-[calc(100vh-120px)]">
      {/* Chat Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 -mx-4 mb-4 sticky top-16 z-10">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/messages')}
            className="p-2 -ml-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          
          <div className="flex items-center space-x-3 ml-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
            
            <div>
              <h2 className="font-semibold text-white">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-xs text-slate-400">онлайн</p>
            </div>
          </div>
          
          <button className="ml-auto p-2 hover:bg-slate-800 rounded-full transition-colors">
            <MoreVertical className="w-5 h-5 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-4">
        {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
          <div key={dateKey}>
            <div className="text-center mb-4">
              <span className="inline-block px-3 py-1 bg-slate-800 text-slate-300 text-sm rounded-full">
                {formatDate(dateMessages[0].createdAt)}
              </span>
            </div>
            
            <div className="space-y-3">
              {dateMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.senderId === userId ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                      message.senderId === userId
                        ? 'bg-slate-700 text-white rounded-tl-none'
                        : 'bg-primary-500 text-white rounded-tr-none'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.senderId === userId ? 'text-slate-300' : 'text-primary-100'
                    }`}>
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="mt-4">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Введите сообщение..."
            className="flex-1 bg-slate-800 text-white rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-primary-500 text-white p-3 rounded-full hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}