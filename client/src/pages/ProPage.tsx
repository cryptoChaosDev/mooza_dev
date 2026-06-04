import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Zap, Check, X, Loader2, Copy, ExternalLink,
  Users, Heart, Gift, Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { isProActive } from '../lib/proLimits';
import { proAPI, referralAPI } from '../lib/api';

const SUPPORT_URL = 'https://t.me/moooza_support';

type Step = 'page' | 'prepay' | 'done';

const COMPARISON: { label: string; free: string; pro: string }[] = [
  { label: 'Файлов в разделе портфолио', free: 'до 10', pro: 'до 20' },
  { label: 'Максимальный размер файла', free: '20 МБ', pro: '50 МБ' },
  { label: 'Количество каналов в Потоке', free: '1', pro: 'без ограничений' },
  { label: 'Символов в блоке «О себе»', free: '100', pro: '200' },
  { label: 'GIF-аватар и обложка', free: '✗', pro: '✓' },
  { label: 'Пресеты фильтров ленты', free: '✗', pro: '✓' },
];

const BENEFITS: { title: string; desc: string }[] = [
  {
    title: 'Портфолио без ограничений',
    desc: 'До 20 файлов в каждом разделе вместо 10, до 50 МБ вместо 20. Показывай работы в полном объёме.',
  },
  {
    title: 'Несколько каналов',
    desc: 'Веди больше одного канала — для разных проектов, ролей или аудиторий. Посты идут в общую ленту Потока.',
  },
  {
    title: 'Расширенный профиль',
    desc: 'До 200 символов в блоке «О себе» вместо 100. Достаточно, чтобы рассказать о себе как следует.',
  },
  {
    title: 'GIF-аватар и обложка',
    desc: 'Загружай анимированные изображения на аватар и обложку профиля.',
  },
  {
    title: 'Несколько пресетов ленты',
    desc: 'Переключайся между сохранёнными настройками фильтров в один клик — без необходимости каждый раз настраивать заново.',
  },
];

function SupportLink() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-violet-400 hover:text-violet-300 font-medium underline underline-offset-2"
    >
      @moooza_support
    </a>
  );
}

