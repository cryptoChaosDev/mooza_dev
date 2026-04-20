import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Share2, Users, Star, Music2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const APP_URL = 'https://moooza.ru';

export default function InvitePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const refLink = `${APP_URL}/register?ref=${user?.id ?? ''}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = refLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Moooza — соцсеть для музыкантов',
          text: 'Присоединяйся к Moooza — платформе для музыкантов, где находят коллег, клиентов и проекты!',
          url: refLink,
        });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
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
              Приглашай музыкантов, продюсеров, промоутеров и всех участников индустрии — вместе мы создаём самое крутое сообщество.
            </p>
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
          </div>

          {/* Ref link */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ваша реферальная ссылка</p>
            <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-2xl px-4 py-3">
              <p className="text-sm text-slate-300 truncate flex-1">{refLink}</p>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                  copied ? 'bg-green-600/20 text-green-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Скопировано!' : 'Копировать'}
              </button>
            </div>
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors shadow-lg shadow-primary-900/40 mb-6"
          >
            <Share2 size={18} />
            Поделиться ссылкой
          </button>

          {/* Stats placeholder */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Ваш прогресс</p>
            <div className="flex items-center gap-4">
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-white">0</p>
                <p className="text-xs text-slate-500 mt-0.5">Приглашено</p>
              </div>
              <div className="w-px h-10 bg-slate-800" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-white">0</p>
                <p className="text-xs text-slate-500 mt-0.5">Зарегистрировались</p>
              </div>
              <div className="w-px h-10 bg-slate-800" />
              <div className="text-center flex-1">
                <p className="text-2xl font-bold text-amber-400">100</p>
                <p className="text-xs text-slate-500 mt-0.5">Цель</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full w-0 bg-primary-500 rounded-full transition-all" />
            </div>
          </div>

          {/* How it works */}
          <div className="mt-6 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Как это работает</p>
            {[
              { icon: Share2, text: 'Поделитесь ссылкой с коллегами, друзьями, в соцсетях' },
              { icon: Users, text: 'Друг регистрируется по вашей ссылке' },
              { icon: Star, text: 'Копи 100 регистраций → получи статус Амбасадор' },
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
