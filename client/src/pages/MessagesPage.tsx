import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Plus, Users, X, Check, User, FolderKanban } from 'lucide-react';
import { messageAPI, friendshipAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
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
  const [activeTab, setActiveTab] = useState<'personal' | 'projects'>('personal');
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

  const TABS = [
    { id: 'personal' as const, label: 'Личные', icon: User },
    { id: 'projects' as const, label: 'Проекты', icon: FolderKanban },
  ];

  const filtered = conversations.filter(c =>
    (activeTab === 'personal' ? !c.isGroup : c.isGroup) &&
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={20} className="text-primary-400" />
                <h2 className="text-lg font-bold text-white">Сообщения</h2>
              </div>
              {activeTab === 'projects' && (
                <button
                  onClick={openNewGroup}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-medium transition-colors"
                >
                  <Plus size={14} />
                  Проект
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-3">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <tab.icon size={13} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени..."
                className="w-full bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 pl-8 pr-3 py-2 rounded-xl outline-none focus:border-primary-600 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="pb-24">
          {loading ? (
            <div className="divide-y divide-slate-800/60">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-11 h-11 rounded-full bg-slate-800 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-800 rounded w-2/5" />
                    <div className="h-3 bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {filtered.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/messages/${conv.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {conv.avatar ? (
                      <img
                        src={getAvatarUrl(conv.avatar)!}
                        alt={conv.name}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : conv.isGroup ? (
                      <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                        <Users size={18} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{conv.name[0]}</span>
                      </div>
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-primary-500 text-white text-[10px] min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center font-semibold">
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
                      <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-slate-500'}`}>
                        {conv.isGroup && `${conv.lastMessage.senderName.split(' ')[0]}: `}
                        {conv.lastMessage.content.length > 50
                          ? conv.lastMessage.content.slice(0, 50) + '...'
                          : conv.lastMessage.content}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Нет сообщений</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                <Search size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-sm">Ничего не найдено</p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
                {activeTab === 'projects'
                  ? <FolderKanban size={28} className="text-slate-600" />
                  : <MessageCircle size={28} className="text-slate-600" />}
              </div>
              <p className="text-slate-500 text-sm">
                {activeTab === 'projects' ? 'Нет проектов' : 'Нет сообщений'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl mb-20">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderKanban size={18} className="text-primary-400" />
                <h3 className="font-semibold text-white">Новый проект</h3>
              </div>
              <button onClick={() => setShowNewGroup(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Название проекта..."
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
              />

              <div className="space-y-1 max-h-52 overflow-y-auto">
                {friends.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Нет друзей для добавления</p>
                ) : friends.map(f => (
                  <button
                    key={f.id}
                    onClick={() => toggleFriend(f.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                      selectedIds.includes(f.id)
                        ? 'bg-primary-600/20 border border-primary-500/40'
                        : 'hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {f.avatar ? (
                      <img
                        src={getAvatarUrl(f.avatar)!}
                        alt={`${f.firstName} ${f.lastName}`}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{f.firstName[0]}</span>
                      </div>
                    )}
                    <span className="text-white text-sm flex-1">{f.firstName} {f.lastName}</span>
                    {selectedIds.includes(f.id) && <Check size={16} className="text-primary-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedIds.length === 0 || creatingGroup}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
              >
                {creatingGroup ? 'Создание...' : `Создать проект${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
