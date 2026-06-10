import React, { useState } from 'react';
import { classifyUrl, BLOCK_MESSAGE } from '../lib/socialPlatforms';

// ─── Service definitions ──────────────────────────────────────────────────────
//
// The editor offers EXACTLY the allowed platforms (see lib/socialPlatforms.ts):
// ВКонтакте, Telegram, TenChat, Одноклассники, RuTube, Яндекс Музыка, Яндекс
// Дзен, SoundCloud, Bandlink, Официальный сайт — plus the contact-only keys
// (phone / email / Telegram-for-contact).
//
// Removed (blocked / deprecated): youtube, spotify, twitter, dropbox, lastfm,
// instagram. Legacy stored values for those keys are silently filtered at render
// time (see ALLOWED_KEYS / filtering in SocialIconRow & SocialLinksEditor).

export type SocialKey =
  | 'phone'
  | 'email'
  | 'tg_profile'   // Telegram (used as a contact)
  | 'vk'           // ВКонтакте
  | 'telegram'     // Telegram channel / profile (social)
  | 'tenchat'      // TenChat
  | 'ok'           // Одноклассники
  | 'rutube'       // RuTube
  | 'yandex_music' // Яндекс Музыка
  | 'dzen'         // Яндекс Дзен
  | 'soundcloud'   // SoundCloud
  | 'bandlink'     // Bandlink
  | 'website';     // Официальный сайт

// Contact keys vs social keys — used to split the profile "Contacts" card
export const CONTACT_KEYS: SocialKey[] = ['phone', 'email', 'tg_profile'];
export const SOCIAL_KEYS: SocialKey[] = [
  'vk',
  'telegram',
  'tenchat',
  'ok',
  'rutube',
  'yandex_music',
  'dzen',
  'soundcloud',
  'bandlink',
  'website',
];

export interface SocialService {
  key: SocialKey;
  label: string;
  baseUrl: string;
  placeholder: string;
  color: string;         // Tailwind bg/text color token for badge
  iconBg: string;        // icon background colour (hex)
  icon: React.ReactNode;
}

// SVG icons (inline, no external deps)
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const VKIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.864 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z"/>
  </svg>
);

const OkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12.005 8.36a2.114 2.114 0 1 1 .002-4.228 2.114 2.114 0 0 1-.002 4.228m0 2.022a4.135 4.135 0 0 0 4.133-4.135A4.135 4.135 0 0 0 12.005 2.11 4.135 4.135 0 0 0 7.87 6.247a4.135 4.135 0 0 0 4.135 4.135m2.957 3.503a8.83 8.83 0 0 1-2.812.802l1.798 1.799 2.04 2.04a1.485 1.485 0 0 1-2.1 2.1l-1.888-1.889-1.889 1.889a1.485 1.485 0 1 1-2.1-2.1l2.04-2.04 1.797-1.799a8.83 8.83 0 0 1-2.81-.802 1.485 1.485 0 1 1 1.34-2.65 5.866 5.866 0 0 0 5.245 0 1.485 1.485 0 1 1 1.34 2.65"/>
  </svg>
);

const RutubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="2" y="5" width="20" height="14" rx="3"/>
    <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/>
  </svg>
);

const MusicNoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
  </svg>
);

const DzenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 0c.27 6.13 1.6 7.46 7.73 7.73v.54C13.6 8.54 12.27 9.87 12 16h-.54c-.27-6.13-1.6-7.46-7.73-7.73v-.54C9.87 7.46 11.2 6.13 11.46 0z"/>
    <path d="M12 8c.27 6.13 1.6 7.46 7.73 7.73v.54C13.6 16.54 12.27 17.87 12 24h-.54c-.27-6.13-1.6-7.46-7.73-7.73v-.54c6.14-.27 7.47-1.6 7.73-7.73z" opacity=".55"/>
  </svg>
);

const SoundCloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.1.101.1.05 0 .09-.042.099-.1l.255-2.105-.27-2.154c0-.057-.045-.1-.09-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c0 .055.045.094.09.094s.089-.045.104-.104l.21-1.319-.21-1.334c0-.061-.044-.09-.09-.09m1.83-1.229c-.061 0-.12.05-.12.12l-.21 2.563.225 2.46c0 .075.06.12.12.12.061 0 .12-.045.12-.12l.255-2.46-.27-2.563c0-.075-.06-.12-.12-.12m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.15l.225-2.532-.225-2.623c-.015-.089-.075-.135-.151-.135l-.015.001m1.155.36c-.005-.09-.075-.149-.159-.149-.09 0-.158.06-.164.149l-.217 2.43.2 2.563c.005.09.075.157.164.157.084 0 .151-.064.159-.159l.222-2.563-.222-2.43zm.845-.974c-.105 0-.18.075-.18.18l-.21 3.090.195 2.555c0 .105.09.18.18.18.104 0 .179-.09.179-.18l.225-2.555-.225-3.090c0-.104-.075-.18-.18-.18m1.05-.044c-.105 0-.195.09-.195.195l-.18 3.135.18 2.535c0 .105.09.195.195.195.104 0 .194-.09.194-.195l.21-2.535-.21-3.135c0-.105-.09-.195-.194-.195m1.05.36c-.119 0-.21.09-.225.21l-.165 2.76.165 2.49c.015.12.105.21.225.21.119 0 .21-.09.225-.21l.18-2.49-.18-2.76c-.015-.12-.105-.21-.225-.21m1.05-.42c-.135 0-.24.105-.24.24l-.15 3.135.15 2.475c0 .135.105.24.24.24.119 0 .224-.105.24-.24l.165-2.475-.165-3.135c-.016-.135-.121-.24-.24-.24m1.05-.105c-.135 0-.255.105-.255.255l-.135 3.225.135 2.46c0 .135.12.255.255.255.135 0 .255-.12.255-.255l.149-2.46-.149-3.225c0-.135-.12-.255-.255-.255m1.083.629c-.151 0-.27.119-.27.27l-.12 2.595.12 2.43c0 .15.119.269.27.269.149 0 .27-.119.285-.269l.12-2.43-.12-2.595c-.016-.151-.135-.27-.285-.27m1.097-1.143c-.166 0-.285.135-.285.299l-.105 3.435.105 2.41c0 .164.119.299.285.299.165 0 .299-.135.299-.299l.121-2.41-.121-3.435c0-.164-.134-.299-.299-.299m1.082-.06c-.18 0-.314.149-.314.314l-.09 3.495.09 2.385c0 .179.135.314.314.314.18 0 .314-.135.314-.314l.105-2.385-.105-3.495c0-.165-.135-.314-.314-.314m1.2 1.349c-.045-.255-.255-.45-.51-.45s-.464.195-.51.45l-.075 1.96.09 2.37c.045.255.255.449.495.449.255 0 .465-.194.51-.449l.075-2.37-.075-1.96zm6.81-1.439c-.42 0-.81.135-1.13.36-.21-2.385-2.205-4.245-4.65-4.245-.6 0-1.185.119-1.71.314-.21.075-.255.15-.255.314v8.4c0 .166.135.301.301.314h7.444c1.5 0 2.715-1.215 2.715-2.715s-1.215-2.715-2.715-2.715"/>
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const TenChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-10 6L2 7"/>
  </svg>
);

