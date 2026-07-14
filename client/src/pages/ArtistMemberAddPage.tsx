import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, Search, Tag, CheckCircle2, Loader2 } from 'lucide-react';
import { artistAPI, userAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';
import RolePicker from '../components/RolePicker';
import { toast } from '../stores/toastStore';

/**
 * Страница «Добавить участника» — /artist/:id/members/add.
 * Бывший нижний лист showAddMember на ArtistPage: поиск зарегистрированных
 * пользователей, выбор ролей (RolePicker) и статуса участия. Права проверяет
 * сервер (artistAPI.addMember).
 */
export default function ArtistMemberAddPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [participation, setParticipation] = useState<'ACTIVE_MEMBER' | 'FORMER_MEMBER'>('ACTIVE_MEMBER');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ['user-search', search],
    queryFn: async () => {
      const { data } = await userAPI.search({ query: search.trim() });
      return data as { id: string; firstName: string; lastName: string; nickname?: string; avatar?: string }[];
    },
    enabled: search.trim().length >= 1,
  });

  const addMemberMut = useMutation({
    mutationFn: () =>
      artistAPI.addMember(id!, {
        userId: selectedUserId,
        roleIds,
        participationStatus: participation,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      toast.success('Приглашение отправлено');
      navigate(-1);
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Липкая шапка — как ArtistEditPage */}
      <div
        className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <UserPlus size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Добавить участника</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Search users */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">1. Найдите пользователя</p>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedUserId(''); }}
              placeholder="Имя или никнейм..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500"
            />
          </div>
          {search.trim().length < 1 ? (
            <p className="text-xs text-slate-600 italic py-1">Начните вводить имя</p>
          ) : searchLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
          ) : searchResults.length === 0 ? (
            <p className="text-xs text-slate-600 italic py-1">Никого не найдено</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left ${
                    selectedUserId === u.id
                      ? 'bg-primary-500/10 border-primary-500/40'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <AvatarComponent src={u.avatar} name={`${u.lastName ?? ''} ${u.firstName ?? ''}`} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{u.lastName} {u.firstName}</p>
                    {u.nickname && <p className="text-xs text-slate-500 truncate">@{u.nickname}</p>}
                  </div>
                  {selectedUserId === u.id && <CheckCircle2 size={16} className="text-primary-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Roles */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">2. Роли</p>
          <button
            onClick={() => setRolePickerOpen(true)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
          >
            <span className={roleIds.length ? 'text-white' : 'text-slate-500'}>
              {roleIds.length ? `Выбрано ролей: ${roleIds.length}` : 'Выбрать роли'}
            </span>
            <Tag size={14} className="text-slate-500" />
          </button>
        </div>

        {/* Participation */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">3. Статус участия</p>
          <div className="flex gap-2">
            {([['ACTIVE_MEMBER', 'Действующий участник'], ['FORMER_MEMBER', 'Бывший участник']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setParticipation(val)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  participation === val
                    ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {addMemberMut.isError && (
          <p className="text-sm text-red-400">{(addMemberMut.error as any)?.response?.data?.error ?? 'Ошибка. Попробуйте снова.'}</p>
        )}

        {/* Действия — липкий низ как ArtistEditPage */}
        <div
          className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 bg-slate-950/95 border-t border-slate-800/60 flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex-1 py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-2xl transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => addMemberMut.mutate()}
            disabled={!selectedUserId || roleIds.length === 0 || addMemberMut.isPending}
            title={roleIds.length === 0 ? 'Выберите роль участника' : undefined}
            className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {addMemberMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Добавить
          </button>
        </div>
      </div>

      {/* RolePicker (сам лочит скролл и рисуется порталом) */}
      {rolePickerOpen && (
        <RolePicker
          context="collective"
          value={roleIds}
          onSave={(ids) => setRoleIds(ids)}
          onClose={() => setRolePickerOpen(false)}
          title="Роли участника"
        />
      )}
    </div>
  );
}
