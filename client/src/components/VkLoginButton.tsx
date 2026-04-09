import { useEffect, useRef } from 'react';
import * as VKID from '@vkid/sdk';
import { authAPI } from '../lib/api';

interface VkLoginButtonProps {
  onAuth: (user: any, token: string) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

export default function VkLoginButton({ onAuth, onError, disabled }: VkLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || disabled) return;

    VKID.Config.init({
      app: 54535061,
      redirectUrl: 'https://moooza.ru/login',
      responseMode: VKID.ConfigResponseMode.Callback,
      source: VKID.ConfigSource.LOWCODE,
      scope: 'email',
    });

    const oneTap = new VKID.OneTap();

    oneTap
      .render({
        container: containerRef.current,
        showAlternativeLogin: true,
        scheme: VKID.Scheme.DARK,
      })
      .on(VKID.WidgetEvents.ERROR, (err: unknown) => {
        console.error('[VK ID] widget error', err);
        onError('Ошибка виджета ВКонтакте');
      })
      .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, (payload: any) => {
        const { code, device_id } = payload;
        VKID.Auth.exchangeCode(code, device_id)
          .then((data: any) => {
            const accessToken = data?.access_token;
            if (!accessToken) throw new Error('no access_token');
            return authAPI.vkToken(accessToken);
          })
          .then(({ data }) => {
            onAuth(data.user, data.token);
          })
          .catch((e: any) => {
            console.error('[VK ID] auth error', e);
            onError('Не удалось войти через ВКонтакте');
          });
      });

    return () => {
      containerRef.current?.replaceChildren();
    };
  }, [disabled]);

  return <div ref={containerRef} className="w-full" />;
}
