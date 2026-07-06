import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Disc3, Users, Briefcase, ClipboardList, Check, X, Loader2, ChevronRight, HandshakeIcon,
} from 'lucide-react';
import { releaseAPI, clipAPI, artistAPI, vacancyAPI, orderAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import AvatarComponent from './Avatar';

type Sub = 'media' | 'artists' | 'vacancies' | 'orders';

const fullName = (u: any) => `${u?.lastName ?? ''} ${u?.firstName ?? ''}`.trim() || 'Пользователь';

export default function RequestsSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Под-вкладку держим в URL (?req=), чтобы возврат назад со страницы заказа/вакансии
  // (navigate(-1)) вернул на «Запросы» → нужную под-вкладку, а не сбросил.
  const [searchParams, setSearchParams] = useSearchParams();
  const [sub, setSubState] = useState<Sub>((searchParams.get('req') as Sub) || 'media');
  const setSub = (s: Sub) => {
    setSubState(s);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'requests');
    next.set('req', s);
    setSearchParams(next, { replace: true });
  };
  const [busyId, setBusyId] = useState<string | null>(null);

  const media = useQuery({
    queryKey: ['req-media'],
    queryFn: async () => {
      const [r, c] = await Promise.all([releaseAPI.getPendingParticipations(), clipAPI.getPendingParticipations()]);
      return [...(r.data ?? []), ...(c.data ?? [])] as any[];
    },
  });
  const artists = useQuery({
    queryKey: ['req-artists'],
    queryFn: async () => {
      const [inv, jr] = await Promise.all([artistAPI.getMyInvites(), artistAPI.getJoinRequests()]);
      return { invites: (inv.data ?? []) as any[], joinRequests: (jr.data ?? []) as any[] };
    },
  });
  const vacancies = useQuery({
    queryKey: ['req-vacancies'],
    queryFn: async () => {
      const [off, resp] = await Promise.all([vacancyAPI.getMyOffers(), vacancyAPI.getIncomingResponses()]);
      return { offers: (off.data ?? []) as any[], responses: (resp.data ?? []) as any[] };
    },
  });
  const orders = useQuery({
    queryKey: ['req-orders'],
    queryFn: async () => ((await orderAPI.getIncomingResponses()).data ?? []) as any[],
  });

  const mediaCount = media.data?.length ?? 0;
  const artistsCount = (artists.data?.invites.length ?? 0) + (artists.data?.joinRequests.length ?? 0);
  const vacCount = (vacancies.data?.offers.length ?? 0) + (vacancies.data?.responses.length ?? 0);
  const ordCount = orders.data?.length ?? 0;

  const act = async (id: string, fn: () => Promise<any>, key: string, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: [key] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(ok);
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось выполнить действие'));
    } finally {
      setBusyId(null);
    }
  };

  const SUBS: { id: Sub; label: string; icon: typeof Disc3; badge: number }[] = [
    { id: 'media', label: 'Медиа', icon: Disc3, badge: mediaCount },
    { id: 'artists', label: 'Артисты', icon: Users, badge: artistsCount },
    { id: 'vacancies', label: 'Вакансии', icon: Briefcase, badge: vacCount },
    { id: 'orders', label: 'Заказы', icon: ClipboardList, badge: ordCount },
  ];

  const Ok = ({ id, on }: { id: string; on: () => Promise<any> }) => (
    <button onClick={on} disabled={busyId === id}
      className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white transition-colors flex-shrink-0" title="Принять">
      {busyId === id ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
    </button>
  );
  const No = ({ id, on }: { id: string; on: () => Promise<any> }) => (
    <button onClick={on} disabled={busyId === id}
      className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 text-slate-400 transition-colors flex-shrink-0" title="Отклонить">
      <X size={16} />
    </button>
  );

  const Empty = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center py-14 text-center">
      <HandshakeIcon size={34} className="text-slate-700 mb-3" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );

  const anyLoading = media.isLoading || artists.isLoading || vacancies.isLoading || orders.isLoading;

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 mb-3">
        {SUBS.map(s => {
          const Icon = s.icon;
          const active = sub === s.id;
          return (
            <button key={s.id} onClick={() => setSub(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all flex-shrink-0 ${
                active ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}>
              <Icon size={13} />
              {s.label}
              {s.badge > 0 && (
                <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? 'bg-white/20 text-white' : 'bg-primary-600 text-white'}`}>{s.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {anyLoading && sub && (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-slate-600" /></div>
      )}

      {/* ── МЕДИА ── */}
      {sub === 'media' && !media.isLoading && (
        mediaCount === 0 ? <Empty text="Нет запросов на участие в релизах/клипах" /> : (
          <div className="space-y-2">
            {media.data!.map((it: any) => {
              const m = it.kind === 'release' ? it.release : it.clip;
              const api = it.kind === 'release' ? releaseAPI : clipAPI;
              return (
                <div key={`${it.kind}-${it.id}`} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                    {m.coverUrl ? <img src={m.coverUrl} alt="" className="w-full h-full object-cover" /> : <Disc3 size={18} className="text-slate-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{m.title}</p>
                    <p className="text-xs text-slate-500 truncate">{it.kind === 'release' ? 'Релиз' : 'Клип'} · {m.artist?.name}</p>
                    {it.roleNames?.length > 0 && <p className="text-xs text-primary-400 truncate">{it.roleNames.join(', ')}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <Ok id={it.id} on={() => act(it.id, () => api.confirmParticipant(it.id), 'req-media', 'Участие подтверждено')} />
                    <No id={it.id} on={() => act(it.id, () => api.declineParticipant(it.id), 'req-media', 'Отклонено')} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── АРТИСТЫ ── */}
      {sub === 'artists' && !artists.isLoading && (
        artistsCount === 0 ? <Empty text="Нет приглашений и заявок по артистам" /> : (
          <div className="space-y-4">
            {artists.data!.invites.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Приглашения вам</p>
                {artists.data!.invites.map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl">
                    <AvatarComponent src={inv.artist?.avatar} name={inv.artist?.name || 'A'} size={44} className="rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{inv.artist?.name}</p>
                      <p className="text-xs text-slate-500 truncate">Приглашение вступить{inv.professionName ? ` · ${inv.professionName}` : ''}</p>
                      {inv.roleNames?.length > 0 && <p className="text-xs text-primary-400 truncate">{inv.roleNames.join(', ')}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <Ok id={inv.id} on={() => act(inv.id, () => artistAPI.confirmMembership(inv.id), 'req-artists', 'Вы вступили в артиста')} />
                      <No id={inv.id} on={() => act(inv.id, () => artistAPI.declineMembership(inv.id), 'req-artists', 'Приглашение отклонено')} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {artists.data!.joinRequests.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Заявки в ваших артистов</p>
                {artists.data!.joinRequests.map((jr: any) => (
                  <div key={jr.id} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl">
                    <AvatarComponent src={jr.user?.avatar} name={fullName(jr.user)} size={44} className="rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{fullName(jr.user)}</p>
                      <p className="text-xs text-slate-500 truncate">Заявка в «{jr.artist?.name}»{jr.professionName ? ` · ${jr.professionName}` : ''}</p>
                      {jr.roleNames?.length > 0 && <p className="text-xs text-primary-400 truncate">{jr.roleNames.join(', ')}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <Ok id={jr.id} on={() => act(jr.id, () => artistAPI.approveMembership(jr.id), 'req-artists', 'Заявка одобрена')} />
                      <No id={jr.id} on={() => act(jr.id, () => artistAPI.rejectMembership(jr.id), 'req-artists', 'Заявка отклонена')} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* ── ВАКАНСИИ ── */}
      {sub === 'vacancies' && !vacancies.isLoading && (
        vacCount === 0 ? <Empty text="Нет предложений и откликов по вакансиям" /> : (
          <div className="space-y-4">
            {vacancies.data!.offers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Предложения о сотрудничестве</p>
                {vacancies.data!.offers.map((o: any) => (
                  <div key={o.id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex items-start gap-2">
                      <HandshakeIcon size={15} className="text-primary-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white break-words [overflow-wrap:anywhere]">Вакансия «{o.vacancy?.title}»</p>
                        <p className="text-xs text-slate-500 truncate">{o.vacancy?.artist?.name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300">💰 {o.compensation} · с {o.startDate ? new Date(o.startDate).toLocaleDateString('ru-RU') : '—'}</p>
                    {o.conditions && <p className="text-xs text-slate-400 break-words [overflow-wrap:anywhere] line-clamp-3">{o.conditions}</p>}
                    <div className="flex gap-2 pt-0.5">
                      <button onClick={() => act(o.id, () => vacancyAPI.acceptOffer(o.id), 'req-vacancies', 'Предложение принято')} disabled={busyId === o.id}
                        className="flex-1 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors">
                        {busyId === o.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}Принять
                      </button>
                      <button onClick={() => act(o.id, () => vacancyAPI.rejectOffer(o.id), 'req-vacancies', 'Предложение отклонено')} disabled={busyId === o.id}
                        className="flex-1 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:text-red-400 disabled:opacity-50 text-slate-300 text-xs font-medium transition-colors">
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {vacancies.data!.responses.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Отклики на ваши вакансии</p>
                {vacancies.data!.responses.map((r: any) => (
                  <button key={r.id} onClick={() => navigate(`/vacancies/${r.vacancy?.id}`)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl text-left transition-colors">
                    <AvatarComponent src={r.applicant?.avatar} name={fullName(r.applicant)} size={44} className="rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{fullName(r.applicant)}</p>
                      <p className="text-xs text-slate-500 truncate">Отклик на «{r.vacancy?.title}»</p>
                      {r.comment && <p className="text-xs text-slate-400 truncate">{r.comment}</p>}
                    </div>
                    <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* ── ЗАКАЗЫ ── */}
      {sub === 'orders' && !orders.isLoading && (
        ordCount === 0 ? <Empty text="Нет откликов на ваши заказы" /> : (
          <div className="space-y-2">
            {orders.data!.map((r: any) => (
              <button key={r.id} onClick={() => navigate(`/orders/${r.order?.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl text-left transition-colors">
                <AvatarComponent src={r.executor?.avatar} name={fullName(r.executor)} size={44} className="rounded-xl flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{fullName(r.executor)}</p>
                  <p className="text-xs text-slate-500 truncate">Отклик на «{r.order?.title}»{r.price != null ? ` · ${r.price.toLocaleString('ru')} ₽` : ''}</p>
                  {r.comment && <p className="text-xs text-slate-400 truncate">{r.comment}</p>}
                </div>
                <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
