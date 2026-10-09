import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import { getApiError } from '../lib/apiError';
import PublicConsentGate from './PublicConsentGate';

// Ф3: согласие на публичное распространение ПДн (152-ФЗ ст. 10.1) —
// карточка в профиле + разовое окно после входа. Решение владельца: окно не
// чаще раза в 30 дней и не больше 3 раз — это считает сервер и отдаёт флаг
// shouldPromptPublicConsent в GET /users/me; факт показа фиксируем
// POST /users/me/public-consent/prompt-shown. Чекбокс НЕ отмечен по умолчанию.

const SESSION_KEY = 'mooza_public_consent_prompted';

/** Текст «что станет публичным» — общий для окна и карточки профиля. */
export function PublicProfileIntro({ userId }: { userId?: string }) {
  return (
    <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
      <p>Вас найдут заказчики в Яндексе: профиль, профессии, услуги и участие в релизах будут видны без регистрации.</p>
      <p className="text-xs text-slate-400">
        Телефон, email и мессенджеры гости не увидят — только вошедшие пользователи и по вашим настройкам приватности.
        Отозвать согласие можно в любой момент в настройках.
      </p>
      {userId && (
        <Link to={`/profile/${userId}?as=guest`} className="inline-block text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2">
          Как профиль видят гости
        </Link>
      )}
    </div>
  );
}

/** Выдать согласие: сервер + локальный стор + кэш профиля. */
export function useGivePublicConsent(source: 'profile' | 'prompt' | 'onboarding' = 'profile') {
  const queryClient = useQueryClient();
  return async () => {
    await userAPI.givePublicConsent(source);
    const u = useAuthStore.getState().user;
    if (u) useAuthStore.getState().setUser({ ...u, publicConsentAt: new Date().toISOString(), publicConsentRevokedAt: null, shouldPromptPublicConsent: false });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    if (u?.id) queryClient.invalidateQueries({ queryKey: ['user', u.id] });
  };
}

// Где окно не показываем: полноэкранные шаги, выбор профессии, открытый чат.
const BLOCKED = /^\/(onboarding|vk-setup|professions|login|register|forgot-password)(\/|$)|^\/(messages|chat)\/[^/]+/;

export default function PublicConsentPrompt() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const give = useGivePublicConsent('prompt');
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  const should = !!user?.shouldPromptPublicConsent && !user?.publicConsentAt;
  const blocked = BLOCKED.test(location.pathname);

  useEffect(() => {
    if (!should || blocked || shownRef.current) return;
    try { if (sessionStorage.getItem(SESSION_KEY) === '1') return; } catch { /* ignore */ }
    // Небольшая пауза после входа — не поверх перехода и других окон.
    const t = setTimeout(() => {
      shownRef.current = true;
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
      setOpen(true);
      userAPI.markPublicConsentPromptShown().catch(() => { /* старый сервер — окно всё равно разовое в сессии */ });
    }, 1500);
    return () => clearTimeout(t);
  }, [should, blocked]);

  if (!open || !user) return null;

  return (
    <PublicConsentGate
      title="Сделайте профиль публичным"
      intro={<PublicProfileIntro userId={user.id} />}
      confirmLabel="Сделать публичным"
      cancelLabel="Не сейчас"
      onClose={() => setOpen(false)}
      onAccept={async () => {
        try {
          await give();
          toast.success('Профиль стал публичным');
          setOpen(false);
        } catch (e) {
          toast.error(getApiError(e, 'Не удалось сохранить согласие'));
        }
      }}
    />
  );
}
