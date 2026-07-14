import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Tag, Save, Loader2 } from 'lucide-react';
import { artistAPI, referenceAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

/**
 * Страница редактирования жанров артиста — /artist/:id/genres.
 * Бывший лист SelectSheet на ArtistPage: мультивыбор жанров чипсами (стиль —
 * как в модалке фильтров артистов в каталоге), сохранение updateArtist({genreIds}).
 */
export default function ArtistGenresPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  // Заполняем выбор один раз после загрузки артиста.
  const [seeded, setSeeded] = useState(false);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(id!);
      return data;
    },
    enabled: !!id,
  });

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data } = await referenceAPI.getGenres();
      return data as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    if (artist && !seeded) {
      setSelected((artist.genres ?? []).map((g: { id: string }) => g.id));
      setSeeded(true);
    }
  }, [artist, seeded]);

  const toggle = (genreId: string) =>
    setSelected(prev => prev.includes(genreId) ? prev.filter(x => x !== genreId) : [...prev, genreId]);

  const saveMut = useMutation({
    mutationFn: () => artistAPI.updateArtist(id!, { genreIds: selected }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      navigate(-1);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить')),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-400">Артист не найден</p>
        <button onClick={() => navigate(-1)} className="text-primary-400 text-sm">Назад</button>
      </div>
    );
  }

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
          <Tag size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Жанры</h1>
          {selected.length > 0 && <span className="text-xs text-slate-500 flex-shrink-0">{selected.length}</span>}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {genres.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {genres.map((genre) => {
              const isActive = selected.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggle(genre.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    isActive
                      ? 'bg-primary-600 border-primary-500 text-white'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-600'
                  }`}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Жанры не найдены</p>
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
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
