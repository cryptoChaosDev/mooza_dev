import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, ExternalLink,
  Camera, Navigation, Edit3, X, Save, Loader2,
  ShieldCheck, Clock, ShieldX, CheckCircle2, Send,
  UserPlus, Trash2, Search,
} from 'lucide-react';
import { artistAPI, referenceAPI, groupAPI, friendshipAPI } from '../lib/api';
import { plural } from '../lib/plural';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import { avatarUrl } from '../lib/avatar';
import { SocialIconRow, SocialLinksEditor } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import SelectSheet from '../components/SelectSheet';
import ShareButton from '../components/ShareButton';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

function resolveUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_URL}${path}`;
}

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

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [proofUrl, setProofUrl] = useState('');
  const [form, setForm] = useState<EditForm>({
    name: '', type: '', city: '', tourReady: '', description: '',
    bandLink: '', listeners: '', genreIds: [], socialLinks: {},
  });
  const [genreSheetOpen, setGenreSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  // Invite member state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteProfessionId, setInviteProfessionId] = useState('');
  const [inviteFriendSearch, setInviteFriendSearch] = useState('');
  const [inviteProfSearch, setInviteProfSearch] = useState('');

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(id!);
      return data;
    },
    enabled: !!id,
  });

  const { data: genreOptions = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data } = await referenceAPI.getGenres();
      return data as { id: string; name: string }[];
    },
  });

  const isGroup = artist?.type === 'GROUP' || artist?.type === 'COVER_GROUP';
  const isOwner = !!currentUser && artist?.submittedById === currentUser.id;

  const { data: friendsList = [] } = useQuery({
    queryKey: ['friends-list'],
    queryFn: async () => {
      const { data } = await friendshipAPI.getFriends();
      return (data as { friendshipId: string; user: { id: string; firstName: string; lastName: string; avatar?: string } }[])
        .map(f => f.user);
    },
    enabled: showInviteModal && isOwner,
  });

  const { data: allProfessions = [] } = useQuery({
    queryKey: ['all-professions'],
    queryFn: async () => {
      const { data } = await referenceAPI.getAllReferences();
      return (data?.professions ?? []) as { id: string; name: string }[];
    },
    enabled: showInviteModal && isOwner,
  });

  // Lock body scroll when modal is open (iOS-compatible)
  useEffect(() => {
    if (isEditing) lockScroll();
    else unlockScroll();
    return () => unlockScroll();
  }, [isEditing]);

  // Populate form when opening edit
  useEffect(() => {
    if (isEditing && artist) {
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
    }
  }, [isEditing, artist]);

  const followMut = useMutation({
    mutationFn: () => artistAPI.follow(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const unfollowMut = useMutation({
    mutationFn: () => artistAPI.unfollow(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const uploadAvatarMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadAvatar(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const uploadBannerMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadBanner(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const submitMut = useMutation({
    mutationFn: () => artistAPI.submitForModeration(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const submitProofMut = useMutation({
    mutationFn: () => artistAPI.submitProof(id!, proofUrl),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artist', id] }); setProofUrl(''); },
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
      setIsEditing(false);
    },
  });

  const inviteMut = useMutation({
    mutationFn: () => groupAPI.invite(id!, inviteFriendId, inviteProfessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      setShowInviteModal(false);
      setInviteFriendId('');
      setInviteProfessionId('');
      setInviteFriendSearch('');
      setInviteProfSearch('');
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (membershipId: string) => groupAPI.removeMember(id!, membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const set = (key: keyof EditForm, value: string | string[] | Record<string, string>) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Filtered lists for invite modal — must be before early returns
  const filteredFriends = useMemo(() => {
    const memberIds = new Set((artist?.members ?? []).map((m: any) => m.id));
    const q = inviteFriendSearch.toLowerCase();
    return friendsList.filter((f: any) =>
      !memberIds.has(f.id) &&
      `${f.firstName} ${f.lastName}`.toLowerCase().includes(q)
    );
  }, [friendsList, artist?.members, inviteFriendSearch]);

  const filteredProfessions = useMemo(() => {
    const q = inviteProfSearch.toLowerCase();
    return allProfessions.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [allProfessions, inviteProfSearch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-slate-400">Артист не найден</p>
        <button onClick={() => navigate(-1)} className="text-primary-400 text-sm">Назад</button>
      </div>
    );
  }

  const isMemberOfArtist = artist.members?.some(
    (m: { id: string; inviteStatus: string }) => m.id === currentUser?.id && m.inviteStatus === 'ACCEPTED'
  );
  const hasSocialLinks =
    artist.socialLinks && Object.values(artist.socialLinks as Record<string, string>).some(Boolean);

  const bannerSrc = resolveUrl(artist.banner);
  const avatarSrc = avatarUrl(artist.avatar);

  // ── Edit modal ───────────────────────────────────────────────────────────────
  function EditModal() {
    return (
      <>
      <div
        className="fixed inset-0 z-50 bg-black/70"
        onClick={() => setIsEditing(false)}
      >
        <div
          className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl flex flex-col"
          style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-600" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
            <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <span className="font-semibold text-white text-sm">Редактировать коллектив</span>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Сохранить
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

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

            {/* Город */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Город</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Москва"
              />
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

            {/* Описание */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Описание</label>
              <textarea
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500 resize-none"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="О коллективе..."
              />
            </div>

            {/* Жанры */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Жанры</label>
              <button
                type="button"
                onClick={() => setGenreSheetOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
              >
                <span className={form.genreIds.length ? 'text-white' : 'text-slate-500'}>
                  {form.genreIds.length
                    ? genreOptions.filter((g) => form.genreIds.includes(g.id)).map((g) => g.name).join(', ')
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                value={form.listeners}
                onChange={(e) => set('listeners', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            {/* Ссылка BandLink */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ссылка на страницу группы</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
                value={form.bandLink}
                onChange={(e) => set('bandLink', e.target.value)}
                placeholder="https://band.link/..."
              />
            </div>

            {/* Соцсети */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Социальные сети</label>
              <SocialLinksEditor
                value={form.socialLinks}
                onChange={(v) => set('socialLinks', v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sheets rendered outside overlay so fixed positioning works correctly */}
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

      <SelectSheet
        isOpen={genreSheetOpen}
        onClose={() => setGenreSheetOpen(false)}
        title="Жанры"
        options={genreOptions}
        selectedIds={form.genreIds}
        onSelect={(v) => { set('genreIds', v as string[]); }}
        mode="multiple"
        showConfirm
        height="full"
      />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
      {/* ── Header banner ── */}
      <div className="relative w-full h-32 bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {bannerSrc && (
          <img src={bannerSrc} alt="banner" className="w-full h-full object-cover" />
        )}

        {/* Back button — fixed so it stays visible on scroll */}
        <button
          onClick={() => navigate(-1)}
          className="fixed top-[72px] left-4 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        {/* Top-right actions */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <ShareButton url={`/artist/${id}`} title={artist?.name} />
          {isOwner && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
            >
              <Edit3 size={16} className="text-white" />
            </button>
          )}
          {currentUser && !isMemberOfArtist && (
            <button
              onClick={() => {
                if (artist.isFollowed) unfollowMut.mutate();
                else followMut.mutate();
              }}
              disabled={followMut.isPending || unfollowMut.isPending}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                artist.isFollowed
                  ? 'bg-slate-700/80 text-slate-200 border border-slate-600'
                  : 'bg-primary-600 text-white'
              }`}
            >
              {artist.isFollowed ? 'Отписаться' : 'Подписаться'}
            </button>
          )}
        </div>

        {/* Banner camera button */}
        {isOwner && (
          <>
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="absolute bottom-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"
            >
              <Camera size={15} className="text-white" />
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadBannerMut.mutate(file);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {/* ── Avatar ── */}
      <div className="relative px-4 -mt-14 mb-4 flex items-end">
        <div className="relative flex-shrink-0">
          <div className="w-28 h-28 rounded-full border-4 border-slate-950 overflow-hidden bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-xl">
            {avatarSrc ? (
              <img src={avatarSrc} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-3xl">
                {artist.name?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          {isMemberOfArtist && (
            <>
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center shadow"
              >
                <Camera size={13} className="text-white" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatarMut.mutate(file);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4">

        {/* Name + type badge + status */}
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h1 className="text-2xl font-bold text-white leading-tight">{artist.name}</h1>
          {artist.type && TYPE_LABELS[artist.type] && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-300 border border-primary-500/30">
              {TYPE_LABELS[artist.type]}
            </span>
          )}
          {artist.status === 'VERIFIED' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
              <ShieldCheck size={11} /> Верифицирован
            </span>
          )}
          {artist.status === 'PENDING' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock size={11} /> На модерации
            </span>
          )}
          {artist.status === 'APPROVED' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <CheckCircle2 size={11} /> Одобрен
            </span>
          )}
        </div>

        {/* City + tour readiness */}
        {(artist.city || artist.tourReady) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-400 mb-1">
            {artist.city && (
              <span className="flex items-center gap-1">
                <MapPin size={12} className="flex-shrink-0" />
                {artist.city}
              </span>
            )}
            {artist.tourReady && (
              <span className="flex items-center gap-1">
                <Navigation size={12} className="flex-shrink-0" />
                {artist.tourReady}
              </span>
            )}
          </div>
        )}

        {/* Stats — compact inline */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
          <span><span className="font-semibold text-slate-300">{artist.followersCount ?? 0}</span> {plural(artist.followersCount ?? 0, 'подписчик', 'подписчика', 'подписчиков')}</span>
          {(artist.members?.length ?? 0) > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{artist.members.length}</span> {plural(artist.members.length, 'участник', 'участника', 'участников')}</span></>}
          {(artist.listeners ?? 0) > 0 && <><span className="text-slate-700">·</span><span><span className="font-semibold text-slate-300">{Number(artist.listeners).toLocaleString('ru-RU')}</span> {plural(Number(artist.listeners), 'слушатель', 'слушателя', 'слушателей')}</span></>}
        </div>

        {/* Moderation panel for members */}
        {isMemberOfArtist && (
          <>
            {(artist.status === 'DRAFT' || artist.status === 'REJECTED') && (
              <div className={`mb-4 p-3 rounded-xl border ${artist.status === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                {artist.status === 'REJECTED' && artist.rejectionReason && (
                  <p className="text-xs text-red-400 mb-2 flex items-start gap-1.5">
                    <ShieldX size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Отклонено: {artist.rejectionReason}</span>
                  </p>
                )}
                <p className="text-xs text-slate-400 mb-2">
                  {artist.status === 'DRAFT'
                    ? 'Карточка не опубликована. Отправьте на проверку, чтобы она появилась в каталоге.'
                    : 'Карточка была отклонена. Исправьте данные и отправьте снова.'}
                </p>
                <button
                  onClick={() => submitMut.mutate()}
                  disabled={submitMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {submitMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Отправить на модерацию
                </button>
              </div>
            )}

            {artist.status === 'APPROVED' && (
              <div className="mb-4 p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
                <p className="text-xs text-sky-300 font-medium mb-1">Карточка одобрена — верифицируйте коллектив</p>
                <p className="text-xs text-slate-400 mb-2">
                  Опубликуйте этот код в официальных соцсетях коллектива и пришлите ссылку на публикацию:
                </p>
                <div className="flex items-center gap-2 mb-3 p-2 bg-slate-900 rounded-lg">
                  <code className="text-sm font-mono font-bold text-primary-400 tracking-wider flex-1">
                    {artist.verificationCode}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(artist.verificationCode)}
                    className="text-slate-500 hover:text-white text-xs px-2 py-0.5 bg-slate-800 rounded transition-colors"
                  >
                    Копировать
                  </button>
                </div>
                {artist.verificationProofUrl ? (
                  <p className="text-xs text-slate-400">
                    Ссылка отправлена на проверку. Ожидайте подтверждения администратора.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={proofUrl}
                      onChange={e => setProofUrl(e.target.value)}
                      placeholder="Ссылка на публикацию..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                    />
                    <button
                      onClick={() => submitProofMut.mutate()}
                      disabled={!proofUrl.trim() || submitProofMut.isPending}
                      className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {submitProofMut.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Отправить'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Description */}
        {artist.description && (
          <p className="text-slate-300 text-sm leading-relaxed mb-4 border-l-2 border-primary-500/40 pl-3">
            {artist.description}
          </p>
        )}

        {/* Жанры */}
        {(artist.genres?.length ?? 0) > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Жанры</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((g: { id: string; name: string }) => (
                <span key={g.id} className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium">
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Контакты */}
        {(hasSocialLinks || artist.bandLink) && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Контакты</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            {artist.bandLink && (
              <a
                href={artist.bandLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary-400 text-sm hover:underline mb-2"
              >
                <ExternalLink size={14} className="flex-shrink-0" />
                <span className="truncate">{artist.bandLink}</span>
              </a>
            )}
            {hasSocialLinks && <SocialIconRow links={(artist.socialLinks as Record<string, string>) || {}} labeled />}
          </div>
        )}

        {/* Участники */}
        {(isGroup || (artist.members?.length ?? 0) > 0) && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Состав</span>
              <div className="flex-1 h-px bg-slate-800" />
              {isOwner && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  <UserPlus size={13} />
                  Пригласить
                </button>
              )}
            </div>

            {(artist.members?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-600 italic">Участников пока нет</p>
            ) : (
              <div className="space-y-2">
                {artist.members.map((m: any) => (
                  <div key={m.membershipId} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <button onClick={() => navigate(`/profile/${m.id}`)} className="flex-shrink-0">
                      <AvatarComponent src={m.avatar} name={`${m.firstName} ${m.lastName}`} size={40} />
                    </button>
                    <div className="flex-1 min-w-0" onClick={() => navigate(`/profile/${m.id}`)}>
                      <p className="text-sm font-medium text-white truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {m.isOwner ? 'Владелец' : (m.profession?.name ?? '—')}
                      </p>
                    </div>
                    {m.inviteStatus === 'PENDING' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md flex-shrink-0">ожидает</span>
                    )}
                    {isOwner && !m.isOwner && (
                      <button
                        onClick={() => removeMemberMut.mutate(m.membershipId)}
                        disabled={removeMemberMut.isPending}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Follow/Unfollow for members */}
        {currentUser && isMemberOfArtist && (
          <button
            onClick={() => {
              if (artist.isFollowed) unfollowMut.mutate();
              else followMut.mutate();
            }}
            disabled={followMut.isPending || unfollowMut.isPending}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors mb-4 ${
              artist.isFollowed
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
            }`}
          >
            {artist.isFollowed ? 'Отписаться' : 'Подписаться на коллектив'}
          </button>
        )}
      </div>

      {/* ── Edit modal ── */}
      {isEditing && EditModal()}

      {/* ── Invite member modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
            <button onClick={() => setShowInviteModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-base font-semibold text-white flex-1">Пригласить участника</h2>
            <button
              onClick={() => inviteMut.mutate()}
              disabled={!inviteFriendId || !inviteProfessionId || inviteMut.isPending}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              {inviteMut.isPending && <Loader2 size={14} className="animate-spin" />}
              Пригласить
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* Step 1: Choose friend */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">1. Выберите друга</p>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={inviteFriendSearch}
                  onChange={e => setInviteFriendSearch(e.target.value)}
                  placeholder="Поиск по имени..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500"
                />
              </div>
              {filteredFriends.length === 0 ? (
                <p className="text-xs text-slate-600 italic py-2">Нет друзей для приглашения</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredFriends.map((f: any) => (
                    <button
                      key={f.id}
                      onClick={() => setInviteFriendId(f.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left ${
                        inviteFriendId === f.id
                          ? 'bg-primary-500/10 border-primary-500/40'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <AvatarComponent src={f.avatar} name={`${f.firstName} ${f.lastName}`} size={36} />
                      <span className="text-sm text-white">{f.firstName} {f.lastName}</span>
                      {inviteFriendId === f.id && <CheckCircle2 size={16} className="text-primary-400 ml-auto flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="px-4 py-3">
              <div className="h-px bg-slate-800" />
            </div>

            {/* Step 2: Choose role (profession) */}
            <div className="px-4 pb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">2. Выберите роль</p>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={inviteProfSearch}
                  onChange={e => setInviteProfSearch(e.target.value)}
                  placeholder="Поиск роли (гитарист, вокалист...)..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500"
                />
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {filteredProfessions.slice(0, 40).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setInviteProfessionId(p.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors text-left ${
                      inviteProfessionId === p.id
                        ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm">{p.name}</span>
                    {inviteProfessionId === p.id && <CheckCircle2 size={15} className="text-primary-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary footer */}
          {(inviteFriendId || inviteProfessionId) && (
            <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/80 flex-shrink-0 text-sm text-slate-400">
              {inviteFriendId && (
                <span className="text-white font-medium">
                  {friendsList.find((f: any) => f.id === inviteFriendId)?.firstName}
                </span>
              )}
              {inviteFriendId && inviteProfessionId && <span className="mx-1">—</span>}
              {inviteProfessionId && (
                <span>{allProfessions.find((p: any) => p.id === inviteProfessionId)?.name}</span>
              )}
            </div>
          )}

          {inviteMut.isError && (
            <p className="px-4 py-2 text-sm text-red-400 bg-red-500/5 border-t border-red-500/20">
              Ошибка. Попробуйте снова.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
