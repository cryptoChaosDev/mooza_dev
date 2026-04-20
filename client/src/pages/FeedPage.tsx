import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Send, Heart, MessageCircle, Trash2, Loader2, X,
  MoreHorizontal, Image, Music, Pencil, Check,
  Radio, Crown, BadgeCheck, Ban, SlidersHorizontal,
  Plus, FileText, Briefcase, Calendar, CheckSquare, Lightbulb, Wrench,
  Zap,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import ShareButton from '../components/ShareButton';
import { postAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarComponent from '../components/Avatar';
import AudioPlayer from '../components/AudioPlayer';
import { ReactionBar, DoubleTapReactWrapper } from '../components/ReactionBar';
import { loadFilters, DEFAULT_FILTERS, FlowFilters } from './FlowSettingsPage';

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

function CommentItem({ comment, postId, currentUserId, feedQueryKey = ['feed'] }: {
  comment: any; postId: string; postAuthorId?: string; currentUserId: string; feedQueryKey?: string[];
}) {
  const queryClient = useQueryClient();
  const isOwner = comment.author.id === currentUserId;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
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

  const isEdited = new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 3000;

  return (
    <div className="flex gap-2.5 group/comment">
      <Link to={`/profile/${comment.author.id}`}><Avatar user={comment.author} size={7} /></Link>
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
                  <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} className="text-slate-500 hover:text-red-400 p-0.5 transition-colors">
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
        <div className="px-1">
          <ReactionBar reactions={comment.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => reactMut.mutate(emoji)} onUnreact={() => unreactMut.mutate()} />
        </div>
        <p className="text-xs text-slate-600 mt-0.5 px-1">
          {timeAgo(comment.createdAt)}
          {isEdited && <span className="text-slate-700"> · изм. {timeAgo(comment.updatedAt)}</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, currentUserId, feedQueryKey = ['feed'], highlight = false }: { post: any; currentUserId: string; feedQueryKey?: string[]; highlight?: boolean }) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editImagePreview, setEditImagePreview] = useState<{ url: string; serverUrl: string } | null>(
    post.imageUrl ? { url: `${API_URL}${post.imageUrl}`, serverUrl: post.imageUrl } : null
  );
  const [editAudioFile, setEditAudioFile] = useState<{ name: string; serverUrl: string } | null>(
    post.audioUrl ? { name: post.audioName || post.audioUrl.split('/').pop() || 'audio', serverUrl: post.audioUrl } : null
  );
  const [editUploading, setEditUploading] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);
  const editAudioRef = useRef<HTMLInputElement>(null);
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
  const editMut = useMutation({ mutationFn: () => postAPI.editPost(post.id, { content: editContent, imageUrl: editImagePreview?.serverUrl ?? null, audioUrl: editAudioFile?.serverUrl ?? null, audioName: editAudioFile?.name ?? null }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setEditing(false); } });
  const deleteMut = useMutation({ mutationFn: () => postAPI.deletePost(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const reactMut = useMutation({ mutationFn: (emoji: string) => postAPI.reactPost(post.id, emoji), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });
  const unreactMut = useMutation({ mutationFn: () => postAPI.unreactPost(post.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }) });

  const uploadEditFile = async (file: File, type: 'image' | 'audio') => {
    setEditUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      if (type === 'image') setEditImagePreview({ url: URL.createObjectURL(file), serverUrl: data.url });
      else setEditAudioFile({ name: file.name, serverUrl: data.url });
    } finally { setEditUploading(false); }
  };

  return (
    <div id={`post-${post.id}`} className={`px-4 py-4 hover:bg-slate-900/30 transition-colors ${highlight ? 'ring-2 ring-primary-500/40 ring-inset bg-primary-500/5' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {post.channel ? (
            <Link to={`/profile/${post.author.id}`} className="flex-shrink-0">
              {post.channel.avatar
                ? <img src={`${API_URL}${post.channel.avatar}`} alt={post.channel.name} className="w-10 h-10 rounded-full object-cover" />
                : <div className="w-10 h-10 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center"><Radio size={18} className="text-primary-400" /></div>
              }
            </Link>
          ) : (
            <Link to={`/profile/${post.author.id}`} className="flex-shrink-0"><Avatar user={post.author} size={10} /></Link>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {post.channel ? (
                <Link to={`/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate">
                  {post.channel.name}
                </Link>
              ) : (
                <>
                  <Link to={`/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate">
                    {post.author.firstName} {post.author.lastName}
                  </Link>
                  {post.author.isPremium && <span title="Premium"><Crown size={13} className="text-amber-400 flex-shrink-0" /></span>}
                  {post.author.isVerified && <span title="Верифицирован"><BadgeCheck size={13} className="text-sky-400 flex-shrink-0" /></span>}
                  {post.author.isBlocked && <span title="Заблокирован"><Ban size={13} className="text-red-500 flex-shrink-0" /></span>}
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {post.channel
                ? <>{post.author.firstName} {post.author.lastName} · {timeAgo(post.createdAt)}</>
                : <>{timeAgo(post.createdAt)}{post.author.role ? ` · ${post.author.role}` : ''}</>
              }
              {new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 5000 && <span className="text-slate-600"> · изменён {timeAgo(post.updatedAt)}</span>}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button onClick={() => setShowMenu(m => !m)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><MoreHorizontal size={16} /></button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden min-w-[150px]">
                <button onClick={() => { setShowMenu(false); setEditing(true); setEditContent(post.content); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"><Pencil size={14} /> Редактировать</button>
                <button onClick={() => { setShowMenu(false); deleteMut.mutate(); }} disabled={deleteMut.isPending} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors border-t border-slate-700">
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
            {editAudioFile && (
              <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <Music size={13} className="text-primary-400 flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{editAudioFile.name}</span>
                <button type="button" onClick={() => setEditAudioFile(null)} className="text-slate-500 hover:text-white transition-colors"><X size={13} /></button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <input ref={editImageRef} type="file" accept="image/*,.gif" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditFile(f, 'image'); e.target.value = ''; }} />
                <button type="button" onClick={() => editImageRef.current?.click()} disabled={editUploading || !!editImagePreview} className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
                  {editUploading && !editAudioFile ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                </button>
                <input ref={editAudioRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditFile(f, 'audio'); e.target.value = ''; }} />
                <button type="button" onClick={() => editAudioRef.current?.click()} disabled={editUploading || !!editAudioFile} className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
                  {editUploading && !editImagePreview ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
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
          <DoubleTapReactWrapper reactions={post.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => reactMut.mutate(emoji)} onUnreact={() => unreactMut.mutate()}>
            <>
              {post.content && (
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                  {isLongContent && !expanded ? post.content.slice(0, 280) + '…' : post.content}
                </p>
              )}
              {isLongContent && <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 mt-1 transition-colors">{expanded ? 'Свернуть' : 'Читать полностью'}</button>}
              {post.imageUrl && <div className="mt-2"><img src={`${API_URL}${post.imageUrl}`} alt="Вложение" className="max-h-96 w-full object-cover rounded-xl border border-slate-800" loading="lazy" /></div>}
              {post.audioUrl && <AudioPlayer src={`${API_URL}${post.audioUrl}`} name={post.audioName || post.audioUrl.split('/').pop()} />}
            </>
          </DoubleTapReactWrapper>
        )}
        {!editing && <ReactionBar reactions={post.reactions ?? []} currentUserId={currentUserId} onReact={(emoji) => reactMut.mutate(emoji)} onUnreact={() => unreactMut.mutate()} />}
      </div>

      <div className="flex items-center gap-1 ml-[52px]">
        <button onClick={() => !isOwner && likeMut.mutate()} disabled={likeMut.isPending || isOwner} title={isOwner ? 'Нельзя лайкать свой пост' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${isOwner ? 'cursor-default text-slate-600' : post.isLiked ? 'text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
          <Heart size={15} className={post.isLiked ? 'fill-red-400 text-red-400' : ''} />
          <span className="font-medium tabular-nums">{post._count.likes}</span>
        </button>
        <button onClick={() => { setShowComments(true); setTimeout(() => commentInputRef.current?.focus(), 50); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all">
          <MessageCircle size={15} />
          <span className="font-medium tabular-nums">{post._count.comments}</span>
        </button>
        <ShareButton url={`/post/${post.id}`} title={`Пост от ${post.author.firstName} ${post.author.lastName}`} text={post.content?.slice(0, 100)} iconSize={15} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all" />
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
          <form onSubmit={e => { e.preventDefault(); if (commentText.trim()) commentMut.mutate(commentText.trim()); }} className="flex gap-2 items-center">
            <input ref={commentInputRef} type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Написать комментарий..."
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors" />
            <button type="submit" disabled={!commentText.trim() || commentMut.isPending} className="p-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0">
              {commentMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Post Type Picker ──────────────────────────────────────────────────────────

const POST_TYPE_OPTIONS = [
  { type: 'blog',    label: 'Блог',        icon: FileText,    desc: 'Свободная форма',   inDev: false },
  { type: 'vacancy', label: 'Вакансия',    icon: Briefcase,   desc: 'В разработке',      inDev: true },
  { type: 'event',   label: 'Мероприятие', icon: Calendar,    desc: 'В разработке',      inDev: true },
  { type: 'task',    label: 'Задача',      icon: CheckSquare, desc: 'В разработке',      inDev: true },
  { type: 'offer',   label: 'Предложение', icon: Lightbulb,   desc: 'В разработке',      inDev: true },
  { type: 'service', label: 'Услуга',      icon: Wrench,      desc: 'Свободная форма',   inDev: false },
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
              onClick={() => { onClose(); navigate(`/create-post?type=${type}`); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-slate-800 transition-colors text-left"
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${inDev ? 'bg-slate-800' : 'bg-primary-600/20'}`}>
                <Icon size={20} className={inDev ? 'text-slate-500' : 'text-primary-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${inDev ? 'text-slate-400' : 'text-white'}`}>{label}</p>
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function applyFilters(posts: any[], filters: FlowFilters): any[] {
  let result = [...posts];

  if (filters.period !== 'all') {
    const ms: Record<string, number> = { day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
    const cutoff = Date.now() - (ms[filters.period] || 0);
    result = result.filter(p => new Date(p.createdAt).getTime() >= cutoff);
  }

  if (filters.location) {
    const loc = filters.location.toLowerCase();
    result = result.filter(p => p.author?.city?.toLowerCase().includes(loc));
  }

  if (filters.genre) {
    const genre = filters.genre.toLowerCase();
    result = result.filter(p =>
      p.author?.genres?.some((g: string) => g.toLowerCase().includes(genre)) ||
      p.author?.role?.toLowerCase().includes(genre)
    );
  }

  return result;
}

function countActiveFilters(f: FlowFilters): number {
  return [
    f.postType !== 'all',
    f.profileType !== 'all',
    !!f.location,
    f.period !== 'all',
    !!f.genre,
    f.relationship !== 'all',
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

export default function FeedPage() {
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetPostId = searchParams.get('post');
  const [showPostTypePicker, setShowPostTypePicker] = useState(false);
  const [filters, setFilters] = useState<FlowFilters>(loadFilters);

  // Reload filters when returning from settings
  useEffect(() => {
    const onFocus = () => setFilters(loadFilters());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => { const { data } = await postAPI.getFeed(); return data; },
    refetchInterval: 30000,
  });

  const filteredPosts = useMemo(() => applyFilters(posts ?? [], filters), [posts, filters]);

  useEffect(() => {
    if (!targetPostId || !posts) return;
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

        {/* Posts */}
        <div className="pb-28">
          {isLoading ? (
            <div className="divide-y divide-slate-800/60">
              {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
            </div>
          ) : filteredPosts.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {filteredPosts.map((post: any) => (
                <PostCard key={post.id} post={post} currentUserId={currentUser?.id ?? ''} highlight={post.id === targetPostId} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Zap size={32} className="text-slate-600" /></div>
              <p className="text-white font-semibold mb-1">Поток пуст</p>
              <p className="text-slate-500 text-sm">Добавьте друзей или сбросьте фильтры</p>
              {activeFilterCount > 0 && (
                <button onClick={() => { setFilters(DEFAULT_FILTERS); localStorage.removeItem('mooza_flow_filters'); }} className="mt-3 text-sm text-primary-400 hover:text-primary-300 transition-colors">
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
