import { Link } from 'react-router-dom';
import { CheckCircle2, BadgeCheck, ExternalLink, RotateCcw, Megaphone } from 'lucide-react';
import AvatarComponent from '../Avatar';
import { plural } from '../../lib/plural';
import type { CreateRequestResponse } from '../../lib/requestsApi';

/** Итог отправки: сколько исполнителей уведомлено, ссылка на заказ, превью профилей. */
export default function RequestResult({ result, onReset }: { result: CreateRequestResponse; onReset: () => void }) {
  const n = result.notifiedCount;
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-center">
        {n > 0 ? (
          <>
            <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-base font-semibold text-white">
              Запрос отправлен {n} {plural(n, 'подходящему исполнителю', 'подходящим исполнителям', 'подходящим исполнителям')}
            </p>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">Отклики придут в уведомления и чат.</p>
          </>
        ) : (
          <>
            <Megaphone size={36} className="text-primary-400 mx-auto mb-3" />
            <p className="text-base font-semibold text-white">Заказ опубликован</p>
            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
              Подходящих исполнителей пока не нашли — заказ виден всем в Потоке. Отклики придут в уведомления и чат.
            </p>
          </>
        )}
        <Link
          to={`/orders/${result.orderId}`}
          className="mt-4 w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <ExternalLink size={16} /> Открыть заказ
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="mt-2 w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={14} /> Новый запрос
          {result.remainingToday >= 0 && (
            <span className="text-slate-500">· осталось сегодня: {result.remainingToday}</span>
          )}
        </button>
      </div>

      {result.previewUsers.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Кому отправили</p>
          <div className="space-y-1">
            {result.previewUsers.map((u) => (
              <Link
                key={u.id}
                to={`/profile/${u.id}`}
                className="flex items-center gap-3 p-2 -mx-2 rounded-2xl hover:bg-slate-800/60 transition-colors"
              >
                <AvatarComponent src={u.avatar} name={u.displayName} size={40} className="rounded-xl flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                    {u.displayName}
                    {u.isVerified && <BadgeCheck size={14} className="text-primary-400 flex-shrink-0" />}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{[u.profession, u.city].filter(Boolean).join(' · ')}</p>
                </div>
              </Link>
            ))}
          </div>
          {n > result.previewUsers.length && (
            <p className="text-xs text-slate-500 mt-2">
              и ещё {n - result.previewUsers.length} {plural(n - result.previewUsers.length, 'исполнитель', 'исполнителя', 'исполнителей')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
