import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { LogIn, UserPlus, Mail, Ticket, ArrowLeft, Loader2, CheckCircle2, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useScrollLock } from '../lib/scrollLock';
import { waitlistAPI } from '../lib/api';
import { getApiError } from '../lib/apiError';
import { isValidEmail } from '../lib/authHelpers';
import { saveReturnTo, type GateReason } from '../lib/authReturn';
import { reachGoal } from '../lib/metrika';
import { useSiteSettings } from '../lib/siteSettings';

export type { GateReason } from '../lib/authReturn';

const DEFAULT_TEXT = 'Это действие доступно только авторизованным пользователям';

// Тексты AuthGate по причине (план, раздел A).
export const GATE_TEXTS: Record<GateReason, string> = {
  message: 'Войдите, чтобы написать сообщение',
  contacts: 'Контакты доступны после входа',
  connect: 'Войдите, чтобы установить деловую связь',
  friend: 'Войдите, чтобы добавить в друзья',
  favorite: 'Войдите, чтобы добавлять в избранное',
  follow: 'Войдите, чтобы следить за артистом',
  deal: 'Войдите, чтобы оформить сделку',
  respondOrder: 'Войдите, чтобы откликнуться на заказ',
  respondVacancy: 'Войдите, чтобы откликнуться на вакансию',
  join: 'Войдите, чтобы вступить в состав',
  like: 'Войдите, чтобы ставить лайки',
  reaction: 'Войдите, чтобы ставить реакции',
  comment: 'Войдите, чтобы читать обсуждение и комментировать',
  save: 'Войдите, чтобы сохранять публикации',
  repost: 'Войдите, чтобы делиться публикациями в ленте',
  vote: 'Войдите, чтобы голосовать в опросах',
  create: 'Войдите, чтобы публиковать посты, заказы и вакансии',
  complaint: 'Войдите, чтобы отправить жалобу',
  feedWall: 'Войдите, чтобы смотреть дальше',
  saved: 'Войдите, чтобы открыть сохранённое',
  preset: 'Войдите, чтобы сохранять пресеты фильтров',
  page: 'Эта страница доступна после входа',
  generic: DEFAULT_TEXT,
};

// ─── Глобальное состояние модалки: одна на всё приложение ─────────────────────
export type GateMode = 'main' | 'waitlist';

interface GateState {
  open: boolean;
  reason: GateReason;
  text?: string;
  mode: GateMode;
  show: (reason: GateReason, text?: string, mode?: GateMode) => void;
  close: () => void;
}

export const useAuthGateStore = create<GateState>((set) => ({
  open: false,
  reason: 'generic',
  text: undefined,
  mode: 'main',
  show: (reason, text, mode = 'main') => set({ open: true, reason, text, mode }),
  close: () => set({ open: false }),
}));

/** Открыть AuthGate откуда угодно (без хука). */
export function openAuthGate(reason: GateReason = 'generic', ctx: Record<string, unknown> = {}, text?: string, mode: GateMode = 'main') {
  reachGoal('gate_open', { reason, ...ctx });
  useAuthGateStore.getState().show(reason, text, mode);
}

const WAITLIST_TYPES = [
  { id: 'resident_waitlist', label: 'Музыкант или специалист' },
  { id: 'customer', label: 'Ищу исполнителей' },
  { id: 'company', label: 'Компания' },
  { id: 'listener', label: 'Слушатель' },
] as const;
type WaitlistType = typeof WAITLIST_TYPES[number]['id'];

// Код приглашения: можно вставить и саму ссылку (…/register?ref=CODE).
function extractInviteCode(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  try {
    if (/^https?:\/\//i.test(v) || v.startsWith('/')) {
      const u = new URL(v, window.location.origin);
      return (u.searchParams.get('ref') || '').trim();
    }
  } catch { /* не ссылка — считаем кодом */ }
  return v.replace(/\s+/g, '');
}

/**
 * Содержимое AuthGate: текст причины + «Войти» и «Зарегистрироваться»
 * (регистрация открыта) или «Получить доступ» (waitlist прямо здесь) и
 * «У меня есть приглашение» (регистрация закрыта). Используется и в модалке,
 * и на экране «Войдите, чтобы…» приватных маршрутов (LoginRequired).
 */
