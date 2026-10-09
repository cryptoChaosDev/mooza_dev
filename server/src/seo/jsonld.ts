/**
 * JSON-LD (schema.org) для SEO-снимков — план, раздел D:
 *   MusicGroup — артист; MusicAlbum — релиз; MusicVideoObject — клип;
 *   ProfilePage + Person — профиль; Service + Offer — услуга; JobPosting —
 *   вакансия; Demand — заказ; CollectionPage + ItemList — лента/каталог;
 *   BreadcrumbList — все страницы.
 *
 * На вход — ТОЛЬКО объекты из загрузчиков lib/publicData (белые списки):
 * люди без согласия туда не попадают (id = null) — и здесь не выводятся.
 * Пустые значения выкидываются (compact), строки — плоский текст: экранирование
 * для <script> делает jsonForScript при вставке.
 */

import { SITE_NAME } from './config';
import { absUrl, isoDate, isoDateTime, isoDuration, ogImageUrl, plainText, safeHttpUrl } from './html';

type Json = Record<string, unknown>;

const CTX = 'https://schema.org';

/** Убрать null/undefined/''/[] (рекурсивно по объектам и массивам). */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => compact(v)).filter((v) => !isEmpty(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      const c = compact(v);
      if (!isEmpty(c)) out[k] = c;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && !(v instanceof Date)) return Object.keys(v as Json).length === 0;
  return false;
}

/** Обёртка @context/@graph для нескольких сущностей страницы. */
export function graph(...nodes: Array<Json | null | undefined>): Json {
  return { '@context': CTX, '@graph': nodes.filter(Boolean).map((n) => compact(n)) };
}

export interface Crumb { name: string; url?: string | null }

export function breadcrumbList(crumbs: Crumb[]): Json | null {
  if (crumbs.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.url ? { item: c.url } : {}),
    })),
  };
}

/** Публичные ссылки «sameAs»: только http(s) (контактные ключи уже вырезаны publicData). */
function sameAsFrom(links: unknown): string[] {
  if (!links || typeof links !== 'object') return [];
  const out = new Set<string>();
  for (const v of Object.values(links as Record<string, unknown>)) {
    const u = safeHttpUrl(v);
    if (u) out.add(u);
  }
  return [...out].slice(0, 20);
}

function personNode(p: { id?: string | null; displayName?: string; firstName?: string; lastName?: string } | null | undefined, url: (id: string) => string): Json | null {
  if (!p || !p.id) return null; // обезличенный — не выводим
  const name = (p.displayName || `${p.firstName ?? ''} ${p.lastName ?? ''}`).trim();
  if (!name) return null;
  return { '@type': 'Person', name, url: url(p.id) };
}

// ── Артист ──────────────────────────────────────────────────────────────────

export function musicGroupLd(a: any, ctx: {
  url: string;
  profileUrl: (id: string) => string;
  releases: Array<{ id: string; title: string }>;
  releaseUrl: (id: string) => string;
}): Json {
  const members = (a.confirmedMembers ?? [])
    .map((m: any) => {
      const person = personNode(m.user, ctx.profileUrl);
      if (!person) return null;
      const roles = (m.roles ?? []).map((r: any) => r?.name).filter(Boolean);
      return roles.length
        ? { '@type': 'OrganizationRole', member: person, roleName: roles.join(', ') }
        : person;
    })
    .filter(Boolean);
  return {
    '@type': 'MusicGroup',
    '@id': `${ctx.url}#artist`,
    name: a.name,
    url: ctx.url,
    image: ogImageUrl(a.avatar) ?? ogImageUrl(a.banner),
    description: plainText(a.description, 500),
    genre: (a.genres ?? []).map((g: any) => g?.name).filter(Boolean),
    foundingLocation: a.city ? { '@type': 'Place', name: a.city } : null,
    member: members,
    album: ctx.releases.slice(0, 20).map((r) => ({ '@type': 'MusicAlbum', name: r.title, url: ctx.releaseUrl(r.id) })),
    sameAs: sameAsFrom(a.socialLinks).concat(safeHttpUrl(a.bandLink) ? [safeHttpUrl(a.bandLink)!] : []),
    interactionStatistic: a.followersCount > 0
      ? { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: a.followersCount }
      : null,
  };
}

