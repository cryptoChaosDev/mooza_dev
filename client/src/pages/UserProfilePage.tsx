import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Globe, Building2, User, Users, FileText,
} from 'lucide-react';
import { userAPI } from '../lib/api';

type Tab = 'basic' | 'profession';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Услуги', icon: <Briefcase size={14} /> },
];

const EmptyState = ({ text }: { text: string }) => (
  <div className="py-8 text-center">
    <p className="text-slate-500 text-sm">{text}</p>
  </div>
);

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('basic');

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
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent mx-auto shadow-lg shadow-primary-500/30" />
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
        <button onClick={() => navigate(-1)} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-xl transition-all text-sm">
          Вернуться назад
        </button>
      </div>
    );
  }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const servicesByField = (user.userServices ?? []).reduce((acc: Record<string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }>, us: any) => {
    const fId = us.profession?.fieldOfActivity?.id || 'unknown';
    const fName = us.profession?.fieldOfActivity?.name || '';
    const pId = us.professionId;
    const pName = us.profession?.name || '';
    if (!acc[fId]) acc[fId] = { fieldName: fName, byProfession: {} };
    if (!acc[fId].byProfession[pId]) acc[fId].byProfession[pId] = { profName: pName, services: [] };
    acc[fId].byProfession[pId].services.push(us);
    return acc;
  }, {} as Record<string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }>);

  const friendCount = (user._count?.sentRequests ?? 0) + (user._count?.receivedRequests ?? 0);
  const rating = (() => {
    let s = 0;
    if (user.firstName) s += 5;
    if (user.lastName) s += 5;
    if (user.nickname) s += 5;
    if (user.bio) s += 15;
    if (user.avatar) s += 15;
    if (user.country) s += 5;
    if (user.city) s += 5;
    if (user.vkLink) s += 5;
    if (user.youtubeLink) s += 5;
    if (user.telegramLink) s += 5;
    if (user.employer) s += 5;
    if (user.userArtists?.length > 0) s += 5;
    if (user.userServices?.length > 0) s += 15;
    if (user.portfolioFiles?.length > 0) s += 5;
    return Math.min(100, s);
  })();
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700/80 rounded-lg border border-slate-700/50 hover:border-primary-500/50 transition-all mb-3"
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
                  {user.avatar
                    ? <img src={`${import.meta.env.VITE_API_URL}${user.avatar}`} alt={`${user.firstName} ${user.lastName}`} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">{user.firstName[0]}{user.lastName[0]}</span>
                      </div>
                  }
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-white leading-tight truncate">{user.firstName} {user.lastName}</h1>
                {user.nickname && <p className="text-slate-400 text-xs mt-0.5 mb-1.5">@{user.nickname}</p>}
                {user.role && (
                  <span className="inline-block px-2 py-0.5 bg-primary-500/15 text-primary-300 text-xs font-medium rounded-md border border-primary-500/30 mb-1.5">
                    {user.role}
                  </span>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {user.country && <span className="flex items-center gap-1 text-slate-400 text-xs"><Globe size={10} />{user.country}</span>}
                  {user.city    && <span className="flex items-center gap-1 text-slate-400 text-xs"><MapPin size={10} />{user.city}</span>}
                </div>
                {(user.vkLink || user.youtubeLink || user.telegramLink) && (
                  <div className="flex flex-col gap-1 mt-2">
                    {user.vkLink && (
                      <a href={user.vkLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        <span className="font-bold shrink-0">VK</span>
                        <span className="truncate">{user.vkLink.replace(/^https?:\/\/(www\.)?vk\.com\//, '')}</span>
                      </a>
                    )}
                    {user.youtubeLink && (
                      <a href={user.youtubeLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                        <span className="font-bold shrink-0">YT</span>
                        <span className="truncate">{user.youtubeLink.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}</span>
                      </a>
                    )}
                    {user.telegramLink && (
                      <a href={user.telegramLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors">
                        <span className="font-bold shrink-0">TG</span>
                        <span className="truncate">{user.telegramLink.replace(/^https?:\/\/(www\.)?t\.me\//, '')}</span>
                      </a>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Users size={11} />{friendCount} друзей
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-14 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full" style={{ width: `${rating}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{rating}</span>
                  </div>
                </div>
              </div>

              {/* Message */}
              <div className="flex-shrink-0">
                <button onClick={() => navigate(`/messages/${user.id}`)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all shadow-lg shadow-primary-500/30 text-white text-xs font-medium"
                >
                  <MessageCircle size={13} />
                  <span className="hidden sm:inline">Написать</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex gap-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700/50 mb-3">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/30'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50">

          {/* ОСНОВНОЕ */}
          {activeTab === 'basic' && (
            <div className="p-4 space-y-4">
              {user.bio
                ? <p className="text-slate-300 text-sm leading-relaxed">{user.bio}</p>
                : <EmptyState text="Биография не заполнена" />
              }
              {(user.country || user.city) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  {user.country && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                      <Globe size={12} className="text-slate-400" />{user.country}
                    </span>
                  )}
                  {user.city && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl text-slate-300 text-xs border border-slate-600/30">
                      <MapPin size={12} className="text-slate-400" />{user.city}
                    </span>
                  )}
                </div>
              )}
              {/* Groups */}
              {user.userArtists?.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  <span className="w-full text-xs text-slate-500 font-semibold">Группы / Артисты</span>
                  {user.userArtists.map((ua: any) => (
                    <span key={ua.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 rounded-xl text-purple-300 text-xs border border-purple-500/20">
                      <Music size={11} />{ua.artist?.name}
                    </span>
                  ))}
                </div>
              )}
              {/* Employer */}
              {user.employer && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
                  <span className="w-full text-xs text-slate-500 font-semibold">Работодатель</span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 rounded-xl text-green-300 text-xs border border-green-500/20">
                    <Building2 size={11} />{user.employer.name}
                  </span>
                </div>
              )}
              {/* Portfolio */}
              {user.portfolioFiles?.length > 0 && (
                <div className="pt-2 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 font-semibold mb-2">Портфолио</p>
                  <div className="space-y-1.5">
                    {user.portfolioFiles.map((f: any) => (
                      <a key={f.id} href={`${API_URL}${f.url}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/20 rounded-xl border border-slate-600/30 hover:border-primary-500/30 transition-colors">
                        <FileText size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="flex-1 text-xs text-slate-300 truncate">{f.originalName}</span>
                        <span className="text-xs text-slate-500">{formatFileSize(f.size)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ПРОФЕССИЯ */}
          {activeTab === 'profession' && (
            <div className="p-4">
              {/* Field + Employer chips */}
              {(user.fieldOfActivity || user.employer) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {user.fieldOfActivity && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Briefcase size={12} className="text-primary-400" />{user.fieldOfActivity.name}
                    </div>
                  )}
                  {user.employer && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Building2 size={12} className="text-green-400" />{user.employer.name}
                    </div>
                  )}
                </div>
              )}

              {/* Services grouped by field → profession */}
              {Object.keys(servicesByField).length > 0 ? (
                <div className="space-y-4">
                  {(Object.entries(servicesByField) as [string, { fieldName: string; byProfession: Record<string, { profName: string; services: any[] }> }][]).map(([fieldId, { fieldName, byProfession }]) => (
                    <div key={fieldId}>
                      <p className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2">{fieldName}</p>
                      <div className="space-y-3 pl-2 border-l border-primary-500/20">
                        {(Object.entries(byProfession) as [string, { profName: string; services: any[] }][]).map(([professionId, { profName, services }]) => (
                          <div key={professionId}>
                            <p className="text-xs text-slate-500 font-semibold mb-1.5">{profName}</p>
                            <div className="space-y-2">
                              {services.map((us: any) => {
                                const tags = [
                                  ...(us.genres?.map((g: any) => g.name) ?? []),
                                  ...(us.workFormats?.map((w: any) => w.name) ?? []),
                                  ...(us.employmentTypes?.map((e: any) => e.name) ?? []),
                                  ...(us.skillLevels?.map((s: any) => s.name) ?? []),
                                  ...(us.availabilities?.map((a: any) => a.name) ?? []),
                                  ...(us.priceRanges?.map((p: any) => p.name) ?? []),
                                  ...(us.geographies?.map((g: any) => g.name) ?? []),
                                ];
                                return (
                                  <div key={us.id} className="bg-slate-700/20 rounded-xl border border-slate-600/30 p-3">
                                    <p className="text-sm font-semibold text-white mb-1.5">{us.service?.name}</p>
                                    {tags.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {tags.map((t: string, i: number) => (
                                          <span key={i} className="px-2 py-0.5 bg-slate-600/40 text-slate-300 rounded-md text-xs border border-slate-600/30">{t}</span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-slate-500 text-xs">Фильтры не настроены</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="Профессиональная информация не заполнена" />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
