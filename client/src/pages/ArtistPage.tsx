import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin,
  Camera, Navigation, Edit3, X, Loader2,
  ShieldCheck, Clock, ShieldX, CheckCircle2, Send,
  UserPlus, Trash2,
  Settings, Link2, Tag, Crown, Shield, UserCog, UserCheck, UserX,
  UserRound, Users, Disc3, Clapperboard, Briefcase, Activity, ChevronRight, Lock,
} from 'lucide-react';
import { artistAPI, releaseAPI, clipAPI, vacancyAPI } from '../lib/api';
import { workFormatLabel } from '../lib/vacancyOptions';
import { useScrollLock } from '../lib/scrollLock';
import { avatarUrl } from '../lib/avatar';
import { copyText, artistHref } from '../lib/artistUtils';
import { SocialIconRow, CONTACT_KEYS } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import SelectSheet from '../components/SelectSheet';
import RolePicker from '../components/RolePicker';
import ConfirmDialog from '../components/ConfirmDialog';
import MediaRail from '../components/MediaRail';
import ArtistYandexBlocks from '../components/ArtistYandexBlocks';
import { useAuthStore } from '../stores/authStore';
import { classifyUrl, BLOCK_MESSAGE } from '../lib/socialPlatforms';
import ImageCropModal, { blobToFile } from '../components/ImageCropModal';
import CoverImage from '../components/CoverImage';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { useAuthGate, openAuthGate } from '../components/AuthGateModal';
import { personName, personHref } from '../lib/publicPerson';
import { useSeo, seoTitle, seoDescription, robotsFor, SITE_ORIGIN } from '../lib/seo';
import { trackGuestView } from '../lib/metrika';
import { collectArtistLinks } from '../components/artist/linkPlatforms';
import { trackArtistViewOnce } from '../components/artist/artistTracking';
import { ArtistListenBlock, ArtistSocialRow, ArtistLatestRelease, type ReleaseLite } from '../components/artist/ArtistListen';
import ArtistConcerts from '../components/artist/ArtistConcerts';
import ArtistCtaRow from '../components/artist/ArtistCtaRow';
import ArtistQrModal from '../components/artist/ArtistQrModal';
import ArtistBioStats from '../components/artist/ArtistBioStats';
import VerificationPushHint from '../components/artist/VerificationPushHint';

const ACTIVITY_OPTIONS = [
  { id: 'ACTIVE',    name: 'Действующий' },
  { id: 'INACTIVE',  name: 'Неактивный' },
  { id: 'ARCHIVED',  name: 'Архивный' },
  { id: 'DISBANDED', name: 'Распался' },
];
const ACTIVITY_LABELS: Record<string, string> = Object.fromEntries(ACTIVITY_OPTIONS.map(o => [o.id, o.name]));

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

// What each verification status means + the owner's next step. Shown under the
// status badge to the artist's owner/admins.
const ARTIST_STATUS_DESC: Record<string, string> = {
  DRAFT: 'Черновик: профиль ещё не отправлен на верификацию. Заполните данные, добавьте участников и отправьте код верификации в соцсети.',
  PENDING: 'На модерации: заявка отправлена и ожидает проверки. Мы сверим публикацию с кодом и уведомим о результате.',
  REJECTED: 'Отклонён: заявка не прошла проверку. Посмотрите причину ниже, исправьте данные и отправьте повторно.',
  // VERIFIED: без пояснения — значок у названия говорит сам за себя.
  APPROVED: 'Одобрен модератором.',
};

function resolveUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_URL}${path}`;
}

function pluralMembers(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'участник';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'участника';
  return 'участников';
}

export default function ArtistPage() {
  // Адрес — /artist/<slug> (человекочитаемый) или /artist/<uuid> (старые ссылки):
  // сервер принимает оба и прежние слаги, а страница после загрузки меняет адрес
  // на канонический /artist/<slug>. Подстраницы (/artist/:id/edit и т.п.) и все
  // запросы к API — по id из ответа.
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Image cropping (avatar / banner) before upload
  const [cropAvatarFile, setCropAvatarFile] = useState<File | null>(null);
  const [cropBannerFile, setCropBannerFile] = useState<File | null>(null);

  const [proofUrl, setProofUrl] = useState('');
  const [verifyUnmet, setVerifyUnmet] = useState<string[]>([]);

  // ── Phase 5b state ─────────────────────────────────────────────────────────
  // Нижний лист «Управление артистом» (шестерёнка)
  const [showManageSheet, setShowManageSheet] = useState(false);

  // Точечное редактирование карточки «Об артисте» — остаётся инлайн.
  // Жанры/контакты/участники/приглашения/релизы/клипы/вакансии — отдельные
  // страницы /artist/:id/… (единая механика «форма = отдельная страница»).
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');

  // Per-member role editing
  const [roleEditMembershipId, setRoleEditMembershipId] = useState<string | null>(null);
  const [roleEditSeed, setRoleEditSeed] = useState<string[]>([]);

  // Confirm dialogs
  const [removeMembershipId, setRemoveMembershipId] = useState<string | null>(null);
  const [transferOwnerUserId, setTransferOwnerUserId] = useState<string | null>(null);
  const [removeAdminUserId, setRemoveAdminUserId] = useState<string | null>(null);

  // Owner/admin picker dialogs (within admin block)
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showAdminPicker, setShowAdminPicker] = useState(false);

  // Activity status sheet
  const [activitySheetOpen, setActivitySheetOpen] = useState(false);

  // Визитка: модалка QR-кода страницы артиста
  const [showQr, setShowQr] = useState(false);

  // iOS: любой открытый нижний лист/оверлей страницы блокирует фон.
  // (RolePicker/SelectSheet/ConfirmDialog лочат скролл сами — лок ref-counted.)
  useScrollLock(showOwnerPicker || showAdminPicker || showManageSheet);

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', idOrSlug],
    queryFn: async () => {
      const { data } = await artistAPI.getArtist(idOrSlug!);
      return data;
    },
    enabled: !!idOrSlug,
    retry: (count, e: any) => e?.response?.status !== 404 && count < 1,
  });
  const id: string | undefined = artist?.id;

  // Открыт по uuid или прежнему слагу → заменить адрес на /artist/<slug>
  // (без новой записи в истории; данные уже в кэше под новым ключом).
  useEffect(() => {
    const slug: string | null | undefined = artist?.slug;
    if (!slug || !idOrSlug || idOrSlug === slug) return;
    queryClient.setQueryData(['artist', slug], artist);
    navigate(`${artistHref(artist)}${location.search}${location.hash}`, { replace: true, state: location.state });
  }, [artist, idOrSlug, location.search, location.hash, location.state, navigate, queryClient]);

  // Кэш карточки лежит под ключом из адреса (слаг) — сбрасываем и его, и ключ по id
  // (страницы редактирования /artist/:id/… работают с ['artist', id]).
  const invalidateArtist = () => queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'artist' && (q.queryKey[1] === idOrSlug || q.queryKey[1] === id),
  });

  const gate = useAuthGate();
  const isGuest = !currentUser;
  useEffect(() => { if (id) trackGuestView('artist', id); }, [id]);
  const artistIndexable = artist?.status === 'VERIFIED' || artist?.status === 'APPROVED';
  const artistTypeLabel = artist?.type ? (TYPE_LABELS[artist.type] ?? null) : null;
  useSeo({
    title: artist ? seoTitle(artist.name, [artistTypeLabel ?? 'артист', artist.city].filter(Boolean).join(', ')) : seoTitle('Артист'),
    description: artist
      ? seoDescription(artist.description)
        || seoDescription(`${artist.name} — ${(artistTypeLabel ?? 'артист').toLowerCase()}${artist.city ? ` из города ${artist.city}` : ''}${(artist.genres?.length ?? 0) > 0 ? `. Жанры: ${artist.genres.map((g: any) => g.name).join(', ')}` : ''}. Состав, релизы и клипы на Moooza.`)
      : null,
    canonical: artist ? artistHref(artist) : `/artist/${idOrSlug}`,
    // DRAFT/PENDING — с бейджем, но noindex (план, раздел A).
    robots: robotsFor(artist, artistIndexable),
  });

  // ── Phase 6b: releases & clips lists ──────────────────────────────────────
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', 'artist', id],
    queryFn: async () => {
      const { data } = await releaseAPI.listByArtist(id!);
      // Сервер отдаёт свежие сверху (по дате релиза, без даты — в конце).
      return data as ReleaseLite[];
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

  // ── Vacancies owned by this artist (owner/admin-visible) ───────────────────
  // getMine is owner-scoped on the server (assertArtistOwner → 403 otherwise),
  // so only fetch once we know the viewer is an admin/owner of this artist.
  const { data: myVacancies = [] } = useQuery<any[]>({
    queryKey: ['vacancies', 'mine', id],
    queryFn: async () => {
      const { data } = await vacancyAPI.getMine({ artistId: id! });
      return data as any[];
    },
    enabled: !!id && !!(artist as any)?.viewerIsAdmin,
  });

  // Права — ТОЛЬКО по флагам сервера (подтверждённый владелец/админ артиста;
  // владелец ≥ админ). Никаких выводов из submittedById / legacy members[].
  const canAdminArtist = !!(artist as any)?.viewerIsAdmin || !!(artist as any)?.viewerIsOwner;

  // Статистика визитки: просмотр — один на сессию вкладки; свои заходы админов
  // артиста не считаем.
  useEffect(() => {
    if (id && !canAdminArtist) trackArtistViewOnce(id);
  }, [id, canAdminArtist]);

  // Площадки «Слушать» и соцсети — из socialLinks/bandLink (контакты не входят).
  const bioLinks = useMemo(
    () => collectArtistLinks(artist?.socialLinks, artist?.bandLink),
    [artist?.socialLinks, artist?.bandLink],
  );

  const favInvalidate = () => {
    invalidateArtist();
    queryClient.invalidateQueries({ queryKey: ['followed-artists'] });
  };
  const followMut = useMutation({
    mutationFn: () => artistAPI.follow(id!),
    onSuccess: favInvalidate,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось добавить в избранное')),
  });

  const unfollowMut = useMutation({
    mutationFn: () => artistAPI.unfollow(id!),
    onSuccess: favInvalidate,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось убрать из избранного')),
  });

  const uploadAvatarMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadAvatar(id!, file),
    onSuccess: () => invalidateArtist(),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось загрузить аватар')),
  });

  // Точечное сохранение поля карточки «Об артисте» — PUT принимает
  // частичные данные, непереданные поля не меняются.
  const patchMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => artistAPI.updateArtist(id!, payload),
    onSuccess: () => {
      invalidateArtist();
      setEditingAbout(false);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить')),
  });

  const uploadBannerMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadBanner(id!, file),
    onSuccess: () => invalidateArtist(),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось загрузить обложку')),
  });

  const requestVerifyMut = useMutation({
    mutationFn: () => artistAPI.requestVerification(id!, proofUrl),
    onSuccess: () => {
      invalidateArtist(); setProofUrl(''); setVerifyUnmet([]);
      toast.success('Заявка отправлена — модератор проверит её в ближайшее время');
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data?.error === 'CONDITIONS_NOT_MET' && Array.isArray(data.unmet)) {
        setVerifyUnmet(data.unmet);
      } else {
        setVerifyUnmet([data?.error || 'Не удалось отправить запрос']);
      }
    },
  });

  const withdrawMut = useMutation({
    mutationFn: () => artistAPI.withdrawVerification(id!),
    onSuccess: () => invalidateArtist(),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отозвать заявку')),
  });

  // Заявки на вступление — только тем, кто может их решать (владелец/админ):
  // остальным запрос не шлём вовсе (раньше у приглашённых участников был 403 в консоли).
  const { data: pendingMembers = [] } = useQuery<any[]>({
    queryKey: ['artist-pending-members', id],
    queryFn: () => artistAPI.pendingMemberships(id!).then((r: any) => r.data),
    enabled: !!id && canAdminArtist,
    retry: false,
  });

  const approveMemberMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.approveMembership(membershipId),
    onSuccess: () => {
      invalidateArtist();
      queryClient.invalidateQueries({ queryKey: ['artist-pending-members', id] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось подтвердить заявку')),
  });
  const rejectMemberMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.rejectMembership(membershipId),
    onSuccess: () => {
      invalidateArtist();
      queryClient.invalidateQueries({ queryKey: ['artist-pending-members', id] });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отклонить заявку')),
  });


  // ── Phase 5b: mutations ────────────────────────────────────────────────────
  // The viewer's own pending invitation: confirm / decline.
  const confirmInviteMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.confirmMembership(membershipId),
    onSuccess: () => invalidateArtist(),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось подтвердить участие')),
  });
  const declineInviteMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.declineMembership(membershipId),
    onSuccess: () => invalidateArtist(),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отклонить приглашение')),
  });

  const setParticipationMut = useMutation({
    mutationFn: (vars: { membershipId: string; status: 'ACTIVE_MEMBER' | 'FORMER_MEMBER' }) =>
      artistAPI.setMemberParticipation(id!, vars.membershipId, vars.status),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус участника')),
  });

  const setRolesMut = useMutation({
    mutationFn: (vars: { membershipId: string; roleIds: string[] }) =>
      artistAPI.setMemberRoles(id!, vars.membershipId, vars.roleIds),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить роли')),
  });

  const removeMember5bMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.removeMember(id!, membershipId),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить участника')),
  });

  const setActivityMut = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DISBANDED') =>
      artistAPI.setActivityStatus(id!, status),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось изменить статус активности')),
  });

  const transferOwnerNewMut = useMutation({
    mutationFn: (userId: string) => artistAPI.transferOwner(id!, userId),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сменить владельца')),
  });

  const addAdminMut = useMutation({
    mutationFn: (userId: string) => artistAPI.addAdmin(id!, userId),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось добавить администратора')),
  });

  const removeAdminMut = useMutation({
    mutationFn: (userId: string) => artistAPI.removeAdmin(id!, userId),
    onSuccess: invalidateArtist,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось снять администратора')),
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

  // Карточка «Контакты» — только контактные ключи (телефон/почта/Telegram для
  // связи); площадки и соцсети — в блоках визитки выше. Гостю контакты сервер
  // не отдаёт (только флаг contactsAvailable).
  const contactLinks: Record<string, string> = Object.fromEntries(
    Object.entries((artist.socialLinks ?? {}) as Record<string, unknown>)
      .filter(([k, v]) => (CONTACT_KEYS as string[]).includes(k) && typeof v === 'string' && !!v.trim()),
  ) as Record<string, string>;
  const hasContactLinks = Object.keys(contactLinks).length > 0;

  const bannerSrc = resolveUrl(artist.banner);
  const avatarSrc = avatarUrl(artist.avatar);
  // Публичный адрес визитки — для «Поделиться», QR и шапки профиля в соцсетях.
  const bioUrl = `${SITE_ORIGIN}${artistHref(artist)}`;

  // ── Phase 5b derived data ──────────────────────────────────────────────────
  // Owner/admin gating from the backend (preferred over legacy member-flag scan).
  const viewerIsOwner: boolean = !!artist.viewerIsOwner;
  const viewerIsAdmin: boolean = !!artist.viewerIsAdmin || viewerIsOwner;

  const confirmedMembers: any[] = artist.confirmedMembers ?? [];
  // Подтверждённый участник (любой) — для звезды «в избранное» (своих не добавляют).
  const isMemberOfArtist = !!currentUser && confirmedMembers.some((m) => m.user?.id === currentUser.id);
  const pendingMembers5b: any[] = artist.pendingMembers ?? [];
  const activeMembers = confirmedMembers.filter((m) => m.participationStatus === 'ACTIVE_MEMBER');
  const formerMembers = confirmedMembers.filter((m) => m.participationStatus === 'FORMER_MEMBER');
  // Owner = the confirmed member flagged isOwner (единственный источник истины).
  const ownerMember = confirmedMembers.find((m) => m.isOwner) ?? null;
  const adminMembers = confirmedMembers.filter((m) => m.isAdmin);
  // Viewer is an active confirmed member (used to gate the gear button)
  const viewerIsActiveMember = !!currentUser && confirmedMembers.some(
    (m) => m.user.id === currentUser.id && m.participationStatus === 'ACTIVE_MEMBER',
  );
  const canSeeGear = viewerIsOwner || viewerIsAdmin || viewerIsActiveMember;
  const memberName = (m: any) => personName(m.user, { surnameFirst: true });
  // Гостю сервер отдаёт только участников с согласием + число остальных.
  const hiddenMembersCount: number = artist.hiddenMembersCount ?? 0;
  const roleText = (m: any) => (m.roles ?? []).map((r: any) => r.name).join(', ');
  const currentActivity: string = artist.activityStatus ?? 'ACTIVE';

  // Helper to render a confirmed-member card (public + admin controls).
  const MemberCard = ({ m, pending = false }: { m: any; pending?: boolean }) => (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
      {/* <Link> вместо onClick-navigate — ссылка на профиль видна краулеру. */}
      {personHref(m.user) ? (
        <Link to={personHref(m.user)!} className="flex items-center gap-3 flex-1 min-w-0">
          <AvatarComponent src={m.user?.avatar} name={memberName(m)} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white flex items-center gap-1.5 min-w-0">
              <span className="truncate min-w-0">{memberName(m)}</span>
              {m.isOwner && <Crown size={12} className="text-amber-400 flex-shrink-0" />}
              {m.isAdmin && !m.isOwner && <Shield size={11} className="text-sky-400 flex-shrink-0" />}
            </p>
            <p className="text-xs text-slate-500 truncate">{roleText(m) || '—'}</p>
          </div>
        </Link>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AvatarComponent src={m.user?.avatar} name={memberName(m)} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{memberName(m)}</p>
            <p className="text-xs text-slate-500 truncate">{roleText(m) || '—'}</p>
          </div>
        </div>
      )}
      {pending && (
        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md flex-shrink-0">ожидает</span>
      )}
      {/* Admin controls (visible to artist admins). Строки других админов и
          владельца меняет только владелец — как на сервере. */}
      {!pending && viewerIsAdmin && (viewerIsOwner || (!m.isAdmin && !m.isOwner)) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Toggle participation */}
          <button
            onClick={() => setParticipationMut.mutate({
              membershipId: m.membershipId,
              status: m.participationStatus === 'ACTIVE_MEMBER' ? 'FORMER_MEMBER' : 'ACTIVE_MEMBER',
            })}
            disabled={setParticipationMut.isPending}
            title={m.participationStatus === 'ACTIVE_MEMBER' ? 'В бывшие' : 'В действующие'}
            className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors"
          >
            <UserCog size={14} />
          </button>
          {/* Edit roles */}
          <button
            onClick={() => {
              setRoleEditMembershipId(m.membershipId);
              setRoleEditSeed((m.roles ?? []).map((r: any) => r.id));
            }}
            title="Изменить роли"
            className="p-1.5 text-slate-500 hover:text-primary-400 transition-colors"
          >
            <Tag size={14} />
          </button>
          {/* Remove (not owner) */}
          {!m.isOwner && (
            <button
              onClick={() => setRemoveMembershipId(m.membershipId)}
              title="Удалить участника"
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pb-24">
     {/* Десктоп: страница по центру, как остальные (не растягивается на всю ширину). */}
     <div className="lg:max-w-3xl lg:mx-auto">
      {/* ── Header banner ── */}
      {/* Обложка 3:1 — как при обрезке (ImageCropModal aspect={3}); на десктопе — по колонке */}
      <div className="relative aspect-[3/1] sm:mx-4 sm:mt-3 sm:rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
        {bannerSrc && (
          <CoverImage src={bannerSrc} alt="banner" />
        )}

        {/* Back button — fixed so it stays visible on scroll; на десктопе — правее
            бокового меню (Layout: lg:w-64). */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="fixed left-4 lg:left-[17rem] z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg"
          style={{ top: 'calc(72px + env(safe-area-inset-top, 0px))' }}
        >
          <ArrowLeft size={18} className="text-white" />
        </button>

        {/* Banner camera button */}
        {viewerIsAdmin && (
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
                if (file) setCropBannerFile(file);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {/* ── Avatar ── */}
      <div className="relative px-4 -mt-14 mb-4 flex items-end justify-between">
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
          {viewerIsAdmin && (
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
                  if (file) setCropAvatarFile(file);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>

        {/* Действия под обложкой — только управление; «Подписаться»/«Поделиться»/
            QR — в CTA-ряду визитки ниже. */}
        <div className="flex items-center gap-2 pb-1">
          {viewerIsAdmin && (
            <button
              onClick={() => navigate(`/artist/${id}/edit`)}
              title="Редактировать основную информацию"
              aria-label="Редактировать основную информацию"
              className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            >
              <Edit3 size={16} />
            </button>
          )}
          {canSeeGear && (
            <button
              onClick={() => setShowManageSheet(true)}
              title="Управление артистом"
              aria-label="Управление артистом"
              className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            >
              <Settings size={16} />
            </button>
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
          {artist.status === 'PENDING' && viewerIsAdmin && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock size={11} /> На модерации
            </span>
          )}
          {/* Не прошедший проверку артист: посетителям — бейдж «Не верифицирован» */}
          {!viewerIsAdmin && artist.status !== 'VERIFIED' && artist.status !== 'APPROVED' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/60">
              <ShieldX size={11} /> Не верифицирован
            </span>
          )}
          {artist.status === 'APPROVED' && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <CheckCircle2 size={11} /> Одобрен
            </span>
          )}
        </div>

        {/* Creator — explicit, visible to everyone */}
        {ownerMember && personHref(ownerMember.user) && (
          <Link
            to={personHref(ownerMember.user)!}
            className="flex items-center gap-1.5 text-sm mb-1 group/creator w-fit"
          >
            <Crown size={12} className="text-amber-400 flex-shrink-0" />
            <span className="text-slate-500">Создатель:</span>
            <span className="text-slate-300 group-hover/creator:text-white transition-colors">{memberName(ownerMember)}</span>
          </Link>
        )}

        {/* Status description (owner/admin) — what the current status means + next step. */}
        {viewerIsAdmin && ARTIST_STATUS_DESC[artist.status] && (
          <p className="text-xs text-slate-400 leading-relaxed mb-1.5">
            {ARTIST_STATUS_DESC[artist.status]}
          </p>
        )}

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

        {/* ── Визитка («ссылка в био»): Слушать → CTA → релиз → соцсети → концерты.
            Главный сценарий — переход из шапки ВК/Telegram на телефоне: площадки
            и CTA помещаются на первый экран. ── */}
        <div className="mt-4">
          <ArtistListenBlock
            artistId={artist.id}
            links={bioLinks.listen}
            canEdit={viewerIsAdmin}
            onEditLinks={() => navigate(`/artist/${id}/contacts`)}
          />
          <ArtistCtaRow
            artistId={artist.id}
            artistName={artist.name}
            shareUrl={bioUrl}
            isMember={isMemberOfArtist}
            isFollowed={!!artist.isFollowed}
            followPending={followMut.isPending || unfollowMut.isPending}
            onToggleFollow={() => (artist.isFollowed ? unfollowMut.mutate() : followMut.mutate())}
            onOpenQr={() => setShowQr(true)}
          />
          <ArtistLatestRelease artistId={artist.id} release={releases[0]} />
          <ArtistSocialRow artistId={artist.id} links={bioLinks.social} />
          <ArtistConcerts artistId={artist.id} artistName={artist.name} concerts={artist.ymData?.concerts} />
        </div>


        {/* Verification panel for admins */}
        {viewerIsAdmin && (
          <>
            {/* DRAFT / REJECTED — request (or re-request) verification */}
            {(artist.status === 'DRAFT' || artist.status === 'REJECTED') && (() => {
              const classified = proofUrl.trim() ? classifyUrl(proofUrl.trim()) : null;
              const urlBlocked = classified?.status === 'blocked';
              const urlInvalid = classified?.status === 'invalid';
              const urlOk = classified?.status === 'allowed';
              return (
                <div className={`mb-4 p-3 rounded-xl border ${artist.status === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                  <p className="text-xs font-medium mb-1 text-white">
                    {artist.status === 'REJECTED'
                      ? 'Заявка отклонена — требуется повторная подача'
                      : 'Верификация не запрошена'}
                  </p>
                  {artist.status === 'REJECTED' && artist.rejectionReason && (
                    <p className="text-xs text-red-400 mb-2 flex items-start gap-1.5">
                      <ShieldX size={13} className="flex-shrink-0 mt-0.5" />
                      <span>Причина: {artist.rejectionReason}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mb-2">
                    Разместите этот код в посте или описании профиля артиста в соцсетях и пришлите ссылку на профиль:
                  </p>
                  <div className="flex items-center gap-2 mb-3 p-2 bg-slate-900 rounded-lg">
                    <code className="text-sm font-mono font-bold text-primary-400 tracking-wider flex-1">
                      {artist.verificationCode}
                    </code>
                    <button
                      onClick={async () => {
                        if (!artist.verificationCode) return;
                        if (await copyText(artist.verificationCode)) toast.success('Код скопирован');
                        else toast.error('Не удалось скопировать — выделите код вручную');
                      }}
                      className="text-slate-500 hover:text-white text-xs px-2 py-0.5 bg-slate-800 rounded transition-colors"
                    >
                      Копировать
                    </button>
                  </div>
                  <input
                    value={proofUrl}
                    onChange={e => { setProofUrl(e.target.value); setVerifyUnmet([]); }}
                    placeholder="Ссылка на профиль для верификации..."
                    className="w-full mb-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                  {urlBlocked && <p className="text-xs text-red-400 mb-2">{BLOCK_MESSAGE}</p>}
                  {urlInvalid && <p className="text-xs text-amber-400 mb-2">Введите корректную ссылку (http/https).</p>}
                  {verifyUnmet.length > 0 && (
                    <ul className="text-xs text-amber-400 mb-2 list-disc list-inside space-y-0.5">
                      {verifyUnmet.map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                  )}
                  <button
                    onClick={() => requestVerifyMut.mutate()}
                    disabled={requestVerifyMut.isPending || !urlOk}
                    title={!urlOk ? 'Укажите ссылку на разрешённую соцсеть. Также добавьте участников (мин. по типу) на странице артиста.' : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {requestVerifyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Отправить на верификацию
                  </button>
                </div>
              );
            })()}

            {/* PENDING — push о результате + отзыв заявки (статус — в строке выше) */}
            {artist.status === 'PENDING' && (
              <div className="mb-4 space-y-2.5">
                <VerificationPushHint />
                <button
                  onClick={() => withdrawMut.mutate()}
                  disabled={withdrawMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {withdrawMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  Отозвать заявку
                </button>
              </div>
            )}
          </>
        )}

        {/* Статистика визитки + подсказка «поставьте ссылку в шапку» — только админам */}
        {viewerIsAdmin && <ArtistBioStats artistId={artist.id} bioUrl={bioUrl} />}

        {/* Об артисте — редактируется прямо в карточке (как «О себе» в Профиле) */}
        {(artist.description || viewerIsAdmin) && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
              <UserRound size={14} className="text-sky-400" />
              <span className="text-sm font-semibold text-white">Об артисте</span>
              {viewerIsAdmin && !editingAbout && (
                <button
                  onClick={() => { setAboutDraft(artist.description ?? ''); setEditingAbout(true); }}
                  className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800 flex-shrink-0"
                >
                  <Edit3 size={13} />
                </button>
              )}
            </div>
            <div className="p-4">
              {editingAbout ? (
                <div className="space-y-2">
                  <textarea
                    value={aboutDraft}
                    onChange={e => setAboutDraft(e.target.value)}
                    rows={4}
                    placeholder="О коллективе..."
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingAbout(false)} className="flex-1 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl transition-colors">Отмена</button>
                    <button
                      onClick={() => patchMut.mutate({ description: aboutDraft.trim() })}
                      disabled={patchMut.isPending}
                      className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                    >
                      {patchMut.isPending ? <Loader2 size={13} className="animate-spin" /> : null}Сохранить
                    </button>
                  </div>
                </div>
              ) : artist.description ? (
                <p className="text-slate-300 text-sm leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {artist.description}
                </p>
              ) : (
                <button
                  onClick={() => { setAboutDraft(''); setEditingAbout(true); }}
                  className="text-sm text-slate-600 hover:text-slate-400 transition-colors italic"
                >
                  + Добавить описание
                </button>
              )}
            </div>
          </div>
        )}

        {/* Жанры — карандаш ведёт на страницу /artist/:id/genres */}
        {((artist.genres?.length ?? 0) > 0 || viewerIsAdmin) && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
              <Tag size={14} className="text-primary-400" />
              <span className="text-sm font-semibold text-white">Жанры</span>
              {(artist.genres?.length ?? 0) > 0 && <span className="text-xs text-slate-500">{artist.genres.length}</span>}
              {viewerIsAdmin && (
                <button
                  onClick={() => navigate(`/artist/${id}/genres`)}
                  className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800 flex-shrink-0"
                >
                  <Edit3 size={13} />
                </button>
              )}
            </div>
            <div className="p-3">
              {(artist.genres?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {artist.genres.map((g: { id: string; name: string }) => (
                    <span key={g.id} className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/50 text-slate-300 rounded-lg text-xs font-medium">
                      {g.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 italic">Жанры не указаны</p>
              )}
            </div>
          </div>
        )}

        {/* Контакты — просмотр; карандаш ведёт на страницу /artist/:id/contacts
            (там же ссылки на площадки и соцсети для блоков визитки). */}
        {(hasContactLinks || viewerIsAdmin || (isGuest && artist.contactsAvailable)) && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
              <Link2 size={14} className="text-primary-400" />
              <span className="text-sm font-semibold text-white">Контакты</span>
              {viewerIsAdmin && (
                <button
                  onClick={() => navigate(`/artist/${id}/contacts`)}
                  className="ml-auto p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800 flex-shrink-0"
                >
                  <Edit3 size={13} />
                </button>
              )}
            </div>
            <div className="p-3">
              {hasContactLinks && <SocialIconRow links={contactLinks} labeled only={CONTACT_KEYS} />}
              {/* Гостю контактные ключи socialLinks сервер не отдаёт — только флаг. */}
              {isGuest && artist.contactsAvailable && (
                <button
                  onClick={() => gate.ensure('contacts', { type: 'artist' })}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-colors"
                >
                  <Lock size={12} className="text-slate-400" /> Показать контакты
                </button>
              )}
              {!hasContactLinks && !(isGuest && artist.contactsAvailable) && (
                <p className="text-sm text-slate-600 italic">Контакты не указаны</p>
              )}
            </div>
          </div>
        )}

        {/* Запросы на участие — владельцу и админам (решают их тоже они) */}
        {viewerIsAdmin && pendingMembers.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
              <UserPlus size={14} className="text-amber-400" />
              <span className="text-sm font-semibold text-white">Запросы на участие</span>
              <span className="text-xs text-slate-500">{pendingMembers.length}</span>
            </div>
            <div className="p-3 space-y-2">
              {pendingMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <AvatarComponent src={m.user.avatar} name={`${m.user.firstName} ${m.user.lastName}`} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{m.user.firstName} {m.user.lastName}</p>
                    <p className="text-xs text-slate-400 truncate">{m.roleNames?.length ? m.roleNames.join(', ') : (m.profession?.name ?? '—')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => rejectMemberMut.mutate(m.id)}
                      disabled={rejectMemberMut.isPending || approveMemberMut.isPending}
                      className="px-2.5 py-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Отклонить
                    </button>
                    <button
                      onClick={() => approveMemberMut.mutate(m.id)}
                      disabled={approveMemberMut.isPending || rejectMemberMut.isPending}
                      className="px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      Подтвердить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Viewer's own pending invitation: confirm / decline ── */}
        {artist.viewerPendingMembership && (
          <div className="mb-4 p-3.5 rounded-xl bg-primary-500/10 border border-primary-500/30">
            <p className="text-sm text-white font-medium mb-1">
              «{artist.name}» приглашает вас стать участником
              {artist.viewerPendingMembership.roles?.length
                ? <> в роли <span className="text-primary-300">{artist.viewerPendingMembership.roles.map((r: any) => r.name).join(', ')}</span></>
                : null}
            </p>
            <p className="text-xs text-slate-400 mb-3">Подтвердите участие, чтобы появиться в составе.</p>
            <div className="flex gap-2">
              <button
                onClick={() => confirmInviteMut.mutate(artist.viewerPendingMembership.membershipId)}
                disabled={confirmInviteMut.isPending || declineInviteMut.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {confirmInviteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                Подтвердить
              </button>
              <button
                onClick={() => declineInviteMut.mutate(artist.viewerPendingMembership.membershipId)}
                disabled={confirmInviteMut.isPending || declineInviteMut.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium transition-colors"
              >
                <UserX size={14} /> Отклонить
              </button>
            </div>
          </div>
        )}

        {/* ── Состав (Phase 5b: active / former blocks) ── */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
            <Users size={14} className="text-primary-400" />
            <span className="text-sm font-semibold text-white">Состав</span>
            {confirmedMembers.length + hiddenMembersCount > 0 && <span className="text-xs text-slate-500">{confirmedMembers.length + hiddenMembersCount}</span>}
          </div>

          <div className="p-3">
            {/* Admin actions: add member / invite link */}
            {viewerIsAdmin && (
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => navigate(`/artist/${id}/members/add`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-colors"
                >
                  <UserPlus size={13} /> Добавить участника
                </button>
                <button
                  onClick={() => navigate(`/artist/${id}/invite`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  <Link2 size={13} /> Пригласить на сервис
                </button>
              </div>
            )}

            {/* Действующие участники */}
            {activeMembers.length > 0 ? (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Действующие участники</p>
                <div className="space-y-2">
                  {activeMembers.map((m: any) => <MemberCard key={m.membershipId ?? m.user?.id} m={m} />)}
                </div>
              </div>
            ) : viewerIsAdmin ? (
              <p className="text-xs text-slate-600 italic mb-3">Действующих участников пока нет</p>
            ) : null}

            {/* Бывшие участники */}
            {formerMembers.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Бывшие участники</p>
                <div className="space-y-2">
                  {formerMembers.map((m: any) => <MemberCard key={m.membershipId ?? m.user?.id} m={m} />)}
                </div>
              </div>
            )}

            {activeMembers.length === 0 && formerMembers.length === 0 && !viewerIsAdmin && hiddenMembersCount === 0 && (
              <p className="text-xs text-slate-600 italic">Участников пока нет</p>
            )}

            {/* Участники без согласия на публичность гостю не показываются */}
            {hiddenMembersCount > 0 && (
              <button
                onClick={() => openAuthGate('page', { type: 'artist_members' }, 'Полный состав виден после входа')}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <Lock size={12} />
                {activeMembers.length + formerMembers.length > 0 ? 'и ещё' : 'В составе'} {hiddenMembersCount} {pluralMembers(hiddenMembersCount)} — после входа
              </button>
            )}

            {/* Ожидают подтверждения (admins only, read-only indicator) */}
            {viewerIsAdmin && pendingMembers5b.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Ожидают подтверждения</p>
                <div className="space-y-2">
                  {pendingMembers5b.map((m: any) => <MemberCard key={m.membershipId} m={m} pending />)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Phase 6b: Releases rail ── */}
        {(viewerIsAdmin || releases.length > 0) && (
          <MediaRail
            title="Релизы"
            icon={Disc3}
            items={releases}
            to="/releases"
            showAdd={viewerIsAdmin}
            onAdd={() => navigate(`/artist/${id}/releases/new`)}
          />
        )}

        {/* ── Phase 6b: Clips rail ── */}
        {(viewerIsAdmin || clips.length > 0) && (
          <MediaRail
            title="Клипы"
            icon={Clapperboard}
            items={clips}
            to="/clips"
            showAdd={viewerIsAdmin}
            onAdd={() => navigate(`/artist/${id}/clips/new`)}
          />
        )}

        {/* ── Данные Яндекс.Музыки: статистика, топ-треки, похожие, фото, концерты ── */}
        <ArtistYandexBlocks
          listeners={artist.listeners}
          listenersDelta={artist.listenersDelta}
          listenersHistory={artist.listenersHistory}
          ymData={artist.ymData}
          hideConcerts
        />

        {/* ── Vacancies rail (owner/admin only) — same look as Releases/Clips ── */}
        {viewerIsAdmin && (
          <MediaRail
            title="Мои вакансии"
            icon={Briefcase}
            items={myVacancies.map((v: any) => ({
              id: v.id,
              title: v.title,
              subtitle: [v.profession?.name, v.workFormat ? workFormatLabel(v.workFormat) : '']
                .filter(Boolean).join(' · '),
              badge: v.status === 'active'
                ? { label: 'Активна', className: 'bg-emerald-600 text-white' }
                : v.status === 'archived'
                ? { label: 'Архив', className: 'bg-slate-600 text-white' }
                : { label: 'Черновик', className: 'bg-amber-600 text-white' },
            }))}
            count={myVacancies.length}
            to="/vacancies"
            showAdd={viewerIsOwner}
            onAdd={() => navigate(`/artist/${id}/vacancies/new`)}
            seeAllTo={`/artists/${id}/vacancies`}
          />
        )}

      </div>
     </div>

      {/* RolePicker for editing a member's roles */}
      {roleEditMembershipId && (
        <RolePicker
          context="collective"
          value={roleEditSeed}
          onSave={(ids) => setRolesMut.mutate({ membershipId: roleEditMembershipId, roleIds: ids })}
          onClose={() => setRoleEditMembershipId(null)}
          title="Роли участника"
        />
      )}

      {/* ── Phase 5b: Owner picker (transfer owner) — нижний лист ── */}
      {showOwnerPicker && createPortal(
        <>
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={() => setShowOwnerPicker(false)} />
        <div
          className="fixed inset-x-0 bottom-0 z-[56] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85dvh] flex flex-col"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 flex-shrink-0" />
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 flex-shrink-0">
            <h3 className="font-semibold text-white text-sm">Изменить владельца</h3>
            <button onClick={() => setShowOwnerPicker(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          <div className="p-4 flex-1 min-h-0 overflow-y-auto">
            {confirmedMembers.filter((m) => !m.isOwner).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Нет других участников.</p>
            ) : (
              <div className="space-y-1.5">
                {confirmedMembers.filter((m) => !m.isOwner).map((m: any) => (
                  <button
                    key={m.membershipId}
                    onClick={() => { setTransferOwnerUserId(m.user.id); setShowOwnerPicker(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 border border-transparent transition-colors text-left"
                  >
                    <AvatarComponent src={m.user.avatar} name={memberName(m)} size={36} />
                    <span className="text-sm text-white truncate">{memberName(m)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </>,
        document.body,
      )}

      {/* ── Phase 5b: Администраторы — нижний лист (текущие + добавить; бывший center-picker) ── */}
      {showAdminPicker && createPortal(
        <>
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={() => setShowAdminPicker(false)} />
        <div
          className="fixed inset-x-0 bottom-0 z-[56] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85dvh] flex flex-col"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 flex-shrink-0" />
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 flex-shrink-0">
            <h3 className="font-semibold text-white text-sm">Администраторы</h3>
            <button onClick={() => setShowAdminPicker(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {/* Текущие администраторы (владелец может снимать) — бывший инлайн Admin block */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Текущие</p>
              {adminMembers.length === 0 ? (
                <p className="text-xs text-slate-600 italic">Нет администраторов</p>
              ) : (
                <div className="space-y-2">
                  {adminMembers.map((m: any) => (
                    <div key={m.membershipId ?? m.user?.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                      <AvatarComponent src={m.user.avatar} name={memberName(m)} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white flex items-center gap-1.5 min-w-0">
                          {m.isOwner ? <Crown size={12} className="text-amber-400 flex-shrink-0" /> : <Shield size={11} className="text-sky-400 flex-shrink-0" />}
                          <span className="truncate min-w-0">{memberName(m)}</span>
                        </p>
                      </div>
                      {viewerIsOwner && !m.isOwner && (
                        <button
                          onClick={() => setRemoveAdminUserId(m.user.id)}
                          title="Снять администратора"
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Добавить администратора (только владелец) */}
            {viewerIsOwner && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Добавить</p>
                {confirmedMembers.filter((m) => !m.isAdmin).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Все участники уже администраторы.</p>
                ) : (
                  <div className="space-y-1.5">
                    {confirmedMembers.filter((m) => !m.isAdmin).map((m: any) => (
                      <button
                        key={m.membershipId}
                        onClick={() => { addAdminMut.mutate(m.user.id); setShowAdminPicker(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 border border-transparent transition-colors text-left"
                      >
                        <AvatarComponent src={m.user.avatar} name={memberName(m)} size={36} />
                        <span className="text-sm text-white truncate">{memberName(m)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </>,
        document.body,
      )}

      {/* ── Нижний лист «Управление артистом» (шестерёнка) ── */}
      {showManageSheet && canSeeGear && createPortal(
        <>
        <div className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm" onClick={() => setShowManageSheet(false)} />
        <div
          className="fixed inset-x-0 bottom-0 z-[56] bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[85dvh] flex flex-col"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-3 flex-shrink-0" />
          <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Settings size={18} className="text-primary-400" />
              <h2 className="text-base font-bold text-white">Управление артистом</h2>
            </div>
            <button onClick={() => setShowManageSheet(false)} className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Только уникальные действия: редактирование, приглашения и добавление
              участников доступны прямо на странице (карандаш и карточка «Состав»). */}
          <div className="px-4 pb-2 space-y-2 flex-1 min-h-0 overflow-y-auto">
            {/* Статус активности */}
            {viewerIsAdmin && (
              <>
                <button
                  onClick={() => { setShowManageSheet(false); setActivitySheetOpen(true); }}
                  className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <Activity size={17} className="text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">Статус активности</p>
                    <p className="text-xs text-slate-500 truncate">{ACTIVITY_LABELS[currentActivity] ?? 'Действующий'}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
                </button>
                <p className="text-[10px] text-slate-500 px-1">
                  При смене с «Действующий» все действующие участники переходят в бывшие.
                </p>
              </>
            )}

            {/* Владелец */}
            {viewerIsOwner && (
              <button
                onClick={() => { setShowManageSheet(false); setShowOwnerPicker(true); }}
                className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors text-left"
              >
                <Crown size={17} className="text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">Владелец</p>
                  <p className="text-xs text-slate-500 truncate">{ownerMember ? memberName(ownerMember) : '—'}</p>
                </div>
                <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
              </button>
            )}

            {/* Администраторы */}
            <button
              onClick={() => { setShowManageSheet(false); setShowAdminPicker(true); }}
              className="w-full flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 rounded-2xl px-4 py-3.5 hover:bg-slate-800 transition-colors text-left"
            >
              <Shield size={17} className="text-sky-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">Администраторы</p>
                <p className="text-xs text-slate-500 truncate">{adminMembers.length} чел.</p>
              </div>
              <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />
            </button>
          </div>
        </div>
        </>,
        document.body,
      )}

      {/* Activity status sheet */}
      <SelectSheet
        isOpen={activitySheetOpen}
        onClose={() => setActivitySheetOpen(false)}
        title="Статус активности"
        options={ACTIVITY_OPTIONS}
        selectedIds={currentActivity}
        onSelect={(v) => { setActivityMut.mutate(v as any); setActivitySheetOpen(false); }}
        mode="single"
        searchable={false}
        height="auto"
      />

      {/* Confirm: remove member */}
      <ConfirmDialog
        open={!!removeMembershipId}
        message="Удалить участника?"
        confirmLabel="Удалить"
        onConfirm={() => { if (removeMembershipId) removeMember5bMut.mutate(removeMembershipId); }}
        onCancel={() => setRemoveMembershipId(null)}
      />

      {/* Confirm: transfer owner */}
      <ConfirmDialog
        open={!!transferOwnerUserId}
        message="Точно сменить владельца?"
        confirmLabel="Да, точно сменить владельца"
        onConfirm={() => { if (transferOwnerUserId) transferOwnerNewMut.mutate(transferOwnerUserId); }}
        onCancel={() => setTransferOwnerUserId(null)}
      />

      {/* Confirm: remove admin */}
      <ConfirmDialog
        open={!!removeAdminUserId}
        message="Точно удалить администратора?"
        confirmLabel="Да, точно удалить администратора"
        onConfirm={() => { if (removeAdminUserId) removeAdminMut.mutate(removeAdminUserId); }}
        onCancel={() => setRemoveAdminUserId(null)}
      />

      {/* ── Визитка: QR-код страницы артиста ── */}
      {showQr && (
        <ArtistQrModal
          url={bioUrl}
          title={artist.name}
          fileName={`moooza-${artist.slug || artist.id}-qr.png`}
          onClose={() => setShowQr(false)}
        />
      )}

      {/* ── Phase 7: avatar / banner cropping ── */}
      {cropAvatarFile && (
        <ImageCropModal
          file={cropAvatarFile}
          aspect={1}
          cropShape="round"
          title="Аватар"
          onCancel={() => setCropAvatarFile(null)}
          onCropped={blob => { uploadAvatarMut.mutate(blobToFile(blob, 'avatar.jpg')); setCropAvatarFile(null); }}
        />
      )}
      {cropBannerFile && (
        <ImageCropModal
          file={cropBannerFile}
          aspect={3}
          cropShape="rect"
          title="Обложка"
          onCancel={() => setCropBannerFile(null)}
          onCropped={blob => { uploadBannerMut.mutate(blobToFile(blob, 'banner.jpg')); setCropBannerFile(null); }}
        />
      )}
    </div>
  );
}