export default function ProPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const proActive = isProActive(user);

  const [step, setStep] = useState<Step>('page');
  const [donation, setDonation] = useState<{ code: string; cloudTipsUrl: string } | null>(null);
  const [loadingDonation, setLoadingDonation] = useState(false);
  const [donationError, setDonationError] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: refStats } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: async () => {
      const { data } = await referralAPI.getStats();
      return data as { count: number; proMonthsEarned: number; towardNext: number; perMonth: number };
    },
  });

  const startDonation = async () => {
    setLoadingDonation(true);
    setDonationError('');
    setStep('prepay');
    try {
      const { data } = await proAPI.startDonation();
      setDonation({ code: data.code, cloudTipsUrl: data.cloudTipsUrl ?? '' });
    } catch {
      setDonationError('Не удалось начать оплату. Попробуйте позже.');
    } finally {
      setLoadingDonation(false);
    }
  };

  const copyCode = async () => {
    if (!donation?.code) return;
    try {
      await navigator.clipboard.writeText(donation.code);
    } catch {
      const el = document.createElement('textarea');
      el.value = donation.code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const proUntilLabel = user?.proUntil
    ? new Date(user.proUntil).toLocaleDateString('ru-RU')
    : null;

  const towardNext = refStats?.towardNext ?? 0;
  const perMonth = refStats?.perMonth ?? 10;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => (step === 'page' ? navigate(-1) : setStep('page'))}
            className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-white">Moooza Pro</h2>
        </div>

        <div className="px-4 pb-24">
          {step === 'page' && (
            <>
              {/* Hero */}
              <div className="mt-8 mb-8 text-center">
                <div className="w-20 h-20 rounded-3xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-5">
                  <Zap size={36} className="text-violet-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2 leading-tight">Moooza Pro</h1>
                <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                  Больше возможностей для тех, кто работает серьёзно
                </p>
              </div>

              {/* Active status banner */}
              {proActive && (
                <div className="bg-gradient-to-br from-violet-600/15 to-fuchsia-600/10 border border-violet-500/25 rounded-2xl p-4 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <Zap size={20} className="text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-violet-300">Pro активен</p>
                    {proUntilLabel && (
                      <p className="text-xs text-slate-400">до {proUntilLabel}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Comparison table */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden mb-8">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-3 border-b border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <span>Преимущество</span>
                  <span className="text-center w-16">Бесплатно</span>
                  <span className="text-center w-16">Pro</span>
                </div>
                {COMPARISON.map((row, i) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-4 py-3 ${
                      i !== COMPARISON.length - 1 ? 'border-b border-slate-800/60' : ''
                    }`}
                  >
                    <span className="text-sm text-slate-300 leading-snug">{row.label}</span>
                    <span className="text-center w-16 text-sm text-slate-500">
                      {row.free === '✗' ? <X size={15} className="inline text-slate-600" /> : row.free}
                    </span>
                    <span className="text-center w-16 text-sm font-medium text-violet-300">
                      {row.pro === '✓'
                        ? <Check size={15} className="inline text-violet-400" />
                        : row.pro === '✗'
                          ? <X size={15} className="inline text-slate-600" />
                          : row.pro}
                    </span>
                  </div>
                ))}
              </div>

              {/* Benefit cards */}
              <div className="space-y-3 mb-8">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={17} className="text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white mb-0.5">{b.title}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* How to get Pro */}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Как получить Pro</p>

              <div className="space-y-4">
                {/* Referral */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center flex-shrink-0">
                      <Users size={20} className="text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-1">Реферальная программа</p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Каждые 10 регистраций по реферальной ссылке — 1 месяц Pro автоматически.
                      </p>
                    </div>
                  </div>

                  {refStats && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                        <span>До следующего месяца Pro</span>
                        <span className="text-primary-400 font-semibold">{towardNext} / {perMonth}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, perMonth ? (towardNext / perMonth) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => navigate('/invite')}
                    className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Gift size={16} />
                    Перейти к реферальной программе
                  </button>
                </div>

                {/* Donation */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                      <Heart size={20} className="text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-1">Донат</p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Сервис полностью бесплатный. Пользователь может поддержать Moooza любой суммой — в благодарность активируется Pro на месяц.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={startDonation}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Heart size={16} />
                    Поддержать
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 1 — pre-payment */}
          {step === 'prepay' && (
            <div className="mt-8 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
                <Heart size={30} className="text-violet-400" />
              </div>

              {loadingDonation ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 size={28} className="animate-spin text-violet-400" />
                  <p className="text-sm text-slate-400">Готовим оплату…</p>
                </div>
              ) : donationError ? (
                <div className="text-center">
                  <p className="text-sm text-rose-400 mb-5">{donationError}</p>
                  <button
                    onClick={startDonation}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    Попробовать снова
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-base text-white text-center mb-2 font-medium">
                    Спасибо, что поддерживаешь Moooza.
                  </p>
                  <p className="text-sm text-slate-400 text-center mb-5 leading-relaxed">
                    Перед оплатой запомни свой код — он понадобится для активации Pro:
                  </p>

                  <div className="bg-slate-900 border border-violet-500/30 rounded-2xl p-4 mb-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-xl font-bold text-violet-300 tracking-wider select-all break-all">
                      {donation?.code}
                    </span>
                    <button
                      onClick={copyCode}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-shrink-0 ${
                        copied ? 'bg-green-600/20 text-green-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
                    Впиши этот код в поле «Комментарий» в форме ниже. Без кода активация займёт больше времени.
                  </p>

                  {donation?.cloudTipsUrl ? (
                    <>
                      <div className="rounded-2xl overflow-hidden border border-slate-800 mb-3 bg-slate-950" style={{ height: '68vh', minHeight: 460 }}>
                        <iframe
                          src={donation.cloudTipsUrl}
                          title="Оплата CloudTips"
                          className="w-full h-full"
                          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                          allow="payment *"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => window.open(donation.cloudTipsUrl, '_blank')}
                        className="w-full mb-4 text-xs text-slate-400 hover:text-white transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <ExternalLink size={13} /> Форма не открылась? Открыть в новой вкладке
                      </button>
                      <button
                        onClick={() => setStep('done')}
                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors"
                      >
                        Я оплатил(а)
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setStep('done')}
                      className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors"
                    >
                      Продолжить
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3 — confirmation */}
          {step === 'done' && (
            <div className="mt-8 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-green-600/15 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
                <Check size={30} className="text-green-400" />
              </div>

              <p className="text-base text-white text-center mb-3 font-medium leading-relaxed">
                Готово. Как только мы проверим оплату — Pro активируется. Обычно это занимает до 24 часов.
              </p>
              <p className="text-sm text-slate-400 text-center mb-8 leading-relaxed">
                Если что-то пошло не так — напиши нам: <SupportLink />
              </p>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Забыл вписать код? Напиши нам <SupportLink /> — укажи никнейм на платформе и приложи скрин оплаты. Разберёмся.
                </p>
              </div>

              <button
                onClick={() => setStep('page')}
                className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Вернуться
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
