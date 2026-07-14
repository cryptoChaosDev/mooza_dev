import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Search, Tag, Trash2, RefreshCw, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseAPI, clipAPI, userAPI, roleAPI, artistAPI } from '../lib/api';
import { detectMediaPlatform, MEDIA_PLATFORM_LABELS, allowedPlatformLabels } from '../lib/mediaPlatforms';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import { toast } from '../stores/toastStore';
import AvatarComponent from './Avatar';
import RolePicker from './RolePicker';

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
  /**
   * Page mode (/artist/:id/releases/new, /artist/:id/clips/new): renders the form
   * inline with a sticky Отмена/Сохранить footer instead of a bottom sheet —
   * no portal, no scroll lock.
   */
  asPage?: boolean;
}

// ISO (YYYY-MM-DD) → masked ДД.ММ.ГГГГ for the date field's display value.
function isoToMasked(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export default function MediaItemForm({ kind, artistId, initial, onClose, onSaved, asPage = false }: Props) {
  const queryClient = useQueryClient();
  const isRelease = kind === 'release';
  const api = isRelease ? releaseAPI : clipAPI;
  const roleContext = isRelease ? 'release' : 'clip';
  const editing = !!initial;

  // Local «today» (YYYY-MM-DD) — a release date cannot be in the future.
  const _td = new Date();
  const todayStr = `${_td.getFullYear()}-${String(_td.getMonth() + 1).padStart(2, '0')}-${String(_td.getDate()).padStart(2, '0')}`;

  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '');
  const [releaseDate, setReleaseDate] = useState(
    initial?.releaseDate ? initial.releaseDate.slice(0, 10) : '',
  );
  // Masked ДД.ММ.ГГГГ display (native <input type=date> rendered its border wider
  // than the sibling text fields on iOS — same masked pattern as the other forms).
  const [releaseDateInput, setReleaseDateInput] = useState(
    initial?.releaseDate ? isoToMasked(initial.releaseDate.slice(0, 10)) : '',
  );

  // Platform is no longer picked by hand — it's derived from the pasted link.
  // null → the link isn't a real URL to one of the allowed streaming services.
  const detectedPlatform = useMemo(
    () => (url.trim() ? detectMediaPlatform(kind, url.trim()) : null),
    [kind, url],
  );
  const urlInvalid = url.trim().length > 0 && !detectedPlatform;

  const [participants, setParticipants] = useState<DraftParticipant[]>(
    (initial?.participants ?? []).map((p) => ({
      userId: p.userId,
      name: `${p.user.lastName ?? ''} ${p.user.firstName ?? ''}`.trim(),
      avatar: p.user.avatar,
      roleIds: (p.roles ?? []).map((r) => r.id),
    })),
  );

  // Новый релиз/клип: по умолчанию подставляем ДЕЙСТВУЮЩИХ участников артиста
  // (их можно убрать крестиком или добавить других через поиск). Один раз,
  // и только если пользователь ещё не начал собирать список сам.
  const [membersSeeded, setMembersSeeded] = useState(false);
  const { data: artistForSeed } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(artistId);
      return data;
    },
    enabled: !editing && !membersSeeded,
  });

  // Role catalog → id→name map for displaying chosen role names.
  const { data: roleCategories = [], isFetched: rolesFetched } = useQuery({
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

  // Для КЛИПА «творческость» участника определяем по РЕЛИЗНОМУ справочнику
  // (в клиповом — кино-роли, музыкантских имён там нет): музыканты
  // подставляются с ролью «Артист» из клипового каталога.
  const { data: releaseCatalogForSeed = [], isFetched: releaseCatFetched } = useQuery({
    queryKey: ['roles', 'release'],
    queryFn: async () => {
      const { data } = await roleAPI.list('release');
      return data as { category: string; roles: { id: string; name: string }[] }[];
    },
    enabled: !editing && !membersSeeded && !isRelease,
  });

  // Сид участников: роли в коллективе (context COLLECTIVE) переносим в роли
  // релиза/клипа ПО ИМЕНАМ — id в каталогах разные. Ждём загрузку каталогов,
  // чтобы роли скопировались, а не потерялись.
  useEffect(() => {
    if (editing || membersSeeded || !artistForSeed || !rolesFetched) return;
    if (!isRelease && !releaseCatFetched) return; // клипу нужен и релизный каталог
    const nameToId = new Map<string, string>();
    for (const c of roleCategories) for (const r of c.roles) nameToId.set(r.name.trim().toLowerCase(), r.id);
    // Набор «творческих» имён ролей — из релизного справочника
    const creativeNames = new Set<string>();
    const creativeSource = isRelease ? roleCategories : releaseCatalogForSeed;
    for (const c of creativeSource) for (const r of c.roles) creativeNames.add(r.name.trim().toLowerCase());
    const defaultClipArtistId = !isRelease ? nameToId.get('артист') : undefined;

    const active = (artistForSeed.confirmedMembers ?? [])
      .filter((m: any) => m.participationStatus === 'ACTIVE_MEMBER' && m.user?.id);
    setParticipants((prev) => {
      if (prev.length > 0) return prev; // пользователь уже добавил кого-то сам
      return active
        .map((m: any) => {
          // confirmedMembers отдаёт роли уже плоско ({id, name}); поддержим и
          // вложенный формат ({role:{name}}) на всякий случай.
          const memberRoleNames = (m.roles ?? [])
            .map((mr: any) => String(mr.name ?? mr.role?.name ?? '').trim().toLowerCase())
            .filter(Boolean) as string[];
          let roleIds = memberRoleNames
            .map((n) => nameToId.get(n))
            .filter(Boolean) as string[];
          const isCreative = roleIds.length > 0 || memberRoleNames.some((n) => creativeNames.has(n));
          // Музыкант в клипе без прямого совпадения ролей — роль «Артист»
          if (!isRelease && isCreative && roleIds.length === 0 && defaultClipArtistId) {
            roleIds = [defaultClipArtistId];
          }
          return {
            userId: m.user.id,
            name: `${m.user.lastName ?? ''} ${m.user.firstName ?? ''}`.trim(),
            avatar: m.user.avatar ?? null,
            roleIds,
            isCreative,
          };
        })
        // Переносим только «творческих»: чисто менеджерские (директор, юрист…)
        // и участники без ролей в кредиты не попадают — их можно добавить
        // вручную через поиск.
        .filter((p: { isCreative: boolean; roleIds: string[] }) => p.isCreative && p.roleIds.length > 0)
        .map(({ isCreative: _c, ...p }: { isCreative: boolean; userId: string; name: string; avatar: string | null; roleIds: string[] }) => p);
    });
    setMembersSeeded(true);
  }, [editing, membersSeeded, artistForSeed, rolesFetched, roleCategories, isRelease, releaseCatFetched, releaseCatalogForSeed]);

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

  // Sheet mode blocks the background page; page mode scrolls normally.
  useEffect(() => {
    if (asPage) return;
    lockScroll();
    return () => unlockScroll();
  }, [asPage]);

  // Debounced user search
  useEffect(() => {
    const q = search.trim();
    if (q.length < 1) {
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

  // Snapshot of what «Подтянуть» filled + the platform it came from. Lets us drop
  // that prefill if the link is later switched to a different service (so we never
  // save one service's cover/title/date under another service's link).
  const metaRef = useRef<{ platform: string | null; title: string; coverUrl: string; releaseDate: string }>(
    { platform: null, title: '', coverUrl: '', releaseDate: '' },
  );

  // ── Metadata prefill ──────────────────────────────────────────────────────
  const metaMut = useMutation({
    mutationFn: () => api.fetchMetadata(detectedPlatform ?? '', url.trim()),
    onSuccess: (res: any) => {
      const data = res?.data ?? {};
      const filledTitle = data.title ?? '';
      const filledCover = data.coverUrl ?? '';
      const filledDate = isRelease && data.releaseDate ? String(data.releaseDate).slice(0, 10) : '';
      if (filledTitle) setTitle(filledTitle);
      if (filledCover) setCoverUrl(filledCover);
      if (filledDate) { setReleaseDate(filledDate); setReleaseDateInput(isoToMasked(filledDate)); }
      metaRef.current = { platform: detectedPlatform, title: filledTitle, coverUrl: filledCover, releaseDate: filledDate };
      if (!data.title && !data.coverUrl) {
        setFetchError('Не удалось подтянуть данные — заполните вручную.');
      } else {
        setFetchError('');
      }
    },
    onError: () => setFetchError('Не удалось подтянуть данные — заполните вручную.'),
  });

  // If the link is changed to a DIFFERENT platform after a prefill, wipe the fields
  // that still hold the previous service's fetched values (untouched ones only —
  // anything the user edited by hand is kept).
  useEffect(() => {
    const m = metaRef.current;
    if (!m.platform || !detectedPlatform || detectedPlatform === m.platform) return;
    setTitle((t) => (t === m.title ? '' : t));
    setCoverUrl((c) => (c === m.coverUrl ? '' : c));
    if (isRelease) {
      setReleaseDate((d) => (d === m.releaseDate ? '' : d));
      setReleaseDateInput((di) => (di === (m.releaseDate ? isoToMasked(m.releaseDate) : '') ? '' : di));
    }
    metaRef.current = { platform: null, title: '', coverUrl: '', releaseDate: '' };
  }, [detectedPlatform, isRelease]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      const participantsPayload = participants.map((p) => ({ userId: p.userId, roleIds: p.roleIds }));
      if (editing) {
        return api.update(initial!.id, {
          platform: detectedPlatform as any,
          url: url.trim(),
          title: title.trim(),
          coverUrl: coverUrl.trim() ? coverUrl.trim() : null,
          ...(isRelease ? { releaseDate: releaseDate ? releaseDate : null } : {}),
          participants: participantsPayload,
        } as any);
      }
      return api.create({
        artistId,
        platform: detectedPlatform as any,
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

  const handleSave = () => {
    if (!detectedPlatform) {
      toast.error('Вставьте ссылку на поддерживаемый сервис');
      return;
    }
    if (isRelease && releaseDateInput.trim() && !releaseDate) {
      toast.error('Дата релиза — в формате ДД.ММ.ГГГГ');
      return;
    }
    if (isRelease && releaseDate && isNaN(new Date(releaseDate).getTime())) {
      toast.error('Некорректная дата релиза');
      return;
    }
    if (isRelease && releaseDate && releaseDate > todayStr) {
      toast.error('Дата релиза не может быть позже сегодняшнего дня');
      return;
    }
    setSaveError('');
    saveMut.mutate();
  };
  const saveDisabled = saveMut.isPending || !title.trim() || !detectedPlatform;

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

  // Form fields — shared between the bottom-sheet and page variants.
  const formFields = (
    <>
      {/* URL + fetch — platform is auto-detected from the link */}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Ссылка <span className="text-red-400">*</span></label>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={() => { setFetchError(''); metaMut.mutate(); }}
            disabled={metaMut.isPending || !detectedPlatform}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {metaMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Подтянуть
          </button>
        </div>
        {/* Auto-detected platform / invalid-link hint */}
        {detectedPlatform ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1.5">
            <Check size={12} className="flex-shrink-0" />
            Платформа: {MEDIA_PLATFORM_LABELS[detectedPlatform] ?? detectedPlatform}
          </p>
        ) : urlInvalid ? (
          <p className="text-xs text-red-400 mt-1.5 leading-snug">
            Ссылка должна вести на поддерживаемый сервис: {allowedPlatformLabels(kind).join(', ')}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
            Платформа определится автоматически. Поддерживаются: {allowedPlatformLabels(kind).join(', ')}
          </p>
        )}
        {fetchError && <p className="text-xs text-amber-400 mt-1">{fetchError}</p>}
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Название <span className="text-red-400">*</span></label>
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
            type="text"
            inputMode="numeric"
            placeholder="ДД.ММ.ГГГГ"
            maxLength={10}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-primary-500"
            value={releaseDateInput}
            onChange={(e) => {
              let v = e.target.value.replace(/\D/g, '');
              if (v.length >= 3) v = v.slice(0, 2) + '.' + v.slice(2);
              if (v.length >= 6) v = v.slice(0, 5) + '.' + v.slice(5);
              v = v.slice(0, 10);
              setReleaseDateInput(v);
              setReleaseDate(v.length === 10 ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}` : '');
            }}
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
        {search.trim().length >= 1 && (
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
                  {p.roleIds.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.roleIds.map((id) => (
                        <span key={id} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] leading-tight">
                          {roleNameById.get(id) ?? id}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Роли не выбраны</p>
                  )}
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
    </>
  );

  // RolePicker overlay for the currently-edited participant (both variants).
  const rolePickerEl = rolePickerUserId ? (
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
  ) : null;

  // ── Page variant: inline form + sticky Отмена/Сохранить (как ArtistEditPage) ──
  if (asPage) {
    return (
      <>
        <div className="space-y-4">{formFields}</div>

        <div
          className="sticky bottom-0 -mx-4 px-4 pt-3 pb-2 mt-4 bg-slate-950/95 border-t border-slate-800/60 flex gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-2xl transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saveDisabled}
            className="flex-1 py-3 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-1.5"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        </div>

        {rolePickerEl}
      </>
    );
  }

  // ── Sheet variant (edit flows on ReleasePage/ClipPage etc.) ────────────────
  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl flex flex-col"
            style={{
              maxHeight: '92dvh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
                onClick={handleSave}
                disabled={saveDisabled}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Сохранить
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              {formFields}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {rolePickerEl}
    </>
  );
}
