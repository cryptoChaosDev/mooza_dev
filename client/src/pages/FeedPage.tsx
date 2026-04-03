import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Newspaper, Send, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { postAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export default function FeedPage() {
  const [content, setContent] = useState('');
  const [commentContent, setCommentContent] = useState<{ [key: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const { data: posts, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const { data } = await postAPI.getFeed();
      return data;
    },
  });

  const createPostMutation = useMutation({
    mutationFn: postAPI.createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setContent('');
    },
  });

  const likeMutation = useMutation({
    mutationFn: (postId: string) => postAPI.likePost(postId),
    onSuccess: (_, postId) => {
      queryClient.setQueryData(['feed'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((post: any) =>
          post.id === postId
            ? { ...post, isLiked: true, _count: { ...post._count, likes: post._count.likes + 1 } }
            : post
        );
      });
    },
    onError: (error: any) => {
      if (error.response?.data?.error === 'Post already liked') {
        console.log('Post already liked');
      }
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: (postId: string) => postAPI.unlikePost(postId),
    onSuccess: (_, postId) => {
      queryClient.setQueryData(['feed'], (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((post: any) =>
          post.id === postId
            ? { ...post, isLiked: false, _count: { ...post._count, likes: Math.max(0, post._count.likes - 1) } }
            : post
        );
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: string; content: string }) =>
      postAPI.commentPost(postId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      setCommentContent({});
    },
  });

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      createPostMutation.mutate({ content });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Newspaper size={20} className="text-primary-400" />
              <h2 className="text-lg font-bold text-white">Лента</h2>
            </div>
          </div>
        </div>

        <div className="pb-24">

          {/* Create Post */}
          <div className="px-4 pt-4 pb-2">
            <form onSubmit={handleCreatePost} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Что нового?"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 resize-none transition-colors"
                rows={3}
              />
              <div className="flex justify-end mt-3">
                <button
                  type="submit"
                  disabled={!content.trim() || createPostMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {createPostMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Опубликовать
                </button>
              </div>
            </form>
          </div>

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
                  <div className="space-y-2">
                    <div className="h-3.5 bg-slate-800 rounded w-full" />
                    <div className="h-3.5 bg-slate-800 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="divide-y divide-slate-800/60">
              {posts.map((post: any) => (
                <div key={post.id} className="px-4 py-4 hover:bg-slate-800/20 transition-colors">
                  {/* Author */}
                  <div className="flex items-center gap-3 mb-3">
                    {post.author.avatar ? (
                      <img
                        src={`${import.meta.env.VITE_API_URL}${post.author.avatar}`}
                        alt={`${post.author.firstName} ${post.author.lastName}`}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {post.author.firstName[0]}{post.author.lastName[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {post.author.firstName} {post.author.lastName}
                      </p>
                      {post.author.role && (
                        <p className="text-xs text-slate-500">{post.author.role}</p>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-slate-200 text-sm leading-relaxed mb-3">{post.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (post.isLiked) {
                          unlikeMutation.mutate(post.id);
                        } else {
                          likeMutation.mutate(post.id);
                        }
                      }}
                      disabled={likeMutation.isPending || unlikeMutation.isPending || post.author.id === currentUser?.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-slate-800/60"
                    >
                      <Heart size={15} className={`transition-all ${post.isLiked ? 'fill-red-400 text-red-400' : 'text-slate-400'}`} />
                      <span className={`font-medium ${post.isLiked ? 'text-red-400' : 'text-slate-400'}`}>{post._count.likes}</span>
                    </button>

                    <button
                      onClick={() => setShowComments({ ...showComments, [post.id]: !showComments[post.id] })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all"
                    >
                      <MessageCircle size={15} />
                      <span className="font-medium">{post._count.comments}</span>
                    </button>
                  </div>

                  {/* Comments */}
                  {showComments[post.id] && (
                    <div className="mt-3 pt-3 border-t border-slate-800/60">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const c = commentContent[post.id];
                          if (c?.trim()) commentMutation.mutate({ postId: post.id, content: c });
                        }}
                        className="flex gap-2 mb-3"
                      >
                        <input
                          type="text"
                          value={commentContent[post.id] || ''}
                          onChange={(e) => setCommentContent({ ...commentContent, [post.id]: e.target.value })}
                          placeholder="Написать комментарий..."
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-600 transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={!commentContent[post.id]?.trim() || commentMutation.isPending}
                          className="p-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                        >
                          {commentMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                      </form>

                      {post.comments && post.comments.length > 0 && (
                        <div className="space-y-2">
                          {post.comments.map((comment: any) => (
                            <div key={comment.id} className="flex gap-2">
                              {comment.author.avatar ? (
                                <img
                                  src={`${import.meta.env.VITE_API_URL}${comment.author.avatar}`}
                                  alt={`${comment.author.firstName} ${comment.author.lastName}`}
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs font-bold">
                                    {comment.author.firstName[0]}{comment.author.lastName[0]}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                                <p className="text-xs font-semibold text-white mb-0.5">
                                  {comment.author.firstName} {comment.author.lastName}
                                </p>
                                <p className="text-xs text-slate-300 leading-relaxed">{comment.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="p-4 bg-slate-800/50 rounded-2xl mb-4">
                <Newspaper size={32} className="text-slate-600" />
              </div>
              <p className="text-white font-semibold mb-1">Лента пуста</p>
              <p className="text-slate-500 text-sm">Создайте первый пост или добавьте друзей</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
