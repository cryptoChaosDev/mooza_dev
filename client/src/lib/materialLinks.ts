// «Материалы» (reference links) — the only allowed link sources and the domains
// each one must point to. Used to validate that a pasted URL really belongs to the
// chosen source (Яндекс.Диск / Google Docs / Dropbox / YouTube).

export const LINK_SOURCE_DOMAINS: Record<string, string[]> = {
  yandex_disk: ['disk.yandex.ru', 'disk.yandex.com', 'disk.360.yandex.ru', 'yadi.sk'],
  google_docs: ['docs.google.com', 'drive.google.com', 'sheets.google.com', 'slides.google.com'],
  dropbox: ['dropbox.com', 'db.tt'],
  youtube: ['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'],
};

export const LINK_SOURCE_LABELS: Record<string, string> = {
  yandex_disk: 'Яндекс.Диск',
  google_docs: 'Google Docs',
  dropbox: 'Dropbox',
  youtube: 'YouTube',
};

// True if `url` is a valid http(s) link whose host matches the given source.
export function matchesLinkSource(source: string, url: string): boolean {
  const domains = LINK_SOURCE_DOMAINS[source];
  if (!domains) return false;
  let host: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith('.' + d));
}

// Which allowed source a URL belongs to (or null if none of the four). Use where
// the user pastes a portfolio link without explicitly picking a source.
export function detectLinkSource(url: string): string | null {
  for (const source of Object.keys(LINK_SOURCE_DOMAINS)) {
    if (matchesLinkSource(source, url)) return source;
  }
  return null;
}

// True if the URL is from one of the allowed portfolio sources.
export function isAllowedLinkUrl(url: string): boolean {
  return detectLinkSource(url) !== null;
}
