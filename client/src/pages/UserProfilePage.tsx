import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Globe, Building2, Star, DollarSign, Clock, Headphones,
  Settings, ChevronRight
} from 'lucide-react';
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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30"></div>
          <p className="text-slate-400 mt-3 text-sm">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
        <Loader2 size={32} className="text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm mb-4">Пользователь не найден</p>
        <button
          onClick={() => navigate(-1)}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl transition-all text-sm"
        >
          Вернуться назад
        </button>
      </div>
    );
  }

  const sp = user.userSearchProfiles?.[0];
  const hasSearchProfile = sp && (
    sp.service || sp.genre || sp.workFormat || sp.employmentType ||
    sp.skillLevel || sp.availability || sp.pricePerHour || sp.pricePerEvent
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">

        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 rounded-lg border border-slate-700/50 hover:border-primary-500/50 transition-all mb-3 text-sm"
        >
          <ArrowLeft size={15} className="text-slate-300 group-hover:text-white transition-colors" />
          <span className="text-slate-300 group-hover:text-white transition-colors text-xs">Назад</span>
        </button>

        {/* ── HERO CARD ── */}
        <div className="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-lg overflow-hidden mb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-purple-500/5 pointer-events-none" />

          <div className="relative p-4">
            <div className="flex items-start gap-4">

              {/* Avatar */}
              <div className="flex-shrink-0">
                <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden ring-2 ring-primary-500/30 shadow-xl">
                  {user.avatar ? (
                    <img
                      src={`${import.meta.env.VITE_API_URL}${user.avatar}`}
                      alt={`${user.firstName} ${user.lastName}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">
                        {user.firstName[0]}{user.lastName[0]}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-white leading-tight truncate">
                  {user.firstName} {user.lastName}
                </h1>
                {user.nickname && (
                  <p className="text-slate-400 text-xs mt-0.5 mb-1.5">@{user.nickname}</p>
                )}
                {user.role && (
                  <span className="inline-block px-2 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-md border border-primary-500/30 mb-1.5">
                    {user.role}
                  </span>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                  {user.country && (
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <Globe size={10} /> {user.country}
                    </span>
                  )}
                  {user.city && (
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <MapPin size={10} /> {user.city}
                    </span>
                  )}
                </div>
              </div>

              {/* Message Button */}
              <div className="flex-shrink-0">
                <button
                  onClick={() => navigate(`/messages/${user.id}`)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all shadow-lg shadow-primary-500/30 text-white text-xs font-medium"
                >
                  <MessageCircle size={13} />
                  <span className="hidden sm:inline">Написать</span>
                </button>
              </div>
            </div>

            {/* Bio */}
            {user.bio && (
              <p className="mt-3 text-slate-300 text-sm leading-relaxed border-t border-slate-700/50 pt-3">
                {user.bio}
              </p>
            )}
          </div>
        </div>

        {/* ── INFO SECTIONS ── */}
        <div className="space-y-3">

          {/* Field of Activity + Employer */}
          {(user.fieldOfActivity || user.employer) && (
            <div className="flex flex-wrap gap-2">
              {user.fieldOfActivity && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/50 text-slate-300 text-xs font-medium">
                  <Briefcase size={12} className="text-primary-400" />
                  {user.fieldOfActivity.name}
                </div>
              )}
              {user.employer && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/50 text-slate-300 text-xs font-medium">
                  <Building2 size={12} className="text-green-400" />
                  {user.employer.name}
                  {user.employer.inn && (
                    <span className="text-slate-500 font-normal">· ИНН {user.employer.inn}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Professions */}
          {user.userProfessions && user.userProfessions.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Star size={11} className="text-primary-400" /> Профессии
              </h3>
              <div className="space-y-2">
                {user.userProfessions.map((up: any) => (
                  <div key={up.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 bg-primary-500/15 text-primary-300 rounded-lg text-xs font-semibold border border-primary-500/30">
                      {up.profession?.name}
                    </span>
                    {up.features?.map((f: string) => (
                      <span key={f} className="px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded text-xs border border-slate-600/30">
                        {f}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artists */}
          {user.userArtists && user.userArtists.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Music size={11} className="text-purple-400" /> Артисты / Группы
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {user.userArtists.map((ua: any) => (
                  <span key={ua.id} className="px-2.5 py-1 bg-purple-500/15 text-purple-300 rounded-lg text-xs font-medium border border-purple-500/30">
                    {ua.artist?.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search Profile */}
          {hasSearchProfile && (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Settings size={11} className="text-primary-400" /> Параметры поиска
              </h3>
              <div className="flex flex-wrap gap-2">
                {sp?.service && (
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 rounded-lg border border-primary-500/20">
                    <Headphones size={11} className="text-primary-400" />
                    <span className="text-primary-300 text-xs">{sp.service.name}</span>
                  </div>
                )}
                {sp?.genre && (
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/10 rounded-lg border border-primary-500/20">
                    <Music size={11} className="text-primary-400" />
                    <span className="text-primary-300 text-xs">{sp.genre.name}</span>
                  </div>
                )}
                {sp?.workFormat && (
                  <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">
                    {sp.workFormat.name}
                  </span>
                )}
                {sp?.employmentType && (
                  <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">
                    {sp.employmentType.name}
                  </span>
                )}
                {sp?.skillLevel && (
                  <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">
                    {sp.skillLevel.name}
                  </span>
                )}
                {sp?.availability && (
                  <span className="px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-lg text-xs border border-slate-600/30">
                    {sp.availability.name}
                  </span>
                )}
                {(sp?.pricePerHour || sp?.pricePerEvent) && (
                  <div className="w-full flex flex-wrap gap-3 pt-2 mt-1 border-t border-slate-700/50">
                    {sp?.pricePerHour && (
                      <div className="flex items-center gap-1 text-green-300 text-xs font-semibold">
                        <DollarSign size={11} />
                        {sp.pricePerHour} ₽/час
                      </div>
                    )}
                    {sp?.pricePerEvent && (
                      <div className="flex items-center gap-1 text-green-300 text-xs font-semibold">
                        <Clock size={11} />
                        {sp.pricePerEvent} ₽/выступление
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Social Links */}
          {(user.vkLink || user.youtubeLink || user.telegramLink) && (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Globe size={11} className="text-primary-400" /> Соцсети
              </h3>
              <div className="space-y-2">
                {user.vkLink && (
                  <a href={user.vkLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group"
                  >
                    <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/25 transition-colors">
                      <span className="text-blue-400 text-xs font-bold">VK</span>
                    </div>
                    <span className="text-sm flex-1 truncate">{user.vkLink}</span>
                    <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                  </a>
                )}
                {user.youtubeLink && (
                  <a href={user.youtubeLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group"
                  >
                    <div className="w-7 h-7 bg-red-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/25 transition-colors">
                      <span className="text-red-400 text-xs font-bold">YT</span>
                    </div>
                    <span className="text-sm flex-1 truncate">{user.youtubeLink}</span>
                    <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                  </a>
                )}
                {user.telegramLink && (
                  <a href={user.telegramLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2 text-slate-300 hover:text-white transition-colors group"
                  >
                    <div className="w-7 h-7 bg-sky-500/15 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-sky-500/25 transition-colors">
                      <span className="text-sky-400 text-xs font-bold">TG</span>
                    </div>
                    <span className="text-sm flex-1 truncate">{user.telegramLink}</span>
                    <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />
                  </a>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
