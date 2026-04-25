import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, Music, DollarSign, MapPin, Send } from 'lucide-react';
import { userAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';

export default function ServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();

  const { data: us, isLoading } = useQuery({
    queryKey: ['user-service', serviceId],
    queryFn: async () => {
      const { data } = await userAPI.getUserService(serviceId!);
      return data as any;
    },
    enabled: !!serviceId,
  });

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
          <span className="text-sm font-semibold text-white">Услуга</span>
        </div>

        <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
          {/* Author */}
          {us.user && (
            <button
              onClick={() => navigate(`/profile/${us.user.id}`)}
              className="flex items-center gap-3 w-full text-left"
            >
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
            {/* Profession */}
            {us.profession?.name && (
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">{us.profession.name}</p>
            )}

            {/* Service name */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-900/60 border border-primary-700/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Briefcase size={18} className="text-primary-400" />
              </div>
              <h1 className="text-xl font-bold text-white leading-tight">{us.service?.name}</h1>
            </div>

            {/* Genres */}
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

            {/* Price */}
            {price && (
              <div className="flex items-center gap-2">
                <DollarSign size={13} className="text-slate-500 flex-shrink-0" />
                <span className="text-base font-bold text-primary-400">{price}</span>
              </div>
            )}

            {/* Geography */}
            {(us.geographies?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <MapPin size={13} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-300">{us.geographies.map((g: any) => g.name).join(', ')}</span>
              </div>
            )}

            {/* Description */}
            {us.description && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Описание</p>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{us.description}</p>
              </div>
            )}
          </div>

          {/* Order button */}
          {us.user && (
            <button
              onClick={() => navigate(`/messages`)}
              className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Send size={16} />
              Заказать
            </button>
          )}
        </div>
    </div>
  );
}
