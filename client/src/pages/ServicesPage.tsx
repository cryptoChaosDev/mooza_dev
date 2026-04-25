import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, DollarSign } from 'lucide-react';
import { userAPI } from '../lib/api';

export default function ServicesPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => { const { data } = await userAPI.getUser(userId!); return data as any; },
    enabled: !!userId,
  });

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['user-services', userId],
    queryFn: async () => { const { data } = await userAPI.getUserServices(userId!); return data as any[]; },
    enabled: !!userId,
  });

  const authorName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-white">Услуги</span>
            {authorName && <span className="text-xs text-slate-500 ml-2">{authorName}</span>}
          </div>
          {services.length > 0 && <span className="text-xs text-slate-500">{services.length}</span>}
        </div>

        <div className="max-w-lg mx-auto px-4 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Briefcase size={40} className="text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">Нет добавленных услуг</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {services.map((us: any) => {
                const genres = us.genres?.map((g: any) => g.name) ?? [];
                const price = us.priceFrom != null || us.priceTo != null
                  ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                  : null;
                return (
                  <button
                    key={us.id}
                    onClick={() => navigate(`/services/${us.id}`)}
                    className="flex flex-col text-left bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 hover:border-primary-700/50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary-900/60 border border-primary-700/30 flex items-center justify-center mb-3 group-hover:border-primary-500/50 transition-colors">
                      <Briefcase size={16} className="text-primary-400" />
                    </div>
                    {us.profession?.name && (
                      <p className="text-[10px] text-slate-500 mb-0.5 truncate">{us.profession.name}</p>
                    )}
                    <p className="text-sm font-bold text-white leading-snug line-clamp-2 flex-1">{us.service?.name}</p>
                    {genres.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-1.5 line-clamp-1">{genres.slice(0, 2).join(' · ')}</p>
                    )}
                    {price && (
                      <div className="flex items-center gap-1 mt-2">
                        <DollarSign size={10} className="text-primary-400 flex-shrink-0" />
                        <span className="text-xs font-semibold text-primary-400">{price}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
    </div>
  );
}
