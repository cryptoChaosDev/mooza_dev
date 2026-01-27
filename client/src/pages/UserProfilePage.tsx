import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Briefcase, Music2, MessageCircle, Loader2 } from 'lucide-react';
import { userAPI } from '../lib/api';

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const { data } = await userAPI.getUser(userId!);
      return data;
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={48} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-slate-400 text-lg">Пользователь не найден</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-primary-400 hover:text-primary-300"
        >
          Назад
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h2 className="text-2xl font-bold text-white">Профиль</h2>
      </div>

      {/* Profile Card */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {user.avatar ? (
              <img
                src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-32 h-32 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-32 h-32 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center">
                <span className="text-white font-bold text-4xl">
                  {user.firstName[0]}{user.lastName[0]}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-3xl font-bold text-white mb-2">
                {user.firstName} {user.lastName}
              </h3>

              <div className="flex flex-col gap-2">
                {user.role && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Briefcase size={18} className="text-primary-400" />
                    <span>{user.role}</span>
                  </div>
                )}
                {user.city && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <MapPin size={18} className="text-primary-400" />
                    <span>{user.city}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bio */}
            {user.bio && (
              <div>
                <p className="text-slate-300 leading-relaxed">{user.bio}</p>
              </div>
            )}

            {/* Genres */}
            {user.genres && user.genres.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Music2 size={18} className="text-primary-400" />
                  <span className="text-sm font-medium text-slate-400">Жанры:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.genres.map((genre: string) => (
                    <span
                      key={genre}
                      className="bg-gradient-to-br from-primary-500/20 to-primary-600/20 border border-primary-500/30 text-primary-300 px-3 py-1 rounded-full text-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {user.skills && user.skills.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-slate-400">Навыки:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.skills.map((skill: string) => (
                    <span
                      key={skill}
                      className="bg-slate-700/50 text-slate-300 px-3 py-1 rounded-full text-sm"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social Links */}
            <div className="flex flex-wrap gap-3 pt-2">
              {user.vkLink && (
                <a
                  href={user.vkLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  VK
                </a>
              )}
              {user.youtubeLink && (
                <a
                  href={user.youtubeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  YouTube
                </a>
              )}
              {user.telegramLink && (
                <a
                  href={user.telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Telegram
                </a>
              )}
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <button
                onClick={() => navigate(`/chat/${user.id}`)}
                className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center gap-2"
              >
                <MessageCircle size={20} />
                Написать сообщение
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
          <p className="text-sm text-slate-400 mb-1">Постов</p>
          <p className="text-2xl font-bold text-white">{user._count?.posts || 0}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
          <p className="text-sm text-slate-400 mb-1">Друзей</p>
          <p className="text-2xl font-bold text-white">{user._count?.sentRequests || 0}</p>
        </div>
      </div>
    </div>
  );
}
