import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Star, X, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { reviewAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';

interface Review {
  id: string;
  authorId: string;
  targetId: string;
  rating: number;
  text: string | null;
  reply: string | null;
  type: string;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; avatar: string | null };
  service: { id: string; name: string } | null;
  deal: { id: string; createdAt: string; updatedAt: string; status: string } | null;
}

function Stars({ rating, size = 10 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {[1,2,3,4,5,6,7,8,9,10].map(i => (
        <Star key={i} size={size} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
      ))}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  connection: 'Связь',
  service: 'Услуга',
  collaboration: 'Сотрудничество',
};

export default function ReviewsBlock({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savingReply, setSavingReply] = useState(false);

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ['reviews', userId],
    queryFn: async () => {
      const { data } = await reviewAPI.getForUser(userId);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reviewAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', userId] });
      setSelected(null);
    },
  });

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSavingReply(true);
    try {
      await reviewAPI.reply(selected.id, replyText.trim());
      queryClient.invalidateQueries({ queryKey: ['reviews', userId] });
      setSelected(null);
    } finally {
      setSavingReply(false);
    }
  };

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <Star size={14} className="text-amber-400 fill-amber-400" />
        <span className="text-sm font-semibold text-white">Отзывы</span>
        {reviews.length > 0 && <span className="text-xs text-slate-500">{reviews.length}</span>}
        {reviews.length > 0 && <span className="text-xs text-amber-400 font-medium">{avgRating.toFixed(1)}</span>}
        {reviews.length > 0 && (
          <button
            onClick={() => navigate(`/profile/${userId}/reviews`)}
            className="ml-auto text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
          >
            Смотреть все
          </button>
        )}
      </div>
      <div className="p-3">
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-600 italic text-center py-2">Отзывов пока нет</p>
        ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {reviews.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelected(r); setReplyText(r.reply || ''); }}
              className="flex flex-col gap-1.5 flex-shrink-0 text-left bg-slate-800/50 border border-slate-700/40 rounded-2xl p-3 hover:border-primary-500/40 transition-colors"
              style={{ width: 'calc((100% - 24px) / 3.5)' }}
            >
              <Stars rating={r.rating} />
              {r.service && (
                <span className="text-[9px] bg-primary-500/15 text-primary-400 px-1.5 py-0.5 rounded-md font-medium leading-tight truncate w-full block">
                  {r.service.name}
                </span>
              )}
              {r.text && (
                <p className="text-[10px] text-slate-400 leading-snug line-clamp-3 flex-1">{r.text}</p>
              )}
              <div className="flex items-center gap-1 mt-auto pt-1">
                {r.author.avatar
                  ? <img src={getAvatarUrl(r.author.avatar) ?? ''} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-4 h-4 rounded-full bg-primary-800 flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0">{r.author.firstName[0]}</div>
                }
                <span className="text-[9px] text-slate-500 truncate">{r.author.firstName}</span>
              </div>
            </button>
          ))}
        </div>
        )}
      </div>

      {selected && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div
            className="fixed inset-x-0 bottom-0 z-[71] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 mb-1" />
            <div className="flex items-start justify-between px-5 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <Stars rating={selected.rating} size={16} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500">{TYPE_LABELS[selected.type] ?? selected.type}</span>
                  {selected.service && (
                    <span className="text-xs text-primary-400 font-medium">{selected.service.name}</span>
                  )}
                  {selected.deal && selected.deal.status === 'COMPLETED' && (
                    <span className="text-xs text-slate-600">
                      {new Date(selected.deal.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      {' — '}
                      {new Date(selected.deal.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3">
                {selected.author.avatar
                  ? <img src={getAvatarUrl(selected.author.avatar) ?? ''} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-9 h-9 rounded-full bg-primary-800 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">{selected.author.firstName[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{selected.author.firstName} {selected.author.lastName}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(selected.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                {user?.id === selected.authorId && (
                  <button
                    onClick={() => deleteMutation.mutate(selected.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
              </div>

              {selected.text && (
                <p className="text-sm text-slate-300 leading-relaxed">{selected.text}</p>
              )}

              {selected.reply ? (
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-semibold text-primary-400 flex items-center gap-1">
                    <MessageSquare size={11} />Ответ
                  </p>
                  <p className="text-sm text-slate-300">{selected.reply}</p>
                </div>
              ) : isOwner ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <MessageSquare size={11} />Ответить на отзыв
                  </p>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Напишите ответ..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || savingReply}
                    className="w-full py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    {savingReply ? <Loader2 size={14} className="animate-spin" /> : null}
                    Отправить ответ
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
