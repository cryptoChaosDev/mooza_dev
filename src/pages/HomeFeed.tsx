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
    <main className="flex flex-col items-center min-h-[100dvh] pt-6 bg-dark-bg w-full flex-1 overflow-x-hidden" style={{ paddingBottom: 'calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))' }}>
      <section className="w-full max-w-md flex flex-col gap-6 animate-fade-in px-4 container-responsive max-width-md">
        {/* Improved header with better UX organization */}
        <div className="flex flex-col gap-4">
          {/* Page title */}
          <div className="text-2xl font-bold text-dark-text">Лента друзей</div>
          
          {/* Sorting options and New Post button in a single row */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-dark-muted font-medium mr-2 hidden sm:block">Сортировка:</span>
              <div className="flex bg-dark-bg/60 rounded-2xl p-1 shadow-inner">
                <button
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    sortBy === 'date' 
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' 
                      : 'text-dark-muted hover:text-dark-text'
                  }`}
                  onClick={() => setSortBy('date')}
                  title="Сортировать по дате"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="inline mr-1 sm:hidden">
                    <path d="M12 5v14m7-7H5" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span className="hidden sm:inline">Дата</span>
                  <span className="sm:hidden">📅</span>
                </button>
                <button
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    sortBy === 'author' 
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow' 
                      : 'text-dark-muted hover:text-dark-text'
                  }`}
                  onClick={() => setSortBy('author')}
                  title="Сортировать по автору"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className="inline mr-1 sm:hidden">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M4 20c0-2.5 3.5-4 8-4s8 1.5 8 4" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span className="hidden sm:inline">Автор</span>
                  <span className="sm:hidden">👤</span>
                </button>
              </div>
            </div>
            
            {/* New Post button */}
            <button 
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold text-sm shadow-lg hover:opacity-90 active:scale-95 transition-all hover:scale-105"
              title={showCreate ? 'Скрыть создание поста' : 'Создать пост'} 
              onClick={() => setShowCreate(v => !v)}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M12 5v14m7-7H5" stroke="#fff" strokeWidth="1.5"/>
              </svg>
              <span className="hidden sm:inline">Новый пост</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-6 animate-fade-in animate-scale-in border border-dark-bg/40">
            <div className="text-2xl font-bold text-dark-text">Создать пост</div>
            <textarea
              className="w-full border-none rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
              rows={5}
              placeholder="Что нового? Поделитесь с друзьями..."
              value={newPost.content}
              onChange={e => setNewPost({ ...newPost, content: e.target.value })}
            />
            <div className="flex flex-col gap-5">
              <div className="text-base text-dark-muted font-semibold">Теги:</div>
              <InterestSelector
                selected={newPost.tags}
                onChange={tags => setNewPost(prev => ({ ...prev, tags }))}
              />
            </div>
            <div className="flex items-center gap-5">
              <label className="cursor-pointer p-3 rounded-2xl bg-dark-bg/60 hover:bg-dark-accent/10 transition-colors shadow text-dark-accent" title="Прикрепить изображение">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M16.5 13.5V7a4.5 4.5 0 0 0-9 0v8a6 6 0 0 0 12 0V9.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/></svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewPost(prev => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  className="hidden"
                />
              </label>
              {newPost.attachment && (
                <img src={URL.createObjectURL(newPost.attachment)} alt="attachment" className="max-h-20 rounded-2xl object-contain" />
              )}
              <button
                className="ml-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 hover:scale-105"
                onClick={handleCreatePost}
                disabled={!newPost.content.trim() || newPost.tags.length === 0}
                title="Опубликовать пост"
                type="button"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M4 12h16M12 4l8 8-8 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="text-base hidden sm:inline">Опубликовать</span>
                <span className="sm:hidden">↗️</span>
              </button>
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-5">
          {sortedPosts.length === 0 ? (
            <div className="bg-dark-card rounded-3xl shadow-card p-8 flex flex-col items-center justify-center gap-5 border border-dark-bg/40">
              <div className="text-5xl opacity-50">🎵</div>
              <div className="text-center text-dark-muted">
                <div className="font-semibold text-xl">Нет постов по вашим интересам</div>
                <div className="text-base mt-2">Подпишитесь на интересных людей или создайте свой первый пост!</div>
              </div>
              <button 
                className="mt-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow-btn hover:opacity-90 active:scale-95 transition-all text-base hover:scale-105"
                onClick={() => setShowCreate(true)}
              >
                Создать первый пост
              </button>
            </div>
          ) : (
            sortedPosts.map((post) => {
              const user = users.find(u => u.userId === post.userId);
              return (
                <div key={post.id} className="bg-dark-card rounded-3xl shadow-card p-6 flex flex-col gap-5 animate-fade-in animate-scale-in border border-dark-bg/40 hover:bg-dark-bg/80 transition shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center text-xl border-2 border-white overflow-hidden flex-shrink-0 shadow-lg">
                      {user?.avatarUrl || post.avatarUrl ? (
                        <img src={user?.avatarUrl || post.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        <span role="img" aria-label="avatar" className="text-2xl">👤</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div 
                        className="font-bold text-dark-text text-lg cursor-pointer hover:text-blue-400 transition-colors"
                        onClick={() => {
                          const u = users.find(u => u.userId === post.userId);
                          if (u) onUserClick(u);
                        }}
                      >
                        {(() => {
                          const u = users.find(u => u.userId === post.userId);
                          return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : post.author;
                        })()}
                      </div>
                      <div className="text-sm text-dark-muted">{formatPostDate(post.createdAt)}</div>
                    </div>
                    {/* Кнопки редактирования/удаления только для своих постов */}
                    {post.userId === profile.userId && (
                      <div className="flex gap-2">
                        <button 
                          title="Редактировать пост" 
                          className="p-2 rounded-2xl bg-dark-bg/60 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors hover:scale-105"
                          onClick={() => { setEditPost(post); setEditPostData({ content: post.content, tags: post.tags }); }}
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M4 20h4.586a1 1 0 0 0 .707-.293l9.414-9.414a2 2 0 0 0 0-2.828l-2.172-2.172a2 2 0 0 0-2.828 0l-9.414 9.414A1 1 0 0 0 4 15.414V20z" stroke="currentColor" strokeWidth="1.5"/></svg>
                        </button>
                        <button 
                          title="Удалить пост" 
                          className="p-2 rounded-2xl bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white transition-colors hover:scale-105"
                          onClick={() => setDeletePostId(post.id)}
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-dark-text text-lg whitespace-pre-line leading-relaxed">{post.content}</div>
                  
                  {post.attachmentUrl && (
                    <img src={post.attachmentUrl} alt="attachment" className="max-h-64 rounded-2xl object-contain" />
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag, i) => (
                      <span key={i} className="px-3 py-1.5 bg-dark-bg/60 text-blue-700 rounded-2xl text-sm font-medium shadow-sm">{getInterestPath(tag)}</span>
                    ))}
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      title={post.liked ? "Убрать лайк" : "Лайкнуть"} 
                      className={`p-2 rounded-2xl transition-colors ${post.liked ? 'bg-red-500 text-white' : 'bg-dark-bg/60 text-red-500 hover:bg-red-500 hover:text-white'} hover:scale-105`}
                      onClick={() => onLikePost(post.id)}
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 21s-6.5-5.5-9-9.5C1.5 8.5 3.5 5 7 5c2.5 0 3.5 2 5 2s2.5-2 5-2c3.5 0 5.5 3.5 4 6.5C18.5 15.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" fill={post.liked ? '#ef4444' : 'none'} /></svg>
                    </button>
                    <button 
                      title={post.favorite ? "Убрать из избранного" : "В избранное"} 
                      className={`p-2 rounded-2xl transition-colors ${post.favorite ? 'bg-yellow-400 text-white' : 'bg-dark-bg/60 text-yellow-400 hover:bg-yellow-400 hover:text-white'} hover:scale-105`}
                      onClick={() => onLikePost(post.id)}
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke="currentColor" strokeWidth="1.5" fill={post.favorite ? '#fbbf24' : 'none'} /></svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-x-hidden p-4">
          <div className="bg-dark-card rounded-3xl shadow-2xl p-6 w-[90vw] max-w-md flex flex-col gap-6 animate-fade-in animate-scale-in border border-dark-bg/40">
            <div className="flex justify-between items-center">
              <div className="text-xl font-bold text-dark-text">Редактировать пост</div>
              <button 
                className="p-2 rounded-2xl hover:bg-dark-bg/60 transition-colors hover:scale-105"
                onClick={() => setEditPost(null)}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>
            
            <textarea
              className="w-full border-none rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-dark-bg/60 text-dark-text shadow-inner"
              rows={4}
              placeholder="Текст поста"
              value={editPostData.content}
              onChange={e => setEditPostData({ ...editPostData, content: e.target.value })}
            />
            
            <div className="flex flex-col gap-4">
              <div className="text-sm text-dark-muted">Теги:</div>
              <InterestSelector
                selected={editPostData.tags}
                onChange={tags => setEditPostData(prev => ({ ...prev, tags }))}
              />
            </div>
            
            <div className="flex gap-4 pt-3">
              <button
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold shadow active:scale-95 transition-transform hover:scale-105"
                onClick={() => { onUpdatePost(editPost.id, editPostData.content, editPostData.tags); setEditPost(null); }}
                disabled={!editPostData.content.trim() || editPostData.tags.length === 0}
              >
                Сохранить
              </button>
              <button
                className="flex-1 py-3 rounded-2xl bg-dark-bg/60 text-dark-muted font-semibold shadow active:scale-95 transition-transform hover:scale-105"
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