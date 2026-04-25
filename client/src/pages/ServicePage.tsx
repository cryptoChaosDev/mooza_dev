import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, Music, DollarSign, MapPin, Send, Edit3, Save, X, Trash2, Loader2 } from 'lucide-react';
import { userAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useAuthStore } from '../stores/authStore';

export default function ServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: us, isLoading } = useQuery({
    queryKey: ['user-service', serviceId],
    queryFn: async () => {
      const { data } = await userAPI.getUserService(serviceId!);
      return data as any;
    },
    enabled: !!serviceId,
  });

  const patchMut = useMutation({
    mutationFn: () => userAPI.patchUserService(serviceId!, {
      priceFrom: priceFrom !== '' ? Number(priceFrom) : null,
      priceTo: priceTo !== '' ? Number(priceTo) : null,
      description,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-service', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      // Remove by saving all services minus this one
      const { data: allServices } = await userAPI.getUserServices(me!.id);
      const remaining = (allServices as any[]).filter((s: any) => s.id !== serviceId);
      await userAPI.updateServices(remaining.map((s: any) => ({
        professionId: s.professionId,
        serviceId: s.serviceId,
        genreIds: s.genres?.map((g: any) => g.id) ?? [],
        workFormatIds: s.workFormats?.map((w: any) => w.id) ?? [],
        employmentTypeIds: s.employmentTypes?.map((e: any) => e.id) ?? [],
        skillLevelIds: s.skillLevels?.map((sl: any) => sl.id) ?? [],
        availabilityIds: s.availabilities?.map((a: any) => a.id) ?? [],
        geographyIds: s.geographies?.map((g: any) => g.id) ?? [],
        priceFrom: s.priceFrom ?? undefined,
        priceTo: s.priceTo ?? undefined,
        description: s.description ?? undefined,
        customFilterValueIds: s.selectedCustomFilterValues?.map((v: any) => v.id) ?? [],
      })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-services', me?.id] });
      navigate(-1);
    },
  });

  const startEdit = () => {
    setPriceFrom(us.priceFrom != null ? String(us.priceFrom) : '');
    setPriceTo(us.priceTo != null ? String(us.priceTo) : '');
    setDescription(us.description ?? '');
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!us) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Услуга не найдена</p>
      </div>
    );
  }

  const isOwner = me?.id === us.user?.id;
  const genres = us.genres?.map((g: any) => g.name) ?? [];
  const price = us.priceFrom != null || us.priceTo != null
    ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
    : null;
  const authorName = us.user ? `${us.user.firstName ?? ''} ${us.user.lastName ?? ''}`.trim() : null;
  const authorAvatar = us.user?.avatar ? getAvatarUrl(us.user.avatar) : null;

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm font-semibold text-white flex-1">Услуга</span>
        {isOwner && !editing && (
          <button onClick={startEdit} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <Edit3 size={18} />
          </button>
        )}
        {isOwner && !editing && (
          <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-xl hover:bg-red-500/15 text-slate-400 hover:text-red-400 transition-all">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {/* Author */}
        {us.user && (
          <button onClick={() => navigate(`/profile/${us.user.id}`)} className="flex items-center gap-3 w-full text-left">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
              {authorAvatar
                ? <img src={authorAvatar} alt={authorName ?? ''} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-bold">{(authorName?.[0] ?? '?').toUpperCase()}</div>
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{authorName}</p>
              {us.user.nickname && <p className="text-xs text-slate-500">@{us.user.nickname}</p>}
            </div>
          </button>
        )}

        {/* Main card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {us.profession?.name && (
            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">{us.profession.name}</p>
          )}

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-900/60 border border-primary-700/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Briefcase size={18} className="text-primary-400" />
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">{us.service?.name}</h1>
          </div>

          {genres.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Music size={13} className="text-slate-500 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g: string) => (
                  <span key={g} className="px-2.5 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full text-xs text-slate-300">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Price — editable for owner */}
          {editing ? (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1"><DollarSign size={12} />Стоимость (₽)</p>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="От" value={priceFrom}
                  onChange={e => setPriceFrom(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="До" value={priceTo}
                  onChange={e => setPriceTo(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>
            </div>
          ) : price ? (
            <div className="flex items-center gap-2">
              <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
              <span className="text-base font-bold text-primary-400">{price}</span>
            </div>
          ) : null}

          {(us.geographies?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin size={13} className="text-slate-500 flex-shrink-0" />
              <span className="text-sm text-slate-300">{us.geographies.map((g: any) => g.name).join(', ')}</span>
            </div>
          )}

          {/* Description — editable for owner */}
          {editing ? (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">Описание услуги</p>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Расскажите подробнее об услуге..."
                rows={4}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none" />
            </div>
          ) : us.description ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{us.description}</p>
            </div>
          ) : null}
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-2xl transition-colors flex items-center justify-center gap-1.5">
              <X size={14} />Отмена
            </button>
            <button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}
              className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5">
              {patchMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Сохранить
            </button>
          </div>
        )}

        {/* Order button */}
        {!isOwner && us.user && (
          <button onClick={() => navigate(`/messages`)}
            className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm">
            <Send size={16} />Заказать
          </button>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
          <div className="bg-red-950/60 border border-red-800/60 rounded-2xl p-4 space-y-3">
            <p className="text-sm text-red-300 font-medium">Удалить услугу «{us.service?.name}»?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                className="flex-1 py-2.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                {deleteMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}Удалить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
