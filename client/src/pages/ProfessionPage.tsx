import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Pencil, Trash2, Loader2, Briefcase } from 'lucide-react';
import { userAPI } from '../lib/api';
import { avatarUrl as getAvatarUrl } from '../lib/avatar';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import ConfirmDialog from '../components/ConfirmDialog';
import GroupedFilterChips from '../components/GroupedFilterChips';

/**
 * Страница профессии пользователя — /professions/:userId/:professionId.
 * Зеркало страниц Услуги/Заказа: шапка (иконка + название + карандаш владельцу),
 * карточка с направлением и «Характеристиками» (табличный вид), «Услуги по
 * профессии». Владелец может удалить профессию (сохранение списка без неё).
 * Акцент профессий — фуксия (отличен от фиолетовых услуг).
 */
export default function ProfessionPage() {
  const { userId, professionId } = useParams<{ userId: string; professionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuthStore(s => s.user);
  const isOwner = !!me?.id && me.id === userId;

  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ['profession-page-user', userId],
    queryFn: async () => { const { data } = await userAPI.getUser(userId!); return data as any; },
    enabled: !!userId,
  });

  // Удаление: перезаписываем список профессий без этой (единый save-эндпоинт профиля).
  // Полные features/valueIds берём из /users/me — публичный payload может быть беднее.
  const deleteMut = useMutation({
    mutationFn: async () => {
      const { data: meFull } = await userAPI.getMe();
      const rest = (meFull.userProfessions ?? []).filter((up: any) => up.professionId !== professionId);
      await userAPI.updateMe({
        userProfessions: rest.map((up: any) => ({
          professionId: up.professionId,
          features: up.features || [],
          selectedCustomFilterValueIds: (up.selectedCustomFilterValues ?? []).map((v: any) => v.id),
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Профессия удалена');
      navigate('/profile');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить профессию')),
  });

  if (isLoading || !user) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-fuchsia-500 border-t-transparent" />
      </div>
    );
  }

  const up = (user.userProfessions ?? []).find((p: any) => p.professionId === professionId);
  if (!up) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-slate-400 text-sm">Профессия не найдена — возможно, её удалили из профиля.</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors">Назад</button>
      </div>
    );
  }

  const cfvs: any[] = up.selectedCustomFilterValues || [];
  const dirName = up.profession?.direction?.name || '';
  const fieldName = up.profession?.direction?.fieldOfActivity?.name || '';
  const relatedServices = (user.userServices ?? []).filter((us: any) => us.professionId === professionId || us.profession?.id === professionId);
  const authorName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const authorAvatar = user.avatar ? getAvatarUrl(user.avatar) : null;

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Шапка — как у Услуги/Заказа */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all flex-shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GraduationCap size={16} className="text-fuchsia-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">{up.profession?.name}</h1>
          </div>
          {isOwner && (
            <button
              onClick={() => navigate('/profile?editProfessions=1')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-shrink-0"
              title="Редактировать профессии"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>

        {/* Владелец профессии (для гостей) */}
        {!isOwner && (
          <button onClick={() => navigate(`/profile/${user.id}`)} className="flex items-center gap-2.5 min-w-0 text-left -mt-1">
            <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
              {authorAvatar
                ? <img src={authorAvatar} alt={authorName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">{(authorName[0] ?? '?').toUpperCase()}</div>
              }
            </div>
            <span className="text-xs text-slate-400 hover:text-white transition-colors truncate">
              {authorName}{user.nickname ? ` · @${user.nickname}` : ''}
            </span>
          </button>
        )}

        {/* Главная карточка */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-4">
          {(fieldName || dirName) && (
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">
              {[fieldName, dirName].filter(Boolean).join(' · ')}
            </p>
          )}

          <h2 className="text-xl font-bold text-white leading-tight min-w-0 break-words [overflow-wrap:anywhere]">{up.profession?.name}</h2>

          {cfvs.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Характеристики</p>
              <GroupedFilterChips values={cfvs} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Характеристики не указаны.</p>
          )}
        </div>

        {/* Услуги по профессии */}
        {relatedServices.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Briefcase size={15} className="text-primary-400" />
              <h3 className="text-sm font-bold text-white">Услуги по профессии</h3>
              <span className="px-1.5 py-0.5 bg-primary-500/15 text-primary-400 text-[11px] rounded-full font-semibold">{relatedServices.length}</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {relatedServices.map((us: any) => {
                const price = us.priceFrom != null || us.priceTo != null
                  ? [us.priceFrom != null ? `от ${us.priceFrom} ₽` : null, us.priceTo != null ? `до ${us.priceTo} ₽` : null].filter(Boolean).join(' ')
                  : 'По договорённости';
                return (
                  <button
                    key={us.id}
                    onClick={() => navigate(`/services/${us.id}`)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/30 -mx-1 px-1 rounded-lg transition-colors"
                  >
                    <div className="w-1 self-stretch rounded-full bg-primary-500/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{us.name || us.service?.name}</p>
                      <p className="text-xs text-slate-500 truncate">{price}</p>
                    </div>
                    <span className="text-slate-600 flex-shrink-0">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Владелец: удаление профессии */}
        {isOwner && (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMut.isPending}
            className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-2xl transition-colors disabled:opacity-50"
          >
            {deleteMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Удалить профессию
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={`Удалить профессию «${up.profession?.name}» из профиля? Характеристики будут потеряны; услуги останутся.`}
        onConfirm={() => { setConfirmDelete(false); deleteMut.mutate(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
