import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Plus } from 'lucide-react';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

/**
 * Все профессии пользователя — /profile/:userId/professions.
 * Зеркало страницы «все услуги»: строки как в блоке профиля, тап открывает
 * страницу профессии. Владельцу — строка «Добавить профессию» (редактор профиля).
 */
export default function UserProfessionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const isOwner = !!me?.id && me.id === userId;

  const { data: user, isLoading } = useQuery({
    queryKey: ['professions-list-user', userId],
    queryFn: async () => { const { data } = await userAPI.getUser(userId!); return data as any; },
    enabled: !!userId,
  });

  const professions: any[] = user?.userProfessions ?? [];

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GraduationCap size={16} className="text-fuchsia-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">
              Профессии{user ? ` · ${`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()}` : ''}
            </h1>
            {professions.length > 0 && <span className="text-xs text-slate-500 flex-shrink-0">{professions.length}</span>}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-fuchsia-500 border-t-transparent" />
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
            <div className="divide-y divide-slate-800/60">
              {professions.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">Профессии не добавлены</p>
              )}
              {professions.map((up: any, i: number) => {
                const cfvs: any[] = up.selectedCustomFilterValues || [];
                const dirName = up.profession?.direction?.name || '';
                return (
                  <button
                    key={up.professionId ?? i}
                    onClick={() => navigate(`/professions/${userId}/${up.professionId}`)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/20 -mx-1 px-1 rounded-lg transition-colors"
                  >
                    <div className="w-1 self-stretch rounded-full bg-fuchsia-500/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{up.profession?.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[dirName, cfvs.length > 0 ? `характеристик: ${cfvs.length}` : null].filter(Boolean).join(' · ') || 'Без характеристик'}
                      </p>
                    </div>
                    <span className="text-slate-600 flex-shrink-0">›</span>
                  </button>
                );
              })}
              {isOwner && (
                <button
                  onClick={() => navigate('/profile?editProfessions=1')}
                  className="w-full flex items-center gap-3 py-2.5 text-left group"
                >
                  <div className="w-1 self-stretch rounded-full bg-slate-700/60 flex-shrink-0" />
                  <Plus size={14} className="text-slate-500 group-hover:text-fuchsia-400 transition-colors flex-shrink-0" />
                  <span className="text-sm text-slate-500 group-hover:text-slate-300 transition-colors">Добавить профессию</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
