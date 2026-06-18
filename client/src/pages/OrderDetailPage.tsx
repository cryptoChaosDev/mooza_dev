import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Briefcase, DollarSign, Calendar, MessageCircle,
  Archive, Loader2, Send, Link2, Users, Sparkles, HandshakeIcon, Share2,
} from 'lucide-react';
import { orderAPI } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import { DEALS_ENABLED } from '../lib/features';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import AvatarComponent from '../components/Avatar';

// Budget «от X ₽ до Y ₽» / «По договорённости»
function formatBudget(from?: number | null, to?: number | null): string {
  if (from == null && to == null) return 'По договорённости';
  return [
    from != null ? `от ${from.toLocaleString('ru')} ₽` : null,
    to != null ? `до ${to.toLocaleString('ru')} ₽` : null,
  ].filter(Boolean).join(' ');
}

function formatDeadline(deadline?: string | null): string {
  return deadline ? new Date(deadline).toLocaleDateString('ru-RU') : 'Срок не ограничен';
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showRespond, setShowRespond] = useState(false);
  const [respondPrice, setRespondPrice] = useState('');
  const [respondComment, setRespondComment] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => { const { data } = await orderAPI.getOne(orderId!); return data as any; },
    enabled: !!orderId,
  });

  const isOwner = !!order?.isOwner;

  // «Подходящие исполнители» (author only)
  const { data: matches } = useQuery({
    queryKey: ['order-matches', orderId],
    queryFn: async () => { const { data } = await orderAPI.getMatches(orderId!); return data as any; },
    enabled: !!orderId && isOwner,
  });

  // «Отклики» (author only)
  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ['order-responses', orderId],
    queryFn: async () => { const { data } = await orderAPI.getResponses(orderId!); return data as any[]; },
    enabled: !!orderId && isOwner,
  });

  const archiveMut = useMutation({
    mutationFn: () => orderAPI.setStatus(orderId!, 'archived'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders', 'mine'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось убрать заказ в архив')),
  });

  const offerMut = useMutation({
    mutationFn: (executorId: string) => orderAPI.offer(orderId!, executorId),
    onSuccess: () => toast.success('Заказ предложен исполнителю'),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось предложить заказ')),
  });

  const respondMut = useMutation({
    mutationFn: () => orderAPI.respond(orderId!, {
      price: Number(respondPrice),
      comment: respondComment.trim() || undefined,
    }),
    onSuccess: () => {
      setShowRespond(false);
      setRespondPrice('');
      setRespondComment('');
      toast.success('Отклик отправлен');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить отклик')),
  });

  const dealMut = useMutation({
    mutationFn: (responseId: string) => orderAPI.createDeal(orderId!, responseId),
    onSuccess: (res: any) => {
      const dealId = res?.data?.deal?.id;
      if (dealId) navigate(`/deals/${dealId}`);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось оформить сделку')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Заказ не найден</p>
      </div>
    );
  }

  const budget = formatBudget(order.budgetFrom, order.budgetTo);
  const sectionName = order.service?.section?.name ?? null;
  const matchResults: any[] = matches?.results ?? [];
  const matchesEmpty = matches?.fallbackLevel === 'empty';

  // Grouped custom filters (mirror ServicePage)
  const customFilterValues: { filterName: string; values: string[] }[] = [];
  if (order.selectedCustomFilterValues?.length) {
    const grouped: Record<string, { filterName: string; values: string[] }> = {};
    for (const v of order.selectedCustomFilterValues) {
      const fId = v.filter?.id ?? v.filterId ?? 'unknown';
      if (!grouped[fId]) grouped[fId] = { filterName: v.filter?.name ?? '', values: [] };
      grouped[fId].values.push(v.value ?? v.name ?? '');
    }
    customFilterValues.push(...Object.values(grouped));
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Briefcase size={16} className="text-rose-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">{order.title}</h1>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {sectionName && (
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">{sectionName}</p>
          )}

          <h2 className="text-xl font-bold text-white leading-tight">{order.title}</h2>

          {/* Filters */}
          {customFilterValues.length > 0 && (
            <div className="space-y-2">
              {customFilterValues.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 flex-shrink-0 pt-0.5 min-w-[80px]">{f.filterName}</span>
                  <div className="flex flex-wrap gap-1">
                    {f.values.map((v, j) => (
                      <span key={j} className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">{v}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Budget */}
          <div className="flex items-center gap-2">
            <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-base font-bold text-rose-400">{budget}</span>
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-300">{formatDeadline(order.deadline)}</span>
          </div>

          {/* Description */}
          {order.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{order.description}</p>
            </div>
          )}

          {/* References — files */}
          {order.referenceFiles?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Референсы</p>
              <div className="space-y-2">
                {order.referenceFiles.map((file: any) => {
                  const url = avatarUrl(file.url) || undefined;
                  const isImage = IMAGE_EXT.test(file.originalName || file.url || '');
                  const isAudio = (file.mimeType || '').startsWith('audio') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.originalName || file.url || '');
                  return (
                    <div key={file.id}>
                      {isImage ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={file.originalName} className="max-h-48 rounded-xl border border-slate-800 object-cover" />
                        </a>
                      ) : isAudio ? (
                        <audio controls src={url} className="w-full" />
                      ) : (
                        <a href={url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors">
                          <Link2 size={14} />{file.originalName}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* References — links */}
          {order.referenceLinks?.length > 0 && (
            <div>
              {!order.referenceFiles?.length && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Референсы</p>
              )}
              <div className="space-y-1.5">
                {order.referenceLinks.map((link: any) => (
                  <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors break-all">
                    <Link2 size={14} className="flex-shrink-0" />{link.title || link.url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── OWNER ── */}
        {isOwner ? (
          <>
            {/* Archive */}
            {order.status === 'active' && (
              <button
                onClick={() => archiveMut.mutate()}
                disabled={archiveMut.isPending}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-2xl transition-colors disabled:opacity-50"
              >
                {archiveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
                В архив
              </button>
            )}

            {/* Matches */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-primary-400" />
                <h3 className="text-sm font-bold text-white">Подходящие исполнители</h3>
              </div>

              {matchesEmpty ? (
                <div className="text-center py-4 space-y-3">
                  <Sparkles size={28} className="text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Заказ уже виден всей платформе</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Пока нет точных совпадений по фильтрам, но ваш заказ опубликован в Потоке — его увидят подходящие специалисты и смогут откликнуться.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => navigate('/')}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      Посмотреть заказ в Потоке
                    </button>
                    <button onClick={() => navigate('/invite')}
                      className="inline-flex items-center justify-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                      <Share2 size={12} />Пригласить специалиста по ссылке
                    </button>
                  </div>
                </div>
              ) : matchResults.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Загрузка подходящих исполнителей...</p>
              ) : (
                <div className="space-y-2">
                  {matchResults.map((m: any) => {
                    const u = m.user ?? m;
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    const professions: string[] = (m.professions?.map((p: any) => p?.name).filter(Boolean))
                      ?? (m.searchProfile?.professions?.map((p: any) => p?.name).filter(Boolean))
                      ?? [];
                    const city = u.city || u.country || '';
                    return (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-800/60">
                        <button onClick={() => navigate(`/profile/${u.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <AvatarComponent src={u.avatar} name={name} size={40} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {[professions.join(', '), city].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => offerMut.mutate(u.id)}
                          disabled={offerMut.isPending}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          Предложить заказ
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Responses */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={15} className="text-primary-400" />
                <h3 className="text-sm font-bold text-white">Отклики</h3>
                {responses.length > 0 && (
                  <span className="text-xs text-slate-500">{responses.length}</span>
                )}
              </div>

              {responses.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Пока никто не откликнулся.</p>
              ) : (
                <div className="space-y-3">
                  {responses.map((r: any) => {
                    const u = r.executor ?? {};
                    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
                    return (
                      <div key={r.id} className="p-3 rounded-xl bg-slate-800/40 border border-slate-800/60 space-y-2">
                        <div className="flex items-center gap-3">
                          <button onClick={() => navigate(`/profile/${u.id}`)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                            <AvatarComponent src={u.avatar} name={name} size={36} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{name}</p>
                              <p className="text-xs text-rose-400 font-semibold">{Number(r.price).toLocaleString('ru')} ₽</p>
                            </div>
                          </button>
                        </div>
                        {r.comment && (
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{r.comment}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/messages/${u.id}`)}
                            className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                          >
                            <MessageCircle size={13} />Написать
                          </button>
                          {DEALS_ENABLED && (
                            <button
                              onClick={() => dealMut.mutate(r.id)}
                              disabled={dealMut.isPending}
                              className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {dealMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <HandshakeIcon size={13} />}
                              Оформить сделку
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── NON-OWNER ── */
          <div className="space-y-2">
            {showRespond ? (
              <div className="space-y-3 border border-primary-500/20 bg-primary-500/5 rounded-2xl p-4">
                <p className="text-sm font-semibold text-white">Откликнуться на заказ</p>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Цена (₽)</label>
                  <input
                    type="number"
                    value={respondPrice}
                    onChange={e => setRespondPrice(e.target.value)}
                    placeholder="Ваша цена ₽"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">Комментарий (необязательно)</label>
                  <textarea
                    value={respondComment}
                    onChange={e => setRespondComment(e.target.value)}
                    placeholder="Расскажите, как вы можете помочь..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRespond(false)} className="flex-1 py-2 text-sm text-slate-400 border border-slate-700 rounded-xl hover:text-white transition-colors">Отмена</button>
                  <button
                    onClick={() => respondMut.mutate()}
                    disabled={respondMut.isPending || !respondPrice || Number.isNaN(Number(respondPrice))}
                    className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {respondMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Отправить отклик
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRespond(true)}
                className="w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-2xl transition-colors"
              >
                <Send size={16} />Откликнуться
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
