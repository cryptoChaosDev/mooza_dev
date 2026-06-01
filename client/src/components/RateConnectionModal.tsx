import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, Check, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewAPI } from '../lib/api';

const RATING_LABEL: Record<number, string> = {
  10: 'Восхитительно', 9: 'Отлично', 8: 'Очень хорошо', 7: 'Хорошо', 6: 'Приемлемо',
  5: 'Посредственно', 4: 'Ниже среднего', 3: 'Плохо', 2: 'Очень плохо', 1: 'Ужасно',
};

// Standalone connection-rating modal — reusable from any place where you have a
// partner to rate (profile, connections page, etc). Posts a 'connection' review;
// the server upserts by author→target so re-rating updates the existing one.
export default function RateConnectionModal({ targetId, targetName, serviceId, onClose }: {
  targetId: string;
  targetName: string;
  serviceId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [sent, setSent] = useState(false);

  const reviewMut = useMutation({
    mutationFn: () => reviewAPI.create({
      targetId,
      rating,
      text: reviewText.trim() || undefined,
      type: 'connection',
      serviceId,
    }),
    onSuccess: () => { setSent(true); queryClient.invalidateQueries({ queryKey: ['reviews', targetId] }); },
  });

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 rounded-lg">
              <Star size={15} className="text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Оценить взаимодействие</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {sent ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-3">
              <Check size={15} />Оценка отправлена
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                Как прошло взаимодействие с <span className="font-semibold text-white">{targetName}</span>?
              </p>
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                  <button key={i} onClick={() => setRating(i)} className="transition-transform hover:scale-110">
                    <Star size={22} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-xs text-amber-400/80 font-medium">{rating} — {RATING_LABEL[rating]}</p>
              )}
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="Комментарий (необязательно)..."
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">
                  Отмена
                </button>
                <button
                  onClick={() => reviewMut.mutate()}
                  disabled={rating === 0 || reviewMut.isPending}
                  className="flex-1 py-2.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  {reviewMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                  Отправить
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