export const SOCIAL_SERVICES: SocialService[] = [
  {
    key: 'phone',
    label: 'Телефон',
    baseUrl: 'tel:',
    placeholder: '+7 900 000-00-00',
    color: 'emerald',
    iconBg: '#10B981',
    icon: <PhoneIcon />,
  },
  {
    key: 'email',
    label: 'E-mail',
    baseUrl: 'mailto:',
    placeholder: 'you@example.com',
    color: 'amber',
    iconBg: '#F59E0B',
    icon: <EmailIcon />,
  },
  {
    key: 'tg_profile',
    label: 'Telegram',
    baseUrl: 'https://t.me/',
    placeholder: 'никнейм',
    color: 'sky',
    iconBg: '#0088cc',
    icon: <TelegramIcon />,
  },
  {
    key: 'vk',
    label: 'ВКонтакте',
    baseUrl: 'https://vk.com/',
    placeholder: 'id123456',
    color: 'blue',
    iconBg: '#4680C2',
    icon: <VKIcon />,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    baseUrl: 'https://t.me/',
    placeholder: 'канал или никнейм',
    color: 'sky',
    iconBg: '#0088cc',
    icon: <TelegramIcon />,
  },
  {
    key: 'tenchat',
    label: 'TenChat',
    baseUrl: 'https://tenchat.ru/',
    placeholder: 'username',
    color: 'indigo',
    iconBg: '#5B6CF9',
    icon: <TenChatIcon />,
  },
  {
    key: 'ok',
    label: 'Одноклассники',
    baseUrl: 'https://ok.ru/',
    placeholder: 'profile/123',
    color: 'orange',
    iconBg: '#EE8208',
    icon: <OkIcon />,
  },
  {
    key: 'rutube',
    label: 'RuTube',
    baseUrl: 'https://rutube.ru/channel/',
    placeholder: 'channel/123',
    color: 'slate',
    iconBg: '#000000',
    icon: <RutubeIcon />,
  },
  {
    key: 'yandex_music',
    label: 'Яндекс Музыка',
    baseUrl: 'https://music.yandex.ru/artist/',
    placeholder: 'ID артиста',
    color: 'yellow',
    iconBg: '#FFCC00',
    icon: <MusicNoteIcon />,
  },
  {
    key: 'dzen',
    label: 'Яндекс Дзен',
    baseUrl: 'https://dzen.ru/',
    placeholder: 'id или канал',
    color: 'slate',
    iconBg: '#000000',
    icon: <DzenIcon />,
  },
  {
    key: 'soundcloud',
    label: 'SoundCloud',
    baseUrl: 'https://soundcloud.com/',
    placeholder: 'username',
    color: 'orange',
    iconBg: '#FF5500',
    icon: <SoundCloudIcon />,
  },
  {
    key: 'bandlink',
    label: 'Bandlink',
    baseUrl: 'https://band.link/',
    placeholder: 'yourpage',
    color: 'purple',
    iconBg: '#7C3AED',
    icon: <LinkIcon />,
  },
  {
    key: 'website',
    label: 'Официальный сайт',
    baseUrl: 'https://',
    placeholder: 'example.com',
    color: 'teal',
    iconBg: '#0D9488',
    icon: <GlobeIcon />,
  },
];

// Set of keys that are still offered/rendered. Legacy stored keys outside this
// set (youtube/spotify/twitter/dropbox/lastfm/instagram/vk_profile/…) are
// silently filtered at render time — see SocialIconRow / SocialLinksEditor.
export const ALLOWED_KEYS: Set<string> = new Set(SOCIAL_SERVICES.map(s => s.key));

export const getSocialService = (key: SocialKey) =>
  SOCIAL_SERVICES.find(s => s.key === key)!;

// ─── Build full URL from slug ─────────────────────────────────────────────────

export function buildUrl(service: SocialService, slug: string): string {
  if (!slug) return '';
  // If user pasted a full URL, return as-is
  if (slug.startsWith('http://') || slug.startsWith('https://')) return slug;
  return service.baseUrl + slug;
}

export function extractSlug(service: SocialService, fullUrl: string): string {
  if (!fullUrl) return '';
  // Strip base URL prefix if present
  for (const base of [service.baseUrl, service.baseUrl.replace('https://', 'http://')]) {
    if (base && fullUrl.startsWith(base)) return fullUrl.slice(base.length);
  }
  return fullUrl;
}

// ─── View: clickable icon row ─────────────────────────────────────────────────

