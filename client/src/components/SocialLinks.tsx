import React from 'react';

// ─── Service definitions ──────────────────────────────────────────────────────

export type SocialKey =
  | 'tg_profile'
  | 'tg_channel'
  | 'vk_profile'
  | 'vk_community'
  | 'youtube'
  | 'bandlink'
  | 'yandex_music'
  | 'yandex_disk'
  | 'google_drive'
  | 'dropbox'
  | 'spotify'
  | 'lastfm'
  | 'twitter';

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

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SpotifyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const LastFmIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M10.584 17.21l-.88-2.392s-1.43 1.595-3.573 1.595c-1.897 0-3.244-1.65-3.244-4.289 0-3.381 1.704-4.596 3.381-4.596 2.42 0 3.189 1.562 3.848 3.574l.88 2.74c.88 2.674 2.54 4.817 7.31 4.817 3.42 0 5.737-1.056 5.737-3.824 0-2.242-1.276-3.396-3.65-3.957l-1.76-.396c-1.23-.265-1.584-.748-1.584-1.54 0-.9.703-1.43 1.848-1.43 1.254 0 1.936.462 2.045 1.562l2.617-.33c-.22-2.374-1.848-3.343-4.53-3.343-2.374 0-4.64.9-4.64 3.783 0 1.804.879 2.946 3.08 3.474l1.87.44c1.408.33 1.98.857 1.98 1.738 0 1.01-.99 1.408-2.99 1.408-2.9 0-4.11-1.518-4.815-3.65l-.9-2.76c-1.165-3.607-3.013-4.95-6.505-4.95C2.062 7.654 0 10.38 0 12.255c0 3.805 2.2 5.823 5.812 5.823 2.553 0 4.178-1.276 4.772-1.848z"/>
  </svg>
);

const DropboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M6 1.807L0 5.62l6 3.812 6-3.812zm12 0l-6 3.813 6 3.812 6-3.812zM0 13.245l6 3.812 6-3.812-6-3.813zm18-3.813l-6 3.813 6 3.812 6-3.812zM6 17.98l6 3.812 6-3.812-6-3.813z"/>
  </svg>
);

const MusicNoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
  </svg>
);

const DriveIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M7.71 3.5L1.15 15l3.43 6 6.57-12zm.57 12.5H2.43l3.43 6h5.71l-3.29-6zm8 0l-3.29 6h5.72l3.43-6zm1.15-12.5L9.14 16h5.71l6.57-12z"/>
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
  </svg>
);

export const SOCIAL_SERVICES: SocialService[] = [
  {
    key: 'tg_profile',
    label: 'Telegram профиль',
    baseUrl: 'https://t.me/',
    placeholder: 'никнейм',
    color: 'sky',
    iconBg: '#0088cc',
    icon: <TelegramIcon />,
  },
  {
    key: 'tg_channel',
    label: 'Telegram канал',
    baseUrl: 'https://t.me/',
    placeholder: 'canal_name',
    color: 'sky',
    iconBg: '#0088cc',
    icon: <TelegramIcon />,
  },
  {
    key: 'vk_profile',
    label: 'VK профиль',
    baseUrl: 'https://vk.com/',
    placeholder: 'id123456',
    color: 'blue',
    iconBg: '#4680C2',
    icon: <VKIcon />,
  },
  {
    key: 'vk_community',
    label: 'VK сообщество',
    baseUrl: 'https://vk.com/',
    placeholder: 'publicXXXX',
    color: 'blue',
    iconBg: '#4680C2',
    icon: <VKIcon />,
  },
  {
    key: 'youtube',
    label: 'YouTube канал',
    baseUrl: 'https://www.youtube.com/',
    placeholder: '@channel',
    color: 'red',
    iconBg: '#FF0000',
    icon: <YouTubeIcon />,
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
    key: 'yandex_music',
    label: 'Яндекс Музыка',
    baseUrl: 'https://music.yandex.ru/artist/',
    placeholder: 'ID артиста',
    color: 'yellow',
    iconBg: '#FFCC00',
    icon: <MusicNoteIcon />,
  },
  {
    key: 'yandex_disk',
    label: 'Яндекс Диск',
    baseUrl: 'https://disk.yandex.ru/d/',
    placeholder: 'ссылка или хэш',
    color: 'yellow',
    iconBg: '#FFCC00',
    icon: <DriveIcon />,
  },
  {
    key: 'google_drive',
    label: 'Google Диск',
    baseUrl: 'https://drive.google.com/drive/folders/',
    placeholder: 'ID папки',
    color: 'green',
    iconBg: '#34A853',
    icon: <DriveIcon />,
  },
  {
    key: 'dropbox',
    label: 'Dropbox',
    baseUrl: 'https://www.dropbox.com/sh/',
    placeholder: 'ссылка',
    color: 'blue',
    iconBg: '#0061FF',
    icon: <DropboxIcon />,
  },
  {
    key: 'spotify',
    label: 'Spotify',
    baseUrl: 'https://open.spotify.com/artist/',
    placeholder: 'ID артиста',
    color: 'green',
    iconBg: '#1DB954',
    icon: <SpotifyIcon />,
  },
  {
    key: 'lastfm',
    label: 'Last.fm',
    baseUrl: 'https://www.last.fm/user/',
    placeholder: 'username',
    color: 'red',
    iconBg: '#D51007',
    icon: <LastFmIcon />,
  },
  {
    key: 'twitter',
    label: 'Twitter (X)',
    baseUrl: 'https://x.com/',
    placeholder: 'username',
    color: 'slate',
    iconBg: '#000000',
    icon: <TwitterIcon />,
  },
];

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
    if (fullUrl.startsWith(base)) return fullUrl.slice(base.length);
  }
  return fullUrl;
}

// ─── View: clickable icon row ─────────────────────────────────────────────────

export function SocialIconRow({ links, labeled = false }: { links: Record<string, string>; labeled?: boolean }) {
  const entries = SOCIAL_SERVICES.filter(s => links[s.key]);
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

export function SocialLinksEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-2">
      {SOCIAL_SERVICES.map(service => {
        const slug = extractSlug(service, value[service.key] || '');
        return (
          <div key={service.key} className="flex items-center gap-2">
            {/* Icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 p-1.5"
              style={{ backgroundColor: service.iconBg }}
            >
              {service.icon}
            </div>
            {/* Input with prefix */}
            <div className="flex-1 flex items-center bg-slate-700/50 border border-slate-600/50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 text-xs min-w-0">
              <span className="px-2 text-slate-500 shrink-0 border-r border-slate-600/50 py-2 text-[10px] leading-none max-w-[110px] truncate">
                {service.baseUrl.replace('https://', '')}
              </span>
              <input
                type="text"
                value={slug}
                onChange={e => {
                  const newSlug = e.target.value.trim();
                  const updated = { ...value };
                  if (newSlug) {
                    updated[service.key] = buildUrl(service, newSlug);
                  } else {
                    delete updated[service.key];
                  }
                  onChange(updated);
                }}
                placeholder={service.placeholder}
                className="flex-1 min-w-0 px-2 py-2 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
