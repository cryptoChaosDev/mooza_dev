import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Plus, Users, X, Check } from 'lucide-react';
import { messageAPI, friendshipAPI } from '../lib/api';
import { getSocket } from '../lib/socket';

interface ConvItem {
  id: string;
  isGroup: boolean;
  name: string;
  avatar: string | null;
  otherUser: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  lastMessage: { content: string; createdAt: string; senderId: string; senderName: string } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Friend {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const navigate = useNavigate();

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await messageAPI.getConversations();
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh list when new messages or groups arrive
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => loadConversations();
    socket.on('new_message', refresh);
    socket.on('group_created', refresh);
    return () => {
      socket.off('new_message', refresh);
      socket.off('group_created', refresh);
    };
  }, [loadConversations]);

  const openNewGroup = async () => {
    setShowNewGroup(true);
    setGroupName('');
    setSelectedIds([]);
    try {
      const res = await friendshipAPI.getFriends();
      const list: Friend[] = (res.data as any[]).map((f: any) => ({
        id: f.user.id,
        firstName: f.user.firstName,
        lastName: f.user.lastName,
        avatar: f.user.avatar ?? null,
      }));
      setFriends(list);
    } catch {
      setFriends([]);
    }
  };

  const toggleFriend = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedIds.length === 0 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const res = await messageAPI.createGroup(groupName.trim(), selectedIds);
      setShowNewGroup(false);
      navigate(`/messages/${res.data.id}`);
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setCreatingGroup(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffH = (now.getTime() - date.getTime()) / 3600000;
    if (diffH < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffH < 48) return 'Вчера';
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const filtered = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary-500/20 rounded-xl">
                <MessageCircle size={20} className="text-primary-400" />
              </div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Сообщения
              </h2>
            </div>
            <button
              onClick={openNewGroup}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-xl text-sm transition-all border border-primary-500/20 hover:border-primary-500/40"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Группа</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-24 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-full pl-10 pr-4 py-2.5 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
          />
        </div>

        {/* Conversations */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-3.5 border border-slate-700/50 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-700/50 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-700/50 rounded-lg w-1/3" />
                    <div className="h-3 bg-slate-700/50 rounded-lg w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => navigate(`/messages/${conv.id}`)}
                className="w-full group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-3 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-md text-left"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {conv.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${conv.avatar}`}
                        alt={conv.name}
                        className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all"
                      />
                    ) : conv.isGroup ? (
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                        <Users size={18} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/50 transition-all">
                        <span className="text-white font-bold text-sm">
                          {conv.name[0]}
                        </span>
                      </div>
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary-500 text-white text-[10px] min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center font-semibold shadow-lg">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-semibold text-white text-sm truncate">{conv.name}</p>
                      {conv.lastMessage && (
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    {conv.lastMessage ? (
                      <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-slate-400'}`}>
                        {conv.isGroup && `${conv.lastMessage.senderName.split(' ')[0]}: `}
                        {conv.lastMessage.content.length > 50
                          ? conv.lastMessage.content.slice(0, 50) + '...'
                          : conv.lastMessage.content}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Нет сообщений</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery ? (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 text-center py-10 px-6">
            <Search size={36} className="text-slate-500 mx-auto mb-4" />
            <h3 className="text-base font-bold text-white mb-2">Ничего не найдено</h3>
            <p className="text-slate-400 text-sm">Попробуйте изменить запрос</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 text-center py-10 px-6">
            <MessageCircle size={36} className="text-slate-500 mx-auto mb-4" />
            <h3 className="text-base font-bold text-white mb-2">Нет сообщений</h3>
            <p className="text-slate-400 text-sm">Начните общение с друзьями</p>
          </div>
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl mb-20">
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-primary-400" />
                <h3 className="font-semibold text-white">Новая группа</h3>
              </div>
              <button onClick={() => setShowNewGroup(false)} className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Group name */}
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Название группы..."
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />

              {/* Friends list */}
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {friends.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Нет друзей для добавления</p>
                ) : friends.map(f => (
                  <button
                    key={f.id}
                    onClick={() => toggleFriend(f.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
                      selectedIds.includes(f.id)
                        ? 'bg-primary-500/20 border border-primary-500/40'
                        : 'bg-slate-700/30 border border-transparent hover:bg-slate-700/50'
                    }`}
                  >
                    {f.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${f.avatar}`}
                        alt={`${f.firstName} ${f.lastName}`}
                        className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{f.firstName[0]}</span>
                      </div>
                    )}
                    <span className="text-white text-sm flex-1">{f.firstName} {f.lastName}</span>
                    {selectedIds.includes(f.id) && <Check size={16} className="text-primary-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Create button */}
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedIds.length === 0 || creatingGroup}
                className="w-full py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-800 text-white rounded-xl text-sm font-medium transition-all disabled:cursor-not-allowed"
              >
                {creatingGroup ? 'Создание...' : `Создать группу${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
