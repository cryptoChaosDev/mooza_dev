import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Shield, Bell, Loader2, Send } from 'lucide-react';
import { userAPI, notificationAPI } from '../lib/api';
import PublicConsentGate from '../components/PublicConsentGate';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';

type Tab = 'privacy' | 'notifications';

/**
 * Настройки приватности и уведомлений — отдельная страница с вкладками-модулями
 * (заменяет модалку «Приватность» в Профиле). /settings/privacy
 */
export default function PrivacySettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('privacy');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await userAPI.getMe();
      return data;
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => userAPI.updateMe(payload as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось сохранить')),
  });

  // Согласие на публичное распространение ПД — для «Кто видит контакты: Все»
  const [consentAction, setConsentAction] = useState<(() => void) | null>(null);
  const [locallyConsented, setLocallyConsented] = useState(false);
  const hasPublicConsent = !!(profile as any)?.publicConsentAt || locallyConsented;
  const ensurePublicConsent = (action: () => void) => {
    if (hasPublicConsent) { action(); return; }
    setConsentAction(() => action);
  };
  const handleConsentAccept = async () => {
    try { await userAPI.givePublicConsent(); } catch { /* best-effort */ }
    setLocallyConsented(true);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    const action = consentAction;
    setConsentAction(null);
    action?.();
  };

  // ── Дублирование уведомлений в Telegram (та же механика, что в колокольчике;
  // queryKey общий — статус синхронизирован) ──────────────────────────────────
  const [waitingTg, setWaitingTg] = useState(false);
  const { data: tgStatus } = useQuery({
    queryKey: ['tg-notify-status'],
    queryFn: async () => (await notificationAPI.telegramStatus()).data as { linked: boolean; enabled: boolean },
    enabled: tab === 'notifications',
    refetchInterval: waitingTg ? 2500 : false,
  });
  useEffect(() => {
    if (waitingTg && tgStatus?.enabled) {
      setWaitingTg(false);
      toast.success('Уведомления в Telegram подключены');
    }
  }, [waitingTg, tgStatus?.enabled]);
  const tgSubscribeMut = useMutation({
    mutationFn: async () => (await notificationAPI.telegramSubscribe()).data as { url: string },
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener');
      setWaitingTg(true);
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось открыть Telegram-бота')),
  });
  const tgUnsubscribeMut = useMutation({
    mutationFn: () => notificationAPI.telegramUnsubscribe(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tg-notify-status'] });
      toast.success('Уведомления в Telegram отключены');
    },
    onError: (e: any) => toast.error(getApiError(e, 'Не удалось отписаться')),
  });

  const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
    { id: 'privacy', label: 'Приватность', icon: Shield },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
  ];

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <Loader2 size={40} className="text-primary-500 animate-spin" />
      </div>
    );
  }

  const prefs = ((profile as any).notificationPrefs as Record<string, boolean> | null) ?? {};

  return (
    <div className="min-h-screen bg-slate-950 pb-28">
      {/* Липкая шапка + вкладки — как /services и /orders */}
      <div
        className="sticky top-0 z-10 bg-slate-950/95 border-b border-slate-800/60"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft size={22} />
            </button>
            <Shield size={16} className="text-primary-400 flex-shrink-0" />
            <h1 className="text-base font-bold text-white truncate">Настройки</h1>
          </div>
          <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    tab === t.id ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {tab === 'privacy' && (
          <>
            {/* Кто видит контакты */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60">
                <p className="text-sm font-semibold text-white">Кто видит контакты</p>
                <p className="text-xs text-slate-500">Телефон, email и Telegram</p>
              </div>
              <div className="p-3 space-y-1.5">
                {([
                  { value: 'ALL' as const, label: 'Все' },
                  { value: 'REGISTERED' as const, label: 'Только зарегистрированные' },
                  { value: 'FRIENDS' as const, label: 'Только друзья и коллеги' },
                ]).map(opt => {
                  const active = (profile as any).contactsVisibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const apply = () => updateMut.mutate({ contactsVisibility: opt.value });
                        // «Все» = публичное распространение контактов → согласие (152-ФЗ)
                        if (opt.value === 'ALL') ensurePublicConsent(apply); else apply();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm text-left transition-colors ${
                        active ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-primary-500' : 'border-slate-600'}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-primary-500" />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Профиль — видимость данных */}
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60">
                <p className="text-sm font-semibold text-white">Данные профиля</p>
              </div>
              <div className="px-4">
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">Показывать дату рождения</p>
                    <p className="text-xs text-slate-500">Дата рождения видна в вашем профиле</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateMut.mutate({ birthDateVisible: !(profile as any).birthDateVisible })}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${(profile as any).birthDateVisible ? 'bg-primary-600' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${(profile as any).birthDateVisible ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'notifications' && (
          <>
          {/* Telegram-дублирование — как в колокольчике */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-sm font-semibold text-white">Telegram</p>
              <p className="text-xs text-slate-500">Дублирование уведомлений ботом @moooza_auth_bot</p>
            </div>
            <div className="p-4">
              {tgStatus?.enabled ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 min-w-0">
                    <Send size={13} className="flex-shrink-0" />
                    Уведомления дублируются в Telegram
                  </span>
                  <button
                    onClick={() => tgUnsubscribeMut.mutate()}
                    disabled={tgUnsubscribeMut.isPending}
                    className="text-xs text-slate-400 hover:text-red-400 transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    {tgUnsubscribeMut.isPending && <Loader2 size={11} className="animate-spin" />}
                    Отписаться
                  </button>
                </div>
              ) : waitingTg ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                    <Loader2 size={13} className="animate-spin flex-shrink-0" />
                    Ждём подтверждения в боте… Нажмите Start в Telegram
                  </span>
                  <button onClick={() => setWaitingTg(false)} className="text-xs text-slate-500 hover:text-white transition-colors flex-shrink-0">
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => tgSubscribeMut.mutate()}
                  disabled={tgSubscribeMut.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#4db8e8] rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {tgSubscribeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Подписаться на уведомления в Telegram
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/60">
              <p className="text-sm font-semibold text-white">Какие уведомления получать</p>
              <p className="text-xs text-slate-500">Пуши, колокольчик и дублирование в Telegram</p>
            </div>
            <div className="px-4">
              {([
                { key: 'messages' as const, label: 'Сообщения', desc: 'Личные и групповые чаты' },
                { key: 'orders' as const, label: 'Заказы и услуги', desc: 'Отклики, выбор исполнителя, интерес к услугам' },
                { key: 'vacancies' as const, label: 'Вакансии и приглашения', desc: 'Отклики на вакансии, приглашения в релизы и клипы' },
                { key: 'social' as const, label: 'Социальное', desc: 'Друзья, связи, ответы на посты, отзывы' },
              ]).map(row => {
                const enabled = prefs[row.key] !== false;
                return (
                  <div key={row.key} className="flex items-center gap-3 py-3 border-b border-slate-800/40 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await userAPI.updateNotificationPrefs({ [row.key]: !enabled });
                          queryClient.invalidateQueries({ queryKey: ['profile'] });
                        } catch (e: any) {
                          toast.error(getApiError(e, 'Не удалось сохранить настройку'));
                        }
                      }}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-primary-600' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="px-4 py-3 text-[11px] text-slate-600 border-t border-slate-800/60">
              Системные уведомления (поддержка, Pro) приходят всегда.
            </p>
          </div>
          </>
        )}
      </div>

      {consentAction && (
        <PublicConsentGate onAccept={handleConsentAccept} onClose={() => setConsentAction(null)} />
      )}
    </div>
  );
}
