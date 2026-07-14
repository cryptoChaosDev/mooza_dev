import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Music2, Save, Loader2 } from 'lucide-react';
import { artistAPI, releaseAPI, clipAPI } from '../lib/api';
import CityPicker from '../components/CityPicker';
import SelectSheet from '../components/SelectSheet';
import ArtistLookup from '../components/ArtistLookup';
import MediaImportList from '../components/MediaImportList';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

const TYPE_OPTIONS = [
  { id: 'SOLO',        name: 'Сольный артист' },
  { id: 'DUET',        name: 'Дуэт' },
  { id: 'GROUP',       name: 'Группа' },
  { id: 'COVER_GROUP', name: 'Кавер-группа' },
  { id: 'TRIBUTE',     name: 'Трибьют' },
  { id: 'CHOIR',       name: 'Хор' },
  { id: 'ENSEMBLE',    name: 'Ансамбль' },
  { id: 'ORCHESTRA',   name: 'Оркестр' },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map(t => [t.id, t.name]));

type EditForm = {
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

/**
 * Страница редактирования Артиста — /artist/:id/edit.
 * Заменяет бывшую модалку EditModal на ArtistPage: единая механика
 * «форма = отдельная страница» (как Профессии/Услуги/Заказы).
 */
export default function ArtistEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<EditForm>({
    name: '', type: '', city: '', tourReady: '', description: '',
    bandLink: '', listeners: '', genreIds: [], socialLinks: {},
  });
  // Форма заполняется один раз после загрузки артиста — рефетчи (например, после
  // загрузки аватара из «Найти артиста») не должны затирать правки пользователя.
  const [seeded, setSeeded] = useState(false);

  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  const [applyingLookup, setApplyingLookup] = useState(false);
  const [foundReleases, setFoundReleases] = useState<any[]>([]);
  const [foundClips, setFoundClips] = useState<any[]>([]);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(id!);
      return data;
    },
    enabled: !!id,
  });

  // Уже добавленные релизы/клипы — чтобы не предлагать импорт дублей.
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', 'artist', id],
    queryFn: async () => {
      const { data } = await releaseAPI.listByArtist(id!);
      return data as { id: string; title: string; coverUrl?: string | null }[];
    },
    enabled: !!id,
  });

  const { data: clips = [] } = useQuery({
    queryKey: ['clips', 'artist', id],
    queryFn: async () => {
      const { data } = await clipAPI.listByArtist(id!);
      return data as { id: string; title: string; coverUrl?: string | null }[];
    },
    enabled: !!id,
  });

  // Заполнить форму данными артиста (один раз)
  useEffect(() => {
    if (artist && !seeded) {
      setForm({
        name: artist.name ?? '',
        type: artist.type ?? '',
        city: artist.city ?? '',
        tourReady: artist.tourReady ?? '',
        description: artist.description ?? '',
        bandLink: artist.bandLink ?? '',
        listeners: artist.listeners != null ? String(artist.listeners) : '',
        genreIds: (artist.genres ?? []).map((g: { id: string }) => g.id),
        socialLinks: (artist.socialLinks as Record<string, string>) ?? {},
      });
      setSeeded(true);
    }
  }, [artist, seeded]);

  const uploadAvatarMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadAvatar(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось загрузить аватар')),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      artistAPI.updateArtist(id!, {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      navigate(-1);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить изменения')),
  });

  // «Найти артиста» — autofill the edit form from Deezer/Apple Music (same as create).
  const applyLookupCandidate = async (c: any) => {
    setApplyingLookup(true);
    try {
      setForm(f => ({
        ...f,
        name: c.name || f.name,
        type: c.type || f.type,
        genreIds: c.genreIds?.length ? c.genreIds : f.genreIds,
        socialLinks: {
          ...f.socialLinks,
          ...(c.links?.yandexMusic ? { yandex_music: c.links.yandexMusic } : {}),
          ...(c.links?.spotify ? { spotify: c.links.spotify } : {}),
          ...(c.links?.appleMusic ? { apple_music: c.links.appleMusic } : {}),
          ...(c.links?.deezer ? { deezer: c.links.deezer } : {}),
          ...(c.links?.vk ? { vk: c.links.vk } : {}),
          ...(c.links?.soundcloud ? { soundcloud: c.links.soundcloud } : {}),
          ...(c.links?.website ? { website: c.links.website } : {}),
        },
      }));
      if (c.imageUrl) {
        try {
          const { data: blob } = await artistAPI.lookupAvatar(c.imageUrl);
          uploadAvatarMut.mutate(new File([blob], 'avatar.jpg', { type: (blob as any)?.type || 'image/jpeg' }));
        } catch { /* avatar best-effort */ }
      }
      // Pull the artist's Apple Music releases + clips for optional import (skip already-added).
      if (c.itunesId) {
        try {
          const { data } = await artistAPI.lookupReleases({ itunesId: c.itunesId, deezerId: c.deezerId });
          const key = (u: any) => String(u || '').split('?')[0];
          const haveRel = new Set((releases || []).map((r: any) => key(r.url)));
          const haveClip = new Set((clips || []).map((r: any) => key(r.url)));
          setFoundReleases((data.releases || []).filter((r: any) => !haveRel.has(key(r.url))));
          setFoundClips((data.clips || []).filter((r: any) => !haveClip.has(key(r.url))));
        } catch { /* best-effort */ }
      }
      toast.success('Данные подставлены — проверьте и сохраните');
    } finally {
      setApplyingLookup(false);
    }
  };

  const importReleases = async (selected: any[]) => {
    let ok = 0;
    for (const r of selected) {
      try {
        await releaseAPI.create({
          artistId: id!, platform: 'APPLE_MUSIC', url: r.url, title: r.title,
          coverUrl: r.coverUrl || undefined, releaseDate: r.releaseDate || undefined, participants: [],
        });
        ok++;
      } catch { /* skip a failed one */ }
    }
    setFoundReleases([]);
    queryClient.invalidateQueries({ queryKey: ['releases', 'artist', id] });
    if (ok > 0) toast.success(`Импортировано релизов: ${ok}`); else toast.error('Не удалось импортировать релизы');
  };
  const importClips = async (selected: any[]) => {
    let ok = 0;
    for (const r of selected) {
      try {
        await clipAPI.create({
          artistId: id!, platform: 'APPLE_MUSIC', url: r.url, title: r.title,
          coverUrl: r.coverUrl || undefined, participants: [],
        });
        ok++;
      } catch { /* skip a failed one */ }
    }
    setFoundClips([]);
    queryClient.invalidateQueries({ queryKey: ['clips', 'artist', id] });
    if (ok > 0) toast.success(`Импортировано клипов: ${ok}`); else toast.error('Не удалось импортировать клипы');
  };

  const set = (key: keyof EditForm, value: string | string[] | Record<string, string>) =>
    setForm((f) => ({ ...f, [key]: value }));

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
      {/* Липкая шапка — как OrderFormPage/ProfessionFormPage */}
      <div
        className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={22} />
          </button>
          <Music2 size={16} className="text-primary-400 flex-shrink-0" />
          <h1 className="text-base font-bold text-white truncate">Основная информация</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Описание, жанры и контакты редактируются в своих карточках на странице
            артиста; здесь — только основная информация. Данные «Найти артиста»
            (жанры/соцсети) всё равно подставляются и сохранятся вместе с формой. */}
        <ArtistLookup onApply={applyLookupCandidate} applying={applyingLookup} />

        <MediaImportList title="Релизы на Apple Music" items={foundReleases} onImport={importReleases} />
        <MediaImportList title="Клипы на Apple Music" items={foundClips} onImport={importClips} />

        {/* Название */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Название *</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Название коллектива"
          />
        </div>

        {/* Тип */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Тип</label>
          <button
            type="button"
            onClick={() => setTypeSheetOpen(true)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
          >
            <span className={form.type ? 'text-white' : 'text-slate-500'}>
              {form.type ? TYPE_LABELS[form.type] : 'Выбрать тип'}
            </span>
            <span className="text-slate-500 text-xs">▾</span>
          </button>
        </div>

        {/* Город — автокомплит реальных городов (выбор из списка) */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Город</label>
          <CityPicker city={form.city} country="" onChange={(c) => set('city', c)} />
        </div>

        {/* Готовность к туру */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Готовность к туру</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
            value={form.tourReady}
            onChange={(e) => set('tourReady', e.target.value)}
            placeholder="Готовы к гастролям"
          />
        </div>

        {/* Слушатели */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Слушателей в месяц</label>
          <input
            type="number"
            className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
            value={form.listeners}
            onChange={(e) => set('listeners', e.target.value)}
            placeholder="0"
            min="0"
          />
        </div>

        {/* Действия — липнут к низу как на регистрации */}
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
            disabled={saveMut.isPending || !form.name.trim()}
            className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        </div>
      </div>

      {/* Sheets */}
      <SelectSheet
        isOpen={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Тип коллектива"
        options={TYPE_OPTIONS}
        selectedIds={form.type}
        onSelect={(v) => { set('type', v as string); setTypeSheetOpen(false); }}
        mode="single"
        searchable={false}
        height="auto"
      />

    </div>
  );
}