// ── Релиз / клип ────────────────────────────────────────────────────────────

const ALBUM_RELEASE_TYPE: Record<string, string> = {
  single: 'https://schema.org/SingleRelease',
  ep: 'https://schema.org/EPRelease',
  album: 'https://schema.org/AlbumRelease',
  compilation: 'https://schema.org/AlbumRelease',
};

export function musicAlbumLd(r: any, ctx: { url: string; artistUrl: string | null; profileUrl: (id: string) => string }): Json {
  const tracks: any[] = Array.isArray(r.tracklist) ? r.tracklist : [];
  const byArtist = r.artist ? { '@type': 'MusicGroup', name: r.artist.name, url: ctx.artistUrl } : null;
  const contributors = (r.participants ?? []).map((p: any) => personNode(p.user, ctx.profileUrl)).filter(Boolean);
  return {
    '@type': 'MusicAlbum',
    '@id': `${ctx.url}#album`,
    name: r.title,
    url: ctx.url,
    image: ogImageUrl(r.coverUrl),
    datePublished: isoDate(r.releaseDate),
    byArtist,
    albumReleaseType: r.releaseType ? ALBUM_RELEASE_TYPE[String(r.releaseType)] ?? null : null,
    albumProductionType: r.releaseType === 'compilation' ? 'https://schema.org/CompilationAlbum' : null,
    numTracks: r.trackCount ?? (tracks.length || null),
    genre: r.genre ?? null,
    recordLabel: r.label ? { '@type': 'Organization', name: r.label } : null,
    contributor: contributors,
    track: tracks.length
      ? {
          '@type': 'ItemList',
          numberOfItems: tracks.length,
          itemListElement: tracks.slice(0, 100).map((t: any, i: number) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: compact({
              '@type': 'MusicRecording',
              name: typeof t?.title === 'string' ? t.title : null,
              duration: isoDuration(t?.durationMs),
              byArtist: byArtist ?? undefined,
            }),
          })),
        }
      : null,
    sameAs: safeHttpUrl(r.url) ? [safeHttpUrl(r.url)] : [],
  };
}

export function musicVideoLd(c: any, ctx: { url: string; artistUrl: string | null; description: string; profileUrl: (id: string) => string }): Json {
  return {
    '@type': 'MusicVideoObject',
    '@id': `${ctx.url}#video`,
    name: c.title,
    url: ctx.url,
    description: ctx.description,
    thumbnailUrl: ogImageUrl(c.coverUrl),
    uploadDate: isoDateTime(c.createdAt),
    byArtist: c.artist ? { '@type': 'MusicGroup', name: c.artist.name, url: ctx.artistUrl } : null,
    contributor: (c.participants ?? []).map((p: any) => personNode(p.user, ctx.profileUrl)).filter(Boolean),
    sameAs: safeHttpUrl(c.url) ? [safeHttpUrl(c.url)] : [],
  };
}

// ── Профиль ─────────────────────────────────────────────────────────────────

export function profilePageLd(p: any, ctx: { url: string; title: string; artistUrl: (a: { id: string; slug?: string | null }) => string }): Json {
  const professions = (p.userProfessions ?? []).map((up: any) => up?.profession?.name).filter(Boolean);
  return {
    '@type': 'ProfilePage',
    '@id': `${ctx.url}#page`,
    url: ctx.url,
    name: ctx.title,
    dateCreated: isoDateTime(p.createdAt),
    mainEntity: {
      '@type': 'Person',
      '@id': `${ctx.url}#person`,
      name: p.displayName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
      alternateName: p.nickname ? `@${p.nickname}` : null,
      image: ogImageUrl(p.avatar),
      description: plainText(p.bio, 500),
      jobTitle: professions[0] ?? null,
      knowsAbout: professions,
      address: p.city || p.country
        ? { '@type': 'PostalAddress', addressLocality: p.city ?? null, addressCountry: p.country ?? null }
        : null,
      memberOf: (p.userArtists ?? [])
        .map((ua: any) => ua?.artist)
        .filter((a: any) => a && a.id && a.name)
        .map((a: any) => ({ '@type': 'MusicGroup', name: a.name, url: ctx.artistUrl(a) })),
      sameAs: sameAsFrom(p.socialLinks),
    },
  };
}

