import { useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { enablePush, pushSupported } from '../../lib/push';
import { toast } from '../../stores/toastStore';

type Perm = NotificationPermission | 'unsupported';
const currentPerm = (): Perm => (pushSupported() ? Notification.permission : 'unsupported');

/**
 * Под заявкой на верификацию: результат модерации приходит push-уведомлением
 * (routes/admin.ts → notifyMany). Если уведомления ещё не разрешены — просим
 * здесь: кнопка — жест пользователя, без него iOS/Safari запрос отклоняют.
 */
export default function VerificationPushHint() {
  const [perm, setPerm] = useState<Perm>(currentPerm);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    setPerm(result);
    if (result === 'granted') toast.success('Готово — пришлём результат проверки');
    else if (result === 'denied') toast.error('Уведомления запрещены в настройках браузера');
  };

  if (perm === 'granted') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Bell size={13} className="flex-shrink-0 text-emerald-400" />
        Пришлём push-уведомление, когда модератор проверит заявку.
      </p>
    );
  }

  if (perm === 'default') {
    return (
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20">
        <Bell size={14} className="flex-shrink-0 text-primary-300" />
        <span className="flex-1 min-w-[12rem] text-xs text-slate-200">
          Включите уведомления — пришлём результат проверки, как только модератор её завершит.
        </span>
        <button
          onClick={enable}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Включить
        </button>
      </div>
    );
  }

  return (
    <p className="flex items-start gap-1.5 text-xs text-slate-500">
      <BellOff size={13} className="flex-shrink-0 mt-0.5" />
      {perm === 'denied'
        ? 'Уведомления запрещены в настройках браузера — результат проверки появится в колокольчике.'
        : 'Результат проверки появится в колокольчике. На iPhone push-уведомления работают, если добавить Moooza на экран «Домой».'}
    </p>
  );
}