export function SocialIconRow({ links, labeled = false, only }: { links: Record<string, string>; labeled?: boolean; only?: SocialKey[] }) {
  const pool = only ? SOCIAL_SERVICES.filter(s => only.includes(s.key)) : SOCIAL_SERVICES;
  // Filter out legacy keys that are no longer offered (they silently disappear).
  const entries = pool.filter(s => links[s.key]);
  if (entries.length === 0) return null;

  if (labeled) {
    return (
      <div className="flex items-center flex-wrap gap-2">
        {entries.map(service => (
          <a
            key={service.key}
            href={buildUrl(service, links[service.key])}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/60 hover:border-slate-600 transition-all group"
          >
            <div className="w-4 h-4 flex-shrink-0" style={{ color: service.iconBg }}>
              {service.icon}
            </div>
            <span className="text-slate-300 group-hover:text-white text-xs font-medium transition-colors">{service.label}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center flex-wrap gap-2">
      {entries.map(service => (
        <a
          key={service.key}
          href={buildUrl(service, links[service.key])}
          target="_blank"
          rel="noopener noreferrer"
          title={service.label}
          className="group relative flex-shrink-0"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all duration-150 group-hover:scale-110 group-hover:shadow-lg p-2"
            style={{ backgroundColor: service.iconBg }}
          >
            {service.icon}
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
            {service.label}
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Edit: input list ─────────────────────────────────────────────────────────

// Keys that are real social URLs (block-on-paste applies). Contact keys
// (phone via tel:, email via mailto:) are not http(s) URLs, so they are exempt.
const URL_KEYS: Set<string> = new Set(
  SOCIAL_SERVICES.filter(s => s.key !== 'phone' && s.key !== 'email').map(s => s.key)
);

export function SocialLinksEditor({
  value,
  onChange,
  only,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  only?: SocialKey[];
}) {
  const services = only ? SOCIAL_SERVICES.filter(s => only.includes(s.key)) : SOCIAL_SERVICES;
  // Per-field validation message (e.g. blocked platform). Keyed by SocialKey.
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <div className="space-y-2">
      {services.map(service => {
        const slug = extractSlug(service, value[service.key] || '');
        const error = errors[service.key];
        const checkUrl = URL_KEYS.has(service.key);
        return (
          <div key={service.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {/* Icon */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 p-1.5"
                style={{ backgroundColor: service.iconBg }}
              >
                {service.icon}
              </div>
              {/* Input with prefix */}
              <div className={`flex-1 flex items-center bg-slate-700/50 border rounded-xl overflow-hidden focus-within:ring-2 text-xs min-w-0 ${error ? 'border-red-500/60 focus-within:ring-red-500' : 'border-slate-600/50 focus-within:ring-primary-500'}`}>
                <span className="px-2 text-slate-500 shrink-0 border-r border-slate-600/50 py-2 text-[10px] leading-none max-w-[110px] truncate">
                  {service.baseUrl.replace('https://', '')}
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => {
                    const newSlug = e.target.value.trim();
                    const updated = { ...value };
                    if (!newSlug) {
                      delete updated[service.key];
                      setErrors(prev => { const n = { ...prev }; delete n[service.key]; return n; });
                      onChange(updated);
                      return;
                    }
                    const full = buildUrl(service, newSlug);
                    // BLOCK-ON-PASTE: only run classifyUrl on real http(s) URLs.
                    // Bare slugs (no scheme) build to an allowed base URL and pass.
                    if (checkUrl && (newSlug.startsWith('http://') || newSlug.startsWith('https://'))) {
                      const result = classifyUrl(full);
                      if (result.status === 'blocked') {
                        // Reject: surface BLOCK_MESSAGE, do NOT store the value.
                        setErrors(prev => ({ ...prev, [service.key]: BLOCK_MESSAGE }));
                        delete updated[service.key];
                        onChange(updated);
                        return;
                      }
                      if (result.status === 'invalid') {
                        // Mild hint, but still let them keep typing (don't store).
                        setErrors(prev => ({ ...prev, [service.key]: 'Похоже, это не ссылка' }));
                        delete updated[service.key];
                        onChange(updated);
                        return;
                      }
                    }
                    setErrors(prev => { const n = { ...prev }; delete n[service.key]; return n; });
                    updated[service.key] = full;
                    onChange(updated);
                  }}
                  placeholder={service.placeholder}
                  className="flex-1 min-w-0 px-2 py-2 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>
            {error && (
              <p className="text-[11px] text-red-400 leading-snug pl-10">{error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
