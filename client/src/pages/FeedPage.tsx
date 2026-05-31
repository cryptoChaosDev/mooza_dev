import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Send, Heart, MessageCircle, Trash2, Loader2, X,
  MoreHorizontal, Image, Pencil, Check,
  Crown, BadgeCheck, Ban, SlidersHorizontal,
  Plus, FileText, Briefcase, Calendar, CheckSquare, Lightbulb, Wrench,
  Zap, BarChart3, Star, WifiOff, RefreshCw, HelpCircle, Repeat2,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import ShareButton from '../components/ShareButton';
import { postAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import OnboardingPrompt from '../components/OnboardingPrompt';
import AvatarComponent from '../components/Avatar';
import AudioPlayer from '../components/AudioPlayer';
import { ReactionBar, DoubleTapReactWrapper } from '../components/ReactionBar';
import { loadFilters, DEFAULT_FILTERS, FlowFilters, FLOW_FILTERS_KEY } from './FlowSettingsPage';
import ConfirmDialog from '../components/ConfirmDialog';

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

// ─── Comment Item ──────────────────────────────────────────────────────────────

function CommentItem({ comment, postId, currentUserId, feedQueryKey = ['feed'], isReply = false }: {
  comment: any; postId: string; postAuthorId?: string; currentUserId: string; feedQueryKey?: string[]; isReply?: boolean;
}) {
  const queryClient = useQueryClient();
  const isOwner = comment.author.id === currentUserId;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const editMut = useMutation({
    mutationFn: () => postAPI.editComment(postId, comment.id, editText),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setEditing(false); },
  });

  const reactMut = useMutation({
    mutationFn: (emoji: string) => postAPI.reactComment(postId, comment.id, emoji),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const unreactMut = useMutation({
    mutationFn: () => postAPI.unreactComment(postId, comment.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const replyMut = useMutation({
    mutationFn: (content: string) => postAPI.commentPost(postId, content, comment.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setReplyText(''); setShowReplyInput(false); },
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
                {isOwner && !editing && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-all flex-shrink-0">
                    <button onClick={() => { setEditText(comment.content); setEditing(true); }} className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => setConfirmDelete(true)} disabled={deleteMut.isPending} className="text-slate-500 hover:text-red-400 p-0.5 transition-colors">
                      {deleteMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
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
                <p className="text-xs text-slate-300 leading-relaxed mt-0.5 break-words">{comment.content}</p>
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
                className="flex-1 bg-slate-800/60 border border-slate-700/60 focus:border-primary-500/60 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
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
            <CommentItem key={reply.id} comment={reply} postId={postId} currentUserId={currentUserId} feedQueryKey={feedQueryKey} isReply />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, currentUserId, feedQueryKey = ['feed'], highlight = false }: { post: any; currentUserId: string; feedQueryKey?: string[]; highlight?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [repostComment, setRepostComment] = useState('');

  // Guests (no current user) cannot react — bounce them to login instead.
  const requireAuth = (action: () => void) => {
    if (!currentUserId) { navigate('/login'); return; }
    action();
  };
  const [editContent, setEditContent] = useState(post.content);
  const [editImagePreview, setEditImagePreview] = useState<{ url: string; serverUrl: string } | null>(
    post.imageUrl ? { url: `${API_URL}${post.imageUrl}`, serverUrl: post.imageUrl } : null
  );
  const [editUploading, setEditUploading] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = post.author.id === currentUserId;
  const isLongContent = !editing && post.content.length > 280;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (editing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
    }
  }, [editing]);

  const likeMut = useMutation({ mutationFn: () => post.isLiked ? postAPI.unlikePost(post.id) : postAPI.likePost(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const commentMut = useMutation({ mutationFn: (content: string) => postAPI.commentPost(post.id, content), onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setCommentText(''); } });
  const editMut = useMutation({ mutationFn: () => postAPI.editPost(post.id, { content: editContent, imageUrl: editImagePreview?.serverUrl ?? null, audioUrl: null, audioName: null }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setEditing(false); } });
  const deleteMut = useMutation({ mutationFn: () => postAPI.deletePost(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const reactMut = useMutation({ mutationFn: (emoji: string) => postAPI.reactPost(post.id, emoji), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const unreactMut = useMutation({ mutationFn: () => postAPI.unreactPost(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const voteMut = useMutation({ mutationFn: (optionIndex: number) => postAPI.votePoll(post.id, optionIndex), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const saveMut = useMutation({ mutationFn: () => postAPI.toggleSave(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const repostMut = useMutation({
    mutationFn: (comment: string) => postAPI.repostPost(post.id, comment.trim() || undefined),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feed'] }); setShowRepost(false); setRepostComment(''); },
  });

  const uploadEditFile = async (file: File) => {
    setEditUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      setEditImagePreview({ url: URL.createObjectURL(file), serverUrl: data.url });
    } catch {
      alert('Не удалось загрузить файл. Проверьте формат и размер (до 20 МБ).');
    } finally { setEditUploading(false); }
  };

  const typeMeta = POST_TYPE_META[post.type] ?? POST_TYPE_META.blog;
  const TypeIcon = typeMeta.icon;
  const showTypeBadge = post.type && post.type !== 'blog';

  const isRepost = !!post.repostOfId || !!post.repostOf || !!post.repostDeleted;
  const original = post.repostOf;

  return (
    <div id={`post-${post.id}`} className={`px-4 py-4 hover:bg-slate-900/30 transition-colors ${typeMeta.accent} ${highlight ? 'ring-2 ring-primary-500/40 ring-inset bg-primary-500/5' : ''}`}>
      {isRepost && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2 ml-1">
          <Repeat2 size={13} className="flex-shrink-0" />
          <span className="truncate">«{post.author.firstName} {post.author.lastName} поделился(ась)»</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/profile/${post.author.id}`} className="flex-shrink-0"><Avatar user={post.author} size={10} /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link to={`/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate">
                {post.author.firstName} {post.author.lastName}
              </Link>
              {post.author.isPremium && <span title="Premium"><Crown size={13} className="text-amber-400 flex-shrink-0" /></span>}
              {post.author.isVerified && <span title="Верифицирован"><BadgeCheck size={13} className="text-sky-400 flex-shrink-0" /></span>}
              {post.author.isBlocked && <span title="Заблокирован"><Ban size={13} className="text-red-500 flex-shrink-0" /></span>}
              {showTypeBadge && (
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeMeta.badge}`}>
                  <TypeIcon size={10} />
                  {typeMeta.label}
                </span>
              )}
            </div>
            {post.channel ? (
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
        {isOwner && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button onClick={() => setShowMenu(m => !m)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><MoreHorizontal size={16} /></button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden min-w-[150px]">
                <button onClick={() => { setShowMenu(false); setEditing(true); setEditContent(post.content); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"><Pencil size={14} /> Редактировать</button>
                <button onClick={() => { setShowMenu(false); setConfirmDelete(true); }} disabled={deleteMut.isPending} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors border-t border-slate-700">
                  {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Удалить пост
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 ml-[52px]">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={e => { setEditContent(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }}
              className="w-full bg-slate-800/60 border border-slate-700 focus:border-primary-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none resize-none transition-colors"
              rows={1}
            />
            {editImagePreview && (
              <div className="relative inline-block">
                <img src={editImagePreview.url} alt="preview" className="max-h-48 rounded-xl object-cover border border-slate-700" />
                <button type="button" onClick={() => setEditImagePreview(null)} className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white"><X size={12} /></button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <input ref={editImageRef} type="file" accept="image/*,.gif" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditFile(f); e.target.value = ''; }} />
                <button type="button" onClick={() => editImageRef.current?.click()} disabled={editUploading || !!editImagePreview} className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
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
          <DoubleTapReactWrapper reactions={post.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => requireAuth(() => reactMut.mutate(emoji))} onUnreact={() => requireAuth(() => unreactMut.mutate())}>
            <>
              {isRepost && (
                <>
                  {(post.repostComment || (post.content && original)) && (
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words mb-2">
                      {post.repostComment || post.content}
                    </p>
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
                        <span className="text-sm font-semibold text-white truncate">
                          {original.author ? `${original.author.firstName} ${original.author.lastName}` : 'Автор'}
                        </span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{original.createdAt ? timeAgo(original.createdAt) : ''}</span>
                      </div>
                      {original.content && (
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">{original.content}</p>
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
                const myVoteIdx = post.pollVotes?.find((v: any) => v.userId === currentUserId)?.optionIndex;
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
                            <span className="text-sm text-white font-medium flex items-center gap-2">
                              {isMyVote && <Check size={12} className="text-cyan-400" />}
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
              {!isRepost && post.content && (
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                  {isLongContent && !expanded ? post.content.slice(0, 280) + '…' : post.content}
                </p>
              )}
              {!isRepost && isLongContent && <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 mt-1 transition-colors">{expanded ? 'Свернуть' : 'Читать полностью'}</button>}
              {!isRepost && (Array.isArray(post.images) && post.images.length > 1 ? (
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
        {!editing && <ReactionBar reactions={post.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => requireAuth(() => reactMut.mutate(emoji))} onUnreact={() => requireAuth(() => unreactMut.mutate())} />}
      </div>

      <div className="flex items-center gap-1 ml-[52px]">
        <button onClick={() => requireAuth(() => { if (!isOwner) likeMut.mutate(); })} disabled={likeMut.isPending || (!!currentUserId && isOwner)} title={currentUserId && isOwner ? 'Нельзя лайкать свой пост' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${currentUserId && isOwner ? 'cursor-default text-slate-600' : post.isLiked ? 'text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
          <Heart size={15} className={post.isLiked ? 'fill-red-400 text-red-400' : ''} />
          <span className="font-medium tabular-nums">{post._count.likes}</span>
        </button>
        <button onClick={() => requireAuth(() => { setShowComments(true); setTimeout(() => commentInputRef.current?.focus(), 50); })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all">
          <MessageCircle size={15} />
          <span className="font-medium tabular-nums">{post._count.comments}</span>
        </button>
        <button onClick={() => requireAuth(() => setShowRepost(true))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all" title="Поделиться в ленте">
          <Repeat2 size={15} />
        </button>
        <ShareButton url={`/post/${post.id}`} title={`Пост от ${post.author.firstName} ${post.author.lastName}`} text={post.content?.slice(0, 100)} iconSize={15} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all" />
        <button onClick={() => requireAuth(() => saveMut.mutate())} disabled={saveMut.isPending}
          className={`ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all ${post.isSaved ? 'text-amber-400 hover:bg-amber-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
          title={post.isSaved ? 'Убрать из сохранённого' : 'Сохранить'}>
          <Star size={15} fill={post.isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {showComments && (
        <div className="mt-3 ml-[52px] space-y-3">
          {post.comments && post.comments.length > 0 && (
            <div className="space-y-2">
              {post.comments.map((comment: any) => (
                <CommentItem key={comment.id} comment={comment} postId={post.id} postAuthorId={post.author.id} currentUserId={currentUserId} feedQueryKey={feedQueryKey} />
              ))}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); if (commentText.trim()) requireAuth(() => commentMut.mutate(commentText.trim())); }} className="flex gap-2 items-center">
            <input ref={commentInputRef} type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Написать комментарий..."
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors" />
            <button type="submit" disabled={!commentText.trim() || commentMut.isPending} className="p-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0">
              {commentMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
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
            className="relative w-full max-w-lg bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 pb-8 shadow-2xl"
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
    </div>
  );
}

// ─── Post type meta ────────────────────────────────────────────────────────────

const POST_TYPE_META: Record<string, { label: string; icon: any; accent: string; badge: string }> = {
  blog:       { label: 'Блог',              icon: FileText,    accent: '',                                           badge: '' },
  question:   { label: 'Вопрос',            icon: HelpCircle,  accent: 'border-l-2 border-blue-500/60',              badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  service:    { label: 'Услуга',            icon: Wrench,      accent: 'border-l-2 border-primary-500/60',           badge: 'bg-primary-500/10 text-primary-400 border-primary-500/20' },
  vacancy:    { label: 'Вакансия',          icon: Briefcase,   accent: 'border-l-2 border-amber-500/60',             badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  event:      { label: 'Мероприятие',       icon: Calendar,    accent: 'border-l-2 border-purple-500/60',            badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  task:       { label: 'Задача',            icon: CheckSquare, accent: 'border-l-2 border-emerald-500/60',           badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  offer:      { label: 'Предложение',       icon: Lightbulb,   accent: 'border-l-2 border-orange-500/60',            badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  employment: { label: 'Апдейт занятости', icon: Zap,         accent: 'border-l-2 border-amber-400/60',             badge: 'bg-amber-400/10 text-amber-400 border-amber-400/20' },
  poll:       { label: 'Опрос',             icon: BarChart3,   accent: 'border-l-2 border-cyan-500/60',              badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
};

// ─── Post Type Picker ──────────────────────────────────────────────────────────

const POST_TYPE_OPTIONS = [
  { type: 'blog',       label: 'Блог',              icon: FileText,    desc: 'Свободная форма',     inDev: false },
  { type: 'question',   label: 'Вопрос',            icon: HelpCircle,  desc: 'Вопрос и обсуждение', inDev: false },
  { type: 'vacancy',    label: 'Вакансия',           icon: Briefcase,   desc: 'В разработке',        inDev: true },
  { type: 'event',      label: 'Мероприятие',        icon: Calendar,    desc: 'В разработке',        inDev: true },
  { type: 'task',       label: 'Задача',             icon: CheckSquare, desc: 'В разработке',        inDev: true },
  { type: 'offer',      label: 'Предложение',        icon: Lightbulb,   desc: 'В разработке',        inDev: true },
  { type: 'service',    label: 'Услуга',             icon: Wrench,      desc: 'Свободная форма',     inDev: false },
  { type: 'employment', label: 'Апдейт занятости',  icon: Zap,         desc: 'Обновить статус',     inDev: false },
  { type: 'poll',       label: 'Опрос',              icon: BarChart3,   desc: 'Голосование',         inDev: false },
];

function PostTypePicker({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 rounded-t-3xl border-t border-slate-800 p-2 pb-8 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 mt-2" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 mb-3">Создать пост</p>
        <div className="space-y-1">
          {POST_TYPE_OPTIONS.map(({ type, label, icon: Icon, desc, inDev }) => (
            <button
              key={type}
              disabled={inDev}
              onClick={() => { onClose(); navigate(`/create-post?type=${type}`); }}
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

const TYPE_CHIPS = [
  { id: 'all',        label: 'Все' },
  { id: 'blog',       label: 'Свободный блог' },
  { id: 'question',   label: 'Вопрос' },
  { id: 'poll',       label: 'Опрос' },
  { id: 'service',    label: 'Апдейт услуги' },
  { id: 'employment', label: 'Апдейт занятости' },
];

const AUTHOR_CHIPS = [
  { id: 'all',      label: 'Все' },
  { id: 'resident', label: 'Резидент' },
  { id: 'channel',  label: 'Канал' },
  { id: 'artist',   label: 'Артист' },
  { id: 'mine',     label: 'Мои' },
];

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function countActiveFilters(f: FlowFilters): number {
  return [
    f.postType !== 'all',
    f.authorKind !== 'all',
    f.period !== 'all',
    f.cities.length > 0,
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
  const [filters, setFilters] = useState<FlowFilters>(loadFilters);
  const [showSavedOnly, setShowSavedOnly] = useState(false);

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

  const typeFilter = filters.postType !== 'all' ? filters.postType : undefined;
  const authorKindFilter = filters.authorKind !== 'all' ? filters.authorKind : undefined;
  const periodFilter = filters.period !== 'all' ? filters.period : undefined;
  const cityFilter = filters.cities.length > 0 ? filters.cities.join(',') : undefined;

  // ── Main feed — infinite scroll (chronological only) ──────────────────────
  const feed = useInfiniteQuery({
    queryKey: ['feed', typeFilter, authorKindFilter, periodFilter, cityFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const { data } = await postAPI.getFeed({ type: typeFilter, authorKind: authorKindFilter, period: periodFilter, city: cityFilter, offset: pageParam, limit: PAGE_SIZE });
      return data as any[];
    },
    initialPageParam: 0,
    // A page may include up to 7 pinned team posts for brand-new users, so use >=.
    getNextPageParam: (lastPage, allPages) => lastPage.length >= PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !showSavedOnly,
    refetchInterval: showSavedOnly ? false : 60000,
  });

  // ── Saved posts (separate view) ───────────────────────────────────────────
  const saved = useQuery({
    queryKey: ['feed-saved'],
    queryFn: async () => { const { data } = await postAPI.getSavedPosts(); return data as any[]; },
    enabled: showSavedOnly,
  });

  const posts = showSavedOnly ? (saved.data ?? []) : (feed.data?.pages.flat() ?? []);

  const isLoading = showSavedOnly ? saved.isLoading : feed.isLoading;
  const isError = showSavedOnly ? saved.isError : feed.isError;
  const retry = () => { if (showSavedOnly) saved.refetch(); else feed.refetch(); };

  // ── Infinite-scroll sentinel ──────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showSavedOnly) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
        feed.fetchNextPage();
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [showSavedOnly, feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  useEffect(() => {
    if (!targetPostId || posts.length === 0) return;
    const el = document.getElementById(`post-${targetPostId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [targetPostId, posts]);

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={20} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white">Поток</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSavedOnly(s => !s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-colors ${showSavedOnly ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Сохранённые"
              >
                <Star size={16} fill={showSavedOnly ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => navigate('/flow-settings')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors relative"
              >
                <SlidersHorizontal size={16} />
                <span>Настроить</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Chip rows — hidden in saved view */}
          {!showSavedOnly && (
            <div className="pb-2 space-y-1.5">
              {/* Row 1 — post type */}
              <div className="px-4 flex gap-2 overflow-x-auto scrollbar-none">
                {TYPE_CHIPS.map(c => (
                  <FilterChip key={c.id} label={c.label} active={filters.postType === c.id} onClick={() => updateFilters({ postType: c.id })} />
                ))}
              </div>
              {/* Row 2 — author kind */}
              <div className="px-4 flex gap-2 overflow-x-auto scrollbar-none">
                {AUTHOR_CHIPS.map(c => (
                  <FilterChip key={c.id} label={c.label} active={filters.authorKind === c.id} onClick={() => updateFilters({ authorKind: c.id })} />
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
          ) : posts.length > 0 ? (
            <>
              <div className="divide-y divide-slate-800/60">
                {posts.map((post: any) => (
                  <PostCard key={post.id} post={post} currentUserId={currentUser?.id ?? ''} highlight={post.id === targetPostId} />
                ))}
              </div>
              {/* Infinite-scroll sentinel + loader */}
              {!showSavedOnly && (
                <div ref={sentinelRef} className="py-6 flex justify-center">
                  {feed.isFetchingNextPage && <Loader2 size={22} className="animate-spin text-slate-500" />}
                </div>
              )}
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

        {/* FAB — create post */}
        <button
          onClick={() => setShowPostTypePicker(true)}
          className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 w-14 h-14 bg-primary-600 hover:bg-primary-500 active:scale-95 text-white rounded-2xl shadow-2xl shadow-primary-900/50 flex items-center justify-center transition-all z-40"
        >
          <Plus size={26} />
        </button>

        {showPostTypePicker && <PostTypePicker onClose={() => setShowPostTypePicker(false)} />}
      </div>
    </div>
  );
}