// ── Услуга ──────────────────────────────────────────────────────────────────

function priceSpec(from: unknown, to: unknown): Json | null {
  const f = Number(from);
  const t = Number(to);
  const hasF = from != null && Number.isFinite(f) && f > 0;
  const hasT = to != null && Number.isFinite(t) && t > 0;
  if (!hasF && !hasT) return null;
  return {
    '@type': 'PriceSpecification',
    priceCurrency: 'RUB',
    ...(hasF ? { minPrice: f } : {}),
    ...(hasT ? { maxPrice: t } : {}),
    ...(hasF && (!hasT || f === t) ? { price: f } : {}),
  };
}

export function serviceLd(s: any, ctx: { url: string; providerUrl: string | null; description: string }): Json {
  const spec = priceSpec(s.priceFrom, s.priceTo);
  return {
    '@type': 'Service',
    '@id': `${ctx.url}#service`,
    name: s.name || s.service?.name || s.profession?.name,
    url: ctx.url,
    description: ctx.description,
    serviceType: s.service?.name ?? s.profession?.name ?? null,
    category: s.service?.section?.name ?? s.profession?.direction?.name ?? null,
    provider: s.user?.id
      ? { '@type': 'Person', name: s.user.displayName, url: ctx.providerUrl }
      : null,
    areaServed: s.user?.city ? { '@type': 'City', name: s.user.city } : null,
    offers: {
      '@type': 'Offer',
      url: ctx.url,
      priceCurrency: 'RUB',
      price: spec && 'price' in spec ? spec.price : null,
      priceSpecification: spec,
      availability: 'https://schema.org/InStock',
    },
  };
}

// ── Вакансия / заказ ────────────────────────────────────────────────────────

const EMPLOYMENT_TYPE: Record<string, string> = {
  permanent: 'FULL_TIME',
  partial: 'PART_TIME',
  project: 'CONTRACTOR',
  intern: 'INTERN',
  volunteer: 'VOLUNTEER',
};

export function jobPostingLd(v: any, ctx: { url: string; artistUrl: string | null; description: string; logo: string | null }): Json {
  const remote = v.workFormat === 'online';
  return {
    '@type': 'JobPosting',
    '@id': `${ctx.url}#job`,
    title: v.title,
    url: ctx.url,
    description: ctx.description,
    datePosted: isoDateTime(v.createdAt),
    employmentType: EMPLOYMENT_TYPE[String(v.employmentType)] ?? null,
    occupationalCategory: v.profession?.name ?? null,
    hiringOrganization: v.artist
      ? { '@type': 'Organization', name: v.artist.name, sameAs: ctx.artistUrl, logo: ctx.logo }
      : { '@type': 'Organization', name: SITE_NAME },
    jobLocationType: remote ? 'TELECOMMUTE' : null,
    applicantLocationRequirements: remote ? { '@type': 'Country', name: 'Россия' } : null,
    jobLocation: !remote ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'RU' } } : null,
    directApply: false,
  };
}

export function demandLd(o: any, ctx: { url: string; description: string }): Json {
  return {
    '@type': 'Demand',
    '@id': `${ctx.url}#demand`,
    name: o.title,
    url: ctx.url,
    description: ctx.description,
    itemOffered: o.service
      ? { '@type': 'Service', name: o.service.name, category: o.service.section?.name ?? null }
      : null,
    priceSpecification: priceSpec(o.budgetFrom, o.budgetTo),
    validFrom: isoDateTime(o.createdAt),
    availabilityEnds: isoDateTime(o.deadline),
  };
}

// ── Списки ──────────────────────────────────────────────────────────────────

export interface ListEntry { name: string; url?: string | null }

export function collectionPageLd(ctx: { url: string; name: string; description: string; items: ListEntry[] }): Json {
  return {
    '@type': 'CollectionPage',
    '@id': `${ctx.url}#page`,
    url: ctx.url,
    name: ctx.name,
    description: ctx.description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: ctx.items.length,
      itemListElement: ctx.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        url: it.url ? absUrl(it.url) ?? it.url : null,
      })),
    },
  };
}
