import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Briefcase, Music2, MessageCircle, Loader2, Youtube, Send, Sparkles } from 'lucide-react';
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <Loader2 size={48} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="text-center">
          <p className="text-slate-400 text-xl mb-4">Пользователь не найден</p>
          <button
            onClick={() => navigate(-1)}
            className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl transition-all"
          >
            Вернуться назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Header with gradient backdrop */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 via-purple-500/10 to-pink-500/10 blur-3xl"></div>
        <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-8">
          <button
            onClick={() => navigate(-1)}
            className="group inline-flex items-center gap-2 px-4 py-2 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 rounded-xl transition-all duration-300 border border-slate-700/50 mb-6"
          >
            <ArrowLeft size={20} className="text-slate-300 group-hover:text-white transition-colors" />
            <span className="text-slate-300 group-hover:text-white transition-colors">Назад</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-8 space-y-6">
        {/* Hero Profile Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl">
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>

          <div className="relative p-8">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Avatar Section */}
              <div className="flex-shrink-0 relative group">
                {user.avatar ? (
                  <div className="relative">
                    <img
                      src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                      alt={`${user.firstName} ${user.lastName}`}
                      className="w-40 h-40 rounded-3xl object-cover shadow-2xl ring-4 ring-primary-500/20 group-hover:ring-primary-500/40 transition-all duration-300"
                    />
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-primary-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                ) : (
                  <div className="w-40 h-40 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl ring-4 ring-primary-500/20 group-hover:ring-primary-500/40 transition-all duration-300 group-hover:scale-105">
                    <span className="text-white font-bold text-5xl">
                      {user.firstName[0]}{user.lastName[0]}
                    </span>
                  </div>
                )}
              </div>

              {/* User Info Section */}
              <div className="flex-1 space-y-5">
                {/* Name and Title */}
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    {user.firstName} {user.lastName}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4">
                    {user.role && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-primary-500/10 border border-primary-500/30 rounded-xl">
                        <Briefcase size={18} className="text-primary-400" />
                        <span className="text-primary-300 font-medium">{user.role}</span>
                      </div>
                    )}
                    {user.city && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-700/30 border border-slate-600/30 rounded-xl">
                        <MapPin size={18} className="text-slate-400" />
                        <span className="text-slate-300">{user.city}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {user.bio && (
                  <div className="bg-slate-700/20 rounded-2xl p-4 border border-slate-600/30">
                    <p className="text-slate-200 leading-relaxed text-lg">{user.bio}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => navigate(`/chat/${user.id}`)}
                    className="group flex items-center gap-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105"
                  >
                    <MessageCircle size={20} className="group-hover:rotate-12 transition-transform" />
                    Написать сообщение
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-primary-500/50 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary-500/10 rounded-lg group-hover:bg-primary-500/20 transition-colors">
                <Sparkles size={20} className="text-primary-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{user._count?.posts || 0}</p>
            <p className="text-sm text-slate-400">Постов</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                <MessageCircle size={20} className="text-purple-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{user._count?.sentRequests || 0}</p>
            <p className="text-sm text-slate-400">Друзей</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-pink-500/50 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-pink-500/10 rounded-lg group-hover:bg-pink-500/20 transition-colors">
                <Music2 size={20} className="text-pink-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{user.genres?.length || 0}</p>
            <p className="text-sm text-slate-400">Жанров</p>
          </div>

          <div className="group bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 hover:scale-105">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Briefcase size={20} className="text-blue-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-1">{user.skills?.length || 0}</p>
            <p className="text-sm text-slate-400">Навыков</p>
          </div>
        </div>

        {/* Genres Section */}
        {user.genres && user.genres.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <Music2 size={24} className="text-primary-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Музыкальные жанры</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {user.genres.map((genre: string) => (
                <span
                  key={genre}
                  className="group px-5 py-2.5 bg-gradient-to-br from-primary-500/20 to-primary-600/20 hover:from-primary-500/30 hover:to-primary-600/30 border border-primary-500/30 hover:border-primary-400/50 text-primary-300 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 shadow-lg shadow-primary-500/10 hover:shadow-primary-500/20"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skills Section */}
        {user.skills && user.skills.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Sparkles size={24} className="text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Навыки и умения</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {user.skills.map((skill: string) => (
                <span
                  key={skill}
                  className="px-5 py-2.5 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/30 hover:border-slate-500/50 text-slate-200 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Social Links Section */}
        {(user.vkLink || user.youtubeLink || user.telegramLink) && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Send size={24} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Социальные сети</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {user.vkLink && (
                <a
                  href={user.vkLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-5 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-400/50 text-blue-300 hover:text-blue-200 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2zm3.15 13.21h-1.58c-.48 0-.63-.39-1.5-1.27-.75-.74-1.08-.84-1.27-.84-.26 0-.33.07-.33.41v1.15c0 .31-.1.5-1.02.5-1.5 0-3.17-.91-4.34-2.6-1.77-2.45-2.25-4.3-2.25-4.68 0-.19.07-.37.41-.37h1.58c.31 0 .42.14.54.47.59 1.73 1.59 3.25 2 3.25.15 0 .22-.07.22-.46v-1.77c-.06-.95-.55-1.03-.55-1.37 0-.15.13-.3.33-.3h2.48c.26 0 .36.14.36.44v2.39c0 .26.11.36.19.36.15 0 .28-.1.56-.38 1.07-1.21 1.84-3.08 1.84-3.08.1-.21.24-.37.55-.37h1.58c.37 0 .45.19.37.44-.14.66-1.99 3.51-1.99 3.51-.13.2-.17.29 0 .51.12.16.52.51.79.82.48.53.85.97.95 1.27.1.31-.05.47-.36.47z"/>
                  </svg>
                  <span className="font-medium">ВКонтакте</span>
                </a>
              )}
              {user.youtubeLink && (
                <a
                  href={user.youtubeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-5 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-400/50 text-red-300 hover:text-red-200 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  <Youtube size={20} />
                  <span className="font-medium">YouTube</span>
                </a>
              )}
              {user.telegramLink && (
                <a
                  href={user.telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-5 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-400/50 text-sky-300 hover:text-sky-200 rounded-xl transition-all duration-300 hover:scale-105"
                >
                  <Send size={20} />
                  <span className="font-medium">Telegram</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
