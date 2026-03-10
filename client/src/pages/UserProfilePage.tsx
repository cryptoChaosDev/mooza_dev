import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Briefcase, Music, MessageCircle, Loader2,
  Globe, Building2, Star, Headphones, User
} from 'lucide-react';
import { userAPI } from '../lib/api';

type Tab = 'basic' | 'profession';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'basic',      label: 'Основное',  icon: <User size={14} /> },
  { id: 'profession', label: 'Профессия', icon: <Briefcase size={14} /> },
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

  const servicesByProfession: Record<string, any[]> = (user.userServices ?? []).reduce((acc: Record<string, any[]>, us: any) => {
    const key = us.professionId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(us);
    return acc;
  }, {});

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
            </div>
          )}

          {/* ПРОФЕССИЯ */}
          {activeTab === 'profession' && (
            <div className="p-4 space-y-4">
              {/* Field + Employer chips */}
              {(user.fieldOfActivity || user.employer) && (
                <div className="flex flex-wrap gap-2">
                  {user.fieldOfActivity && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Briefcase size={12} className="text-primary-400" />{user.fieldOfActivity.name}
                    </div>
                  )}
                  {user.employer && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-xl border border-slate-600/30 text-slate-300 text-xs font-medium">
                      <Building2 size={12} className="text-green-400" />{user.employer.name}
                      {user.employer.inn && <span className="text-slate-500 font-normal">· ИНН {user.employer.inn}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Professions */}
              {user.userProfessions?.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Star size={11} className="text-primary-400" />Профессии
                  </p>
                  <div className="space-y-2">
                    {user.userProfessions.map((up: any) => (
                      <div key={up.id} className="bg-slate-700/20 rounded-xl border border-slate-600/30 p-3">
                        <p className="text-sm font-semibold text-white mb-2">{up.profession?.name}</p>
                        {up.features?.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {up.features.map((f: string) => (
                              <span key={f} className="px-2.5 py-1 bg-primary-500/10 text-primary-300 rounded-lg text-xs border border-primary-500/20">{f}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs">Без специализации</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : !user.fieldOfActivity && !user.employer && <EmptyState text="Профессиональная информация не заполнена" />}

              {/* Artists */}
              {user.userArtists?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Music size={11} className="text-purple-400" />Артисты / Группы
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {user.userArtists.map((ua: any) => (
                      <span key={ua.id} className="px-2.5 py-1 bg-purple-500/15 text-purple-300 rounded-lg text-xs font-medium border border-purple-500/30">{ua.artist?.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Services grouped by profession */}
          {activeTab === 'profession' && Object.keys(servicesByProfession).length > 0 && (
            <div className="px-4 pb-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Headphones size={11} className="text-primary-400" />Услуги
              </p>
              {Object.entries(servicesByProfession).map(([professionId, services]) => {
                const profName = (services as any[])[0]?.profession?.name ?? '';
                return (
                  <div key={professionId} className="mb-3">
                    <p className="text-xs text-slate-500 font-semibold mb-1.5">{profName}</p>
                    <div className="space-y-2">
                      {(services as any[]).map((us: any) => {
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
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
