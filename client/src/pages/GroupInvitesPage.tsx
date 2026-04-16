import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X, Loader2, Users } from 'lucide-react';
import { groupAPI } from '../lib/api';
import AvatarComponent from '../components/Avatar';

export default function GroupInvitesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['group-invites'],
    queryFn: async () => {
      const { data } = await groupAPI.getInvites();
      return data as any[];
    },
  });

  const acceptMut = useMutation({
    mutationFn: (membershipId: string) => groupAPI.acceptInvite(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invites'] }),
  });

  const declineMut = useMutation({
    mutationFn: (membershipId: string) => groupAPI.declineInvite(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invites'] }),
  });

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Приглашения в группы</h1>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
          ) : invites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                <Users size={24} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-sm">Нет активных приглашений</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map((inv: any) => (
                <div key={inv.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  {/* Group info */}
                  <div
                    className="flex items-center gap-3 mb-3 cursor-pointer"
                    onClick={() => navigate(`/artist/${inv.group.id}`)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {inv.group.avatar ? (
                        <img src={inv.group.avatar} alt={inv.group.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-sm">{inv.group.name?.[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{inv.group.name}</p>
                      {inv.profession && (
                        <p className="text-xs text-primary-400">Роль: {inv.profession.name}</p>
                      )}
                    </div>
                  </div>

                  {/* Invited by */}
                  {inv.invitedBy && (
                    <div className="flex items-center gap-2 mb-3">
                      <AvatarComponent src={inv.invitedBy.avatar} name={`${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`} size={20} />
                      <p className="text-xs text-slate-500">
                        Пригласил: <span className="text-slate-400">{inv.invitedBy.firstName} {inv.invitedBy.lastName}</span>
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => declineMut.mutate(inv.id)}
                      disabled={declineMut.isPending || acceptMut.isPending}
                      className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X size={14} />
                      Отказаться
                    </button>
                    <button
                      onClick={() => acceptMut.mutate(inv.id)}
                      disabled={acceptMut.isPending || declineMut.isPending}
                      className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      {acceptMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Вступить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
