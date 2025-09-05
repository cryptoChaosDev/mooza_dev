import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { InterestSelector } from "../InterestSelector";
import { formatPostDate, getInterestPath } from "../utils";
import { Post, UserProfile } from "../types";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../contexts/ToastContext";

// --- HomeFeed ---
export function HomeFeed({ profile, allPosts, friends, onUserClick, onDeletePost, onLikePost, onCreatePost, onUpdatePost, users }: {
  profile: UserProfile,
  allPosts: Post[],
  friends: string[],
  onUserClick: (user: UserProfile) => void,
  onDeletePost: (id: number) => void,
  onLikePost: (id: number) => void,
  onCreatePost: (content: string, tags: string[], attachmentUrl?: string) => void,
  onUpdatePost: (id: number, content: string, tags: string[]) => void,
  users: UserProfile[],
}) {
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState<{ content: string; tags: string[]; attachment: File | null }>({ content: "", tags: [], attachment: null });
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'author'>('date');
  const filteredPosts = allPosts.filter((post) => friends.includes(post.userId) || post.userId === profile.userId);
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'author') {
      const userA = users.find(u => u.userId === a.userId);
      const userB = users.find(u => u.userId === b.userId);
      return (userA?.name || '').localeCompare(userB?.name || '', 'ru');
    }
    return 0;
  });

  const toast = useToast();
  const handleCreatePost = () => {
    if (!newPost.content.trim() || newPost.tags.length === 0) return;
    const attachmentUrl = newPost.attachment ? URL.createObjectURL(newPost.attachment) : undefined;
    onCreatePost(newPost.content, newPost.tags, attachmentUrl);
    setNewPost({ content: "", tags: [], attachment: null });
    toast("Пост опубликован!");
  };

  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editPostData, setEditPostData] = useState<{ content: string; tags: string[] }>({ content: "", tags: [] });
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="flex flex-col items-center min-h-[100dvh] pt-20 bg-dark-bg w-full flex-1" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="text-lg font-bold text-dark-text">Лента друзей</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-muted">Сортировать:</span>
            <select className="px-2 py-1 rounded bg-dark-bg/60 text-dark-text text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="date">Сначала новые</option>
              <option value="author">По автору</option>
            </select>
          </div>
          <button
            className={`p-2 rounded-full bg-dark-bg/60 text-dark-accent hover:bg-dark-accent/10 transition-colors shadow focus:outline-none ml-2 ${showCreate ? 'rotate-45' : ''}`}
            title={showCreate ? 'Скрыть создание поста' : 'Создать пост'}
            onClick={() => setShowCreate(v => !v)}
            aria-label={showCreate ? 'Скрыть создание поста' : 'Создать пост'}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <rect x="5" y="3" width="14" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7h8M8 11h8M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {showCreate && (
          <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-lg p-4 mb-4 flex flex-col gap-4 animate-fade-in animate-scale-in">
            <textarea
              className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner mb-2"
              rows={2}
              placeholder="Что нового? Поделитесь с друзьями..."
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
            />
            <InterestSelector
              selected={newPost.tags}
              onChange={tags => setNewPost(prev => ({ ...prev, tags }))}
            />
            <div className="flex items-center gap-3 mt-2">
              <label className="cursor-pointer p-2 rounded-full bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-accent" title="Прикрепить изображение">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewPost(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  className="hidden"
                />
              </label>
              {newPost.attachment && (
                <img src={URL.createObjectURL(newPost.attachment)} alt="attachment" className="max-h-20 rounded-xl object-contain ml-2" />
              )}
              <button
                className="ml-auto p-3 rounded-full bg-dark-accent text-white shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                onClick={handleCreatePost}
                disabled={!newPost.content.trim() || newPost.tags.length === 0}
                title="Опубликовать пост"
                type="button"
              >
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M4 12h16M12 4l8 8-8 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {sortedPosts.length === 0 && (
            <div className="text-center text-dark-muted py-8">Нет постов по вашим интересам</div>
          )}
          {sortedPosts.map((post) => {
            const user = users.find(u => u.userId === post.userId);
            return (
              <div key={post.id} className="relative bg-dark-card rounded-2xl shadow p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-2xl border-2 border-white overflow-hidden">
                    {user?.avatarUrl || post.avatarUrl ? (
                      <img src={user?.avatarUrl || post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span role="img" aria-label="avatar">👤</span>
                    )}
                  </div>
                  <div className="font-medium text-dark-text text-sm cursor-pointer hover:underline" onClick={() => {
                    const u = users.find(u => u.userId === post.userId);
                    if (u) onUserClick(u);
                  }}>{(() => {
                    const u = users.find(u => u.userId === post.userId);
                    return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : post.author;
                  })()}</div>
                  <div className="text-xs text-dark-muted ml-auto">{formatPostDate(post.createdAt)}</div>
                  {/* Кнопки редактирования/удаления только для своих постов */}
                  {post.userId === profile.userId && (
                    <>
                      <button title="Редактировать пост" className="p-2 rounded-full bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors ml-2" onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="#3b82f6" strokeWidth="1.5"/></svg>
                      </button>
                      <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => onDeletePost(post.id)}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="text-dark-text text-base mb-1 whitespace-pre-line">{post.content}</div>
                <div style={{position: 'absolute', right: 16, bottom: 12}} className="flex gap-2 text-xs text-dark-muted">
                  <span><span role="img" aria-label="created">🕒</span> {formatPostDate(post.createdAt)}</span>
                  {post.updatedAt !== post.createdAt && <span><span role="img" aria-label="edited">✏️</span> {formatPostDate(post.updatedAt)}</span>}
                </div>
                {post.attachmentUrl && (
                  <img src={post.attachmentUrl} alt="attachment" className="max-h-60 rounded-xl object-contain mb-2" />
                )}
                <div className="flex flex-wrap gap-2 mb-1">
                  {post.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-dark-bg/60 text-blue-700 rounded-full text-xs font-medium">{getInterestPath(tag)}</span>
                  ))}
                </div>
                <div className="flex gap-4 mt-1">
                  <button title={post.liked ? "Убрать лайк" : "Лайкнуть"} className={`p-2 rounded-full transition-colors ${post.liked ? 'bg-red-500 text-white' : 'bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white'}`} onClick={() => onLikePost(post.id)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.5-9-9.5C1.5 8.5 3.5 5 7 5c2.5 0 3.5 2 5 2s2.5-2 5-2c3.5 0 5.5 3.5 4 6.5C18.5 15.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" fill={post.liked ? '#ef4444' : 'none'} /></svg>
                  </button>
                  <button title={post.favorite ? "Убрать из избранного" : "В избранное"} className={`p-2 rounded-full transition-colors ${post.favorite ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'}`} onClick={() => onLikePost(post.id)}>
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={post.favorite ? '#fbbf24' : 'none'} /></svg>
                  </button>
                  {post.userId === profile.userId && (
                    <button title="Удалить пост" className="p-2 rounded-full bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors ml-2" onClick={() => setDeletePostId(post.id)}>
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="1.5"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {deletePostId !== null && (
        <ConfirmModal
          text="Вы уверены, что хотите удалить этот пост?"
          onConfirm={() => { onDeletePost(deletePostId); setDeletePostId(null); }}
          onCancel={() => setDeletePostId(null)}
        />
      )}
      {editPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-dark-card dark:bg-dark-card rounded-2xl shadow-2xl p-6 w-[90vw] max-w-md flex flex-col gap-4 animate-fade-in animate-scale-in">
            <div className="text-lg font-bold mb-2 text-dark-text">Редактировать пост</div>
            <textarea
              className="w-full border-none rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
              rows={2}
              placeholder="Текст поста"
              value={editPostData.content}
              onChange={e => setEditPostData({ ...editPostData, content: e.target.value })}
            />
            <div>
              <div className="text-sm text-dark-muted mb-1">Теги:</div>
              <InterestSelector
                selected={editPostData.tags}
                onChange={tags => setEditPostData(prev => ({ ...prev, tags }))}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                className="flex-1 py-2 rounded-xl bg-dark-accent text-white font-semibold shadow active:scale-95 transition-transform"
                onClick={() => { onUpdatePost(editPost.id, editPostData.content, editPostData.tags); setEditPost(null); }}
                disabled={!editPostData.content.trim() || editPostData.tags.length === 0}
              >
                Сохранить
              </button>
              <button
                className="flex-1 py-2 rounded-xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform"
                onClick={() => setEditPost(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}