import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, HandshakeIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dealAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { DEALS_ENABLED } from '../lib/features';

interface DuplicateValues {
  title?: string;
  price?: number | null;
  revisionCount?: number | null;
  result?: string | null;
}

interface Props {
  executorId: string;
  executorName: string;
  serviceId?: string;
  userServiceId?: string;
  serviceName?: string;
  initialValues?: DuplicateValues;
  onClose: () => void;
}

export default function DealCreateModal({ executorId, executorName, serviceId, userServiceId, serviceName, initialValues, onClose }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const userAge = user?.birthDate
    ? Math.floor((Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const canCreateDeal = userAge === null || userAge >= 18;

  const [title, setTitle] = useState(initialValues?.title ?? (serviceName ? `Сделка: ${serviceName}` : ''));
  const [dealType, setDealType] = useState<'process' | 'event'>('process');
  const [price, setPrice] = useState(initialValues?.price != null ? String(initialValues.price) : '');
  const [deadline, setDeadline] = useState('');
  const [acceptDeadline, setAcceptDeadline] = useState('');
  const [revisionCount, setRevisionCount] = useState(initialValues?.revisionCount != null ? String(initialValues.revisionCount) : '3');
  const [result, setResult] = useState(initialValues?.result ?? '');
  const [eventDate, setEventDate] = useState('');
  const [deposit, setDeposit] = useState('');

  const createMut = useMutation({
    mutationFn: () => dealAPI.create({
      title: title.trim(),
      executorId,
      serviceId: serviceId || undefined,
      userServiceId: userServiceId || undefined,
      price: price ? Number(price) : undefined,
      result: result.trim() || undefined,
      dealType,
      ...(dealType === 'event'
        ? {
            eventDate: eventDate || undefined,
            deposit: deposit ? Number(deposit) : undefined,
          }
        : {
            deadline: deadline || undefined,
            acceptDeadline: acceptDeadline || undefined,
            revisionCount: Number(revisionCount) || 3,
          }),
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      navigate(`/deals/${res.data.id}`);
      onClose();
    },
  });

  const canSubmit = title.trim().length >= 3 && (dealType !== 'event' || !!eventDate);

  // Deal creation is temporarily disabled — never render the form (belt-and-suspenders
  // alongside the gated entry points). Re-enable via DEALS_ENABLED.
  if (!DEALS_ENABLED) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-500/10 rounded-lg">
              <HandshakeIcon size={15} className="text-primary-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Оформить сделку</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Название сделки *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Название сделки..."
              maxLength={100}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Тип сделки</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDealType('process')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${dealType === 'process' ? 'bg-primary-600/20 border-primary-500/40 text-primary-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                Процессная
              </button>
              <button type="button" onClick={() => setDealType('event')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${dealType === 'event' ? 'bg-primary-600/20 border-primary-500/40 text-primary-300' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                Событийная
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              {dealType === 'process' ? 'Работа сдаётся по завершении' : 'Услуга оказывается в конкретную дату'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Исполнитель</label>
            <p className="px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white">{executorName}</p>
          </div>

          {serviceName && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Услуга</label>
              <p className="px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-primary-300">{serviceName}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Стоимость (₽)</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="По договорённости"
              min={0}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {dealType === 'process' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Срок сдачи</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Срок приёмки</label>
                  <input
                    type="date"
                    value={acceptDeadline}
                    onChange={e => setAcceptDeadline(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Количество правок</label>
                <input
                  type="number"
                  value={revisionCount}
                  onChange={e => setRevisionCount(e.target.value)}
                  min={0}
                  max={20}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Дата события *</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Невозвратный депозит (₽)</label>
                <input
                  type="number"
                  value={deposit}
                  onChange={e => setDeposit(e.target.value)}
                  min={0}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <p className="text-[10px] text-slate-600 mt-1">Сумма, которая не возвращается при отмене после оплаты</p>
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Ожидаемый результат</label>
            <textarea
              value={result}
              onChange={e => setResult(e.target.value)}
              placeholder="Опишите что должно быть сделано..."
              rows={3}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 border-t border-slate-800 pt-4 flex-shrink-0 space-y-3">
          {!canCreateDeal && (
            <div className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-2xl px-4 py-3">
              🔞 Сделки доступны пользователям от 18 лет
            </div>
          )}
          <div className="flex gap-2.5">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Отмена
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!canSubmit || !canCreateDeal || createMut.isPending}
              className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary-500/20"
            >
              {createMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <HandshakeIcon size={15} />}
              Оформить
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
