import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Send, Heart, MessageCircle, Trash2, Loader2, X,
  MoreHorizontal, Image, Pencil, Check, Smile,
  Crown, BadgeCheck, Ban, SlidersHorizontal,
  Plus, FileText, Briefcase, Calendar, CheckSquare, Lightbulb, Wrench,
  Zap, BarChart3, Star, WifiOff, RefreshCw, HelpCircle, Repeat2,
  ExternalLink, MessageSquare, HandshakeIcon, Loader2 as Spinner,
  ArrowUpDown, ChevronDown, ChevronUp, Megaphone, Flag,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import ShareButton from '../components/ShareButton';
import ComplaintModal from '../components/ComplaintModal';
import { api, postAPI, messageAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import { useAuthStore } from '../stores/authStore';
import { useAuthGate } from '../components/AuthGateModal';
import DealCreateModal from '../components/DealCreateModal';
import { DEALS_ENABLED } from '../lib/features';
import OnboardingPrompt from '../components/OnboardingPrompt';
import VacancyForm from '../components/VacancyForm';
import { workFormatLabel, geographyLabel, paymentLabel } from '../lib/vacancyOptions';
import AvatarComponent from '../components/Avatar';
import AudioPlayer from '../components/AudioPlayer';
import PostContent from '../components/PostContent';
import RichTextEditor from '../components/RichTextEditor';
import { ReactionBar, DoubleTapReactWrapper } from '../components/ReactionBar';
import EmojiPicker from '../components/EmojiPicker';
import { loadFilters, DEFAULT_FILTERS, FlowFilters, FLOW_FILTERS_KEY } from './FlowSettingsPage';
import ConfirmDialog from '../components/ConfirmDialog';
import { useScrollLock } from '../lib/scrollLock';
import { htmlToText } from '../lib/htmlText';

const API_URL = import.meta.env.VITE_API_URL || '';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} д.`;
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function Avatar({ user, size = 10 }: { user: { firstName: string; lastName: string; avatar?: string }; size?: number }) {
  return <AvatarComponent src={user.avatar} name={`${user.firstName} ${user.lastName}`} size={size * 4} />;
}

// ─── Feed cache helpers ────────────────────────────────────────────────────────

type CursorPage<T = any> = { items: T[]; nextCursor: string | null };

// Все кэши, где может лежать карточка поста: лента (любые фильтры),
// «Сохранённые», пост по deep link (?post=).
const POST_CACHE_KEYS = [['feed'], ['feed-saved'], ['feed-post']];

function mapPostInData(data: any, postId: string, fn: (p: any) => any): any {
  if (!data) return data;
  const mapPost = (p: any) => (p && p.id === postId ? fn(p) : p);
  if (Array.isArray(data.pages)) {
    return {
      ...data,
      pages: data.pages.map((pg: any) =>
        Array.isArray(pg) ? pg.map(mapPost)
        : pg && Array.isArray(pg.items) ? { ...pg, items: pg.items.map(mapPost) }
        : pg),
    };
  }
  if (Array.isArray(data)) return data.map(mapPost);
  if (data.id) return mapPost(data);
  return data;
}

/** Оптимистично меняет пост во всех кэшах (лента/сохранённые/deep link). */
function patchPostEverywhere(qc: QueryClient, postId: string, fn: (p: any) => any) {
  for (const queryKey of POST_CACHE_KEYS) qc.setQueriesData({ queryKey }, (d: any) => mapPostInData(d, postId, fn));
}

// Посты, удалённые в этой вкладке: deep link на них не перезапрашиваем и не показываем
// тост «Пост не найден» (иначе сразу после удаления — лишний 404 и ошибка).
const deletedPostIds = new Set<string>();

function invalidatePostCaches(qc: QueryClient) {
  for (const queryKey of POST_CACHE_KEYS) qc.invalidateQueries({ queryKey });
  qc.invalidateQueries({ queryKey: ['saved-posts'] }); // FriendsPage
}

function withMyReaction(p: any, emoji: string | null) {
  const prev: string | null = p.myReaction ?? null;
  let summary: { emoji: string; count: number }[] = (p.reactionSummary ?? []).map((s: any) => ({ ...s }));
  if (prev) summary = summary.map((s) => (s.emoji === prev ? { ...s, count: s.count - 1 } : s));
  if (emoji) {
    const found = summary.find((s) => s.emoji === emoji);
    if (found) found.count += 1;
    else summary.push({ emoji, count: 1 });
  }
  return { ...p, myReaction: emoji, reactionSummary: summary.filter((s) => s.count > 0) };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => (it && !seen.has(it.id) ? (seen.add(it.id), true) : false));
}

function toCursorPage(data: any): CursorPage {
  // Совместимость со старым сервером, который отдаёт массив.
  if (Array.isArray(data)) return { items: data, nextCursor: null };
  return { items: Array.isArray(data?.items) ? data.items : [], nextCursor: data?.nextCursor ?? null };
}

// ─── Comment Item ──────────────────────────────────────────────────────────────

function CommentItem({ comment, postId, postAuthorId, currentUserId, isReply = false }: {
  comment: any; postId: string; postAuthorId?: string; currentUserId: string; isReply?: boolean;
}) {
  const queryClient = useQueryClient();
  const isOwner = !!currentUserId && comment.author.id === currentUserId;
  // Автор поста может удалять чужие комментарии под своим постом (сервер это разрешает).
  const canDelete = isOwner || (!!currentUserId && postAuthorId === currentUserId);
  const refreshComments = () => queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const replyInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editing]);

  useEffect(() => {
    if (showReplyInput) replyInputRef.current?.focus();
  }, [showReplyInput]);

  const deleteMut = useMutation({
    mutationFn: () => postAPI.deleteComment(postId, comment.id),
    onSuccess: () => { refreshComments(); invalidatePostCaches(queryClient); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить комментарий')),
  });

  const editMut = useMutation({
    mutationFn: () => postAPI.editComment(postId, comment.id, editText),
    onSuccess: () => { refreshComments(); setEditing(false); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить комментарий')),
  });

  const reactMut = useMutation({
    mutationFn: (emoji: string) => postAPI.reactComment(postId, comment.id, emoji),
    onSuccess: refreshComments,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось поставить реакцию')),
  });

  const unreactMut = useMutation({
    mutationFn: () => postAPI.unreactComment(postId, comment.id),
    onSuccess: refreshComments,
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось убрать реакцию')),
  });

  const replyMut = useMutation({
    mutationFn: (content: string) => postAPI.commentPost(postId, content, comment.id),
    onSuccess: () => {
      refreshComments();
      patchPostEverywhere(queryClient, postId, (p) => ({ ...p, _count: { ...p._count, comments: (p._count?.comments ?? 0) + 1 } }));
      setReplyText(''); setShowReplyInput(false);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить ответ')),
  });

  const isEdited = new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 3000;

  return (
    <div className={isReply ? 'ml-9' : ''}>
      <div className="flex gap-2.5 group/comment">
        <Link to={`/profile/${comment.author.id}`}><Avatar user={comment.author} size={isReply ? 6 : 7} /></Link>
        <div className="flex-1 min-w-0">
          <DoubleTapReactWrapper
            reactions={comment.reactions ?? []}
            currentUserId={currentUserId}
            onReact={(emoji) => reactMut.mutate(emoji)}
            onUnreact={() => unreactMut.mutate()}
          >
            <div className="bg-slate-800/60 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/profile/${comment.author.id}`} className="text-xs font-semibold text-white hover:text-primary-400 transition-colors truncate">
                  {comment.author.firstName} {comment.author.lastName}
                </Link>
                {canDelete && !editing && (
                  // На устройствах без hover (телефоны) кнопки видны всегда; с мышью — по наведению.
                  <div className="flex items-center gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/comment:opacity-100 focus-within:opacity-100 transition-all flex-shrink-0">
                    {isOwner && (
                      <button type="button" onClick={() => { setEditText(comment.content); setEditing(true); }} aria-label="Изменить комментарий" className="text-slate-500 hover:text-slate-300 p-1 transition-colors">
                        <Pencil size={12} />
                      </button>
                    )}
                    <button type="button" onClick={() => setConfirmDelete(true)} disabled={deleteMut.isPending} aria-label="Удалить комментарий" className="text-slate-500 hover:text-red-400 p-1 transition-colors">
                      {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    </button>
                  </div>
                )}
              </div>
              {editing ? (
                <div className="mt-1 space-y-1.5">
                  <textarea
                    ref={editRef}
                    value={editText}
                    onChange={e => { setEditText(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editText.trim()) editMut.mutate(); } if (e.key === 'Escape') setEditing(false); }}
                    className="w-full bg-slate-700/60 border border-slate-600 focus:border-primary-500 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none resize-none transition-colors"
                    maxLength={2000}
                    rows={1}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-white px-2 py-0.5 transition-colors">Отмена</button>
                    <button onClick={() => { if (editText.trim()) editMut.mutate(); }} disabled={editMut.isPending || !editText.trim()} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white rounded-md transition-colors">
                      {editMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {comment.content && <p className="text-xs text-slate-300 leading-relaxed mt-0.5 break-words">{comment.content}</p>}
                  {comment.imageUrl && (
                    <img src={`${API_URL}${comment.imageUrl}`} alt="" loading="lazy" className="mt-1.5 max-h-56 rounded-lg border border-slate-700 object-cover" />
                  )}
                </>
              )}
            </div>
          </DoubleTapReactWrapper>
          <div className="px-1 flex items-center gap-3">
            <ReactionBar reactions={comment.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => reactMut.mutate(emoji)} onUnreact={() => unreactMut.mutate()} />
            {!isReply && (
              <button
                onClick={() => setShowReplyInput(v => !v)}
                className="text-[11px] text-slate-500 hover:text-primary-400 transition-colors py-0.5"
              >
                Ответить
              </button>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-0.5 px-1">
            {timeAgo(comment.createdAt)}
            {isEdited && <span className="text-slate-700"> · изм. {timeAgo(comment.updatedAt)}</span>}
          </p>

          {/* Reply input */}
          {showReplyInput && (
            <form
              onSubmit={e => { e.preventDefault(); if (replyText.trim()) replyMut.mutate(replyText.trim()); }}
              className="flex gap-1.5 items-center mt-1.5"
            >
              <input
                ref={replyInputRef}
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setShowReplyInput(false); }}
                placeholder={`Ответить ${comment.author.firstName}...`}
                maxLength={2000}
                className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/60 focus:border-primary-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button type="submit" disabled={!replyText.trim() || replyMut.isPending} className="p-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white rounded-lg transition-colors flex-shrink-0">
                {replyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message="Удалить комментарий?"
        confirmLabel="Удалить"
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Replies */}
      {!isReply && comment.replies?.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply: any) => (
            <CommentItem key={reply.id} comment={reply} postId={postId} postAuthorId={postAuthorId} currentUserId={currentUserId} isReply />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

const MAX_POST_IMAGES = 10;

function PostCard({ post, currentUserId, highlight = false }: { post: any; currentUserId: string; highlight?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [commentImage, setCommentImage] = useState<{ url: string; serverUrl: string } | null>(null);
  const [commentUploading, setCommentUploading] = useState(false);
  const [newCommentId, setNewCommentId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [repostComment, setRepostComment] = useState('');
  const [showComplaint, setShowComplaint] = useState(false);
  useScrollLock(showRepost);
  useScrollLock(showComments);

  // Structured «Услуга» card — guest gating + «Написать» / «Оформить сделку».
  const { ensureAuth, authGateModal } = useAuthGate();
  const [showDeal, setShowDeal] = useState(false);
  const [contacting, setContacting] = useState(false);
  const svc = post.type === 'service' && post.service ? post.service : null;
  const order = post.type === 'order' && post.order ? post.order : null;
  const vacancy = post.type === 'vacancy' && post.vacancy ? post.vacancy : null;
  // Вакансию в потоке показываем ОТ ИМЕНИ АРТИСТА: артист — крупно и кликабельно (→ страница артиста),
  // владелец (создатель) — вторичной кликабельной строкой (наоборот к обычной шапке).
  const vacancyArtist = post.type === 'vacancy' && post.artist ? post.artist : null;
  const openServiceChat = () => {
    if (!svc || contacting) return;
    setContacting(true);
    messageAPI.contactService(svc.id)
      .then(({ data }) => navigate(`/messages/${data.conversationId}`))
      .catch(() => navigate('/messages'))
      .finally(() => setContacting(false));
  };

  // Guests (no current user) cannot react — bounce them to login instead.
  const requireAuth = (action: () => void) => {
    if (!currentUserId) { navigate('/login'); return; }
    action();
  };
  const [editContent, setEditContent] = useState(post.content);
  // Фото поста при редактировании: новые посты хранят images[], легаси — imageUrl.
  const originalImages: string[] = Array.isArray(post.images) && post.images.length > 0
    ? post.images
    : post.imageUrl ? [post.imageUrl] : [];
  const [editImages, setEditImages] = useState<{ url: string; serverUrl: string }[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const commentImageRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = !!currentUserId && post.author.id === currentUserId;
  const isLongContent = !editing && post.content.length > 280;

  const startEditing = () => {
    setEditContent(post.content);
    setEditImages(originalImages.map((u) => ({ url: `${API_URL}${u}`, serverUrl: u })));
    setEditing(true);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Комментарии — отдельный постраничный запрос при открытии шторки ──
  const commentsQuery = useInfiniteQuery({
    queryKey: ['post-comments', post.id],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/posts/${post.id}/comments`, { params: { cursor: pageParam || undefined, limit: 20 } });
      return toCursorPage(data);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: showComments,
  });
  const comments = useMemo(
    () => dedupeById((commentsQuery.data?.pages ?? []).flatMap((p) => p.items)),
    [commentsQuery.data],
  );

  // После публикации коммента — проскроллить к нему (список уже перезапросился)
  useEffect(() => {
    if (!newCommentId) return;
    const el = document.getElementById(`comment-${newCommentId}`);
    if (!el) return; // ещё не отрендерился — сработает при следующем обновлении списка
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setNewCommentId(null);
  }, [comments, newCommentId]);

  const bumpComments = (delta: number) =>
    patchPostEverywhere(queryClient, post.id, (p) => ({ ...p, _count: { ...p._count, comments: Math.max(0, (p._count?.comments ?? 0) + delta) } }));

  // Лайк/сохранение — оптимистично (кнопка сразу в новом состоянии, повторный
  // клик заблокирован до ответа), сервер идемпотентен.
  const likeMut = useMutation({
    mutationFn: (like: boolean) => (like ? postAPI.likePost(post.id) : postAPI.unlikePost(post.id)),
    onMutate: (like: boolean) => patchPostEverywhere(queryClient, post.id, (p) => ({
      ...p,
      isLiked: like,
      _count: { ...p._count, likes: Math.max(0, (p._count?.likes ?? 0) + (p.isLiked === like ? 0 : like ? 1 : -1)) },
    })),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось поставить лайк')),
    onSettled: () => invalidatePostCaches(queryClient),
  });
  const commentMut = useMutation({
    mutationFn: () => postAPI.commentPost(post.id, commentText.trim(), undefined, commentImage?.serverUrl),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', post.id] });
      bumpComments(1);
      setCommentText(''); setCommentImage(null); setShowEmoji(false);
      if (res?.data?.id) setNewCommentId(res.data.id);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отправить комментарий')),
  });
  // Правка шлёт только изменённое: аудио и нетронутые фото не затираются.
  const editMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (editContent !== post.content) body.content = editContent;
      const nextImages = editImages.map((i) => i.serverUrl);
      if (nextImages.join('\n') !== originalImages.join('\n')) body.images = nextImages;
      return api.put(`/posts/${post.id}`, body);
    },
    onSuccess: () => { invalidatePostCaches(queryClient); setEditing(false); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить изменения')),
  });
  const deleteMut = useMutation({
    mutationFn: () => postAPI.deletePost(post.id),
    onSuccess: () => {
      deletedPostIds.add(post.id);
      queryClient.setQueryData(['feed-post', post.id], null);
      for (const queryKey of [['feed'], ['feed-saved'], ['saved-posts']]) queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось удалить пост')) });
  const reactMut = useMutation({
    mutationFn: (emoji: string) => postAPI.reactPost(post.id, emoji),
    onMutate: (emoji: string) => patchPostEverywhere(queryClient, post.id, (p) => withMyReaction(p, emoji)),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось поставить реакцию')),
    onSettled: () => invalidatePostCaches(queryClient),
  });
  const unreactMut = useMutation({
    mutationFn: () => postAPI.unreactPost(post.id),
    onMutate: () => patchPostEverywhere(queryClient, post.id, (p) => withMyReaction(p, null)),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось убрать реакцию')),
    onSettled: () => invalidatePostCaches(queryClient),
  });
  const voteMut = useMutation({
    mutationFn: (optionIndex: number) => postAPI.votePoll(post.id, optionIndex),
    onSuccess: ({ data }: any) => {
      patchPostEverywhere(queryClient, post.id, (p) => ({
        ...p,
        ...(Array.isArray(data?.options) ? { pollOptions: data.options } : {}),
        myVote: data?.myVote ?? null,
        pollVotes: [{ userId: currentUserId, optionIndex: data?.myVote }],
      }));
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось проголосовать')),
  });
  const saveMut = useMutation({
    mutationFn: (saved: boolean) => api.post(`/posts/${post.id}/save`, { saved }),
    onMutate: (saved: boolean) => patchPostEverywhere(queryClient, post.id, (p) => ({
      ...p,
      isSaved: saved,
      _count: { ...p._count, savedBy: Math.max(0, (p._count?.savedBy ?? 0) + (p.isSaved === saved ? 0 : saved ? 1 : -1)) },
    })),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить пост')),
    onSettled: () => invalidatePostCaches(queryClient),
  });
  const repostMut = useMutation({
    mutationFn: (comment: string) => postAPI.repostPost(post.id, comment.trim() || undefined),
    onSuccess: () => { invalidatePostCaches(queryClient); setShowRepost(false); setRepostComment(''); },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось поделиться постом')),
  });

  // Несколько фото: грузим по очереди, ошибка одного не обрывает остальные.
  const uploadEditFiles = async (files: File[]) => {
    const room = MAX_POST_IMAGES - editImages.length;
    const toUpload = files.slice(0, Math.max(0, room));
    if (toUpload.length === 0) return;
    setEditUploading(true);
    const failed: string[] = [];
    let lastError: any = null;
    try {
      for (const file of toUpload) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await postAPI.uploadMedia(fd);
          setEditImages((prev) => (prev.length >= MAX_POST_IMAGES ? prev : [...prev, { url: URL.createObjectURL(file), serverUrl: data.url }]));
        } catch (e) {
          failed.push(file.name);
          lastError = e;
        }
      }
    } finally { setEditUploading(false); }
    if (failed.length) {
      toast.error(`${getApiError(lastError, 'Не удалось загрузить фото')}: ${failed.join(', ')}`);
    }
  };

  // Эмодзи — в позицию курсора, а не в конец
  const insertCommentEmoji = (em: string) => {
    const el = commentInputRef.current;
    const start = el?.selectionStart ?? commentText.length;
    const end = el?.selectionEnd ?? start;
    setCommentText((t) => t.slice(0, start) + em + t.slice(end));
    requestAnimationFrame(() => {
      const node = commentInputRef.current;
      if (!node) return;
      const pos = start + em.length;
      try { node.setSelectionRange(pos, pos); } catch {}
    });
  };

  const uploadCommentFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Можно приложить только картинку'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Картинка больше 5 МБ'); return; }
    setCommentUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      setCommentImage({ url: URL.createObjectURL(file), serverUrl: data.url });
    } catch (e: any) {
      toast.error(getApiError(e, 'Не удалось загрузить картинку'));
    } finally { setCommentUploading(false); }
  };

  const typeMeta = POST_TYPE_META[post.type] ?? POST_TYPE_META.blog;
  const TypeIcon = typeMeta.icon;
  const showTypeBadge = post.type && post.type !== 'blog';

  const isRepost = !!post.repostOfId || !!post.repostOf || !!post.repostDeleted;
  const original = post.repostOf;

  return (
    <div id={`post-${post.id}`} className={`px-4 py-4 hover:bg-slate-900/30 transition-colors ${highlight ? 'ring-2 ring-primary-500/40 ring-inset bg-primary-500/5' : ''}`}>
      {isRepost && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2 ml-1">
          <Repeat2 size={13} className="flex-shrink-0" />
          <span className="truncate min-w-0">«{post.author.firstName} {post.author.lastName} поделился(ась)»</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={vacancyArtist ? `/artist/${vacancyArtist.id}` : `/profile/${post.author.id}`} className="flex-shrink-0">
            <Avatar user={vacancyArtist ? { firstName: vacancyArtist.name, lastName: '', avatar: vacancyArtist.avatar } : post.author} size={10} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link to={vacancyArtist ? `/artist/${vacancyArtist.id}` : `/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate">
                {vacancyArtist ? vacancyArtist.name : `${post.author.firstName} ${post.author.lastName}`}
              </Link>
              {!vacancyArtist && post.author.isPremium && <span title="Premium"><Crown size={13} className="text-amber-400 flex-shrink-0" /></span>}
              {!vacancyArtist && post.author.isVerified && <span title="Верифицирован"><BadgeCheck size={13} className="text-sky-400 flex-shrink-0" /></span>}
              {!vacancyArtist && post.author.isBlocked && <span title="Заблокирован"><Ban size={13} className="text-red-500 flex-shrink-0" /></span>}
              {showTypeBadge && (
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeMeta.badge}`}>
                  <TypeIcon size={10} />
                  {typeMeta.label}
                </span>
              )}
            </div>
            {vacancyArtist ? (
              <Link to={`/profile/${post.author.id}`} className="text-xs text-slate-500 hover:text-primary-400 transition-colors truncate block">
                👤 {post.author.firstName} {post.author.lastName}
              </Link>
            ) : post.channel ? (
              <p className="text-xs text-slate-500 truncate">📢 {post.channel.name}</p>
            ) : post.artist ? (
              <p className="text-xs text-slate-500 truncate">🎵 {post.artist.name}</p>
            ) : null}
            <p className="text-xs text-slate-500 truncate">
              {timeAgo(post.createdAt)}{post.author.role ? ` · ${post.author.role}` : ''}
              {new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 5000 && (
                <span className="text-slate-600"> · Изменена {new Date(post.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </p>
          </div>
        </div>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button type="button" onClick={() => setShowMenu(m => !m)} aria-label="Действия с постом" className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><MoreHorizontal size={16} /></button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden min-w-[170px]">
              {isOwner ? (
                <>
                  {!isRepost && (
                    <button type="button" onClick={() => { setShowMenu(false); startEditing(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"><Pencil size={14} /> Редактировать</button>
                  )}
                  <button type="button" onClick={() => { setShowMenu(false); setConfirmDelete(true); }} disabled={deleteMut.isPending} className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors ${!isRepost ? 'border-t border-slate-700' : ''}`}>
                    {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Удалить пост
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => { setShowMenu(false); requireAuth(() => setShowComplaint(true)); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors">
                  <Flag size={14} /> Пожаловаться
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 ml-[52px]">
        {editing ? (
          <div className="space-y-2">
            <RichTextEditor value={editContent} onChange={setEditContent} autoFocus minHeight={80} />
            {editImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {editImages.map((img, i) => (
                  <div key={`${img.serverUrl}-${i}`} className="relative flex-shrink-0">
                    <img src={img.url} alt={`Фото ${i + 1}`} className="h-24 w-24 rounded-xl object-cover border border-slate-700" />
                    <button type="button" onClick={() => setEditImages(prev => prev.filter((_, idx) => idx !== i))} aria-label="Убрать фото" className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <input ref={editImageRef} type="file" accept="image/*,.gif" multiple className="hidden" onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) uploadEditFiles(fs); e.target.value = ''; }} />
                <button type="button" onClick={() => editImageRef.current?.click()} disabled={editUploading || editImages.length >= MAX_POST_IMAGES} aria-label="Добавить фото" title={editImages.length >= MAX_POST_IMAGES ? `Максимум ${MAX_POST_IMAGES} фото` : 'Добавить фото'} className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
                  {editUploading ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Отмена</button>
                <button type="button" onClick={() => editMut.mutate()} disabled={editMut.isPending || editUploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors">
                  {editMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Сохранить
                </button>
              </div>
            </div>
          </div>
        ) : (
          <DoubleTapReactWrapper myEmoji={post.myReaction ?? null} currentUserId={currentUserId} onReact={(emoji) => requireAuth(() => reactMut.mutate(emoji))} onUnreact={() => requireAuth(() => unreactMut.mutate())}>
            <>
              {isRepost && (
                <>
                  {(post.repostComment || (post.content && original)) && (
                    <PostContent content={post.repostComment || post.content} className="text-sm text-slate-200 mb-2" />
                  )}
                  {post.repostDeleted ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                      <p className="text-sm text-slate-500">Пост удалён</p>
                    </div>
                  ) : original ? (
                    <button
                      type="button"
                      onClick={() => original.author?.id && navigate(`/profile/${original.author.id}`)}
                      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-colors p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {original.author && <Avatar user={original.author} size={7} />}
                        <span className="text-sm font-semibold text-white truncate min-w-0">
                          {original.author ? `${original.author.firstName} ${original.author.lastName}` : 'Автор'}
                        </span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{original.createdAt ? timeAgo(original.createdAt) : ''}</span>
                      </div>
                      {original.content && (
                        <PostContent content={original.content} className="text-sm text-slate-300 line-clamp-6" />
                      )}
                      {(() => {
                        const firstImg = (Array.isArray(original.images) && original.images[0]) || original.imageUrl;
                        return firstImg ? (
                          <img src={`${API_URL}${firstImg}`} alt="Вложение" className="mt-2 max-h-72 w-full object-cover rounded-lg border border-slate-800" loading="lazy" />
                        ) : null;
                      })()}
                    </button>
                  ) : null}
                </>
              )}
              {post.type === 'employment' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/30 mb-2">
                  <Zap size={13} className="text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-400">Апдейт занятости</span>
                </div>
              )}
              {post.type === 'poll' && Array.isArray(post.pollOptions) && (() => {
                const opts = post.pollOptions as Array<{text: string; votes: number}>;
                const total = opts.reduce((s, o) => s + (o.votes || 0), 0);
                const ended = post.pollEndsAt && new Date(post.pollEndsAt) < new Date();
                const myVoteIdx = post.myVote ?? post.pollVotes?.find((v: any) => v.userId === currentUserId)?.optionIndex;
                return (
                  <div className="space-y-2 mb-2">
                    {opts.map((opt, idx) => {
                      const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                      const isMyVote = myVoteIdx === idx;
                      return (
                        <button key={idx} type="button"
                          disabled={ended || voteMut.isPending}
                          onClick={() => requireAuth(() => voteMut.mutate(idx))}
                          className="w-full relative overflow-hidden bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-left transition-all disabled:cursor-default disabled:opacity-80">
                          <div className="absolute inset-0 bg-cyan-500/15" style={{ width: `${pct}%` }} />
                          <div className="relative flex items-center justify-between gap-3">
                            <span className="text-sm text-white font-medium flex items-center gap-2 min-w-0 break-words [overflow-wrap:anywhere]">
                              {isMyVote && <Check size={12} className="text-cyan-400 flex-shrink-0" />}
                              {opt.text}
                            </span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{pct}% · {opt.votes}</span>
                          </div>
                        </button>
                      );
                    })}
                    <p className="text-[11px] text-slate-500">
                      {total} {total === 1 ? 'голос' : (total > 1 && total < 5 ? 'голоса' : 'голосов')}
                      {ended ? ' · опрос завершён' : post.pollEndsAt ? ` · до ${new Date(post.pollEndsAt).toLocaleDateString('ru-RU')}` : ''}
                    </p>
                  </div>
                );
              })()}
              {/* Structured «Услуга» card — auto-pulled fields + 3 actions. */}
              {!isRepost && svc && (() => {
                const serviceTitle = post.title || svc.name || svc.service?.name || 'Услуга';
                const sectionName = svc.service?.section?.name || '';
                const professionName = svc.profession?.name || '';
                const city = svc.user?.city || '';
                const price = (svc.priceFrom != null || svc.priceTo != null)
                  ? [
                      svc.priceFrom != null ? `от ${svc.priceFrom} ₽` : null,
                      svc.priceTo != null ? `до ${svc.priceTo} ₽` : null,
                    ].filter(Boolean).join(' ')
                  : 'По договорённости';
                const preview = (Array.isArray(post.images) && post.images[0]) || post.imageUrl;
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    {preview && (
                      <img src={`${API_URL}${preview}`} alt={serviceTitle} className="w-full max-h-72 object-cover" loading="lazy" />
                    )}
                    <div className="p-3.5 space-y-2.5">
                      <p className="text-base font-bold text-white leading-snug min-w-0 break-words [overflow-wrap:anywhere]">{serviceTitle}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {sectionName && (
                          <span className="text-xs text-slate-400">
                            Раздел: <span className="text-slate-200">{sectionName}</span>
                          </span>
                        )}
                        {professionName && (
                          <span className="text-xs text-slate-400">
                            Профессия: <span className="text-slate-200">{professionName}</span>
                          </span>
                        )}
                        {city && (
                          <span className="text-xs text-slate-400">
                            Город: <span className="text-slate-200">{city}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          Стоимость: <span className="text-primary-300 font-semibold">{price}</span>
                        </span>
                      </div>
                      {post.content && (
                        <PostContent content={post.content} className="text-sm text-slate-200" />
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/services/${svc.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          <ExternalLink size={15} /> Детали услуги
                        </button>
                        {!isOwner && svc.user?.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => ensureAuth(openServiceChat)}
                            disabled={contacting}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
                          >
                            {contacting ? <Spinner size={15} className="animate-spin" /> : <MessageSquare size={15} />} Написать
                          </button>
                        )}
                        {DEALS_ENABLED && (
                          <button
                            type="button"
                            onClick={() => ensureAuth(() => setShowDeal(true))}
                            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors"
                          >
                            <HandshakeIcon size={15} /> Оформить сделку
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Structured «Заказ» card — customer-posted order. */}
              {!isRepost && order && (() => {
                const orderTitle = post.title || order.title || 'Заказ';
                const sectionName = order.service?.section?.name || '';
                const budget = (order.budgetFrom != null || order.budgetTo != null)
                  ? [
                      order.budgetFrom != null ? `от ${order.budgetFrom} ₽` : null,
                      order.budgetTo != null ? `до ${order.budgetTo} ₽` : null,
                    ].filter(Boolean).join(' ')
                  : 'По договорённости';
                const deadline = order.deadline
                  ? new Date(order.deadline).toLocaleDateString('ru-RU')
                  : 'Срок не ограничен';
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-bold text-white leading-snug min-w-0 break-words [overflow-wrap:anywhere]">{orderTitle}</p>
                        {order.status === 'archived' ? (
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700/70 text-slate-300 border border-slate-600/60">
                            В архиве
                          </span>
                        ) : order.status === 'done' ? (
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ✓ Выполнен
                          </span>
                        ) : order.executorId ? (
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            В работе
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {sectionName && (
                          <span className="text-xs text-slate-400">
                            Раздел: <span className="text-slate-200">{sectionName}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          Бюджет: <span className="text-teal-300 font-semibold">{budget}</span>
                        </span>
                        <span className="text-xs text-slate-400">
                          Срок: <span className="text-slate-200">{deadline}</span>
                        </span>
                      </div>
                      {post.content && (
                        <PostContent
                          content={post.content}
                          className={`text-sm text-slate-200 ${post.content.length > 280 && !expanded ? 'line-clamp-6' : ''}`}
                        />
                      )}
                      {post.content && post.content.length > 280 && (
                        <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">{expanded ? 'Свернуть' : 'Читать полностью'}</button>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          <ExternalLink size={15} /> Посмотреть детали
                        </button>
                        {!isOwner && (
                          <button
                            type="button"
                            onClick={() => navigate(`/messages/${post.author.id}`)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                          >
                            <MessageSquare size={15} /> Написать
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Structured «Вакансия» card — artist-posted vacancy. */}
              {!isRepost && vacancy && (() => {
                const vacancyTitle = post.title || vacancy.title || 'Вакансия';
                const professionName = vacancy.profession?.name || '';
                const formatLabel = vacancy.workFormat ? workFormatLabel(vacancy.workFormat) : '';
                const paymentLbl = vacancy.paymentType ? paymentLabel(vacancy.paymentType) : '';
                const geoLabel = vacancy.geography ? geographyLabel(vacancy.geography) : '';
                return (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-bold text-white leading-snug min-w-0 break-words [overflow-wrap:anywhere]">{vacancyTitle}</p>
                        {vacancy.status === 'archived' && (
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700/70 text-slate-300 border border-slate-600/60">
                            В архиве
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {professionName && (
                          <span className="text-xs text-slate-400">
                            Профессия: <span className="text-slate-200">{professionName}</span>
                          </span>
                        )}
                        {formatLabel && (
                          <span className="text-xs text-slate-400">
                            Формат: <span className="text-slate-200">{formatLabel}</span>
                          </span>
                        )}
                        {paymentLbl && (
                          <span className="text-xs text-slate-400">
                            Оплата: <span className="text-amber-300 font-semibold">{paymentLbl}</span>
                          </span>
                        )}
                        {geoLabel && (
                          <span className="text-xs text-slate-400">
                            Гео: <span className="text-slate-200">{geoLabel}</span>
                          </span>
                        )}
                      </div>
                      {post.content && (
                        <PostContent
                          content={post.content}
                          className={`text-sm text-slate-200 ${post.content.length > 280 && !expanded ? 'line-clamp-6' : ''}`}
                        />
                      )}
                      {post.content && post.content.length > 280 && (
                        <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">{expanded ? 'Свернуть' : 'Читать полностью'}</button>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/vacancies/${vacancy.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          <ExternalLink size={15} /> Посмотреть детали
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {!isRepost && !svc && !order && !vacancy && post.content && (
                <PostContent
                  content={post.content}
                  className={`text-sm text-slate-200 ${isLongContent && !expanded ? 'line-clamp-6' : ''}`}
                />
              )}
              {!isRepost && !svc && !order && !vacancy && isLongContent && <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 mt-1 transition-colors">{expanded ? 'Свернуть' : 'Читать полностью'}</button>}
              {!isRepost && Array.isArray(post.links) && post.links.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {post.links.map((url: string, i: number) => {
                    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                    return (
                      <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 break-all">
                        <ExternalLink size={13} className="flex-shrink-0" />{url}
                      </a>
                    );
                  })}
                </div>
              )}
              {!isRepost && !svc && (Array.isArray(post.images) && post.images.length > 1 ? (
                <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none snap-x">
                  {post.images.map((url: string, i: number) => (
                    <img key={i} src={`${API_URL}${url}`} alt={`Вложение ${i + 1}`} className="h-48 w-auto flex-shrink-0 object-cover rounded-xl border border-slate-800 bg-slate-900/40 snap-start" loading="lazy" />
                  ))}
                </div>
              ) : (Array.isArray(post.images) && post.images.length === 1) ? (
                <div className="mt-2"><img src={`${API_URL}${post.images[0]}`} alt="Вложение" className="max-h-[32rem] w-full object-contain rounded-xl border border-slate-800 bg-slate-900/40" loading="lazy" /></div>
              ) : post.imageUrl ? (
                <div className="mt-2"><img src={`${API_URL}${post.imageUrl}`} alt="Вложение" className="max-h-[32rem] w-full object-contain rounded-xl border border-slate-800 bg-slate-900/40" loading="lazy" /></div>
              ) : null)}
              {Array.isArray(post.tags) && post.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {post.tags.map((tag: string, i: number) => (
                    <span key={i} className="text-xs text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}
              {post.audioUrl && <AudioPlayer src={`${API_URL}${post.audioUrl}`} name={post.audioName || post.audioUrl.split('/').pop()} />}
            </>
          </DoubleTapReactWrapper>
        )}
        {!editing && <ReactionBar summary={post.reactionSummary ?? []} myEmoji={post.myReaction ?? null} currentUserId={currentUserId} onReact={(emoji) => requireAuth(() => { if (!reactMut.isPending && !unreactMut.isPending) reactMut.mutate(emoji); })} onUnreact={() => requireAuth(() => { if (!reactMut.isPending && !unreactMut.isPending) unreactMut.mutate(); })} />}
      </div>

      <div className="flex items-center gap-1 ml-[52px]">
        <button type="button" onClick={() => requireAuth(() => { if (!isOwner && !likeMut.isPending) likeMut.mutate(!post.isLiked); })} disabled={likeMut.isPending || isOwner} title={isOwner ? 'Нельзя лайкать свой пост' : undefined} aria-label={post.isLiked ? 'Убрать лайк' : 'Лайк'} aria-pressed={!!post.isLiked}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${currentUserId && isOwner ? 'cursor-default text-slate-600' : post.isLiked ? 'text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
          <Heart size={15} className={post.isLiked ? 'fill-red-400 text-red-400' : ''} />
          {!!post._count?.likes && <span className="text-xs font-medium">{post._count.likes}</span>}
        </button>
        <button onClick={() => requireAuth(() => setShowComments(true))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all">
          <MessageCircle size={15} />
          {!!post._count?.comments && <span className="text-xs font-medium">{post._count.comments}</span>}
        </button>
        <button onClick={() => requireAuth(() => setShowRepost(true))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all" title="Поделиться в ленте">
          <Repeat2 size={15} />
          {!!post._count?.reposts && <span className="text-xs font-medium">{post._count.reposts}</span>}
        </button>
        <ShareButton url={`/feed?post=${post.id}`} title={`Пост от ${post.author.firstName} ${post.author.lastName}`} text={htmlToText(post.content || post.repostComment).slice(0, 100) || undefined} iconSize={15} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all" />
        <button type="button" onClick={() => requireAuth(() => { if (!saveMut.isPending) saveMut.mutate(!post.isSaved); })} disabled={saveMut.isPending} aria-pressed={!!post.isSaved}
          className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all ${post.isSaved ? 'text-amber-400 hover:bg-amber-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
          title={post.isSaved ? 'Убрать из сохранённого' : 'Сохранить'}>
          <Star size={15} fill={post.isSaved ? 'currentColor' : 'none'} />
          {!!post._count?.savedBy && <span className="text-xs font-medium">{post._count.savedBy}</span>}
        </button>
      </div>

      {showComments && createPortal(
        <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center" onClick={() => { setShowComments(false); setShowEmoji(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-700 rounded-full absolute left-1/2 -translate-x-1/2 top-1.5 sm:hidden" />
              <h3 className="text-base font-bold text-white">Комментарии{!!post._count?.comments && ` · ${post._count.comments}`}</h3>
              <button type="button" onClick={() => setShowComments(false)} aria-label="Закрыть" className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg transition-colors"><X size={18} /></button>
            </div>
            {/* Список: самый верхний комментарий сверху, скролл до последнего */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {commentsQuery.isLoading ? (
                <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
              ) : commentsQuery.isError && comments.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-500 mb-2">Не удалось загрузить комментарии</p>
                  <button type="button" onClick={() => commentsQuery.refetch()} className="text-sm text-primary-400 hover:text-primary-300">Повторить</button>
                </div>
              ) : comments.length > 0 ? (
                <>
                  {comments.map((comment: any) => (
                    <div key={comment.id} id={`comment-${comment.id}`}>
                      <CommentItem comment={comment} postId={post.id} postAuthorId={post.author.id} currentUserId={currentUserId} />
                    </div>
                  ))}
                  {commentsQuery.hasNextPage && (
                    <button
                      type="button"
                      onClick={() => commentsQuery.fetchNextPage()}
                      disabled={commentsQuery.isFetchingNextPage}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-primary-400 hover:text-primary-300 disabled:opacity-60"
                    >
                      {commentsQuery.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
                      Показать ещё
                    </button>
                  )}
                </>
              ) : (
                <p className="text-center text-sm text-slate-500 py-10">Пока нет комментариев.<br />Будьте первым!</p>
              )}
            </div>
            {/* Форма ввода — закреплена внизу */}
            <div className="flex-shrink-0 border-t border-slate-800 px-3 pt-2.5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))' }}>
              {commentImage && (
                <div className="relative inline-block mb-2">
                  <img src={commentImage.url} alt="" className="max-h-32 rounded-lg border border-slate-700" />
                  <button type="button" onClick={() => setCommentImage(null)} className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white"><X size={12} /></button>
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <div className="relative flex-shrink-0">
                  <button type="button" onClick={() => setShowEmoji(v => !v)} className="p-2 text-slate-400 hover:text-primary-400 rounded-lg transition-colors" title="Эмодзи" aria-label="Эмодзи"><Smile size={19} /></button>
                  {showEmoji && <EmojiPicker position="up" onSelect={insertCommentEmoji} onClose={() => setShowEmoji(false)} />}
                </div>
                <input ref={commentImageRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCommentFile(f); e.target.value = ''; }} />
                <button type="button" onClick={() => commentImageRef.current?.click()} disabled={commentUploading || !!commentImage} className="p-2 text-slate-400 hover:text-primary-400 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0" title="Картинка (до 5 МБ)">
                  {commentUploading ? <Loader2 size={19} className="animate-spin" /> : <Image size={19} />}
                </button>
                <textarea
                  ref={commentInputRef}
                  value={commentText}
                  onChange={e => { setCommentText(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }}
                  placeholder="Написать комментарий..."
                  aria-label="Текст комментария"
                  maxLength={2000}
                  rows={1}
                  className="flex-1 min-w-0 resize-none max-h-[120px] bg-slate-800/60 border border-slate-700 rounded-2xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
                />
                <button type="button" aria-label="Отправить комментарий" onClick={() => requireAuth(() => { if ((commentText.trim() || commentImage) && !commentMut.isPending) commentMut.mutate(); })} disabled={(!commentText.trim() && !commentImage) || commentMut.isPending || commentUploading} className="p-2.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-full transition-colors flex-shrink-0">
                  {commentMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={confirmDelete}
        message="Удалить пост? Это действие нельзя отменить."
        confirmLabel="Удалить"
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      {showRepost && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setShowRepost(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 pb-8 shadow-2xl"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center gap-2 mb-3">
              <Repeat2 size={18} className="text-primary-400" />
              <p className="text-base font-bold text-white">Поделиться в ленте</p>
            </div>
            <textarea
              value={repostComment}
              onChange={e => setRepostComment(e.target.value)}
              placeholder="Добавьте комментарий (необязательно)..."
              maxLength={1000}
              rows={3}
              className="w-full bg-slate-800/60 border border-slate-700 focus:border-primary-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none resize-none transition-colors"
            />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowRepost(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Отмена</button>
              <button
                type="button"
                onClick={() => repostMut.mutate(repostComment)}
                disabled={repostMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {repostMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Repeat2 size={14} />}
                Поделиться в ленте
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Structured «Услуга» — оформить сделку with the provider */}
      {showDeal && svc && (
        <DealCreateModal
          executorId={svc.user?.id}
          executorName={svc.user ? `${svc.user.firstName} ${svc.user.lastName}`.trim() : ''}
          userServiceId={svc.id}
          serviceName={svc.name || svc.service?.name}
          onClose={() => setShowDeal(false)}
        />
      )}
      {showComplaint && (
        <ComplaintModal targetType="post" targetId={post.id} onClose={() => setShowComplaint(false)} />
      )}
      {authGateModal}
    </div>
  );
}

// ─── Post type meta ────────────────────────────────────────────────────────────

// Левой цветовой полоски у постов больше нет (убрана по фидбеку) — тип поста
// обозначается только бейджем в шапке.
const POST_TYPE_META: Record<string, { label: string; icon: any; badge: string }> = {
  blog:       { label: 'Блог',              icon: FileText,    badge: '' },
  question:   { label: 'Вопрос',            icon: HelpCircle,  badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  service:    { label: 'Услуга',            icon: Wrench,      badge: 'bg-primary-500/10 text-primary-400 border-primary-500/20' },
  order:      { label: 'Заказ',             icon: Briefcase,   badge: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  vacancy:    { label: 'Вакансия',          icon: Megaphone,   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  event:      { label: 'Мероприятие',       icon: Calendar,    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  task:       { label: 'Задача',            icon: CheckSquare, badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  offer:      { label: 'Предложение',       icon: Lightbulb,   badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  employment: { label: 'Апдейт занятости', icon: Zap,         badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20' },
  poll:       { label: 'Опрос',             icon: BarChart3,   badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
};

// ─── Post Type Picker ──────────────────────────────────────────────────────────

const POST_TYPE_OPTIONS = [
  { type: 'blog',       label: 'Блог',              icon: FileText,    desc: 'Свободная форма',     inDev: false },
  { type: 'question',   label: 'Вопрос',            icon: HelpCircle,  desc: 'Вопрос и обсуждение', inDev: false },
  { type: 'service',    label: 'Услуга',             icon: Wrench,      desc: 'Свободная форма',     inDev: false },
  { type: 'order',      label: 'Заказ',              icon: Briefcase,   desc: 'Заявка на услугу',    inDev: false },
  { type: 'vacancy',    label: 'Вакансия',           icon: Megaphone,   desc: 'Поиск в команду',     inDev: false },
  { type: 'employment', label: 'Апдейт занятости',  icon: Zap,         desc: 'Обновить статус',     inDev: false },
  { type: 'poll',       label: 'Опрос',              icon: BarChart3,   desc: 'Голосование',         inDev: false },
];

function PostTypePicker({ onClose, onPickOrder, onPickVacancy }: { onClose: () => void; onPickOrder?: () => void; onPickVacancy?: () => void }) {
  const navigate = useNavigate();

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain bg-slate-900 rounded-t-3xl border-t border-slate-800 p-2 pb-8 shadow-2xl"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 mt-2" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 mb-3">Создать пост</p>
        <div className="space-y-1">
          {POST_TYPE_OPTIONS.map(({ type, label, icon: Icon, desc, inDev }) => (
            <button
              key={type}
              disabled={inDev}
              onClick={() => {
                onClose();
                if (type === 'order') onPickOrder?.();
                else if (type === 'vacancy') onPickVacancy?.();
                else navigate(`/create-post?type=${type}`);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left ${inDev ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'}`}
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${inDev ? 'bg-slate-800' : 'bg-primary-600/20'}`}>
                <Icon size={20} className={inDev ? 'text-slate-500' : 'text-primary-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${inDev ? 'text-slate-500' : 'text-white'}`}>{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Filter chips ──────────────────────────────────────────────────────────────

// Быстрые чипсы — самые важные для функциональной работы типы (имена как в «Добавить пост»).
// Полный список типов — в общих фильтрах (FlowSettingsPage).
const TYPE_CHIPS = [
  { id: 'blog',    label: 'Блог' },
  { id: 'service', label: 'Услуга' },
  { id: 'order',   label: 'Заказ' },
  { id: 'vacancy', label: 'Вакансия' },
];

const toggleInArray = (arr: string[], id: string) =>
  arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active ? 'bg-primary-600 border-primary-500 text-white shadow-sm' : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

const SORT_OPTIONS = [
  { id: 'smart', label: 'Для вас' },
  { id: 'new', label: 'Новые' },
  { id: 'popular', label: 'Популярные' },
  { id: 'discussed', label: 'Обсуждаемые' },
];

// Quick-sort dropdown for the feed header.
function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const current = SORT_OPTIONS.find(o => o.id === value) ?? SORT_OPTIONS[0];
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
        title="Сортировка"
      >
        <ArrowUpDown size={15} />
        <span>{current.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-slate-800 border border-slate-700 rounded-2xl shadow-xl overflow-hidden z-30">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${o.id === value ? 'text-primary-300 bg-primary-500/10' : 'text-slate-300 hover:bg-slate-700/60'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function countActiveFilters(f: FlowFilters): number {
  return [
    f.postType.length > 0,
    f.authorKind !== 'all',
    f.period !== 'all',
    f.cities.length > 0,
    f.employment !== 'all',
    f.artistType !== 'all',
    f.genre !== 'all',
  ].filter(Boolean).length;
}

// ─── Skeletons ─────────────────────────────────────────────────────────────────

function PostSkeleton() {
  return (
    <div className="px-4 py-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-slate-800 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-slate-800 rounded w-1/3" />
          <div className="h-3 bg-slate-800 rounded w-1/4" />
        </div>
      </div>
      <div className="ml-[52px] space-y-2">
        <div className="h-3.5 bg-slate-800 rounded w-full" />
        <div className="h-3.5 bg-slate-800 rounded w-5/6" />
      </div>
    </div>
  );
}

// ─── Feed Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function FeedPage() {
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetPostId = searchParams.get('post');
  const [showPostTypePicker, setShowPostTypePicker] = useState(false);
  const [showVacancyForm, setShowVacancyForm] = useState(false);
  const [filters, setFilters] = useState<FlowFilters>(loadFilters);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  useScrollLock(showPostTypePicker || showVacancyForm);

  // Кнопка «Вверх» — появляется после прокрутки на ~2 экрана
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 1200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Persist filters between sessions (localStorage).
  const updateFilters = useCallback((patch: Partial<FlowFilters>) => {
    setFilters(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(FLOW_FILTERS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Reload filters when returning from the settings page (period etc.)
  useEffect(() => {
    const onFocus = () => setFilters(loadFilters());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const typeFilter = filters.postType.length > 0 ? filters.postType.join(',') : undefined;
  const authorKindFilter = filters.authorKind !== 'all' ? filters.authorKind : undefined;
  const periodFilter = filters.period !== 'all' ? filters.period : undefined;
  const cityFilter = filters.cities.length > 0 ? filters.cities.join(',') : undefined;
  const employmentFilter = filters.employment !== 'all' ? filters.employment : undefined;
  const artistTypeFilter = filters.artistType !== 'all' ? filters.artistType : undefined;
  const genreFilter = filters.genre !== 'all' ? filters.genre : undefined;
  const sortParam = filters.sort && filters.sort !== 'new' ? filters.sort : undefined;

  // ── Main feed — infinite scroll ───────────────────────────────────────────
  // Курсорная пагинация: для «Новые» — (createdAt,id), для ранжированных
  // сортировок — снапшот порядка на сервере. refetch не даёт дублей/пропусков.
  const feed = useInfiniteQuery({
    queryKey: ['feed', typeFilter, authorKindFilter, periodFilter, cityFilter, employmentFilter, artistTypeFilter, genreFilter, sortParam],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get('/posts/feed', {
        params: { type: typeFilter, authorKind: authorKindFilter, period: periodFilter, city: cityFilter, employment: employmentFilter, artistType: artistTypeFilter, genre: genreFilter, sort: sortParam, cursor: pageParam, limit: PAGE_SIZE },
      });
      return toCursorPage(data);
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !showSavedOnly,
    refetchInterval: showSavedOnly ? false : 60000,
  });

  // ── Saved posts (separate view) ───────────────────────────────────────────
  const saved = useInfiniteQuery({
    queryKey: ['feed-saved'],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get('/posts/saved/list', { params: { cursor: pageParam, limit: PAGE_SIZE } });
      return toCursorPage(data);
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: showSavedOnly,
  });

  const active = showSavedOnly ? saved : feed;
  // Склейка страниц с дедупом по id (страховка от повторов между страницами).
  const posts = useMemo(
    () => dedupeById((active.data?.pages ?? []).flatMap((p) => p.items)),
    [active.data],
  );

  const isLoading = active.isLoading;
  const isError = active.isError;
  const retry = () => { active.refetch(); };

  // ── Infinite-scroll sentinel ──────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = active;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [showSavedOnly, hasNextPage, isFetchingNextPage, fetchNextPage, posts.length]);

  // ── Deep link ?post=<id> — пост грузится отдельно по id (не выкачиваем ленту до конца)
  const targetPost = useQuery({
    queryKey: ['feed-post', targetPostId],
    queryFn: async () => { const { data } = await api.get(`/posts/${targetPostId}`); return data as any; },
    enabled: !!targetPostId && !deletedPostIds.has(targetPostId),
    retry: false,
    staleTime: 30_000,
  });
  const targetInFeed = !!targetPostId && posts.some((p: any) => p.id === targetPostId);
  const showTargetSeparately = !showSavedOnly && !!targetPost.data && !targetInFeed;

  const notFoundToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetPostId || !targetPost.isError || notFoundToastRef.current === targetPostId) return;
    if (deletedPostIds.has(targetPostId)) return;
    notFoundToastRef.current = targetPostId;
    toast.error(getApiError(targetPost.error, 'Пост не найден или удалён'));
  }, [targetPostId, targetPost.isError, targetPost.error]);

  const scrolledPostRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetPostId || scrolledPostRef.current === targetPostId) return;
    if (!document.getElementById(`post-${targetPostId}`)) return; // ещё не отрисован
    scrolledPostRef.current = targetPostId;
    // Centre the post in the viewport. Re-centre a few times: lazy-loaded images above
    // it shift the layout after the first scroll, otherwise leaving it near the bottom.
    const center = () => document.getElementById(`post-${targetPostId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    center();
    const t1 = setTimeout(center, 350);
    const t2 = setTimeout(center, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [targetPostId, posts, targetPost.data]);

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 py-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Zap size={20} className="text-primary-400 flex-shrink-0" />
              <h2 className="text-lg font-bold text-white">Поток</h2>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setShowSavedOnly(s => !s)}
                className={`flex items-center px-2.5 py-1.5 rounded-xl text-sm transition-colors ${showSavedOnly ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Сохранённые"
              >
                <Star size={16} fill={showSavedOnly ? 'currentColor' : 'none'} />
              </button>
              {!showSavedOnly && <SortDropdown value={filters.sort} onChange={(v) => updateFilters({ sort: v })} />}
            </div>
          </div>

          {/* Кнопка общих фильтров + быстрые чипсы — на одном уровне; скрыто в «Сохранённых» */}
          {!showSavedOnly && (
            <div className="pb-2 px-4 flex items-center gap-2">
              <button
                onClick={() => navigate('/flow-settings')}
                className="relative flex items-center flex-shrink-0 px-2.5 py-1.5 rounded-xl text-sm text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors"
                title="Фильтры"
              >
                <SlidersHorizontal size={16} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <div className="flex gap-2 overflow-x-auto scrollbar-none min-w-0">
                <FilterChip label="Все" active={filters.postType.length === 0} onClick={() => updateFilters({ postType: [] })} />
                {TYPE_CHIPS.map(c => (
                  <FilterChip key={c.id} label={c.label} active={filters.postType.includes(c.id)} onClick={() => updateFilters({ postType: toggleInArray(filters.postType, c.id) })} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Onboarding prompt for new users */}
        {!showSavedOnly && <OnboardingPrompt />}

        {/* Posts */}
        <div className="pb-28">
          {isError && posts.length === 0 ? (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><WifiOff size={32} className="text-slate-600" /></div>
              <p className="text-white font-semibold mb-1">Не удалось загрузить ленту</p>
              <p className="text-slate-500 text-sm mb-4">Проверьте подключение к сети</p>
              <button onClick={retry} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors">
                <RefreshCw size={15} /> Повторить
              </button>
            </div>
          ) : isLoading ? (
            <div className="divide-y divide-slate-800/60">
              {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
            </div>
          ) : posts.length > 0 || showTargetSeparately ? (
            <>
              <div className="divide-y divide-slate-800/60">
                {/* Пост по ссылке, которого нет в загруженных страницах — сверху */}
                {showTargetSeparately && (
                  <PostCard key={`target-${targetPost.data.id}`} post={targetPost.data} currentUserId={currentUser?.id ?? ''} highlight />
                )}
                {posts.map((post: any) => (
                  <PostCard key={post.id} post={post} currentUserId={currentUser?.id ?? ''} highlight={post.id === targetPostId} />
                ))}
              </div>
              {/* Infinite-scroll sentinel + loader */}
              <div ref={sentinelRef} className="py-6 flex justify-center">
                {isFetchingNextPage && <Loader2 size={22} className="animate-spin text-slate-500" />}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                {showSavedOnly ? <Star size={32} className="text-slate-600" /> : <Zap size={32} className="text-slate-600" />}
              </div>
              <p className="text-white font-semibold mb-1">{showSavedOnly ? 'Нет сохранённых' : 'Поток пуст'}</p>
              <p className="text-slate-500 text-sm">{showSavedOnly ? 'Нажмите ★ на посте, чтобы сохранить' : 'Сбросьте фильтры или создайте первый пост'}</p>
              {!showSavedOnly && activeFilterCount > 0 && (
                <button onClick={() => { setFilters(DEFAULT_FILTERS); localStorage.removeItem(FLOW_FILTERS_KEY); }} className="mt-3 text-sm text-primary-400 hover:text-primary-300 transition-colors">
                  Сбросить фильтры
                </button>
              )}
            </div>
          )}
        </div>

        {/* Кнопка «Вверх» — над FAB, показывается после прокрутки */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Наверх"
          title="Наверх"
          className={`fixed bottom-[calc(9rem_+_env(safe-area-inset-bottom,0px))] right-6 lg:bottom-24 lg:right-10 w-10 h-10 bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700 rounded-full shadow-xl backdrop-blur flex items-center justify-center transition-all z-40 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
        >
          <ChevronUp size={20} />
        </button>

        {/* FAB — create post */}
        <button
          onClick={() => setShowPostTypePicker(true)}
          aria-label="Создать пост"
          title="Создать пост"
          className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom,0px))] right-4 lg:bottom-8 lg:right-8 w-14 h-14 bg-primary-600 hover:bg-primary-500 active:scale-95 text-white rounded-2xl shadow-2xl shadow-primary-900/50 flex items-center justify-center transition-all z-40"
        >
          <Plus size={26} />
        </button>

        {showPostTypePicker && (
          <PostTypePicker
            onClose={() => setShowPostTypePicker(false)}
            onPickOrder={() => navigate('/orders/new')}
            onPickVacancy={() => setShowVacancyForm(true)}
          />
        )}

        {/* Order create form — opened modally straight from the Поток composer. */}

        {/* Vacancy create form — opened modally from the Поток composer (no artistId — form asks). */}
        {showVacancyForm && createPortal(
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setShowVacancyForm(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 p-4 pb-8 shadow-2xl"
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
              <VacancyForm onClose={() => setShowVacancyForm(false)} />
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
