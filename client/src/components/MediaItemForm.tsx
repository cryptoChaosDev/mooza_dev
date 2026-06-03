import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Search, Tag, Trash2, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseAPI, clipAPI, userAPI, roleAPI } from '../lib/api';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import AvatarComponent from './Avatar';
import RolePicker from './RolePicker';

// ── Platform option labels ─────────────────────────────────────────────────
const RELEASE_PLATFORMS: { id: string; name: string }[] = [
  { id: 'VK', name: 'ВКонтакте' },
  { id: 'SPOTIFY', name: 'Spotify' },
  { id: 'YANDEX_MUSIC', name: 'Яндекс Музыка' },
  { id: 'APPLE_MUSIC', name: 'Apple Music' },
];
const CLIP_PLATFORMS: { id: string; name: string }[] = [
  { id: 'VK_VIDEO', name: 'ВКонтакте Видео' },
  { id: 'RUTUBE', name: 'Rutube' },
  { id: 'YOUTUBE', name: 'YouTube' },
];

export interface MediaItemInitial {
  id: string;
  title: string;
  coverUrl?: string | null;
  releaseDate?: string | null;
  platform: string;
  url: string;
  participants?: {
    id: string;
    userId: string;
    user: { id: string; firstName: string; lastName: string; avatar?: string | null };
    roles: { id: string; name: string }[];
  }[];
}

interface DraftParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
  roleIds: string[];
}

interface Props {
  kind: 'release' | 'clip';
  artistId: string;
  /** When provided → edit mode; otherwise create mode. */
  initial?: MediaItemInitial | null;
  onClose: () => void;
  /** Called after a successful create/update with the saved item id. */
  onSaved?: (id: string) => void;
}

