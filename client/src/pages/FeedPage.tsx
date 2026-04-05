import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Newspaper, Send, Heart, MessageCircle, Trash2, Loader2, X, MoreHorizontal } from 'lucide-react';
import { postAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

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
  const cls = `w-${size} h-${size} rounded-full object-cover flex-shrink-0`;
  if (user.avatar) {
    return <img src={`${API_URL}${user.avatar}`} alt={`${user.firstName} ${user.lastName}`} className={cls} />;
  }
  return (
    <div className={`w-${size} h-${size} rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold" style={{ fontSize: size <= 8 ? '0.65rem' : '0.8rem' }}>
        {user.firstName[0]}{user.lastName[0]}
      </span>
    </div>
  );
}

function CreatePostCard({ currentUser }: { currentUser: any }) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: postAPI.createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    },
  });

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex gap-3">
          <Avatar user={currentUser} size={9} />
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => { setContent(e.target.value); handleInput(); }}
              onInput={handleInput}
              placeholder="Что у вас нового?"
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none resize-none min-h-[40px]"
              rows={1}
            />
            {content.trim() && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { setContent(''); if (textareaRef.current) textareaRef.current.style.height = 'auto'; }}
                  className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={() => createMut.mutate({ content })}
                  disabled={createMut.isPending}
                  className="flex items-center gap-2 px-4 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Опубликовать
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  postId,
  postAuthorId,
  currentUserId,
}: {
  comment: any;
  postId: string;
  postAuthorId: string;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const canDelete = comment.author.id === currentUserId || postAuthorId === currentUserId;

  const deleteMut = useMutation({
    mutationFn: () => postAPI.deleteComment(postId, comment.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  return (
    <div className="flex gap-2.5 group/comment">
      <Link to={`/profile/${comment.author.id}`}>
        <Avatar user={comment.author} size={7} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-slate-800/60 rounded-xl px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/profile/${comment.author.id}`} className="text-xs font-semibold text-white hover:text-primary-400 transition-colors truncate">
              {comment.author.firstName} {comment.author.lastName}
            </Link>
            {canDelete && (
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="opacity-0 group-hover/comment:opacity-100 text-slate-500 hover:text-red-400 transition-all flex-shrink-0 p-0.5"
              >
                {deleteMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mt-0.5 break-words">{comment.content}</p>
        </div>
        <p className="text-xs text-slate-600 mt-0.5 px-1">{timeAgo(comment.createdAt)}</p>
      </div>
    </div>
  );
}

function PostCard({ post, currentUserId }: { post: any; currentUserId: string }) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = post.author.id === currentUserId;
  const isLongContent = post.content.length > 280;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const likeMut = useMutation({
    mutationFn: () => post.isLiked ? postAPI.unlikePost(post.id) : postAPI.likePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const commentMut = useMutation({
    mutationFn: (content: string) => postAPI.commentPost(post.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setCommentText('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => postAPI.deletePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) commentMut.mutate(commentText.trim());
  };

  const handleCommentClick = () => {
    setShowComments(true);
    setTimeout(() => commentInputRef.current?.focus(), 50);
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
            <Link to={`/profile/${post.author.id}`} className="text-sm font-semibold text-white hover:text-primary-400 transition-colors truncate block">
              {post.author.firstName} {post.author.lastName}
            </Link>
            <p className="text-xs text-slate-500 truncate">{timeAgo(post.createdAt)}{post.author.role ? ` · ${post.author.role}` : ''}</p>
          </div>
        </div>
        {isOwner && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden min-w-[140px]">
                <button
                  onClick={() => { setShowMenu(false); deleteMut.mutate(); }}
                  disabled={deleteMut.isPending}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors"
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
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
          {isLongContent && !expanded ? post.content.slice(0, 280) + '…' : post.content}
        </p>
        {isLongContent && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-primary-400 hover:text-primary-300 mt-1 transition-colors">
            {expanded ? 'Свернуть' : 'Читать полностью'}
          </button>
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
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 ml-[52px] space-y-3">
          {/* Existing comments */}
          {post.comments && post.comments.length > 0 && (
            <div className="space-y-2">
              {post.comments.map((comment: any) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  postId={post.id}
                  postAuthorId={post.author.id}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          )}

          {/* Add comment */}
          <form onSubmit={handleCommentSubmit} className="flex gap-2 items-center">
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

export default function FeedPage() {
  const { user: currentUser } = useAuthStore();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const { data } = await postAPI.getFeed();
      return data;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-3 flex items-center gap-2">
            <Newspaper size={20} className="text-primary-400" />
            <h2 className="text-lg font-bold text-white">Лента</h2>
          </div>
        </div>

        <div className="pb-24">
          {/* Create post */}
          {currentUser && <CreatePostCard currentUser={currentUser} />}

          {/* Divider */}
          <div className="border-t border-slate-800/60 mt-3" />

          {/* Posts */}
          {isLoading ? (
            <div className="divide-y divide-slate-800/60">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-4 py-4 animate-pulse">
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
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {posts.map((post: any) => (
                <PostCard key={post.id} post={post} currentUserId={currentUser?.id ?? ''} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                <Newspaper size={32} className="text-slate-600" />
              </div>
              <p className="text-white font-semibold mb-1">Лента пуста</p>
              <p className="text-slate-500 text-sm">Напишите первый пост или добавьте друзей</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
