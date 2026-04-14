import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { artistAPI, referenceAPI } from '../lib/api';
import { SocialLinksEditor } from '../components/SocialLinks';
import SelectSheet from '../components/SelectSheet';

const TYPE_OPTIONS = [
  { id: 'SOLO',        name: 'Соло артист' },
  { id: 'GROUP',       name: 'Группа' },
  { id: 'COVER_GROUP', name: 'Кавер группа' },
];

const TYPE_LABELS: Record<string, string> = {
  SOLO: 'Соло артист',
  GROUP: 'Группа',
  COVER_GROUP: 'Кавер группа',
};

type Form = {
  name: string;
  type: string;
  city: string;
  tourReady: string;
  description: string;
  bandLink: string;
  listeners: string;
  genreIds: string[];
  socialLinks: Record<string, string>;
};

export default function ArtistCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>({
    name: '', type: '', city: '', tourReady: '', description: '',
    bandLink: '', listeners: '', genreIds: [], socialLinks: {},
  });
  const [genreSheetOpen, setGenreSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  const set = (key: keyof Form, value: any) => setForm(f => ({ ...f, [key]: value }));

  const { data: genreOptions = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => { const { data } = await referenceAPI.getGenres(); return data as { id: string; name: string }[]; },
  });

  const createMut = useMutation({
    mutationFn: () => artistAPI.createArtist({
      name: form.name.trim(),
      type: form.type || undefined,
      city: form.city.trim() || undefined,
      tourReady: form.tourReady.trim() || undefined,
      description: form.description.trim() || undefined,
      bandLink: form.bandLink.trim() || undefined,
      listeners: form.listeners !== '' ? Number(form.listeners) : undefined,
      genreIds: form.genreIds,
      socialLinks: form.socialLinks,
    }),
    onSuccess: (res) => {
      navigate(`/artist/${res.data.id}`, { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <span className="font-semibold text-white text-sm">Новый коллектив</span>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Создать
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-xl mx-auto">
        <p className="text-xs text-slate-500">
          После создания отправьте карточку на модерацию — администраторы проверят информацию и одобрят публикацию в каталоге.
        </p>

        {/* Название */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Название *</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Название коллектива"
          />
        </div>

        {/* Тип */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Тип</label>
          <button
            type="button"
            onClick={() => setTypeSheetOpen(true)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center transition-colors hover:border-slate-600"
          >
            <span className={form.type ? 'text-white' : 'text-slate-500'}>
              {form.type ? TYPE_LABELS[form.type] : 'Выбрать тип'}
            </span>
            <span className="text-slate-500 text-xs">▾</span>
          </button>
        </div>

        {/* Город */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Город</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            value={form.city}
            onChange={e => set('city', e.target.value)}
            placeholder="Москва"
          />
        </div>

        {/* Готовность к туру */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Готовность к туру</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            value={form.tourReady}
            onChange={e => set('tourReady', e.target.value)}
            placeholder="Готовы к гастролям"
          />
        </div>

        {/* Описание */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Описание</label>
          <textarea
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors resize-none"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="О коллективе..."
          />
        </div>

        {/* Жанры */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Жанры</label>
          <button
            type="button"
            onClick={() => setGenreSheetOpen(true)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-left flex justify-between items-center transition-colors hover:border-slate-600"
          >
            <span className={form.genreIds.length ? 'text-white' : 'text-slate-500'}>
              {form.genreIds.length
                ? genreOptions.filter(g => form.genreIds.includes(g.id)).map(g => g.name).join(', ')
                : 'Выбрать жанры'}
            </span>
            <span className="text-slate-500 text-xs">▾</span>
          </button>
        </div>

        {/* Слушатели */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Слушателей в месяц</label>
          <input
            type="number"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            value={form.listeners}
            onChange={e => set('listeners', e.target.value)}
            placeholder="0"
            min="0"
          />
        </div>

        {/* BandLink */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ссылка на страницу группы</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
            value={form.bandLink}
            onChange={e => set('bandLink', e.target.value)}
            placeholder="https://band.link/..."
          />
        </div>

        {/* Соцсети */}
        <div>
          <label className="block text-xs text-slate-500 mb-2">Социальные сети</label>
          <SocialLinksEditor value={form.socialLinks} onChange={v => set('socialLinks', v)} />
        </div>

        {createMut.isError && (
          <p className="text-xs text-red-400 text-center">Ошибка при создании. Попробуйте ещё раз.</p>
        )}
      </div>

      <SelectSheet
        isOpen={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Тип коллектива"
        options={TYPE_OPTIONS}
        selectedIds={form.type}
        onSelect={v => { set('type', v as string); setTypeSheetOpen(false); }}
        mode="single"
        searchable={false}
        height="auto"
      />

      <SelectSheet
        isOpen={genreSheetOpen}
        onClose={() => setGenreSheetOpen(false)}
        title="Жанры"
        options={genreOptions}
        selectedIds={form.genreIds}
        onSelect={v => set('genreIds', v as string[])}
        mode="multiple"
        showConfirm
        height="full"
      />
    </div>
  );
}
