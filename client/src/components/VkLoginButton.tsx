import { useEffect, useRef } from 'react';
import * as VKID from '@vkid/sdk';

const APP_ID = 54535061;
const REDIRECT_URL = 'https://moooza.ru/login';

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

interface VkLoginButtonProps {
  disabled?: boolean;
}

export default function VkLoginButton({ disabled }: VkLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || disabled) return;
    // Don't reinitialize when we're handling the OAuth callback
    if (new URLSearchParams(window.location.search).get('code')) return;

    const codeVerifier = generateCodeVerifier();
    localStorage.setItem('vk_code_verifier', codeVerifier);

    VKID.Config.init({
      app: APP_ID,
      redirectUrl: REDIRECT_URL,
      codeVerifier,
      scope: 'email',
    });

    const oauthList = new VKID.OAuthList();
    oauthList
      .render({
        container: containerRef.current,
        oauthList: [VKID.OAuthName.VK],
        scheme: VKID.Scheme.DARK,
      })
      .on(VKID.WidgetEvents.ERROR, (err: unknown) => {
        console.error('[VK ID] widget error', err);
      });

    return () => {
      containerRef.current?.replaceChildren();
    };
  }, [disabled]);

  return <div ref={containerRef} className="w-full" />;
}
