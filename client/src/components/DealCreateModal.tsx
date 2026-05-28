import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, HandshakeIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dealAPI } from '../lib/api';

interface Props {
  executorId: string;
  executorName: string;
  serviceId?: string;
  userServiceId?: string;
  serviceName?: string;
  onClose: () => void;
}

export default function DealCreateModal({ executorId, executorName, serviceId, userServiceId, serviceName, onClose }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [title, setTitle] = useState(serviceName ? `Сделка: ${serviceName}` : '');
  const [price, setPrice] = useState('');
  const [deadline, setDeadline] = useState('');
  const [acceptDeadline, setAcceptDeadline] = useState('');
  const [revisionCount, setRevisionCount] = useState('3');
  const [result, setResult] = useState('');

  const createMut = useMutation({
    mutationFn: () => dealAPI.create({
      title: title.trim(),
      executorId,
      serviceId: serviceId || undefined,
      userServiceId: userServiceId || undefined,
      price: price ? Number(price) : undefined,
      deadline: deadline || undefined,
      acceptDeadline: acceptDeadline || undefined,
      revisionCount: Number(revisionCount) || 3,
      result: result.trim() || undefined,
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      navigate(`/deals/${res.data.id}`);
      onClose();
    },
  });

  const canSubmit = title.trim().length >= 3;

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
        <div className="px-5 pb-5 flex gap-2.5 border-t border-slate-800 pt-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Отмена
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary-500/20"
          >
            {createMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <HandshakeIcon size={15} />}
            Оформить
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
