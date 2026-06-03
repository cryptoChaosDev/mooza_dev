import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, ExternalLink,
  Camera, Navigation, Edit3, X, Save, Loader2,
  ShieldCheck, Clock, ShieldX, CheckCircle2, Send,
  UserPlus, Trash2, Search,
  Settings, Link2, Share2, Tag, Crown, Shield, UserCog, UserCheck, UserX, Star,
} from 'lucide-react';
import { artistAPI, referenceAPI, groupAPI, friendshipAPI, userAPI, releaseAPI, clipAPI } from '../lib/api';
import { plural } from '../lib/plural';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import { avatarUrl } from '../lib/avatar';
import { SocialIconRow, SocialLinksEditor, CONTACT_KEYS, SOCIAL_KEYS } from '../components/SocialLinks';
import AvatarComponent from '../components/Avatar';
import SelectSheet from '../components/SelectSheet';
import ShareButton from '../components/ShareButton';
import RolePicker from '../components/RolePicker';
import ConfirmDialog from '../components/ConfirmDialog';
import MediaRail from '../components/MediaRail';
import MediaItemForm from '../components/MediaItemForm';
import { useAuthStore } from '../stores/authStore';
import { classifyUrl, BLOCK_MESSAGE } from '../lib/socialPlatforms';
import ImageCropModal, { blobToFile } from '../components/ImageCropModal';

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

  // Image cropping (avatar / banner) before upload
  const [cropAvatarFile, setCropAvatarFile] = useState<File | null>(null);
  const [cropBannerFile, setCropBannerFile] = useState<File | null>(null);

  const [proofUrl, setProofUrl] = useState('');
  const [verifyUnmet, setVerifyUnmet] = useState<string[]>([]);
  const [form, setForm] = useState<EditForm>({
    name: '', type: '', city: '', tourReady: '', description: '',
    bandLink: '', listeners: '', genreIds: [], socialLinks: {},
  });
  const [genreSheetOpen, setGenreSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);

  // Invite member state (legacy friend-invite flow)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteProfessionId, setInviteProfessionId] = useState('');
  const [inviteFriendSearch, setInviteFriendSearch] = useState('');
  const [inviteProfSearch, setInviteProfSearch] = useState('');

  // ── Phase 5b state ─────────────────────────────────────────────────────────
  // Admin block (gear) toggle
  const [showAdminBlock, setShowAdminBlock] = useState(false);

  // Add registered member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addSelectedUserId, setAddSelectedUserId] = useState('');
  const [addRoleIds, setAddRoleIds] = useState<string[]>([]);
  const [addParticipation, setAddParticipation] = useState<'ACTIVE_MEMBER' | 'FORMER_MEMBER'>('ACTIVE_MEMBER');
  const [addRolePickerOpen, setAddRolePickerOpen] = useState(false);
  const [addFeedback, setAddFeedback] = useState('');

  // Invite-link (unregistered) flow
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [linkRoleIds, setLinkRoleIds] = useState<string[]>([]);
  const [linkParticipation, setLinkParticipation] = useState<'ACTIVE_MEMBER' | 'FORMER_MEMBER'>('ACTIVE_MEMBER');
  const [linkRolePickerOpen, setLinkRolePickerOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

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

  // ── Phase 6b: releases & clips create-form modals ──────────────────────────
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showClipForm, setShowClipForm] = useState(false);

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

  // Cities restricted to the Moooza catalog (Geography reference). value = name.
  const { data: cityOptions = [] } = useQuery({
    queryKey: ['geographies'],
    queryFn: async () => {
      const { data } = await referenceAPI.getGeographies();
      return (data as { id: string; name: string }[]).map(g => ({ id: g.name, name: g.name }));
    },
  });

  // ── Phase 6b: releases & clips lists ──────────────────────────────────────
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

  const isOwner = !!currentUser && (
    artist?.submittedById === currentUser.id ||
    artist?.members?.some((m: any) => m.id === currentUser.id && m.isOwner)
  );

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

  const favInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['artist', id] });
    queryClient.invalidateQueries({ queryKey: ['followed-artists'] });
  };
  const followMut = useMutation({
    mutationFn: () => artistAPI.follow(id!),
    onSuccess: favInvalidate,
  });

  const unfollowMut = useMutation({
    mutationFn: () => artistAPI.unfollow(id!),
    onSuccess: favInvalidate,
  });

  const uploadAvatarMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadAvatar(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const uploadBannerMut = useMutation({
    mutationFn: (file: File) => artistAPI.uploadBanner(id!, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
  });

  const requestVerifyMut = useMutation({
    mutationFn: () => artistAPI.requestVerification(id!, proofUrl),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artist', id] }); setProofUrl(''); setVerifyUnmet([]); },
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist', id] }),
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

  const { data: pendingMembers = [] } = useQuery<any[]>({
    queryKey: ['artist-pending-members', id],
    queryFn: () => artistAPI.pendingMemberships(id!).then((r: any) => r.data),
    enabled: !!id && isOwner,
  });

  const approveMemberMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.approveMembership(membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      queryClient.invalidateQueries({ queryKey: ['artist-pending-members', id] });
    },
  });
  const rejectMemberMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.rejectMembership(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist-pending-members', id] }),
  });

  // ── Phase 5b: user search for add-member modal ─────────────────────────────
  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ['user-search', addSearch],
    queryFn: async () => {
      const { data } = await userAPI.search({ query: addSearch.trim() });
      return data as { id: string; firstName: string; lastName: string; nickname?: string; avatar?: string }[];
    },
    enabled: showAddMember && addSearch.trim().length >= 2,
  });

  const invalidateArtist = () => queryClient.invalidateQueries({ queryKey: ['artist', id] });

  // ── Phase 5b: mutations ────────────────────────────────────────────────────
  // The viewer's own pending invitation: confirm / decline.
  const confirmInviteMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.confirmMembership(membershipId),
    onSuccess: () => invalidateArtist(),
  });
  const declineInviteMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.declineMembership(membershipId),
    onSuccess: () => invalidateArtist(),
  });

  const addMemberMut = useMutation({
    mutationFn: () =>
      artistAPI.addMember(id!, {
        userId: addSelectedUserId,
        roleIds: addRoleIds,
        participationStatus: addParticipation,
      }),
    onSuccess: () => {
      invalidateArtist();
      setAddFeedback('Приглашение отправлено');
      setAddSelectedUserId('');
      setAddRoleIds([]);
      setAddParticipation('ACTIVE_MEMBER');
      setAddSearch('');
      setTimeout(() => { setAddFeedback(''); setShowAddMember(false); }, 1200);
    },
  });

  const inviteLinkMut = useMutation({
    mutationFn: () =>
      artistAPI.createInviteLink(id!, { roleIds: linkRoleIds, participationStatus: linkParticipation }),
    onSuccess: (res: any) => { setGeneratedLink(res.data?.url ?? ''); setLinkCopied(false); },
  });

  const setParticipationMut = useMutation({
    mutationFn: (vars: { membershipId: string; status: 'ACTIVE_MEMBER' | 'FORMER_MEMBER' }) =>
      artistAPI.setMemberParticipation(id!, vars.membershipId, vars.status),
    onSuccess: invalidateArtist,
  });

  const setRolesMut = useMutation({
    mutationFn: (vars: { membershipId: string; roleIds: string[] }) =>
      artistAPI.setMemberRoles(id!, vars.membershipId, vars.roleIds),
    onSuccess: invalidateArtist,
  });

  const removeMember5bMut = useMutation({
    mutationFn: (membershipId: string) => artistAPI.removeMember(id!, membershipId),
    onSuccess: invalidateArtist,
  });

  const setActivityMut = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DISBANDED') =>
      artistAPI.setActivityStatus(id!, status),
    onSuccess: invalidateArtist,
  });

  const transferOwnerNewMut = useMutation({
    mutationFn: (userId: string) => artistAPI.transferOwner(id!, userId),
    onSuccess: invalidateArtist,
  });

  const addAdminMut = useMutation({
    mutationFn: (userId: string) => artistAPI.addAdmin(id!, userId),
    onSuccess: invalidateArtist,
  });

  const removeAdminMut = useMutation({
    mutationFn: (userId: string) => artistAPI.removeAdmin(id!, userId),
    onSuccess: invalidateArtist,
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
  const isAdminOfArtist = !!currentUser && (
    artist.submittedById === currentUser.id ||
    artist.members?.some((m: any) => m.id === currentUser.id && (m.isAdmin || m.isOwner))
  );
  const hasSocialLinks =
    artist.socialLinks && Object.values(artist.socialLinks as Record<string, string>).some(Boolean);

  const bannerSrc = resolveUrl(artist.banner);
  const avatarSrc = avatarUrl(artist.avatar);

  // ── Phase 5b derived data ──────────────────────────────────────────────────
  // Owner/admin gating from the backend (preferred over legacy member-flag scan).
  const viewerIsOwner: boolean = !!artist.viewerIsOwner;
  const viewerIsAdmin: boolean = !!artist.viewerIsAdmin || viewerIsOwner;

  const confirmedMembers: any[] = artist.confirmedMembers ?? [];
  const pendingMembers5b: any[] = artist.pendingMembers ?? [];
  const activeMembers = confirmedMembers.filter((m) => m.participationStatus === 'ACTIVE_MEMBER');
  const formerMembers = confirmedMembers.filter((m) => m.participationStatus === 'FORMER_MEMBER');
  const ownerMember = confirmedMembers.find((m) => m.isOwner) ?? null;
  const adminMembers = confirmedMembers.filter((m) => m.isAdmin);
  // Viewer is an active confirmed member (used to gate the gear button)
  const viewerIsActiveMember = !!currentUser && confirmedMembers.some(
    (m) => m.user.id === currentUser.id && m.participationStatus === 'ACTIVE_MEMBER',
  );
  const canSeeGear = viewerIsOwner || viewerIsAdmin || viewerIsActiveMember;
  const memberName = (m: any) => `${m.user.lastName ?? ''} ${m.user.firstName ?? ''}`.trim();
  const roleText = (m: any) => (m.roles ?? []).map((r: any) => r.name).join(', ');
  const currentActivity: string = artist.activityStatus ?? 'ACTIVE';

  // Helper to render a confirmed-member card (public + admin controls).
  const MemberCard = ({ m, pending = false }: { m: any; pending?: boolean }) => (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
      <button onClick={() => navigate(`/profile/${m.user.id}`)} className="flex-shrink-0">
        <AvatarComponent src={m.user.avatar} name={memberName(m)} size={40} />
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/profile/${m.user.id}`)}>
        <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
          {memberName(m)}
          {m.isOwner && <Crown size={12} className="text-amber-400 flex-shrink-0" />}
          {m.isAdmin && !m.isOwner && <Shield size={11} className="text-sky-400 flex-shrink-0" />}
        </p>
        <p className="text-xs text-slate-500 truncate">{roleText(m) || '—'}</p>
      </div>
      {pending && (
        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md flex-shrink-0">ожидает</span>
      )}
      {/* Admin controls (visible to artist admins) */}
      {!pending && viewerIsAdmin && (
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

            {/* Город — только из каталога Музы */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Город</label>
              <button
                type="button"
                onClick={() => setCitySheetOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
              >
                <span className={form.city ? 'text-white' : 'text-slate-500'}>
                  {form.city || 'Выбрать город'}
                </span>
                <span className="text-slate-500 text-xs">▾</span>
              </button>
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

            {/* Контакты */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Контакты</label>
              <SocialLinksEditor
                value={form.socialLinks}
                onChange={(v) => set('socialLinks', v)}
                only={CONTACT_KEYS}
              />
            </div>

            {/* Соцсети */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Социальные сети</label>
              <SocialLinksEditor
                value={form.socialLinks}
                onChange={(v) => set('socialLinks', v)}
                only={SOCIAL_KEYS}
              />
            </div>

            {/* Bottom spacer so the last field can scroll clear of the keyboard */}
            <div className="h-40 flex-shrink-0" aria-hidden />
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

      <SelectSheet
        isOpen={citySheetOpen}
        onClose={() => setCitySheetOpen(false)}
        title="Город"
        options={cityOptions}
        selectedIds={form.city}
        onSelect={(v) => { set('city', v as string); setCitySheetOpen(false); }}
        mode="single"
        searchable
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
                  if (file) setCropAvatarFile(file);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>

        {/* Actions under the cover: favorite star + share */}
        <div className="flex items-center gap-2 pb-1">
          {currentUser && !isMemberOfArtist && (
            <button
              onClick={() => {
                if (artist.isFollowed) unfollowMut.mutate();
                else followMut.mutate();
              }}
              disabled={followMut.isPending || unfollowMut.isPending}
              aria-label={artist.isFollowed ? 'Убрать из избранного' : 'В избранное'}
              title={artist.isFollowed ? 'В избранном' : 'В избранное'}
              className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center transition-colors disabled:opacity-60"
            >
              <Star size={17} className={artist.isFollowed ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
            </button>
          )}
          <ShareButton
            url={`/artist/${id}`}
            title={artist?.name}
            iconSize={16}
            className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          />
          {isOwner && (
            <button
              onClick={() => setIsEditing(true)}
              title="Редактировать"
              className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            >
              <Edit3 size={16} />
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

        {/* Verification panel for admins */}
        {isAdminOfArtist && (
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
                      onClick={() => artist.verificationCode && navigator.clipboard.writeText(artist.verificationCode)}
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

            {/* PENDING — request under review */}
            {artist.status === 'PENDING' && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-amber-300 font-medium mb-1 flex items-center gap-1.5">
                  <Clock size={13} /> Заявка на рассмотрении
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Мы проверим публикацию с кодом и уведомим вас о результате.
                </p>
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

            {/* VERIFIED */}
            {artist.status === 'VERIFIED' && (
              <div className="mb-4 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <p className="text-xs text-green-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck size={13} /> Верификация пройдена
                </p>
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

        {/* Запросы на участие — только для владельца */}
        {isOwner && pendingMembers.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Запросы на участие</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">{pendingMembers.length}</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <div className="space-y-2">
              {pendingMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <AvatarComponent src={m.user.avatar} name={`${m.user.firstName} ${m.user.lastName}`} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{m.user.firstName} {m.user.lastName}</p>
                    <p className="text-xs text-slate-400 truncate">{m.profession?.name ?? '—'}</p>
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
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Состав</span>
            <div className="flex-1 h-px bg-slate-800" />
            {canSeeGear && (
              <button
                onClick={() => setShowAdminBlock(v => !v)}
                title="Управление"
                className={`p-1.5 rounded-lg transition-colors ${showAdminBlock ? 'text-primary-400 bg-primary-500/10' : 'text-slate-500 hover:text-primary-400'}`}
              >
                <Settings size={15} />
              </button>
            )}
          </div>

          {/* Admin actions: add member / invite link */}
          {viewerIsAdmin && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => { setShowAddMember(true); setAddFeedback(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-colors"
              >
                <UserPlus size={13} /> Добавить участника
              </button>
              <button
                onClick={() => { setShowInviteLink(true); setGeneratedLink(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                <Link2 size={13} /> Пригласить на сервис
              </button>
            </div>
          )}

          {/* Действующие участники */}
          {activeMembers.length > 0 ? (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Действующие участники</p>
              <div className="space-y-2">
                {activeMembers.map((m: any) => <MemberCard key={m.membershipId} m={m} />)}
              </div>
            </div>
          ) : viewerIsAdmin ? (
            <p className="text-xs text-slate-600 italic mb-3">Действующих участников пока нет</p>
          ) : null}

          {/* Бывшие участники */}
          {formerMembers.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Бывшие участники</p>
              <div className="space-y-2">
                {formerMembers.map((m: any) => <MemberCard key={m.membershipId} m={m} />)}
              </div>
            </div>
          )}

          {activeMembers.length === 0 && formerMembers.length === 0 && !viewerIsAdmin && (
            <p className="text-xs text-slate-600 italic">Участников пока нет</p>
          )}

          {/* Ожидают подтверждения (admins only, read-only indicator) */}
          {viewerIsAdmin && pendingMembers5b.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">Ожидают подтверждения</p>
              <div className="space-y-2">
                {pendingMembers5b.map((m: any) => <MemberCard key={m.membershipId} m={m} pending />)}
              </div>
            </div>
          )}
        </div>

        {/* ── Phase 6b: Releases rail ── */}
        {(viewerIsAdmin || releases.length > 0) && (
          <MediaRail
            title="Релизы"
            items={releases}
            to="/releases"
            showAdd={viewerIsAdmin}
            onAdd={() => setShowReleaseForm(true)}
          />
        )}

        {/* ── Phase 6b: Clips rail ── */}
        {(viewerIsAdmin || clips.length > 0) && (
          <MediaRail
            title="Клипы"
            items={clips}
            to="/clips"
            showAdd={viewerIsAdmin}
            onAdd={() => setShowClipForm(true)}
          />
        )}

        {/* ── Admin block (gear) ── */}
        {canSeeGear && showAdminBlock && (
          <div className="mb-4 p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
            {/* Activity status */}
            {viewerIsAdmin && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Статус активности</p>
                <button
                  onClick={() => setActivitySheetOpen(true)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
                >
                  <span className="text-white">{ACTIVITY_LABELS[currentActivity] ?? 'Действующий'}</span>
                  <span className="text-slate-500 text-xs">▾</span>
                </button>
                <p className="text-[10px] text-slate-500 mt-1">
                  При смене с «Действующий» все действующие участники переходят в бывшие.
                </p>
              </div>
            )}

            {/* Owner */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Владелец</p>
              {ownerMember ? (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <AvatarComponent src={ownerMember.user.avatar} name={memberName(ownerMember)} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                      <Crown size={12} className="text-amber-400" /> {memberName(ownerMember)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 italic">—</p>
              )}
              {viewerIsOwner && (
                <button
                  onClick={() => setShowOwnerPicker(true)}
                  className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Изменить владельца
                </button>
              )}
            </div>

            {/* Admins */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Администраторы</p>
              {adminMembers.length === 0 ? (
                <p className="text-xs text-slate-600 italic">Нет администраторов</p>
              ) : (
                <div className="space-y-2">
                  {adminMembers.map((m: any) => (
                    <div key={m.membershipId} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                      <AvatarComponent src={m.user.avatar} name={memberName(m)} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                          {m.isOwner ? <Crown size={12} className="text-amber-400" /> : <Shield size={11} className="text-sky-400" />}
                          {memberName(m)}
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
              {viewerIsOwner && (
                <button
                  onClick={() => setShowAdminPicker(true)}
                  className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Добавить администратора
                </button>
              )}
            </div>
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

      {/* ── Phase 5b: Add registered member modal ── */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 backdrop-blur">
            <button onClick={() => setShowAddMember(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-base font-semibold text-white flex-1">Добавить участника</h2>
            <button
              onClick={() => addMemberMut.mutate()}
              disabled={!addSelectedUserId || addRoleIds.length === 0 || addMemberMut.isPending}
              title={addRoleIds.length === 0 ? 'Выберите роль участника' : undefined}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            >
              {addMemberMut.isPending && <Loader2 size={14} className="animate-spin" />}
              Добавить
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Search users */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">1. Найдите пользователя</p>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={addSearch}
                  onChange={e => { setAddSearch(e.target.value); setAddSelectedUserId(''); }}
                  placeholder="Имя или никнейм..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-primary-500"
                />
              </div>
              {addSearch.trim().length < 2 ? (
                <p className="text-xs text-slate-600 italic py-1">Введите минимум 2 символа</p>
              ) : searchLoading ? (
                <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-slate-600 italic py-1">Никого не найдено</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setAddSelectedUserId(u.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left ${
                        addSelectedUserId === u.id
                          ? 'bg-primary-500/10 border-primary-500/40'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <AvatarComponent src={u.avatar} name={`${u.lastName ?? ''} ${u.firstName ?? ''}`} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{u.lastName} {u.firstName}</p>
                        {u.nickname && <p className="text-xs text-slate-500 truncate">@{u.nickname}</p>}
                      </div>
                      {addSelectedUserId === u.id && <CheckCircle2 size={16} className="text-primary-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Roles */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">2. Роли</p>
              <button
                onClick={() => setAddRolePickerOpen(true)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
              >
                <span className={addRoleIds.length ? 'text-white' : 'text-slate-500'}>
                  {addRoleIds.length ? `Выбрано ролей: ${addRoleIds.length}` : 'Выбрать роли'}
                </span>
                <Tag size={14} className="text-slate-500" />
              </button>
            </div>

            {/* Participation */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">3. Статус участия</p>
              <div className="flex gap-2">
                {([['ACTIVE_MEMBER', 'Действующий участник'], ['FORMER_MEMBER', 'Бывший участник']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAddParticipation(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      addParticipation === val
                        ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {addFeedback && (
              <p className="text-sm text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} /> {addFeedback}</p>
            )}
            {addMemberMut.isError && (
              <p className="text-sm text-red-400">{(addMemberMut.error as any)?.response?.data?.error ?? 'Ошибка. Попробуйте снова.'}</p>
            )}
          </div>
        </div>
      )}

      {/* RolePicker for add-member */}
      {addRolePickerOpen && (
        <RolePicker
          context="collective"
          value={addRoleIds}
          onSave={(ids) => setAddRoleIds(ids)}
          onClose={() => setAddRolePickerOpen(false)}
          title="Роли участника"
        />
      )}

      {/* ── Phase 5b: Invite-link (unregistered) flow ── */}
      {showInviteLink && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm">Пригласить на сервис</h3>
              <button onClick={() => setShowInviteLink(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {!generatedLink ? (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Роли</p>
                    <button
                      onClick={() => setLinkRolePickerOpen(true)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-left flex justify-between items-center"
                    >
                      <span className={linkRoleIds.length ? 'text-white' : 'text-slate-500'}>
                        {linkRoleIds.length ? `Выбрано ролей: ${linkRoleIds.length}` : 'Выбрать роли'}
                      </span>
                      <Tag size={14} className="text-slate-500" />
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Статус участия</p>
                    <div className="flex gap-2">
                      {([['ACTIVE_MEMBER', 'Действующий'], ['FORMER_MEMBER', 'Бывший']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setLinkParticipation(val)}
                          className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                            linkParticipation === val
                              ? 'bg-primary-500/10 border-primary-500/40 text-primary-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => inviteLinkMut.mutate()}
                    disabled={inviteLinkMut.isPending}
                    className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {inviteLinkMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Создать ссылку
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-400">Ссылка-приглашение готова. Она привязана к выбранным ролям и не имеет срока действия.</p>
                  <div className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg">
                    <code className="text-xs text-primary-300 truncate flex-1">{generatedLink}</code>
                  </div>
                  <button
                    onClick={async () => {
                      if (navigator.share) {
                        try { await navigator.share({ url: generatedLink }); } catch { /* cancelled */ }
                      } else {
                        try {
                          await navigator.clipboard.writeText(generatedLink);
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 1500);
                        } catch { /* ignore */ }
                      }
                    }}
                    className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <Share2 size={14} /> {linkCopied ? 'Скопировано' : 'Поделиться'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RolePicker for invite-link */}
      {linkRolePickerOpen && (
        <RolePicker
          context="collective"
          value={linkRoleIds}
          onSave={(ids) => setLinkRoleIds(ids)}
          onClose={() => setLinkRolePickerOpen(false)}
          title="Роли приглашения"
        />
      )}

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

      {/* ── Phase 5b: Owner picker (transfer owner) ── */}
      {showOwnerPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm">Изменить владельца</h3>
              <button onClick={() => setShowOwnerPicker(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="p-4">
              {confirmedMembers.filter((m) => !m.isOwner).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Нет других участников.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
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
        </div>
      )}

      {/* ── Phase 5b: Admin picker (add admin) ── */}
      {showAdminPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm">Добавить администратора</h3>
              <button onClick={() => setShowAdminPicker(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="p-4">
              {confirmedMembers.filter((m) => !m.isAdmin).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Все участники уже администраторы.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
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
          </div>
        </div>
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

      {/* ── Phase 6b: Create release form ── */}
      {showReleaseForm && id && (
        <MediaItemForm
          kind="release"
          artistId={id}
          onClose={() => setShowReleaseForm(false)}
        />
      )}

      {/* ── Phase 6b: Create clip form ── */}
      {showClipForm && id && (
        <MediaItemForm
          kind="clip"
          artistId={id}
          onClose={() => setShowClipForm(false)}
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