export default function MediaItemForm({ kind, artistId, initial, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const isRelease = kind === 'release';
  const api = isRelease ? releaseAPI : clipAPI;
  const platforms = isRelease ? RELEASE_PLATFORMS : CLIP_PLATFORMS;
  const roleContext = isRelease ? 'release' : 'clip';
  const editing = !!initial;

  const [platform, setPlatform] = useState<string>(initial?.platform ?? platforms[0].id);
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '');
  const [releaseDate, setReleaseDate] = useState(
    initial?.releaseDate ? initial.releaseDate.slice(0, 10) : '',
  );

  const [participants, setParticipants] = useState<DraftParticipant[]>(
    (initial?.participants ?? []).map((p) => ({
      userId: p.userId,
      name: `${p.user.lastName ?? ''} ${p.user.firstName ?? ''}`.trim(),
      avatar: p.user.avatar,
      roleIds: (p.roles ?? []).map((r) => r.id),
    })),
  );

  // Role catalog → id→name map for displaying chosen role names.
  const { data: roleCategories = [] } = useQuery({
    queryKey: ['roles', roleContext],
    queryFn: async () => {
      const { data } = await roleAPI.list(roleContext);
      return data as { category: string; roles: { id: string; name: string }[] }[];
    },
  });
  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of roleCategories) for (const r of c.roles) m.set(r.id, r.name);
    // Seed with initial participant role names so they show before the catalog loads.
    for (const p of initial?.participants ?? [])
      for (const r of p.roles ?? []) m.set(r.id, r.name);
    return m;
  }, [roleCategories, initial]);

  // Participant search
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; firstName: string; lastName: string; nickname?: string; avatar?: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);

  // RolePicker target (which participant userId we're editing roles for)
  const [rolePickerUserId, setRolePickerUserId] = useState<string | null>(null);

  const [fetchError, setFetchError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    lockScroll();
    return () => unlockScroll();
  }, []);

  // Debounced user search
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      userAPI
        .search({ query: q })
        .then(({ data }) => {
          if (alive) setSearchResults(data ?? []);
        })
        .catch(() => {
          if (alive) setSearchResults([]);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  // ── Metadata prefill ──────────────────────────────────────────────────────
  const metaMut = useMutation({
    mutationFn: () => api.fetchMetadata(platform, url.trim()),
    onSuccess: (res: any) => {
      const data = res?.data ?? {};
      if (data.title) setTitle(data.title);
      if (data.coverUrl) setCoverUrl(data.coverUrl);
      if (isRelease && data.releaseDate) setReleaseDate(String(data.releaseDate).slice(0, 10));
      if (!data.title && !data.coverUrl) {
        setFetchError('Не удалось подтянуть данные — заполните вручную.');
      } else {
        setFetchError('');
      }
    },
    onError: () => setFetchError('Не удалось подтянуть данные — заполните вручную.'),
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      const participantsPayload = participants.map((p) => ({ userId: p.userId, roleIds: p.roleIds }));
      if (editing) {
        return api.update(initial!.id, {
          platform: platform as any,
          url: url.trim(),
          title: title.trim(),
          coverUrl: coverUrl.trim() ? coverUrl.trim() : null,
          ...(isRelease ? { releaseDate: releaseDate ? releaseDate : null } : {}),
          participants: participantsPayload,
        } as any);
      }
      return api.create({
        artistId,
        platform: platform as any,
        url: url.trim(),
        title: title.trim(),
        ...(coverUrl.trim() ? { coverUrl: coverUrl.trim() } : {}),
        ...(isRelease && releaseDate ? { releaseDate } : {}),
        participants: participantsPayload,
      } as any);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: [`${kind}s`, 'artist', artistId] });
      if (editing) queryClient.invalidateQueries({ queryKey: [kind, initial!.id] });
      onSaved?.(res?.data?.id ?? initial?.id);
      onClose();
    },
    onError: (err: any) => setSaveError(err?.response?.data?.error ?? 'Не удалось сохранить.'),
  });

  const addParticipant = (u: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
  }) => {
    if (participants.some((p) => p.userId === u.id)) return;
    setParticipants((prev) => [
      ...prev,
      {
        userId: u.id,
        name: `${u.lastName ?? ''} ${u.firstName ?? ''}`.trim(),
        avatar: u.avatar,
        roleIds: [],
      },
    ]);
    setSearch('');
    setSearchResults([]);
  };

  const removeParticipant = (userId: string) =>
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));

  const titleLabel = isRelease ? 'релиз' : 'клип';

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl flex flex-col"
            style={{
              maxHeight: '92vh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
                <X size={20} />
              </button>
              <span className="font-semibold text-white text-sm">
                {editing ? `Редактировать ${titleLabel}` : `Добавить ${titleLabel}`}
              </span>
              <button
                onClick={() => { setSaveError(''); saveMut.mutate(); }}
                disabled={saveMut.isPending || !title.trim() || !url.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Сохранить
              </button>
            </div>

            {/* Body */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {/* Platform */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Платформа</label>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        platform === p.id
                          ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL + fetch */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ссылка</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() => { setFetchError(''); metaMut.mutate(); }}
                    disabled={metaMut.isPending || !url.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                  >
                    {metaMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Подтянуть
                  </button>
                </div>
                {fetchError && <p className="text-xs text-amber-400 mt-1">{fetchError}</p>}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Название *</label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isRelease ? 'Название релиза' : 'Название трека'}
                />
              </div>

              {/* Cover */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Обложка (ссылка)</label>
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                  value={coverUrl ?? ''}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                />
                {coverUrl?.trim() && (
                  <img
                    src={coverUrl}
                    alt="cover preview"
                    className="mt-2 w-24 h-24 rounded-xl object-cover border border-slate-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>

              {/* Release date (releases only) */}
              {isRelease && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Дата релиза</label>
                  <input
                    type="date"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                  />
                </div>
              )}

              {/* Participants */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">Участники</label>

                {/* Search */}
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Найти пользователя..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500"
                  />
                </div>
                {search.trim().length >= 2 && (
                  searching ? (
                    <div className="flex justify-center py-3">
                      <Loader2 size={18} className="animate-spin text-slate-500" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-xs text-slate-600 italic py-1 mb-2">Никого не найдено</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
                      {searchResults
                        .filter((u) => !participants.some((p) => p.userId === u.id))
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => addParticipant(u)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl border bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors text-left"
                          >
                            <AvatarComponent
                              src={u.avatar}
                              name={`${u.lastName ?? ''} ${u.firstName ?? ''}`}
                              size={32}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{u.lastName} {u.firstName}</p>
                              {u.nickname && <p className="text-xs text-slate-500 truncate">@{u.nickname}</p>}
                            </div>
                          </button>
                        ))}
                    </div>
                  )
                )}

                {/* Added participants */}
                {participants.length > 0 && (
                  <div className="space-y-2">
                    {participants.map((p) => (
                      <div
                        key={p.userId}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800"
                      >
                        <AvatarComponent src={p.avatar} name={p.name} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{p.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {p.roleIds.length
                              ? p.roleIds.map((id) => roleNameById.get(id) ?? id).join(', ')
                              : 'Роли не выбраны'}
                          </p>
                        </div>
                        <button
                          onClick={() => setRolePickerUserId(p.userId)}
                          title="Выбрать роли"
                          className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors"
                        >
                          <Tag size={15} />
                        </button>
                        <button
                          onClick={() => removeParticipant(p.userId)}
                          title="Убрать"
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {saveError && <p className="text-sm text-red-400">{saveError}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* RolePicker for the currently-edited participant */}
      {rolePickerUserId && (
        <RolePicker
          context={roleContext}
          value={participants.find((p) => p.userId === rolePickerUserId)?.roleIds ?? []}
          onSave={(ids) =>
            setParticipants((prev) =>
              prev.map((p) => (p.userId === rolePickerUserId ? { ...p, roleIds: ids } : p)),
            )
          }
          onClose={() => setRolePickerUserId(null)}
          title="Роли участника"
        />
      )}
    </>
  );
}
