import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useScrollLock } from '../lib/scrollLock';

const DEFAULT_TEXT = 'Это действие доступно только авторизованным пользователям';

/**
 * Modal shown when an unauthenticated user tries to perform a gated action
 * (написать, оформить сделку, установить связь, комментировать …).
 * Catalog browsing stays open to everyone; only the action is gated.
 */
export function AuthGateModal({
  open,
  onClose,
  text = DEFAULT_TEXT,
}: {
  open: boolean;
  onClose: () => void;
  text?: string;
}) {
  const navigate = useNavigate();
  useScrollLock(open);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-6 pb-5 text-center">
          <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
        </div>
        <div className="px-5 pb-6 space-y-2">
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={16} /> Войти
          </button>
          <button
            onClick={() => navigate('/register')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus size={16} /> Зарегистрироваться
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Convenience hook: wrap gated actions with `ensureAuth`.
 *
 *   const { ensureAuth, authGateModal } = useAuthGate();
 *   <button onClick={() => ensureAuth(() => doDeal())}>Оформить сделку</button>
 *   {authGateModal}
 *
 * `ensureAuth(action)` runs `action` immediately when the user is signed in;
 * otherwise it opens the modal and returns false.
 */
export function useAuthGate(text?: string): {
  isAuthed: boolean;
  ensureAuth: (action?: () => void) => boolean;
  authGateModal: ReactNode;
} {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  const ensureAuth = useCallback(
    (action?: () => void) => {
      if (user) {
        action?.();
        return true;
      }
      setOpen(true);
      return false;
    },
    [user],
  );

  const authGateModal = <AuthGateModal open={open} onClose={() => setOpen(false)} text={text} />;
  return { isAuthed: !!user, ensureAuth, authGateModal };
}