export function AuthGatePanel({
  reason = 'generic',
  text,
  onDone,
  variant = 'modal',
  initialMode = 'main',
}: {
  reason?: GateReason;
  text?: string;
  onDone?: () => void;
  variant?: 'modal' | 'page';
  initialMode?: GateMode;
}) {
  const navigate = useNavigate();
  const { registrationEnabled, referralRegistrationEnabled } = useSiteSettings();
  const [mode, setMode] = useState<'main' | 'waitlist' | 'waitlistDone' | 'invite'>(initialMode);

  // waitlist
  const [email, setEmail] = useState('');
  const [wlType, setWlType] = useState<WaitlistType>(WAITLIST_TYPES[0].id);
  const [consentPd, setConsentPd] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // invite
  const [code, setCode] = useState('');

  const goLogin = () => {
    reachGoal('gate_login_click', { reason });
    saveReturnTo(undefined, reason);
    onDone?.();
    navigate('/login');
  };
  const goRegister = () => {
    reachGoal('gate_access_click', { reason, kind: 'register' });
    saveReturnTo(undefined, reason);
    onDone?.();
    navigate('/register');
  };
  const openWaitlist = () => {
    reachGoal('gate_access_click', { reason, kind: 'waitlist' });
    setError('');
    setMode('waitlist');
  };

  const submitWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isValidEmail(email)) { setError('Проверьте email'); return; }
    if (!consentPd) { setError('Нужно согласие на обработку персональных данных'); return; }
    setSending(true);
    try {
      // Схема сервера: server/src/routes/waitlist.ts (email, type, consentPd, consentMarketing — оба true).
      await waitlistAPI.submit({ email: email.trim(), type: wlType, consentPd: true, consentMarketing });
      reachGoal('waitlist_submit', { type: wlType, reason });
      setMode('waitlistDone');
    } catch (err) {
      setError(getApiError(err, 'Не удалось отправить заявку. Попробуйте позже.'));
    } finally {
      setSending(false);
    }
  };

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const c = extractInviteCode(code);
    if (!c) { setError('Введите код приглашения'); return; }
    reachGoal('invite_code_submit', { reason });
    saveReturnTo(undefined, reason);
    onDone?.();
    navigate(`/register?ref=${encodeURIComponent(c)}`);
  };

  const btnPrimary = 'w-full py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2';
  const btnSecondary = 'w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2';
  const inputCls = 'w-full px-3.5 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500';
  const message = text || GATE_TEXTS[reason] || DEFAULT_TEXT;

  if (mode === 'waitlistDone') {
    return (
      <div className="px-5 pt-6 pb-6 text-center space-y-3">
        <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
        <p className="text-base font-semibold text-white">Заявка принята</p>
        <p className="text-sm text-slate-400 leading-relaxed">Пришлём доступ на {email.trim()}, как только откроем набор.</p>
        {variant === 'modal' && (
          <button onClick={onDone} className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors">Закрыть</button>
        )}
      </div>
    );
  }

  if (mode === 'waitlist') {
    return (
      <form onSubmit={submitWaitlist} className="px-5 pt-5 pb-6 space-y-3">
        <button type="button" onClick={() => { setMode('main'); setError(''); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={13} /> Назад
        </button>
        <p className="text-base font-semibold text-white">Получить доступ</p>
        <p className="text-xs text-slate-400 leading-relaxed">Регистрация сейчас по приглашениям. Оставьте email — пришлём доступ, когда откроем набор.</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          autoComplete="email"
          className={inputCls}
          required
        />
        <div className="grid grid-cols-2 gap-1.5">
          {WAITLIST_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setWlType(t.id)}
              className={`px-2.5 py-2 rounded-xl border text-xs text-left transition-colors ${wlType === t.id ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={consentPd} onChange={(e) => setConsentPd(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 leading-relaxed">
            Я даю <a href="/legal/consent-pd.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline underline-offset-2">согласие на обработку персональных данных</a>
          </span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={consentMarketing} onChange={(e) => setConsentMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 leading-relaxed">
            Я даю <a href="/legal/consent-marketing.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline underline-offset-2">согласие на получение рекламных и информационных сообщений</a> <span className="text-slate-500">(по желанию)</span>
          </span>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={sending || !email.trim() || !consentPd} className={btnPrimary}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Отправить заявку
        </button>
      </form>
    );
  }

  if (mode === 'invite') {
    return (
      <form onSubmit={submitInvite} className="px-5 pt-5 pb-6 space-y-3">
        <button type="button" onClick={() => { setMode('main'); setError(''); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={13} /> Назад
        </button>
        <p className="text-base font-semibold text-white">Код приглашения</p>
        <p className="text-xs text-slate-400 leading-relaxed">Введите код или вставьте ссылку-приглашение.</p>
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(''); }}
          placeholder="Код или ссылка"
          autoCapitalize="off"
          autoCorrect="off"
          className={inputCls}
          autoFocus
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={!code.trim()} className={btnPrimary}>
          <Ticket size={16} /> Продолжить регистрацию
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="px-5 pt-6 pb-4 text-center">
        <p className={`${variant === 'page' ? 'text-lg font-semibold text-white' : 'text-sm text-slate-200'} leading-relaxed`}>{message}</p>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {registrationEnabled
            ? 'Moooza — сообщество музыкантов и профессионалов индустрии.'
            : 'Регистрация сейчас по приглашениям — оставьте заявку, и мы пришлём доступ.'}
        </p>
      </div>
      <div className="px-5 pb-6 space-y-2">
        <button onClick={goLogin} className={btnPrimary}>
          <LogIn size={16} /> Войти
        </button>
        {registrationEnabled ? (
          <button onClick={goRegister} className={btnSecondary}>
            <UserPlus size={16} /> Зарегистрироваться
          </button>
        ) : (
          <>
            <button onClick={openWaitlist} className={btnSecondary}>
              <Mail size={16} /> Получить доступ
            </button>
            {referralRegistrationEnabled && (
              <button onClick={() => { setError(''); setMode('invite'); }} className="w-full py-2.5 text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center justify-center gap-1.5">
                <Ticket size={14} /> У меня есть приглашение
              </button>
            )}
          </>
        )}
        {variant === 'modal' && (
          <button onClick={onDone} className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors">
            Закрыть
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Модалка AuthGate — гость пытается выполнить действие (написать, оформить
 * сделку, установить связь, комментировать …). Просмотр открыт всем, гейтится
 * только действие. Контролируемый вариант (open/onClose) оставлен для
 * совместимости; основной путь — глобальный <AuthGateHost/> + openAuthGate().
 */
export function AuthGateModal({
  open,
  onClose,
  text,
  reason = 'generic',
  initialMode = 'main',
}: {
  open: boolean;
  onClose: () => void;
  text?: string;
  reason?: GateReason;
  initialMode?: GateMode;
}) {
  useScrollLock(open);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-sm max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button onClick={onClose} aria-label="Закрыть" className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors">
          <X size={16} />
        </button>
        <AuthGatePanel reason={reason} text={text} onDone={onClose} initialMode={initialMode} />
      </div>
    </div>,
    document.body,
  );
}

/** Единственный экземпляр модалки — рендерится в App. Закрывается при смене маршрута. */
export function AuthGateHost() {
  const { open, reason, text, mode, close } = useAuthGateStore();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  useEffect(() => { close(); }, [location.pathname, close]);
  // Вошёл (например, в другой вкладке) — гейт больше не нужен.
  useEffect(() => { if (token) close(); }, [token, close]);
  // key — чтобы каждое открытие начиналось с чистой формы.
  return <AuthGateModal key={open ? `${reason}:${mode}` : 'closed'} open={open && !token} onClose={close} text={text} reason={reason} initialMode={mode} />;
}

/**
 * Хук для гейтинга действий.
 *
 *   const gate = useAuthGate();
 *   <button onClick={() => gate.ensure('message', { type: 'profile' }, () => openChat())}>Написать</button>
 *
 * `ensure(reason, ctx, action)` сразу выполняет action, если пользователь вошёл;
 * иначе открывает AuthGate с текстом причины и возвращает false.
 * `ensureAuth(action)` — прежний API (причина generic).
 */
export function useAuthGate(text?: string): {
  isAuthed: boolean;
  ensure: (reason: GateReason, ctx?: Record<string, unknown>, action?: () => void) => boolean;
  ensureAuth: (action?: () => void) => boolean;
  authGateModal: ReactNode;
} {
  const token = useAuthStore((s) => s.token);
  const isAuthed = !!token;

  const ensure = useCallback(
    (reason: GateReason, ctx?: Record<string, unknown>, action?: () => void) => {
      if (isAuthed) {
        action?.();
        return true;
      }
      openAuthGate(reason, ctx, reason === 'generic' ? text : undefined);
      return false;
    },
    [isAuthed, text],
  );

  const ensureAuth = useCallback((action?: () => void) => ensure('generic', undefined, action), [ensure]);

  // Модалка общая (AuthGateHost в App) — отдельный экземпляр не нужен.
  return { isAuthed, ensure, ensureAuth, authGateModal: null };
}
