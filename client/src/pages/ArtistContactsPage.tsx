import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Save, Loader2 } from 'lucide-react';
import { artistAPI } from '../lib/api';
import { SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

/**
 * Страница редактирования контактов артиста — /artist/:id/contacts.
 * Бывшее инлайн-редактирование карточки «Контакты» на ArtistPage: ссылка на
 * страницу группы + контакты + соцсети. Сохранение — частичный PUT
 * (socialLinks, bandLink), непереданные поля не меняются.
 */
export default function ArtistContactsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [links, setLinks] = useState<Record<string, string>>({});
  const [bandLink, setBandLink] = useState('');
  // Заполняем форму один раз после загрузки артиста — рефетчи не должны
  // затирать правки пользователя.
  const [seeded, setSeeded] = useState(false);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(id!);
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (artist && !seeded) {
      setLinks(((artist.socialLinks as Record<string, string>) ?? {}));
      setBandLink(artist.bandLink ?? '');
      setSeeded(true);
    }
  }, [artist, seeded]);

  const saveMut = useMutation({
    mutationFn: () => artistAPI.updateArtist(id!, { socialLinks: links, bandLink: bandLink.trim() }),
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
          <Link2 size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Контакты</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ссылка на страницу группы</label>
          <input
            value={bandLink}
            onChange={e => setBandLink(e.target.value)}
            placeholder="https://band.link/..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-2">Контакты</label>
          <SocialLinksEditor value={links} onChange={setLinks} only={CONTACT_KEYS} />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-2">Социальные сети</label>
          <SocialLinksEditor value={links} onChange={setLinks} only={SOCIAL_KEYS} />
        </div>

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
