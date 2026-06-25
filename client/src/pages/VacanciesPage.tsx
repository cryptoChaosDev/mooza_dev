import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Megaphone, Briefcase, Loader2, Archive, Send, Pencil } from 'lucide-react';
import { vacancyAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import VacancyForm from '../components/VacancyForm';
import { workFormatLabel } from '../lib/vacancyOptions';

type Tab = 'active' | 'archived' | 'draft';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'archived', label: 'В архиве' },
  { key: 'draft', label: 'Черновики' },
];

const EMPTY_LABEL: Record<Tab, string> = {
  active: 'Нет активных вакансий',
  archived: 'Архив пуст',
  draft: 'Нет черновиков',
};

export default function VacanciesPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const [editingVacancy, setEditingVacancy] = useState<any>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);

  const openEdit = async (id: string) => {
    setEditLoadingId(id);
    try {
      const { data } = await vacancyAPI.getOne(id);
      setEditingVacancy(data);
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось открыть вакансию для редактирования'));
    } finally {
      setEditLoadingId(null);
    }
  };

  const { data: vacancies = [], isLoading } = useQuery<any[]>({
    queryKey: ['vacancies', 'mine', artistId, tab],
    queryFn: async () => { const { data } = await vacancyAPI.getMine({ artistId: artistId!, status: tab }); return data as any[]; },
    enabled: !!artistId,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => vacancyAPI.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacancies', 'mine'] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус вакансии')),
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/60">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Megaphone size={16} className="text-amber-400" />
            <h1 className="text-base font-bold text-white">Мои вакансии</h1>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : vacancies.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Megaphone size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">{EMPTY_LABEL[tab]}</p>
          </div>
        ) : vacancies.map((vacancy: any) => {
          const professionName = vacancy.profession?.name ?? '';
          return (
            <div key={vacancy.id} className="p-4 bg-slate-900/60 border border-slate-800/60 rounded-2xl space-y-3">
              <button onClick={() => navigate(`/vacancies/${vacancy.id}`)} className="w-full text-left">
                <p className="text-sm font-semibold text-white truncate">{vacancy.title}</p>
                {professionName && <p className="text-xs text-slate-500 mt-0.5 truncate">{professionName}</p>}
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
                  <Briefcase size={12} className="text-slate-500" />
                  <span>{workFormatLabel(vacancy.workFormat)}</span>
                  {vacancy._count?.responses != null && vacancy._count.responses > 0 && (
                    <span className="ml-auto text-amber-400">Откликов: {vacancy._count.responses}</span>
                  )}
                </div>
              </button>

              <div className="flex gap-2">
                {tab === 'active' && (
                  <>
                    <button
                      onClick={() => openEdit(vacancy.id)}
                      disabled={editLoadingId === vacancy.id}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {editLoadingId === vacancy.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                      Редактировать
                    </button>
                    <button
                      onClick={() => statusMut.mutate({ id: vacancy.id, status: 'archived' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                      В архив
                    </button>
                  </>
                )}

                {tab === 'draft' && (
                  <>
                    <button
                      onClick={() => openEdit(vacancy.id)}
                      disabled={editLoadingId === vacancy.id}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {editLoadingId === vacancy.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                      Редактировать
                    </button>
                    <button
                      onClick={() => statusMut.mutate({ id: vacancy.id, status: 'active' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Опубликовать
                    </button>
                  </>
                )}

                {tab === 'archived' && (
                  <>
                    <button
                      onClick={() => openEdit(vacancy.id)}
                      disabled={editLoadingId === vacancy.id}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-medium border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {editLoadingId === vacancy.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                      Редактировать
                    </button>
                    <button
                      onClick={() => statusMut.mutate({ id: vacancy.id, status: 'active' })}
                      disabled={statusMut.isPending}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {statusMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Опубликовать
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingVacancy && (
        <VacancyForm
          vacancy={editingVacancy}
          artistId={artistId}
          onClose={() => {
            setEditingVacancy(null);
            qc.invalidateQueries({ queryKey: ['vacancies', 'mine'] });
          }}
        />
      )}
    </div>
  );
}
