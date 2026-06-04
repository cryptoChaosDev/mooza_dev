import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Copy, Check, Share2, Star, Music2,
  Plus, Trash2, Link2, Loader2, X, Zap,
} from 'lucide-react';
import { referralAPI } from '../lib/api';

// Referral links point at the current origin (dev → dev links, prod → prod links),
// falling back to the canonical domain when origin is unavailable.
const APP_URL = (typeof window !== 'undefined' && window.location?.origin) || 'https://moooza.ru';

interface RefLink {
  id: string;
  code: string;
  label: string;
  clicks: number;
  usedById: string | null;
  usedAt: string | null;
  createdAt: string;
}

export default function InvitePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: async () => {
      const { data } = await referralAPI.getStats();
      return data as { count: number; proMonthsEarned: number; towardNext: number; perMonth: number };
    },
  });
  const referralCount = stats?.count ?? 0;
  const proMonths = stats?.proMonthsEarned ?? 0;
  const perMonth = stats?.perMonth ?? 10;
  const towardNext = stats?.towardNext ?? 0;
  const remainingToNext = Math.max(0, perMonth - towardNext);
  const MAX_PRO_MONTHS = 6;
  const GOAL = 100;

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ['referral-links'],
    queryFn: async () => { const { data } = await referralAPI.getLinks(); return data as RefLink[]; },
  });

  const createMut = useMutation({
    mutationFn: (label: string) => referralAPI.createLink(label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-links'] });
      setNewLabel('');
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => referralAPI.deleteLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referral-links'] }),
  });

  const linkUrl = (code: string) => `${APP_URL}/register?ref=${code}`;

  const copyLink = async (id: string, code: string) => {
    const url = linkUrl(code);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const shareLink = async (code: string) => {
    const url = linkUrl(code);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Moooza — соцсеть для музыкантов',
          text: 'Присоединяйся к Moooza — платформе для музыкантов, где находят коллег, клиентов и проекты!',
          url,
        });
      } catch { /* cancelled */ }
    } else {
      copyLink(code, code);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-white">Пригласить друзей</h2>
        </div>

        <div className="px-4 pb-24">

          {/* Hero */}
          <div className="mt-8 mb-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-primary-600/20 border border-primary-500/30 flex items-center justify-center mx-auto mb-5">
              <Music2 size={36} className="text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3 leading-tight">
              Собери всю индустрию<br />в одном месте
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
              Каждая ссылка — одноразовая: по ней может зарегистрироваться только один человек. Создавай столько, сколько нужно.
            </p>
            <button
              onClick={() => navigate('/pro')}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/30 text-violet-400 hover:text-violet-300 hover:border-violet-500/60 text-xs font-medium transition-colors"
            >
              <Zap size={13} />
              Каждые 10 приглашений — месяц Moooza Pro
            </button>
          </div>

          {/* Ambassador block */}
          <div className="bg-gradient-to-br from-amber-600/15 to-orange-600/10 border border-amber-500/25 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Star size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-300 mb-1">Стань Амбасадором!</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Приведи 100 музыкантов на платформу и получи уникальный статус <span className="text-amber-300 font-semibold">Амбасадор Moooza</span> — особый бейдж в профиле и привилегии первого ряда.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-amber-300/80">До статуса Амбасадор</span>
                <span className="text-slate-500">{Math.min(referralCount, GOAL)}/{GOAL}</span>
              </div>
              <div className="h-1.5 bg-amber-950/40 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(100, (referralCount / GOAL) * 100)}%` }} />
              </div>
              {referralCount >= GOAL && <p className="mt-2 text-xs text-amber-400 font-semibold text-center">🎉 Вы Амбасадор Moooza</p>}
            </div>
          </div>

          {/* Links section header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ваши реферальные ссылки</p>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors"
            >
              <Plus size={13} /> Создать
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2">
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) createMut.mutate(newLabel.trim()); }}
                  placeholder="Название (напр. Коллеги, Друзья)"
                  maxLength={60}
                  autoFocus
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={() => newLabel.trim() && createMut.mutate(newLabel.trim())}
                  disabled={!newLabel.trim() || createMut.isPending}
                  className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => { setShowCreate(false); setNewLabel(''); }} className="p-2 text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              {createMut.isError && (
                <p className="text-xs text-rose-400 mt-2">
                  {(createMut.error as any)?.response?.data?.error ?? 'Не удалось создать ссылку'}
                </p>
              )}
            </div>
          )}

          {/* Links list */}
          {linksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-600" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-8 bg-slate-900/40 border border-slate-800 border-dashed rounded-2xl mb-6">
              <Link2 size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Создайте первую ссылку, чтобы начать приглашать</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {links.map((link) => {
                const used = !!link.usedById;
                return (
                  <div key={link.id} className={`rounded-2xl p-4 border ${used ? 'bg-slate-900/30 border-slate-800/60' : 'bg-slate-900/60 border-slate-800'}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 size={15} className={used ? 'text-slate-600 flex-shrink-0' : 'text-primary-400 flex-shrink-0'} />
                        <p className={`text-sm font-semibold truncate ${used ? 'text-slate-500' : 'text-white'}`}>{link.label}</p>
                        {used ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold flex-shrink-0">
                            <Check size={10} /> Использована
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-400 text-[10px] font-semibold flex-shrink-0">
                            Доступна
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteMut.mutate(link.id)}
                        disabled={deleteMut.isPending}
                        className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors flex-shrink-0"
                        title="Удалить"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {used ? (
                      <p className="text-xs text-slate-500">
                        Зарегистрировался 1 человек{link.usedAt ? ` · ${new Date(link.usedAt).toLocaleDateString('ru-RU')}` : ''}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2">
                        <p className="text-xs text-slate-400 truncate flex-1">{linkUrl(link.code)}</p>
                        <button
                          onClick={() => copyLink(link.id, link.code)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                            copiedId === link.id ? 'bg-green-600/20 text-green-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {copiedId === link.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <button
                          onClick={() => shareLink(link.code)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors flex-shrink-0"
                        >
                          <Share2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pro progress */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-violet-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Прогресс Moooza Pro</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-white">{referralCount}</p>
                <p className="text-xs text-slate-500 mt-0.5">Приглашено</p>
              </div>
              <div className="w-px h-10 bg-slate-800" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-violet-400">{proMonths}</p>
                <p className="text-xs text-slate-500 mt-0.5">Месяцев Pro</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">До следующего месяца Pro</span>
                <span className="text-slate-500">{towardNext}/{perMonth}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${(towardNext / perMonth) * 100}%` }} />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Каждые {perMonth} регистраций по вашим ссылкам — <span className="text-slate-300">+1 месяц Moooza Pro</span>.
              {remainingToNext > 0 ? ` Ещё ${remainingToNext} до следующего месяца.` : ''} Накопить можно до {MAX_PRO_MONTHS} месяцев.
            </p>
          </div>

          {/* How it works */}
          <div className="mt-6 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Как это работает</p>
            {[
              { icon: Plus, text: 'Создайте отдельную ссылку для каждого приглашения' },
              { icon: Share2, text: 'Отправьте ссылку конкретному человеку — она сработает только для него' },
              { icon: Zap, text: 'Каждые 10 регистраций по вашим ссылкам — +1 месяц Moooza Pro (до 6 месяцев)' },
              { icon: Star, text: 'Ссылка «сгорает» после регистрации. 100 приглашений → статус Амбасадор' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
