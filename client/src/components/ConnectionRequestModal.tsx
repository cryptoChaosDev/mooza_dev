import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, ArrowLeft, Check, Loader2, ChevronRight, Clock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionAPI, referenceAPI } from '../lib/api';
import AvatarComponent from './Avatar';

interface Props {
  targetUser: { id: string; firstName: string; lastName: string; avatar?: string };
  onClose: () => void;
}

type RelType = 'customer_executor' | 'executor_customer' | 'colleague';
type CatalogLevel = 'sections' | 'services';

interface Section {
  id: string;
  name: string;
  sortOrder?: number;
  services: { id: string; name: string; sortOrder?: number }[];
}

const REL_OPTIONS: { type: RelType; myRole: string; partnerRole: string; needsDeal: boolean }[] = [
  { type: 'customer_executor', myRole: 'CUSTOMER', partnerRole: 'EXECUTOR', needsDeal: true },
  { type: 'executor_customer', myRole: 'EXECUTOR', partnerRole: 'CUSTOMER', needsDeal: true },
  { type: 'colleague',         myRole: 'COLLEAGUE', partnerRole: 'COLLEAGUE', needsDeal: false },
];


export default function ConnectionRequestModal({ targetUser, onClose }: Props) {
  const queryClient = useQueryClient();
  const fullName = `${targetUser.firstName} ${targetUser.lastName}`.trim();

  // Check for existing connection
  const [existingConn, setExistingConn] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  useEffect(() => {
    connectionAPI.getWith(targetUser.id)
      .then(({ data }: any) => { if (data?.id) setExistingConn(data); })
      .catch(() => {})
      .finally(() => setCheckingExisting(false));
  }, [targetUser.id]);

  const acceptMut = useMutation({
    mutationFn: () => connectionAPI.accept(existingConn.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['connections-accepted'] }); onClose(); },
  });
  const rejectMut = useMutation({
    mutationFn: () => connectionAPI.reject(existingConn.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['connections-requests'] }); onClose(); },
  });

  const [step, setStep] = useState<'relation' | 'catalog'>('relation');
  const [relType, setRelType] = useState<RelType | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Catalog navigation
  const [catalogLevel, setCatalogLevel] = useState<CatalogLevel>('sections');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState('');

  // Catalog queries
  const { data: sections = [] } = useQuery({
    queryKey: ['ref-sections'],
    queryFn: async () => { const { data } = await referenceAPI.getSections(); return data as Section[]; },
    enabled: step === 'catalog',
  });

  const activeSection = sections.find(s => s.id === sectionId) ?? null;
  const services = activeSection?.services ?? [];

  // Names of all services across all sections, for rendering selected chips
  const serviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach(s => (s.services || []).forEach(sv => map.set(sv.id, sv.name)));
    return map;
  }, [sections]);

  const rel = REL_OPTIONS.find(r => r.type === relType);

  const sendMutation = useMutation({
    mutationFn: () => connectionAPI.send(targetUser.id, [...selected], rel?.myRole, rel?.partnerRole, rel?.needsDeal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-with', targetUser.id] });
      queryClient.invalidateQueries({ queryKey: ['connections-accepted'] });
      queryClient.invalidateQueries({ queryKey: ['connections-sent'] });
      onClose();
    },
  });

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const goBack = () => {
    if (step === 'catalog') {
      if (catalogLevel === 'services') { setCatalogLevel('sections'); setSectionId(null); setSectionName(''); }
      else { setStep('relation'); }
    }
  };

  const catalogTitle = catalogLevel === 'sections' ? 'Выберите раздел' : sectionName;

  // Loading state
  if (checkingExisting) return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-primary-400" />
    </div>, document.body
  );

  // Rejected connection — show info + allow sending a new request (just open the flow below)
  // REJECTED is intentionally not blocked here so the form renders normally

  // Existing pending connection — show status screen
  if (existingConn && existingConn.status === 'PENDING') {
    const { iAmRequester } = existingConn;
    return createPortal(
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><ArrowLeft size={20} /></button>
          <h2 className="text-base font-semibold text-white flex-1">Связь</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 text-center">
          <AvatarComponent src={targetUser.avatar} name={fullName} size={56} />
          <p className="text-base font-bold text-white">{fullName}</p>
          {iAmRequester ? (
            <>
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Clock size={16} />Запрос на связь уже отправлен</div>
              <p className="text-xs text-slate-600">Ожидайте ответа пользователя</p>
              <button onClick={onClose} className="w-full py-3 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium">Закрыть</button>
            </>
          ) : (
            <>
              <p className="text-sm text-primary-400">Этот пользователь уже отправил вам запрос на связь</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}
                  className="flex-1 py-3 bg-slate-800 hover:bg-red-500/15 border border-slate-700 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl text-sm font-medium transition-all">
                  Отклонить
                </button>
                <button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}
                  className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {acceptMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Принять
                </button>
              </div>
            </>
          )}
        </div>
      </div>, document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
        {step === 'catalog'
          ? <button onClick={goBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><ArrowLeft size={20} /></button>
          : <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><ArrowLeft size={20} /></button>
        }
        <h2 className="text-base font-semibold text-white flex-1">Установить связь</h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={18} /></button>
      </div>

      {/* Partner block */}
      <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-3 flex-shrink-0">
        <AvatarComponent src={targetUser.avatar} name={fullName} size={40} className="rounded-xl ring-2 ring-slate-700/50 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-white">{fullName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Link2 size={11} className="text-primary-400" />
            <p className="text-xs text-primary-400">Новая профессиональная связь</p>
          </div>
        </div>
      </div>

      {/* ── Step 1: Relation type ── */}
      {step === 'relation' && (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-4">Тип связи</p>

          <button onClick={() => { setRelType('customer_executor'); setStep('catalog'); }}
            className="w-full flex items-center gap-4 p-4 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-sky-500/30 rounded-2xl text-left transition-all group">
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-sky-500/15 text-sky-400 rounded-full border border-sky-500/20">Заказчик</span>
              <span className="text-[10px] text-slate-600">я</span>
            </div>
            <div className="text-slate-600 text-lg">↔</div>
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full border border-emerald-500/20">Исполнитель</span>
              <span className="text-[10px] text-slate-600">{targetUser.firstName}</span>
            </div>
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-xs text-slate-500 leading-relaxed">Платное сотрудничество — нужна сделка</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
          </button>

          <button onClick={() => { setRelType('executor_customer'); setStep('catalog'); }}
            className="w-full flex items-center gap-4 p-4 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-emerald-500/30 rounded-2xl text-left transition-all group">
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full border border-emerald-500/20">Исполнитель</span>
              <span className="text-[10px] text-slate-600">я</span>
            </div>
            <div className="text-slate-600 text-lg">↔</div>
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-sky-500/15 text-sky-400 rounded-full border border-sky-500/20">Заказчик</span>
              <span className="text-[10px] text-slate-600">{targetUser.firstName}</span>
            </div>
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-xs text-slate-500 leading-relaxed">Платное сотрудничество — нужна сделка</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
          </button>

          <button onClick={() => { setRelType('colleague'); setStep('catalog'); }}
            className="w-full flex items-center gap-4 p-4 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-violet-500/30 rounded-2xl text-left transition-all group">
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-violet-500/15 text-violet-400 rounded-full border border-violet-500/20">Коллега</span>
              <span className="text-[10px] text-slate-600">я</span>
            </div>
            <div className="text-slate-600 text-lg">↔</div>
            <div className="flex flex-col items-center gap-1 w-20 flex-shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 bg-violet-500/15 text-violet-400 rounded-full border border-violet-500/20">Коллега</span>
              <span className="text-[10px] text-slate-600">{targetUser.firstName}</span>
            </div>
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-xs text-slate-500 leading-relaxed">Совместная работа без сделки</p>
            </div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
          </button>
        </div>
      )}

      {/* ── Step 2: Service catalog ── */}
      {step === 'catalog' && (
        <>
          {/* Catalog header + deal badge */}
          <div className="px-5 py-2.5 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
            <p className="text-xs font-semibold text-white flex-1">{catalogTitle}</p>
            {rel && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                rel.needsDeal
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                  : 'bg-slate-700/40 text-slate-500 border-slate-700'
              }`}>
                {rel.needsDeal ? '💰 Сделка' : 'Без сделки'}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Sections level */}
            {catalogLevel === 'sections' && (
              <div className="divide-y divide-slate-800/40">
                {sections.map((s) => (
                  <button key={s.id} onClick={() => { setSectionId(s.id); setSectionName(s.name); setCatalogLevel('services'); }}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/40 transition-colors text-left">
                    <span className="text-sm text-white">{s.name}</span>
                    <ChevronRight size={15} className="text-slate-600" />
                  </button>
                ))}
              </div>
            )}

            {/* Services level */}
            {catalogLevel === 'services' && (
              <div className="divide-y divide-slate-800/40">
                {services.map((s: any) => {
                  const isOn = selected.has(s.id);
                  return (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${isOn ? 'bg-primary-500/10' : 'hover:bg-slate-800/50'}`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isOn ? 'bg-primary-500 border-primary-500' : 'border-slate-600'}`}>
                        {isOn && <Check size={12} className="text-white" />}
                      </div>
                      <span className={`text-sm font-medium ${isOn ? 'text-primary-300' : 'text-slate-200'}`}>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected chips */}
          {selected.size > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/80 flex-shrink-0">
              <p className="text-[11px] text-slate-500 mb-1.5">Выбрано ({selected.size}):</p>
              <div className="flex flex-wrap gap-1.5">
                {[...selected].map(id => {
                  const name = serviceNameById.get(id) ?? id;
                  return (
                    <span key={id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-primary-500/15 border border-primary-500/30 text-primary-300 rounded-lg text-xs">
                      {name}
                      <button onClick={() => toggle(id)} className="text-primary-400/70 hover:text-primary-300 ml-0.5"><X size={11} /></button>
                    </span>
                  );
                })}
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
              disabled={sendMutation.isPending}
              className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
              {sendMutation.isPending && <Loader2 size={15} className="animate-spin" />}
              Отправить запрос{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
