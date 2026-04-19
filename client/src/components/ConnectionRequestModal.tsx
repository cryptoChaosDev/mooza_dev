import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Check, Loader2, ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionAPI, userAPI } from '../lib/api';
import AvatarComponent from './Avatar';

interface Props {
  targetUser: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  onClose: () => void;
}

interface UserService {
  id: string;
  professionId: string;
  serviceId: string;
  profession: { id: string; name: string };
  service: { id: string; name: string };
}

export default function ConnectionRequestModal({ targetUser, onClose }: Props) {
  const queryClient = useQueryClient();

  const [existingConnId, setExistingConnId] = useState<string | null>(null);
  const [existingServices, setExistingServices] = useState<Set<string>>(new Set());

  useEffect(() => {
    connectionAPI.getWith(targetUser.id).then(({ data }: any) => {
      if (data?.id) {
        setExistingConnId(data.id);
        setExistingServices(new Set((data.services ?? []).map((s: any) => s.id)));
      }
    }).catch(() => {});
  }, [targetUser.id]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: userServices = [], isLoading } = useQuery<UserService[]>({
    queryKey: ['user-services', targetUser.id],
    queryFn: async () => { const { data } = await userAPI.getUserServices(targetUser.id); return data; },
  });

  // Group services by profession
  const grouped = useMemo(() => {
    const map = new Map<string, { profession: { id: string; name: string }; services: UserService[] }>();
    for (const us of userServices) {
      if (!map.has(us.professionId)) {
        map.set(us.professionId, { profession: us.profession, services: [] });
      }
      map.get(us.professionId)!.services.push(us);
    }
    return [...map.values()];
  }, [userServices]);

  const toggle = (serviceId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(serviceId) ? next.delete(serviceId) : next.add(serviceId);
      return next;
    });
  };

  const isEditMode = !!existingConnId;

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (isEditMode) {
        await connectionAPI.addServices(existingConnId!, [...selected]);
      } else {
        await connectionAPI.send(targetUser.id, [...selected]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-with', targetUser.id] });
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      onClose();
    },
  });

  const fullName = `${targetUser.firstName} ${targetUser.lastName}`.trim();

  const getServiceName = (serviceId: string) => {
    const us = userServices.find(s => s.serviceId === serviceId);
    return us?.service.name ?? serviceId;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-white flex-1">
          {isEditMode ? 'Добавить услуги к связи' : 'Установить связь'}
        </h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Profile block */}
      <div className="px-5 py-4 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-4 mb-3">
          <AvatarComponent src={targetUser.avatar} name={fullName} size={48} className="rounded-2xl ring-2 ring-slate-700/50 flex-shrink-0" />
          <div>
            <p className="text-base font-bold text-white leading-tight">{fullName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Link2 size={12} className="text-primary-400" />
              <p className="text-xs text-primary-400">{isEditMode ? 'Добавление услуги к связи' : 'Новая профессиональная связь'}</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          Выберите услуги из профиля пользователя, в рамках которых хотите сотрудничать.
        </p>
        {isEditMode && existingServices.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <p className="w-full text-[11px] text-slate-500 mb-0.5">Уже в связи:</p>
            {[...existingServices].map(id => (
              <span key={id} className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs">
                {getServiceName(id)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Services list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-500" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-6 text-center">
            <div className="p-4 bg-slate-800/50 rounded-2xl mb-3">
              <Link2 size={28} className="text-slate-600" />
            </div>
            <p className="text-white font-semibold mb-1">Нет услуг в профиле</p>
            <p className="text-slate-500 text-sm">Пользователь не добавил ни одной услуги</p>
          </div>
        ) : (
          <div className="pb-4">
            {grouped.map(({ profession, services }) => (
              <div key={profession.id}>
                <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/40 sticky top-0">
                  <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wide">{profession.name}</span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {services.map(us => {
                    const isOn = selected.has(us.serviceId);
                    const alreadyLinked = existingServices.has(us.serviceId);
                    return (
                      <button
                        key={us.serviceId}
                        type="button"
                        disabled={alreadyLinked}
                        onClick={() => toggle(us.serviceId)}
                        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                          alreadyLinked ? 'opacity-40 cursor-not-allowed' :
                          isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isOn ? 'bg-primary-500 border-primary-500' :
                          alreadyLinked ? 'border-slate-600 bg-slate-700' : 'border-slate-600'
                        }`}>
                          {(isOn || alreadyLinked) && <Check size={12} className="text-white" />}
                        </div>
                        <span className={`flex-1 text-sm font-medium truncate ${isOn ? 'text-primary-300' : 'text-slate-200'}`}>
                          {us.service.name}
                        </span>
                        {alreadyLinked && <span className="text-[10px] text-slate-500 flex-shrink-0">уже в связи</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {selected.size > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/80 flex-shrink-0">
          <p className="text-[11px] text-slate-500 mb-1.5">Выбрано ({selected.size}):</p>
          <div className="flex flex-wrap gap-1.5">
            {[...selected].map(id => (
              <span key={id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                {getServiceName(id)}
                <button onClick={() => toggle(id)} className="text-primary-400/70 hover:text-primary-300 ml-0.5"><X size={11} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800 flex gap-3 flex-shrink-0 bg-slate-900/80"
           style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <button onClick={onClose}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
          Отмена
        </button>
        <button
          onClick={() => sendMutation.mutate()}
          disabled={selected.size === 0 || sendMutation.isPending}
          className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 disabled:shadow-none"
        >
          {sendMutation.isPending && <Loader2 size={15} className="animate-spin" />}
          {selected.size > 0
            ? (isEditMode ? `Добавить (${selected.size})` : `Отправить запрос (${selected.size})`)
            : 'Выберите услуги'}
        </button>
      </div>
    </div>,
    document.body
  );
}
