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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        {/* Header with gradient backdrop */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
          <div className="relative max-w-4xl mx-auto px-4 pt-6 pb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-500/20 rounded-2xl">
                <Newspaper size={28} className="text-primary-400" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Лента
              </h1>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 animate-pulse"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-slate-700/50 rounded-2xl"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700/50 rounded-lg w-1/3"></div>
                  <div className="h-3 bg-slate-700/50 rounded-lg w-1/4"></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-slate-700/50 rounded-lg w-full"></div>
                <div className="h-4 bg-slate-700/50 rounded-lg w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header with gradient backdrop */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-4xl mx-auto px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-500/20 rounded-2xl">
              <Newspaper size={28} className="text-primary-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Лента
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
        {/* Create Post */}
        <form onSubmit={handleCreatePost} className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Что нового?"
              className="w-full bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-slate-600/50 rounded-2xl px-5 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 resize-none transition-all"
              rows={3}
            />
            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={!content.trim() || createPostMutation.isPending}
                className="group/btn relative px-6 py-3 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-800 text-white font-semibold rounded-2xl transition-all duration-300 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105 disabled:shadow-none disabled:scale-100 flex items-center gap-2"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-400/0 via-white/20 to-primary-400/0 opacity-0 group-hover/btn:opacity-100 transition-opacity blur-xl"></div>
                <span className="relative z-10 flex items-center gap-2">
                  {createPostMutation.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  Опубликовать
                </span>
              </button>
            </div>
          </div>
        </form>

        {/* Posts */}
        {posts && posts.length > 0 ? (
          <div className="space-y-4">
            {posts?.map((post: any) => (
              <div key={post.id} className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 shadow-lg hover:shadow-primary-500/10">
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <div className="relative">
                  {/* Author Info */}
                  <div className="flex items-center mb-4">
                    {post.author.avatar ? (
                      <div className="relative">
                        <img
                          src={`${import.meta.env.VITE_API_URL}${post.author.avatar}`}
                          alt={`${post.author.firstName} ${post.author.lastName}`}
                          className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-700/50 group-hover:ring-primary-500/40 transition-all duration-300"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-2xl flex items-center justify-center ring-2 ring-slate-700/50 group-hover:ring-primary-500/40 transition-all duration-300">
                        <span className="text-white font-bold text-lg">
                          {post.author.firstName[0]}{post.author.lastName[0]}
                        </span>
                      </div>
                    )}
                    <div className="ml-3">
                      <p className="font-bold text-white text-lg">
                        {post.author.firstName} {post.author.lastName}
                      </p>
                      {post.author.role && (
                        <p className="text-sm text-primary-300">{post.author.role}</p>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-slate-100 mb-6 leading-relaxed text-base">{post.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => {
                        if (post.isLiked) {
                          unlikeMutation.mutate(post.id);
                        } else {
                          likeMutation.mutate(post.id);
                        }
                      }}
                      disabled={likeMutation.isPending || unlikeMutation.isPending || post.author.id === currentUser?.id}
                      className="group/like flex items-center gap-2 px-4 py-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Heart size={20} className={`transition-all ${post.isLiked ? 'fill-red-400 text-red-400 scale-110' : 'text-slate-300 group-hover/like:text-red-400'}`} />
                      <span className={`font-medium ${post.isLiked ? 'text-red-400' : 'text-slate-300 group-hover/like:text-white'}`}>{post._count.likes}</span>
                    </button>

                    <button
                      onClick={() => setShowComments({ ...showComments, [post.id]: !showComments[post.id] })}
                      className="group/comment flex items-center gap-2 px-4 py-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all"
                    >
                      <MessageCircle size={20} className="text-slate-300 group-hover/comment:text-primary-400 transition-colors" />
                      <span className="font-medium text-slate-300 group-hover/comment:text-white">{post._count.comments}</span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  {showComments[post.id] && (
                    <div className="mt-6 pt-6 border-t border-slate-700/50">
                      {/* Comment Input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const content = commentContent[post.id];
                          if (content?.trim()) {
                            commentMutation.mutate({ postId: post.id, content });
                          }
                        }}
                        className="flex gap-3 mb-6"
                      >
                        <input
                          type="text"
                          value={commentContent[post.id] || ''}
                          onChange={(e) =>
                            setCommentContent({ ...commentContent, [post.id]: e.target.value })
                          }
                          placeholder="Написать комментарий..."
                          className="flex-1 bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-slate-600/50 rounded-2xl px-5 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500/50 transition-all"
                        />
                        <button
                          type="submit"
                          disabled={!commentContent[post.id]?.trim() || commentMutation.isPending}
                          className="group/send p-3 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:from-slate-700 disabled:to-slate-800 text-white rounded-2xl transition-all duration-300 disabled:cursor-not-allowed shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105 disabled:shadow-none disabled:scale-100"
                        >
                          {commentMutation.isPending ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Send size={20} />
                          )}
                        </button>
                      </form>

                      {/* Comments List */}
                      {post.comments && post.comments.length > 0 && (
                        <div className="space-y-3">
                          {post.comments.map((comment: any) => (
                            <div key={comment.id} className="flex gap-3">
                              {comment.author.avatar ? (
                                <img
                                  src={`${import.meta.env.VITE_API_URL}${comment.author.avatar}`}
                                  alt={`${comment.author.firstName} ${comment.author.lastName}`}
                                  className="w-10 h-10 rounded-2xl object-cover ring-2 ring-slate-700/50"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center flex-shrink-0 ring-2 ring-slate-700/50">
                                  <span className="text-white text-sm font-bold">
                                    {comment.author.firstName[0]}{comment.author.lastName[0]}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 bg-gradient-to-br from-slate-700/40 to-slate-800/40 rounded-2xl px-4 py-3 border border-slate-600/30">
                                <p className="text-sm font-bold text-white mb-1">
                                  {comment.author.firstName} {comment.author.lastName}
                                </p>
                                <p className="text-sm text-slate-200 leading-relaxed">{comment.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
            {/* Decorative gradient orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="relative text-center py-16 px-6">
              <div className="inline-flex p-6 bg-slate-700/30 rounded-3xl mb-6">
                <Newspaper size={64} className="text-slate-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Лента пуста</h3>
              <p className="text-slate-400 text-lg">Создайте первый пост или добавьте друзей</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
