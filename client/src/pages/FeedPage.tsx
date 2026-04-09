import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Newspaper, Send, Heart, MessageCircle, Trash2, Loader2, X,
  MoreHorizontal, Image, Music, Smile, Pencil, Check,
  Radio, Users, ToggleLeft, ToggleRight,
} from 'lucide-react';
import ShareButton from '../components/ShareButton';
import { postAPI, channelAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import EmojiPicker from '../components/EmojiPicker';
import AudioPlayer from '../components/AudioPlayer';
import { ReactionBar, DoubleTapReactWrapper } from '../components/ReactionBar';

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
  if (user.avatar) {
    return <img src={`${API_URL}${user.avatar}`} alt="" className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold" style={{ fontSize: size <= 8 ? '0.65rem' : '0.8rem' }}>
        {user.firstName[0]}{user.lastName[0]}
      </span>
    </div>
  );
}

// ─── Create Post Card ──────────────────────────────────────────────────────────

function CreatePostCard({ currentUser, myChannel, defaultChannelPost = false }: {
  currentUser: any;
  myChannel?: { id: string; name: string; avatar: string | null } | null;
  defaultChannelPost?: boolean;
}) {
  const [content, setContent] = useState('');
  const [imagePreview, setImagePreview] = useState<{ url: string; serverUrl: string } | null>(null);
  const [audioFile, setAudioFile] = useState<{ name: string; serverUrl: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [postAsChannel, setPostAsChannel] = useState(defaultChannelPost && !!myChannel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Sync postAsChannel when defaultChannelPost or myChannel changes (tab switch)
  useEffect(() => {
    setPostAsChannel(defaultChannelPost && !!myChannel);
  }, [defaultChannelPost, myChannel]);

  const canPost = (content.trim() || imagePreview || audioFile) && !uploading;

  const createMut = useMutation({
    mutationFn: postAPI.createPost,
    onSuccess: (_, vars) => {
      if (vars.channelId) {
        queryClient.invalidateQueries({ queryKey: ['channel-feed'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
      setContent('');
      setImagePreview(null);
      setAudioFile(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    },
  });

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const uploadFile = async (file: File, type: 'image' | 'audio') => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      if (type === 'image') {
        setImagePreview({ url: URL.createObjectURL(file), serverUrl: data.url });
      } else {
        setAudioFile({ name: file.name, serverUrl: data.url });
      }
    } catch {
      // fail silently — could add toast here
    } finally {
      setUploading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, 'image');
    e.target.value = '';
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, 'audio');
    e.target.value = '';
  };

  const handleSubmit = () => {
    if (!canPost) return;
    createMut.mutate({
      content,
      imageUrl: imagePreview?.serverUrl,
      audioUrl: audioFile?.serverUrl,
      audioName: audioFile?.name,
      channelId: postAsChannel && myChannel ? myChannel.id : null,
    });
  };

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setContent(c => c + emoji); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setContent(c => c.slice(0, start) + emoji + c.slice(end));
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
      autoResize();
    }, 0);
  }, []);

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex gap-3">
          <Link to="/profile" className="flex-shrink-0"><Avatar user={currentUser} size={9} /></Link>
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => { setContent(e.target.value); autoResize(); }}
              placeholder="Что у вас нового?"
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none resize-none min-h-[40px]"
              rows={1}
            />

            {/* Image preview */}
            {imagePreview && (
              <div className="relative mt-2 inline-block">
                <img src={imagePreview.url} alt="preview" className="max-h-64 rounded-xl object-cover border border-slate-700" />
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Audio preview */}
            {audioFile && (
              <div className="mt-2 flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <Music size={14} className="text-primary-400 flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{audioFile.name}</span>
                <button type="button" onClick={() => setAudioFile(null)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Channel toggle */}
            {myChannel && (
              <button
                type="button"
                onClick={() => setPostAsChannel(v => !v)}
                className={`flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  postAsChannel
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-600/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {postAsChannel ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                <Radio size={12} />
                {postAsChannel ? `В канал «${myChannel.name}»` : 'Опубликовать в канале'}
              </button>
            )}

            {/* Toolbar + Post button */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
              {/* Left: attachment buttons */}
              <div className="flex items-center gap-1 relative">
                {/* Image/GIF */}
                <input ref={imageInputRef} type="file" accept="image/*,.gif" className="hidden" onChange={handleImageChange} />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading || !!imagePreview}
                  title="Фото / GIF"
                  className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uploading && !audioFile ? <Loader2 size={16} className="animate-spin" /> : <Image size={16} />}
                </button>

                {/* Audio */}
                <input ref={audioInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/flac,.mp3,.wav,.ogg,.flac" className="hidden" onChange={handleAudioChange} />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={uploading || !!audioFile}
                  title="Музыка (MP3, WAV)"
                  className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uploading && !imagePreview ? <Loader2 size={16} className="animate-spin" /> : <Music size={16} />}
                </button>

                {/* Emoji */}
                <button
                  type="button"
                  onClick={() => setShowEmoji(e => !e)}
                  title="Эмодзи"
                  className={`p-2 rounded-lg transition-colors ${showEmoji ? 'text-primary-400 bg-slate-800' : 'text-slate-400 hover:text-primary-400 hover:bg-slate-800'}`}
                >
                  <Smile size={16} />
                </button>

                {showEmoji && (
                  <EmojiPicker onSelect={emoji => { insertEmoji(emoji); setShowEmoji(false); }} onClose={() => setShowEmoji(false)} />
                )}
              </div>

              {/* Right: post button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canPost || createMut.isPending}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Опубликовать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
                  <button
                    onClick={() => { setEditText(comment.content); setEditing(true); }}
                    className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => deleteMut.mutate()}
                    disabled={deleteMut.isPending}
                    className="text-slate-500 hover:text-red-400 p-0.5 transition-colors"
                  >
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
                  onChange={e => {
                    setEditText(e.target.value);
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editText.trim()) editMut.mutate(); }
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="w-full bg-slate-700/60 border border-slate-600 focus:border-primary-500 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none resize-none transition-colors"
                  rows={1}
                />
                <div className="flex gap-1.5 justify-end">
                  <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-white px-2 py-0.5 transition-colors">
                    Отмена
                  </button>
                  <button
                    onClick={() => { if (editText.trim()) editMut.mutate(); }}
                    disabled={editMut.isPending || !editText.trim()}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white rounded-md transition-colors"
                  >
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
          <ReactionBar
            reactions={comment.reactions ?? []}
            currentUserId={currentUserId}
            onReact={(emoji) => reactMut.mutate(emoji)}
            onUnreact={() => unreactMut.mutate()}
          />
        </div>
        <p className="text-xs text-slate-600 mt-0.5 px-1">
          {timeAgo(comment.createdAt)}
          {isEdited && (
            <span className="text-slate-700"> · изм. {timeAgo(comment.updatedAt)}</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, currentUserId, feedQueryKey = ['feed'] }: { post: any; currentUserId: string; feedQueryKey?: string[] }) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Edit state
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
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-resize edit textarea
  useEffect(() => {
    if (editing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
    }
  }, [editing]);

  const likeMut = useMutation({
    mutationFn: () => post.isLiked ? postAPI.unlikePost(post.id) : postAPI.likePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const commentMut = useMutation({
    mutationFn: (content: string) => postAPI.commentPost(post.id, content),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setCommentText(''); },
  });

  const editMut = useMutation({
    mutationFn: () => postAPI.editPost(post.id, {
      content: editContent,
      imageUrl: editImagePreview?.serverUrl ?? null,
      audioUrl: editAudioFile?.serverUrl ?? null,
      audioName: editAudioFile?.name ?? null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: feedQueryKey }); setEditing(false); },
  });

  const deleteMut = useMutation({
    mutationFn: () => postAPI.deletePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const reactMut = useMutation({
    mutationFn: (emoji: string) => postAPI.reactPost(post.id, emoji),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const unreactMut = useMutation({
    mutationFn: () => postAPI.unreactPost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedQueryKey }),
  });

  const handleCommentClick = () => {
    setShowComments(true);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  };

  const uploadEditFile = async (file: File, type: 'image' | 'audio') => {
    setEditUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await postAPI.uploadMedia(fd);
      if (type === 'image') setEditImagePreview({ url: URL.createObjectURL(file), serverUrl: data.url });
      else setEditAudioFile({ name: file.name, serverUrl: data.url });
    } finally {
      setEditUploading(false);
    }
  };

  return (
    <div className="px-4 py-4 hover:bg-slate-900/30 transition-colors">
      {/* Author row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/profile/${post.author.id}`} className="flex-shrink-0">
            <Avatar user={post.author} size={10} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link to={`/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate">
                {post.author.firstName} {post.author.lastName}
              </Link>
              {post.channel && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-600/15 border border-primary-600/30 rounded-full text-[10px] text-primary-400 font-medium flex-shrink-0">
                  <Radio size={9} />
                  {post.channel.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {timeAgo(post.createdAt)}
              {post.author.role ? ` · ${post.author.role}` : ''}
              {new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 5000 && (
                <span className="text-slate-600"> · изменён {timeAgo(post.updatedAt)}</span>
              )}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button onClick={() => setShowMenu(m => !m)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden min-w-[150px]">
                <button
                  onClick={() => { setShowMenu(false); setEditing(true); setEditContent(post.content); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <Pencil size={14} /> Редактировать
                </button>
                <button
                  onClick={() => { setShowMenu(false); deleteMut.mutate(); }}
                  disabled={deleteMut.isPending}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors border-t border-slate-700"
                >
                  {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Удалить пост
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="mb-3 ml-[52px]">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={e => {
                setEditContent(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }}
              className="w-full bg-slate-800/60 border border-slate-700 focus:border-primary-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none resize-none transition-colors"
              rows={1}
            />

            {/* Edit image preview */}
            {editImagePreview && (
              <div className="relative inline-block">
                <img src={editImagePreview.url} alt="preview" className="max-h-48 rounded-xl object-cover border border-slate-700" />
                <button type="button" onClick={() => setEditImagePreview(null)} className="absolute top-1.5 right-1.5 p-1 bg-slate-900/80 hover:bg-slate-900 rounded-full text-white">
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Edit audio */}
            {editAudioFile && (
              <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <Music size={13} className="text-primary-400 flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{editAudioFile.name}</span>
                <button type="button" onClick={() => setEditAudioFile(null)} className="text-slate-500 hover:text-white transition-colors"><X size={13} /></button>
              </div>
            )}

            {/* Edit toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <input ref={editImageRef} type="file" accept="image/*,.gif" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditFile(f, 'image'); e.target.value = ''; }} />
                <button type="button" onClick={() => editImageRef.current?.click()} disabled={editUploading || !!editImagePreview}
                  className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
                  {editUploading && !editAudioFile ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                </button>
                <input ref={editAudioRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadEditFile(f, 'audio'); e.target.value = ''; }} />
                <button type="button" onClick={() => editAudioRef.current?.click()} disabled={editUploading || !!editAudioFile}
                  className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
                  {editUploading && !editImagePreview ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => editMut.mutate()}
                  disabled={editMut.isPending || editUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {editMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        ) : (
          <DoubleTapReactWrapper
            reactions={post.reactions ?? []}
            currentUserId={currentUserId}
            onReact={(emoji) => reactMut.mutate(emoji)}
            onUnreact={() => unreactMut.mutate()}
          >
            <>
              {post.content && (
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                  {isLongContent && !expanded ? post.content.slice(0, 280) + '…' : post.content}
                </p>
              )}
              {isLongContent && (
                <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 mt-1 transition-colors">
                  {expanded ? 'Свернуть' : 'Читать полностью'}
                </button>
              )}
              {post.imageUrl && (
                <div className="mt-2">
                  <img src={`${API_URL}${post.imageUrl}`} alt="Вложение" className="max-h-96 w-full object-cover rounded-xl border border-slate-800" loading="lazy" />
                </div>
              )}
              {post.audioUrl && (
                <AudioPlayer src={`${API_URL}${post.audioUrl}`} name={post.audioName || post.audioUrl.split('/').pop()} />
              )}
            </>
          </DoubleTapReactWrapper>
        )}
        {!editing && (
          <ReactionBar
            reactions={post.reactions ?? []}
            currentUserId={currentUserId}
            onReact={(emoji) => reactMut.mutate(emoji)}
            onUnreact={() => unreactMut.mutate()}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-[52px]">
        <button
          onClick={() => !isOwner && likeMut.mutate()}
          disabled={likeMut.isPending || isOwner}
          title={isOwner ? 'Нельзя лайкать свой пост' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
            isOwner ? 'cursor-default text-slate-600' :
            post.isLiked ? 'text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Heart size={15} className={post.isLiked ? 'fill-red-400 text-red-400' : ''} />
          <span className="font-medium tabular-nums">{post._count.likes}</span>
        </button>

        <button
          onClick={handleCommentClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
        >
          <MessageCircle size={15} />
          <span className="font-medium tabular-nums">{post._count.comments}</span>
        </button>

        <ShareButton
          url={`/post/${post.id}`}
          title={`Пост от ${post.author.firstName} ${post.author.lastName}`}
          text={post.content?.slice(0, 100)}
          iconSize={15}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
        />
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 ml-[52px] space-y-3">
          {post.comments && post.comments.length > 0 && (
            <div className="space-y-2">
              {post.comments.map((comment: any) => (
                <CommentItem key={comment.id} comment={comment} postId={post.id} postAuthorId={post.author.id} currentUserId={currentUserId} feedQueryKey={feedQueryKey} />
              ))}
            </div>
          )}
          <form
            onSubmit={e => { e.preventDefault(); if (commentText.trim()) commentMut.mutate(commentText.trim()); }}
            className="flex gap-2 items-center"
          >
            <input
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Написать комментарий..."
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || commentMut.isPending}
              className="p-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
            >
              {commentMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Feed Page ─────────────────────────────────────────────────────────────────

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

type MainTab = 'channels' | 'friends';
type ChannelSubTab = 'mine' | 'subscribed';

export default function FeedPage() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<MainTab>('channels');
  const [channelSubTab, setChannelSubTab] = useState<ChannelSubTab>('mine');

  // Fetch user's own channel
  const { data: myChannel } = useQuery({
    queryKey: ['my-channel'],
    queryFn: async () => {
      const { data } = await channelAPI.getMyChannel();
      return data as { id: string; name: string; avatar: string | null; _count: { subscriptions: number; posts: number } } | null;
    },
    staleTime: 60000,
  });

  // Friends feed
  const { data: friendPosts, isLoading: friendsLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => { const { data } = await postAPI.getFeed(); return data; },
    refetchInterval: 30000,
    enabled: activeTab === 'friends',
  });

  // My channel posts
  const { data: myChannelPosts, isLoading: mineLoading } = useQuery({
    queryKey: ['channel-feed-mine'],
    queryFn: async () => { const { data } = await channelAPI.getMyChannelFeed(); return data; },
    refetchInterval: 30000,
    enabled: activeTab === 'channels' && channelSubTab === 'mine',
  });

  // Subscribed channels posts
  const { data: subscribedPosts, isLoading: subLoading } = useQuery({
    queryKey: ['channel-feed-subscribed'],
    queryFn: async () => { const { data } = await channelAPI.getSubscribedFeed(); return data; },
    refetchInterval: 30000,
    enabled: activeTab === 'channels' && channelSubTab === 'subscribed',
  });

  const posts = activeTab === 'friends'
    ? friendPosts
    : channelSubTab === 'mine' ? myChannelPosts : subscribedPosts;

  const isLoading = activeTab === 'friends'
    ? friendsLoading
    : channelSubTab === 'mine' ? mineLoading : subLoading;

  const feedQueryKey = activeTab === 'friends'
    ? ['feed']
    : channelSubTab === 'mine' ? ['channel-feed-mine'] : ['channel-feed-subscribed'];

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">
        {/* Header + Main Tabs */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Newspaper size={20} className="text-primary-400" />
            <h2 className="text-lg font-bold text-white">Лента</h2>
          </div>
          <div className="flex px-4 pb-0 gap-1">
            <button
              onClick={() => setActiveTab('channels')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'channels' ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Radio size={14} />Каналы
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'friends' ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Users size={14} />Лента
            </button>
          </div>
        </div>

        {/* Channel sub-tabs */}
        {activeTab === 'channels' && (
          <div className="flex gap-2 px-4 pt-3 pb-0">
            <button
              onClick={() => setChannelSubTab('mine')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                channelSubTab === 'mine'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Radio size={11} />Мои каналы
            </button>
            <button
              onClick={() => setChannelSubTab('subscribed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                channelSubTab === 'subscribed'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Users size={11} />Я подписан
            </button>
          </div>
        )}

        <div className="pb-24">
          {currentUser && (
            <CreatePostCard
              currentUser={currentUser}
              myChannel={myChannel}
              defaultChannelPost={activeTab === 'channels' && channelSubTab === 'mine'}
            />
          )}
          <div className="border-t border-slate-800/60 mt-3" />

          {isLoading ? (
            <div className="divide-y divide-slate-800/60">
              {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {posts.map((post: any) => (
                <PostCard key={post.id} post={post} currentUserId={currentUser?.id ?? ''} feedQueryKey={feedQueryKey} />
              ))}
            </div>
          ) : activeTab === 'channels' && channelSubTab === 'mine' ? (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Radio size={32} className="text-slate-600" /></div>
              <p className="text-white font-semibold mb-1">{myChannel ? 'Нет постов в вашем канале' : 'У вас нет канала'}</p>
              <p className="text-slate-500 text-sm">{myChannel ? 'Опубликуйте первый пост' : 'Создайте канал в разделе Профиль → Канал'}</p>
            </div>
          ) : activeTab === 'channels' && channelSubTab === 'subscribed' ? (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Users size={32} className="text-slate-600" /></div>
              <p className="text-white font-semibold mb-1">Вы ни на кого не подписаны</p>
              <p className="text-slate-500 text-sm">Найдите интересных авторов в профилях</p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4"><Users size={32} className="text-slate-600" /></div>
              <p className="text-white font-semibold mb-1">Лента пуста</p>
              <p className="text-slate-500 text-sm">Напишите первый пост или добавьте друзей</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
