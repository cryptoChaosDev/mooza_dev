import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Flag } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { complaintAPI } from '../lib/api';

const CATEGORIES_USER = [
  'Спам', 'Недостоверная информация', 'Мошенничество / обман',
  'Оскорбления и угрозы', 'Выдача себя за другого', 'Контент 18+', 'Другое',
];
const CATEGORIES_POST = [
  'Спам', 'Мошенничество / обман', 'Оскорбления и угрозы',
  'Контент 18+', 'Нарушение авторских прав', 'Дезинформация', 'Другое',
];
const CATEGORIES_REVIEW = ['Клевета / ложные факты', 'Спам', 'Нарушение правил платформы', 'Другое'];

interface Props {
  targetType: 'user' | 'post' | 'review';
  targetId: string;
  onClose: () => void;
}

export default function ComplaintModal({ targetType, targetId, onClose }: Props) {
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const cats = targetType === 'user' ? CATEGORIES_USER : targetType === 'post' ? CATEGORIES_POST : CATEGORIES_REVIEW;
  const title = targetType === 'user' ? 'Жалоба на пользователя' : targetType === 'post' ? 'Жалоба на публикацию' : 'Жалоба на отзыв';

  const mut = useMutation({
    mutationFn: () => complaintAPI.submit({ targetType, targetId, category, text: text.trim() }),
    onSuccess: () => setSent(true),
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Flag size={15} className="text-red-400" />
            <h3 className="text-base font-semibold text-white">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {sent ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-emerald-400 font-semibold">Жалоба принята</p>
              <p className="text-sm text-slate-400">Мы рассмотрим её в течение 3 дней.</p>
              <button onClick={onClose} className="mt-3 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700 transition-colors">Закрыть</button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Категория</p>
                <div className="flex flex-wrap gap-2">
                  {cats.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${category === cat ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Описание</p>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
                  placeholder="Опишите суть жалобы подробно (минимум 30 символов)..."
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none" />
                {text.trim().length > 0 && text.trim().length < 30 && (
                  <p className="text-[11px] text-amber-400 mt-1">Опишите подробнее — нужно ещё {30 - text.trim().length} симв.</p>
                )}
              </div>
              <div className="flex gap-2.5">
                <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Отмена</button>
                <button onClick={() => mut.mutate()} disabled={!category || text.trim().length < 30 || mut.isPending}
                  className="flex-1 py-2.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5">
                  {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
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
