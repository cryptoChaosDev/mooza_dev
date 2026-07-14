import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Bookmark, Users, Search } from 'lucide-react';
import { messageAPI } from '../lib/api';
import AvatarComponent from './Avatar';
import { useScrollLock } from '../lib/scrollLock';

interface ConvLite {
  id: string;
  isGroup: boolean;
  name: string;
  avatar: string | null;
  type: string;
}

// Нижний лист «Отправить в чат»: Избранное + список бесед с поиском.
// onPick получает id целевого разговора; закрытие — на вызывающей стороне.
export default function ChatPicker({ title = 'Отправить в чат', onPick, onClose }: {
  title?: string;
  onPick: (conversationId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [convs, setConvs] = useState<ConvLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  useScrollLock(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await messageAPI.getConversations();
        // «Избранное» показываем отдельной строкой сверху
        setConvs((data as any[]).filter((c) => c.type !== 'saved'));
      } catch {
        setConvs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const list = q.trim() ? convs.filter(c => norm(c.name || '').includes(norm(q.trim()))) : convs;

  const pick = async (id: string) => {
    if (picking) return;
    setPicking(true);
    try {
      await onPick(id);
    } finally {
      setPicking(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[75dvh] flex flex-col"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск чата..."
              className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600"
            />
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-slate-800/60">
          <button
            onClick={async () => {
              try {
                const { data } = await messageAPI.getSaved();
                await pick(data.id);
              } catch { /* onPick сам показывает ошибки */ }
            }}
            disabled={picking}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Bookmark size={18} className="text-white" />
            </div>
            <span className="font-semibold text-white text-sm">Избранное</span>
          </button>
          {loading ? (
            <p className="px-4 py-4 text-sm text-slate-500">Загрузка…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">Чатов не найдено</p>
          ) : list.map(c => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              disabled={picking}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left disabled:opacity-60"
            >
              {c.isGroup && !c.avatar ? (
                <div className="w-10 h-10 rounded-full bg-slate-700/60 border border-slate-600/50 flex items-center justify-center flex-shrink-0">
                  <Users size={16} className="text-slate-300" />
                </div>
              ) : (
                <AvatarComponent src={c.avatar} name={c.name || 'Чат'} size={40} />
              )}
              <span className="font-medium text-white text-sm truncate">{c.name || 'Чат'}</span>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}
