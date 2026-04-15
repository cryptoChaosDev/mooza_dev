import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { connectionAPI } from '../lib/api';
import AvatarComponent from './Avatar';

interface Props {
  targetUser: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    userServices?: Array<{
      id: string;
      service?: { id: string; name: string };
      profession?: { name: string };
    }>;
  };
  onClose: () => void;
}

export default function ConnectionRequestModal({ targetUser, onClose }: Props) {
  const queryClient = useQueryClient();

  // Build unique services list from target user's services
  const services = (() => {
    const seen = new Set<string>();
    const result: { id: string; name: string; profName: string }[] = [];
    for (const us of targetUser.userServices ?? []) {
      if (us.service && !seen.has(us.service.id)) {
        seen.add(us.service.id);
        result.push({ id: us.service.id, name: us.service.name, profName: us.profession?.name ?? '' });
      }
    }
    return result;
  })();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sendMutation = useMutation({
    mutationFn: () => connectionAPI.send(targetUser.id, [...selected]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-with', targetUser.id] });
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      onClose();
    },
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-xl">
              <Link2 size={16} className="text-primary-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Запрос связи</h3>
              <p className="text-xs text-slate-500">{targetUser.firstName} {targetUser.lastName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Target user */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <AvatarComponent src={targetUser.avatar} name={`${targetUser.firstName} ${targetUser.lastName}`} size={40} />
            <div>
              <p className="text-sm font-medium text-white">{targetUser.firstName} {targetUser.lastName}</p>
              <p className="text-xs text-slate-500">Выберите услуги для профессионального сотрудничества</p>
            </div>
          </div>

          {/* Services list */}
          {services.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              У пользователя нет доступных услуг
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {services.map(s => {
                const isOn = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      isOn
                        ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isOn ? 'bg-primary-500 border-primary-500' : 'border-slate-600'
                    }`}>
                      {isOn && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {s.profName && <p className="text-[11px] text-slate-500 truncate">{s.profName}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={selected.size === 0 || sendMutation.isPending}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:shadow-none"
          >
            {sendMutation.isPending && <Loader2 size={15} className="animate-spin" />}
            Отправить запрос
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
