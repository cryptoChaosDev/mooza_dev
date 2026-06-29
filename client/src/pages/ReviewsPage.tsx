import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Star, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { reviewAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={13} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
      ))}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  connection: 'Связь',
  service: 'Услуга',
  collaboration: 'Сотрудничество',
};

type SortMode = 'date' | 'positive' | 'negative';

export default function ReviewsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SortMode>('date');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savingReply, setSavingReply] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', userId, sort],
    queryFn: async () => {
      const { data } = await reviewAPI.getForUser(userId!, sort);
      return data as any[];
    },
    enabled: !!userId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reviewAPI.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reviews', userId] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить отзыв')),
  });

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setSavingReply(true);
    try {
      await reviewAPI.reply(reviewId, replyText.trim());
      queryClient.invalidateQueries({ queryKey: ['reviews', userId] });
      setReplyingId(null);
      setReplyText('');
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось отправить ответ'));
    } finally {
      setSavingReply(false);
    }
  };

  const isOwner = user?.id === userId;
  const avgRating = reviews.length
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center gap-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white">Отзывы</h1>
          {reviews.length > 0 && (
            <p className="text-xs text-slate-500">{avgRating.toFixed(1)} <Star size={10} className="inline text-amber-400 fill-amber-400 -mt-0.5" /></p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* Sort controls */}
        <div className="flex gap-2">
          {([
            { key: 'date', label: 'По дате' },
            { key: 'positive', label: 'Положительные' },
            { key: 'negative', label: 'Отрицательные' },
          ] as { key: SortMode; label: string }[]).map(s => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                sort === s.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-primary-500" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <Star size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Отзывов пока нет</p>
          </div>
        ) : (
          reviews.map((r: any) => (
            <div key={r.id} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {r.author.avatar
                  ? <img src={getAvatarUrl(r.author.avatar) ?? ''} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5" />
                  : <div className="w-9 h-9 rounded-full bg-primary-800 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5">{r.author.firstName[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white min-w-0 break-words [overflow-wrap:anywhere]">{r.author.firstName} {r.author.lastName}</span>
                    <Stars rating={r.rating} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <span className="text-[11px] text-slate-600">·</span>
                    <span className="text-[11px] text-slate-500">{TYPE_LABELS[r.type] ?? r.type}</span>
                    {r.service && (
                      <>
                        <span className="text-[11px] text-slate-600">·</span>
                        <span className="text-[11px] text-primary-400">{r.service.name}</span>
                      </>
                    )}
                  </div>
                </div>
                {user?.id === r.authorId && (
                  <button
                    onClick={() => deleteMutation.mutate(r.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors flex-shrink-0"
                  >
                    {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>

              {r.text && <p className="text-sm text-slate-300 leading-relaxed break-words [overflow-wrap:anywhere]">{r.text}</p>}

              {r.reply ? (
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 space-y-1 ml-4">
                  <p className="text-xs font-semibold text-primary-400 flex items-center gap-1">
                    <MessageSquare size={11} />Ответ
                  </p>
                  <p className="text-sm text-slate-300 break-words [overflow-wrap:anywhere]">{r.reply}</p>
                </div>
              ) : isOwner && replyingId !== r.id ? (
                <button
                  onClick={() => { setReplyingId(r.id); setReplyText(''); }}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary-400 transition-colors ml-4"
                >
                  <MessageSquare size={12} />Ответить
                </button>
              ) : isOwner && replyingId === r.id ? (
                <div className="ml-4 space-y-2">
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Напишите ответ..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReplyingId(null)}
                      className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => handleReply(r.id)}
                      disabled={!replyText.trim() || savingReply}
                      className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      {savingReply ? <Loader2 size={13} className="animate-spin" /> : null}
                      Отправить
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
