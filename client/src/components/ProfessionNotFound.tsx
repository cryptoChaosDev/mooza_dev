import { useState, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { supportAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

interface ProfessionNotFoundProps {
  /** Предзаполнить название профессии (например, текущим поисковым запросом). */
  initialQuery?: string;
  /** Компактная вёрстка для инлайна/дропдаунов (иначе — центрированный блок на весь экран). */
  compact?: boolean;
}

/**
 * «Такой профессии не найдено — напишите в поддержку» + форма запроса на добавление.
 * Отправляет POST /api/support/profession-request (в Telegram команде + админам).
 * Переиспользуется в ProfessionSelector, FilterPanel и MultiLevelSearch.
 */
export default function ProfessionNotFound({ initialQuery = '', compact = false }: ProfessionNotFoundProps) {
  const [profession, setProfession] = useState(initialQuery);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  // Форма следует за входящим запросом, пока пользователь не начал её править / не отправил.
  useEffect(() => {
    setProfession(initialQuery);
    setComment('');
    setSent(false);
  }, [initialQuery]);

  const mut = useMutation({
    mutationFn: () => supportAPI.requestProfession({
      profession: profession.trim(),
      comment: comment.trim() || undefined,
    }),
    onSuccess: () => setSent(true),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить запрос')),
  });

  const inputCls = 'w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  if (sent) {
    return (
      <div className={compact ? 'py-3 px-1 text-center space-y-1' : 'max-w-sm mx-auto mt-6 text-center space-y-1'}>
        <p className="text-emerald-400 text-sm font-semibold">✓ Запрос отправлен</p>
        <p className="text-slate-500 text-xs">Добавим профессию в ближайшее время.</p>
      </div>
    );
  }

  return (
    // stopPropagation — чтобы клики по форме не сворачивали родительский дропдаун/секцию
    <div className={compact ? 'py-2 px-1' : 'px-4 py-8'} onClick={(e) => e.stopPropagation()}>
      <div className={compact ? 'px-1' : 'max-w-sm mx-auto text-center'}>
        <p className="text-slate-200 text-sm font-semibold">Такой профессии не найдено</p>
        <p className="text-slate-500 text-xs mt-1">Напишите в поддержку — добавим её в каталог.</p>
      </div>
      <div className={compact ? 'space-y-2 mt-3' : 'max-w-sm mx-auto mt-5 space-y-3'}>
        <input
          type="text"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          maxLength={80}
          placeholder="Название профессии"
          className={inputCls}
        />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Комментарий (необязательно)"
          className={`${inputCls} resize-none`}
        />
        <button
          onClick={() => mut.mutate()}
          disabled={profession.trim().length < 2 || mut.isPending}
          className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
        >
          {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Отправить в поддержку
        </button>
      </div>
    </div>
  );
}
