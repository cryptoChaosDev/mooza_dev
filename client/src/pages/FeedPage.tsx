import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Newspaper, Send, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { postAPI } from '../lib/api';

export default function FeedPage() {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();

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
    mutationFn: postAPI.likePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      createPostMutation.mutate({ content });
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary-500/20 rounded-lg">
          <Newspaper size={24} className="text-primary-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Лента</h2>
      </div>

      {/* Create Post */}
      <form onSubmit={handleCreatePost} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Что нового?"
          className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-all"
          rows={3}
        />
        <div className="flex justify-end mt-3">
          <button
            type="submit"
            disabled={!content.trim() || createPostMutation.isPending}
            className="bg-primary-500 hover:bg-primary-600 disabled:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition-all disabled:cursor-not-allowed flex items-center gap-2"
          >
            {createPostMutation.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            Опубликовать
          </button>
        </div>
      </form>

      {/* Posts */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-400 mt-3">Загрузка...</p>
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-4">
          {posts?.map((post: any) => (
            <div key={post.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-primary-500/30 transition-all">
              {/* Author Info */}
              <div className="flex items-center mb-4">
                {post.author.avatar ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL}${post.author.avatar}`}
                    alt={`${post.author.firstName} ${post.author.lastName}`}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {post.author.firstName[0]}{post.author.lastName[0]}
                    </span>
                  </div>
                )}
                <div className="ml-3">
                  <p className="font-semibold text-white">
                    {post.author.firstName} {post.author.lastName}
                  </p>
                  {post.author.role && (
                    <p className="text-sm text-slate-400">{post.author.role}</p>
                  )}
                </div>
              </div>

              {/* Content */}
              <p className="text-slate-100 mb-4 leading-relaxed">{post.content}</p>

              {/* Actions */}
              <div className="flex items-center gap-6 text-sm">
                <button
                  onClick={() => likeMutation.mutate(post.id)}
                  disabled={likeMutation.isPending}
                  className="flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors disabled:cursor-not-allowed"
                >
                  <Heart size={20} className={post.isLiked ? 'fill-red-400 text-red-400' : ''} />
                  <span className={post.isLiked ? 'text-red-400' : ''}>{post._count.likes}</span>
                </button>

                <button className="flex items-center gap-2 text-slate-400 hover:text-primary-400 transition-colors">
                  <MessageCircle size={20} />
                  <span>{post._count.comments}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
          <Newspaper size={48} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-lg">Лента пуста</p>
          <p className="text-slate-500 text-sm mt-1">Создайте первый пост или добавьте друзей</p>
        </div>
      )}
    </div>
  );
}
