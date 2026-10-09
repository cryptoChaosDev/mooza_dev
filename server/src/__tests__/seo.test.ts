/**
 * Ф4: SEO-снимки, sitemap, слаги артистов.
 *   - экранирование (bio/описание с "><script>), валидный JSON-LD в снимке,
 *     отсутствие запрещённых гостю ключей (findGuestForbiddenKeys) в JSON-LD;
 *   - статусы: 404 + noindex (профили — одинаковое тело), 301 (uuid, прежний
 *     слаг, хвостовой слэш), 200 + noindex (закрытый заказ), нет CSP на снимке;
 *   - выключатели SEO_SNAPSHOTS / SEO_INDEXABLE, фолбэк шаблона без маркеров, 503;
 *   - слаги: транслитерация (те же значения, что у SQL-миграции), дедуп,
 *     зарезервированные, middleware create/update + история;
 *   - sitemap: только публичное, корректный XML, нарезка по 45 000;
 *   - кэш: обновление только lastSeenAt не сбрасывает, запись в Artist — сбрасывает.
 */

import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { NOW, person, profileRow, DIRTY_SOCIAL_LINKS } from './helpers/guestTestKit';

// ── Prisma: авто-мок (любая model.method — jest.fn) ─────────────────────────

const mockModels: Record<string, Record<string, jest.Mock>> = {};
function mockDefault(method: string) {
  if (method === 'findMany' || method === 'groupBy') return [];
  if (method === 'count') return 0;
  return null;
}
const mockPrisma: any = new Proxy({}, {
  get(_t, model: string) {
    if (model === 'then') return undefined;
    if (!mockModels[model]) {
      const fns: Record<string, jest.Mock> = {};
      mockModels[model] = new Proxy(fns, {
        get(target, method: string) {
          if (!target[method]) target[method] = jest.fn(async () => mockDefault(method));
          return target[method];
        },
      });
    }
    return mockModels[model];
  },
});

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../utils/logger', () => {
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  return { __esModule: true, default: logger, morganStream: { write: noop }, logSecurity: noop };
});
jest.mock('../middleware/rateLimiter', () => ({
  ...jest.requireActual('../middleware/rateLimiter'),
  seoLimiter: (_req: any, _res: any, next: any) => next(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const html = require('../seo/html');
const slugLib = require('../lib/artistSlug');
const cache = require('../seo/cache');
const template = require('../seo/template');
const publicData = require('../lib/publicData');
const sitemap = require('../seo/sitemap');
const siteSettings = require('../routes/site-settings');
const seoRouter = require('../seo').default;
/* eslint-enable @typescript-eslint/no-require-imports */

const m = (model: string) => mockPrisma[model];

function resetMocks() {
  for (const model of Object.values(mockModels)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
  for (const [name, model] of Object.entries(mockModels)) {
    for (const [method, fn] of Object.entries(model)) {
      fn.mockImplementation(async () => mockDefault(method));
      void name;
    }
  }
}

// ── Приложение как в index.ts: /seo ДО helmet ───────────────────────────────

const app = express();
app.use('/seo', seoRouter);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"] } } }));
app.get('/api/x', (_req, res) => res.json({ ok: true }));

const TEMPLATE = [
  '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" />',
  '<script>try{if(localStorage.getItem("token"))document.documentElement.classList.add("authed")}catch(e){}</script>',
  '<!--seo:head--><meta name="description" content="default" /><title>Moooza — Музыкальная социальная сеть</title>',
  '<meta name="robots" content="index, follow" /><!--/seo:head-->',
  '<script type="module" crossorigin src="/assets/index-abc.js"></script></head>',
  '<body><div id="root"><!--seo:body--></div></body></html>',
].join('\n');

let templateBody = TEMPLATE;
const fetchMock = jest.fn(async (url: any) => {
  if (String(url).includes('/legal/')) return new Response('<html><body><h1>Документ</h1><p>Текст документа.</p></body></html>', { status: 200 });
  return new Response(templateBody, { status: 200, headers: { etag: '"tpl-1"' } });
});

const ENV_KEYS = ['SEO_SNAPSHOTS', 'SEO_INDEXABLE', 'APP_URL', 'SPA_TEMPLATE_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};
const realFetch = global.fetch;

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  (global as any).fetch = fetchMock;
});
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  (global as any).fetch = realFetch;
});

function setGuestBrowsing(enabled: boolean) {
  siteSettings.clearSiteSettingsCache();
  m('siteSetting').findMany.mockResolvedValue(enabled ? [{ key: 'guestBrowsingEnabled', value: 'true' }] : []);
}

beforeEach(() => {
  resetMocks();
  setGuestBrowsing(true);
  process.env.SEO_SNAPSHOTS = 'true';
  process.env.SEO_INDEXABLE = 'true';
  process.env.APP_URL = 'https://moooza.test';
  process.env.SPA_TEMPLATE_URL = 'http://web:3000/index.html';
  templateBody = TEMPLATE;
  fetchMock.mockClear();
  template.resetTemplateCache();
  cache.invalidateSeoCache('test');
});

// ── Хелперы ─────────────────────────────────────────────────────────────────

function jsonLdOf(page: string): any {
  const head = /<!--seo:head-->([\s\S]*?)<!--\/seo:head-->/.exec(page)?.[1] ?? '';
  const raw = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)?.[1];
  expect(raw).toBeDefined();
  return JSON.parse(raw!);
}

function typesOf(ld: any): string[] {
  return (ld['@graph'] ?? []).map((n: any) => n['@type']);
}

function metaRobots(page: string): string | null {
  return /<meta name="robots" content="([^"]*)"/.exec(page)?.[1] ?? null;
}

/** Мини-проверка корректности XML: парность тегов и экранирование &. */
function expectWellFormedXml(xml: string) {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  expect(body).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
  const stack: string[] = [];
  for (const t of body.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = t;
    if (selfClosing) continue;
    if (closing) expect(stack.pop()).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
}

const ARTIST_ID = '11111111-2222-4333-8444-555555555555';

// Прежние статические файлы клиента (до Ф4) — легаси-режим отдаёт их же.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodePath = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFs = require('fs');
const CLIENT_ROBOTS_TXT: string = nodeFs.readFileSync(nodePath.resolve(__dirname, '../../../client/public/robots.txt'), 'utf8');
const LEGACY_SITEMAP = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url>', '    <loc>https://moooza.test/</loc>', '    <lastmod>2026-06-04</lastmod>', '    <changefreq>daily</changefreq>', '    <priority>1.0</priority>', '  </url>',
  '  <url>', '    <loc>https://moooza.test/login</loc>', '    <lastmod>2026-06-04</lastmod>', '    <changefreq>monthly</changefreq>', '    <priority>0.5</priority>', '  </url>',
  '  <url>', '    <loc>https://moooza.test/register</loc>', '    <lastmod>2026-06-04</lastmod>', '    <changefreq>monthly</changefreq>', '    <priority>0.7</priority>', '  </url>',
  '</urlset>',
  '',
].join('\n');

function artistRow(over: Record<string, unknown> = {}) {
  return {
    id: ARTIST_ID,
    slug: 'gruppa',
    name: 'Группа <img src=x onerror=alert(1)>',
    nameNorm: 'группа',
    type: 'GROUP',
    city: 'Москва',
    tourReady: null,
    description: '"><script>alert(1)</script> Лучшая группа. Букинг +7 916 123-45-67',
    socialLinks: DIRTY_SOCIAL_LINKS,
    bandLink: 'javascript:alert(1)',
    avatar: '/uploads/artists/avatars/a.png',
    banner: null,
    listeners: BigInt(1500),
    listenersDelta: 10,
    ymData: { similarArtists: [] },
    activityStatus: 'ACTIVE',
    status: 'VERIFIED',
    submittedById: 'u-owner',
    rejectionReason: 'x',
    verificationCode: 'MOOOZA-ABC123',
    verificationProofUrl: 'https://proof',
    createdAt: NOW,
    updatedAt: NOW,
    genres: [{ genre: { id: 'g-1', name: 'Рок' } }],
    _count: { followers: 7 },
    userArtists: [
      { id: 'ua-1', userId: 'u-pub', isOwner: true, isAdmin: true, inviteStatus: 'ACCEPTED', participationStatus: 'ACTIVE_MEMBER', user: person('u-pub'), profession: null, roles: [{ role: { id: 'r-1', name: 'Вокал' } }] },
      { id: 'ua-2', userId: 'u-np', isOwner: false, isAdmin: false, inviteStatus: 'ACCEPTED', participationStatus: 'ACTIVE_MEMBER', user: person('u-np', { consent: false }), profession: null, roles: [] },
    ],
    ...over,
  };
}

function mockArtist(row: any, history: Record<string, string> = {}) {
  m('artist').findUnique.mockImplementation(async (args: any) => {
    const w = args?.where ?? {};
    if (!row) return null;
    if (w.id && w.id === row.id) return row;
    if (w.slug && w.slug === row.slug) return row;
    return null;
  });
  m('artistSlugHistory').findUnique.mockImplementation(async (args: any) => {
    const id = history[args?.where?.slug];
    return id ? { artistId: id } : null;
  });
  m('release').findMany.mockResolvedValue([
    { id: 'r-1', title: 'Альбом </script>', coverUrl: 'https://avatars.yandex.net/get-music-content/1/abc/400x400', platform: 'YANDEX_MUSIC', url: 'https://music.yandex.ru/album/1', releaseDate: NOW, updatedAt: NOW },
  ]);
}

// ── html.ts ─────────────────────────────────────────────────────────────────

describe('seo/html', () => {
  it('escapeHtml экранирует & < > " \'', () => {
    expect(html.escapeHtml('"><script>a&b\'')).toBe('&quot;&gt;&lt;script&gt;a&amp;b&#39;');
  });

  it('jsonForScript: <, >, &, U+2028/2029 экранированы, JSON остаётся валидным', () => {
    const value = { a: '</script><!--', b: 'x & y', c: 'line\u2028sep\u2029end' };
    const out = html.jsonForScript(value);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });

  it('absUrl: пути от APP_URL, абсолютные http(s) как есть, остальное — null', () => {
    process.env.APP_URL = 'https://moooza.test/';
    expect(html.absUrl('/uploads/avatars/a b.png')).toBe('https://moooza.test/uploads/avatars/a%20b.png');
    expect(html.absUrl('https://sun9-1.userapi.com/x.jpg')).toBe('https://sun9-1.userapi.com/x.jpg');
    expect(html.absUrl('//evil.com/x')).toBeNull();
    expect(html.absUrl('javascript:alert(1)')).toBeNull();
    expect(html.absUrl('uploads/x.png')).toBeNull();
    expect(html.safeHttpUrl('https://user:pass@x.ru/')).toBeNull();
  });

  it('ogImageUrl: обложки ЯМ 400x400 → 1000x1000', () => {
    expect(html.ogImageUrl('https://avatars.yandex.net/get-music-content/1/abc/400x400'))
      .toBe('https://avatars.yandex.net/get-music-content/1/abc/1000x1000');
  });

  it('truncate режет по кодпоинтам и не рвёт эмодзи', () => {
    const s = '🎸'.repeat(10);
    const out = html.truncate(s, 5);
    expect(Array.from(out)).toHaveLength(5);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it('stripTags убирает теги и script с содержимым, декодирует сущности', () => {
    expect(html.stripTags('<p>Привет&nbsp;<b>мир</b></p><script>alert(1)</script>&lt;3')).toBe('Привет мир <3');
  });

  it('isoDuration', () => {
    expect(html.isoDuration(245000)).toBe('PT4M5S');
    expect(html.isoDuration(3_600_000)).toBe('PT1H');
    expect(html.isoDuration(null)).toBeNull();
  });
});

// ── Слаги ───────────────────────────────────────────────────────────────────

// Те же имена и ожидания, что прогонялись через SQL-функцию миграции
// 20261011010000_seo_artist_slug (PGlite): транслит TS и SQL совпадают.
const SLUG_CASES: Array<[string, string]> = [
  ['Би-2', 'bi-2'],
  ['Сплин', 'splin'],
  ['Щедрый Вечер', 'shchedryy-vecher'],
  ['Ёлка', 'elka'],
  ['Мумий Тролль', 'mumiy-troll'],
  ['ХОР ТУРЕЦКОГО', 'khor-turetskogo'],
  ['Жуки', 'zhuki'],
  ['ЧайФ', 'chayf'],
  ['Юлия Савичева', 'yuliya-savicheva'],
  ['Подъезд №5', 'podezd-5'],
  ['Café Tacvba', 'cafe-tacvba'],
  ["Guns N' Roses", 'guns-n-roses'],
  ["Rock'n'Roll", 'rocknroll'],
  ['Мёртвые Дельфины', 'mertvye-delfiny'],
  ['Їжак і Ґудзик', 'yizhak-i-gudzik'],
  ['AC/DC', 'ac-dc'],
  ['Ølstykke Straße', 'olstykke-strasse'],
  ['ÆON Œuvre', 'aeon-oeuvre'],
  ['   ---   ', ''],
  ['🎸🎸', ''],
];

describe('lib/artistSlug', () => {
  it.each(SLUG_CASES)('slugify(%j) = %j', (name, slug) => {
    expect(slugLib.slugifyArtistName(name)).toBe(slug);
  });

  it('не длиннее 80 и без дефиса на конце; суффикс укорачивает базу', () => {
    const long = 'Очень Длинное Название Группы Которое Никак Не Помещается В Восемьдесят Символов Совсем';
    const s = slugLib.slugifyArtistName(long);
    expect(s).toBe('ochen-dlinnoe-nazvanie-gruppy-kotoroe-nikak-ne-pomeshchaetsya-v-vosemdesyat-simv');
    expect(s.length).toBeLessThanOrEqual(80);
    expect(slugLib.slugCandidate(s, 2)).toBe('ochen-dlinnoe-nazvanie-gruppy-kotoroe-nikak-ne-pomeshchaetsya-v-vosemdesyat-si-2');
  });

  it('зарезервированные слова и UUID не выдаются: create → create-2, uuid → uuid-2', async () => {
    expect(await slugLib.generateUniqueArtistSlug('Create')).toBe('create-2');
    expect(await slugLib.generateUniqueArtistSlug('Edit')).toBe('edit-2');
    expect(await slugLib.generateUniqueArtistSlug('Members')).toBe('members-2');
    expect(await slugLib.generateUniqueArtistSlug('Suggest')).toBe('suggest-2'); // GET /api/artists/suggest
    expect(await slugLib.generateUniqueArtistSlug('🎸')).toBe('artist-2'); // 'artist' — зарезервирован
    expect(await slugLib.generateUniqueArtistSlug(ARTIST_ID)).toBe(`${ARTIST_ID}-2`);
    for (const seg of ['create', 'edit', 'new', 'contacts', 'genres', 'invite', 'members', 'releases', 'clips', 'vacancies']) {
      expect(slugLib.RESERVED_ARTIST_SLUGS.has(seg)).toBe(true);
    }
  });

  it('дедуп: занятые слаги (и чужие из истории) пропускаются; свой прежний — свободен', async () => {
    m('artist').findMany.mockResolvedValue([{ id: 'a-1', slug: 'splin' }, { id: 'a-2', slug: 'splin-2' }]);
    m('artistSlugHistory').findMany.mockResolvedValue([{ artistId: 'a-9', slug: 'splin-3' }, { artistId: 'me', slug: 'splin-4' }]);
    expect(await slugLib.generateUniqueArtistSlug('Сплин')).toBe('splin-5'); // splin-4 — чей-то прежний адрес
    expect(await slugLib.generateUniqueArtistSlug('Сплин', 'me')).toBe('splin-4'); // свой прежний — можно вернуть
    expect(await slugLib.generateUniqueArtistSlug('Сплин', 'a-1')).toBe('splin'); // свой текущий
  });

  it('бэкфилл-порядок даёт те же слаги, что SQL-миграция (VERIFIED — «чистый» слаг)', async () => {
    const rows = [
      { id: '01', name: 'Сплин', status: 'DRAFT' },
      { id: '02', name: 'Сплин', status: 'VERIFIED' },
      { id: '03', name: 'Би-2', status: 'DRAFT' },
      { id: '04', name: 'Би 2', status: 'DRAFT' },
      { id: '05', name: '   ---   ', status: 'DRAFT' },
      { id: '06', name: '🎸🎸', status: 'DRAFT' },
    ];
    const assigned: Array<{ id: string; slug: string }> = [];
    m('artist').findMany.mockImplementation(async (args: any) => {
      const stem = args.where.slug.startsWith;
      return assigned.filter((a) => a.slug.startsWith(stem));
    });
    const order = [...rows].sort((a, b) => Number(b.status === 'VERIFIED') - Number(a.status === 'VERIFIED') || a.id.localeCompare(b.id));
    for (const r of order) assigned.push({ id: r.id, slug: await slugLib.generateUniqueArtistSlug(r.name, r.id) });
    const byId = Object.fromEntries(assigned.map((a) => [a.id, a.slug]));
    expect(byId).toEqual({ '01': 'splin-2', '02': 'splin', '03': 'bi-2', '04': 'bi-2-2', '05': 'artist-2', '06': 'artist-3' });
  });

  it('middleware create: слаг по имени; конфликт уникальности — повтор', async () => {
    m('artist').findMany.mockResolvedValue([{ id: 'x', slug: 'splin' }]);
    const params: any = { model: 'Artist', action: 'create', args: { data: { name: 'Сплин' } } };
    const next = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['slug'] } }))
      .mockResolvedValueOnce({ id: 'new' });
    await expect(slugLib.artistSlugMiddleware(params, next)).resolves.toEqual({ id: 'new' });
    expect(next).toHaveBeenCalledTimes(2);
    expect(params.args.data.slug).toBe('splin-2');
  });

  it('middleware update: смена имени НЕверифицированного → новый слаг, прежний — в историю', async () => {
    m('artist').findUnique.mockResolvedValue({ id: 'a1', name: 'Старое', slug: 'staroe', status: 'APPROVED' });
    const params: any = { model: 'Artist', action: 'update', args: { where: { id: 'a1' }, data: { name: 'Новое имя' } } };
    const next = jest.fn().mockResolvedValue({ id: 'a1' });
    await slugLib.artistSlugMiddleware(params, next);
    expect(params.args.data.slug).toBe('novoe-imya');
    expect(m('artistSlugHistory').createMany).toHaveBeenCalledWith({ data: [{ artistId: 'a1', slug: 'staroe' }], skipDuplicates: true });
    expect(m('artistSlugHistory').deleteMany).toHaveBeenCalledWith({ where: { artistId: 'a1', slug: 'novoe-imya' } });
  });

  it('middleware update: VERIFIED — слаг не меняется; то же имя — тоже', async () => {
    m('artist').findUnique.mockResolvedValueOnce({ id: 'a1', name: 'Старое', slug: 'staroe', status: 'VERIFIED' });
    const p1: any = { model: 'Artist', action: 'update', args: { where: { id: 'a1' }, data: { name: 'Новое' } } };
    await slugLib.artistSlugMiddleware(p1, jest.fn().mockResolvedValue({}));
    expect(p1.args.data).not.toHaveProperty('slug');

    m('artist').findUnique.mockResolvedValueOnce({ id: 'a1', name: 'Старое', slug: 'staroe', status: 'DRAFT' });
    const p2: any = { model: 'Artist', action: 'update', args: { where: { id: 'a1' }, data: { name: 'Старое' } } };
    await slugLib.artistSlugMiddleware(p2, jest.fn().mockResolvedValue({}));
    expect(p2.args.data).not.toHaveProperty('slug');
    expect(m('artistSlugHistory').createMany).not.toHaveBeenCalled();
  });

  it('artistKeyWhere: uuid → id, иначе слаг в нижнем регистре', () => {
    expect(slugLib.artistKeyWhere(ARTIST_ID)).toEqual({ id: ARTIST_ID });
    expect(slugLib.artistKeyWhere('Gruppa')).toEqual({ slug: 'gruppa' });
    expect(slugLib.artistKeyWhere('')).toBeNull();
  });
});

// ── Снимки ──────────────────────────────────────────────────────────────────

describe('GET /seo/render — артист', () => {
  it('200: экранирование, валидный JSON-LD (MusicGroup + BreadcrumbList), без запрещённых ключей и без CSP', async () => {
    mockArtist(artistRow());
    const res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers.etag).toMatch(/^W\/"/);
    expect(res.headers['last-modified']).toBe(NOW.toUTCString());

    const page = res.text;
    // XSS из описания и имени не прошёл
    expect(page).not.toContain('<script>alert(1)');
    expect(page).not.toContain('<img src=x');
    expect(page).not.toContain('javascript:alert');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // контакты замаскированы, служебного нет
    expect(page).not.toMatch(/916|MOOOZA-ABC123|proof/);
    // ассеты шаблона на месте, тело — внутри #root
    expect(page).toContain('/assets/index-abc.js');
    expect(page).toMatch(/<div id="root"><div data-ssr class="ssr">/);
    expect(page).toContain('<link rel="canonical" href="https://moooza.test/artist/gruppa" />');
    expect(metaRobots(page)).toMatch(/^index, follow/);
    expect(page).toContain('og:image" content="https://moooza.test/uploads/artists/avatars/a.png"');
    // состав: публичный участник — ссылкой, без согласия — только счётчик
    expect(page).toContain('href="/profile/u-pub"');
    expect(page).not.toContain('u-np');
    expect(page).toContain('И ещё 1 участник');
    expect(page).toContain('href="/releases/r-1"');

    const ld = jsonLdOf(page);
    expect(typesOf(ld)).toEqual(['MusicGroup', 'BreadcrumbList']);
    const group = ld['@graph'][0];
    expect(group.name).toBe('Группа <img src=x onerror=alert(1)>');
    expect(group.url).toBe('https://moooza.test/artist/gruppa');
    expect(JSON.stringify(group)).not.toContain('<script');
    expect(publicData.findGuestForbiddenKeys(ld)).toEqual([]);
    // в HTML JSON-LD без сырых < (</script> из названия релиза не закрыл тег)
    const rawLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)![1];
    expect(rawLd).not.toMatch(/[<>]/);
  });

  it('/artist/<uuid> и прежний слаг → 301 на /artist/<slug> (query сохраняется)', async () => {
    mockArtist(artistRow(), { 'old-name': ARTIST_ID });
    let res = await request(app).get(`/seo/render/artist/${ARTIST_ID}?utm_source=x`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/artist/gruppa?utm_source=x');

    res = await request(app).get('/seo/render/artist/old-name');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/artist/gruppa');

    res = await request(app).get('/seo/render/artist/GRUPPA');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/artist/gruppa');
  });

  it('REJECTED / нет → 404 + noindex; PENDING → 200 + noindex', async () => {
    mockArtist(artistRow({ status: 'REJECTED' }));
    let res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(metaRobots(res.text)).toBe('noindex, nofollow');

    mockArtist(null);
    res = await request(app).get('/seo/render/artist/nope');
    expect(res.status).toBe(404);

    cache.invalidateSeoCache('test');
    mockArtist(artistRow({ status: 'PENDING' }));
    res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(metaRobots(res.text)).toBe('noindex, nofollow');
  });

  it('ETag → 304 на повторный запрос', async () => {
    mockArtist(artistRow());
    const first = await request(app).get('/seo/render/artist/gruppa');
    const second = await request(app).get('/seo/render/artist/gruppa').set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
  });
});

describe('GET /seo/render — профиль, заказ, прочее', () => {
  it('профиль: нет / без согласия / заблокирован → 404 с ОДИНАКОВЫМ телом', async () => {
    const bodies: string[] = [];
    for (const [i, row] of [null, profileRow('u-np', { consent: false }), profileRow('u-bl', { blocked: true })].entries()) {
      m('user').findFirst.mockResolvedValueOnce(row);
      const res = await request(app).get(`/seo/render/profile/user-${i}`);
      expect(res.status).toBe(404);
      expect(res.headers['x-robots-tag']).toBe('noindex');
      bodies.push(res.text);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('профиль с согласием → ProfilePage + Person, bio экранирован, контактов нет', async () => {
    m('user').findFirst.mockResolvedValue({ ...profileRow('u-pub'), bio: '"><script>alert(1)</script> Музыкант, звоните 8 916 123 45 67' });
    m('deal').count.mockResolvedValue(0);
    const res = await request(app).get('/seo/render/profile/u-pub');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)');
    expect(res.text).not.toMatch(/916|secret@mail\.ru|tg_user/);
    const ld = jsonLdOf(res.text);
    expect(typesOf(ld)).toEqual(['ProfilePage', 'BreadcrumbList']);
    expect(ld['@graph'][0].mainEntity['@type']).toBe('Person');
    expect(publicData.findGuestForbiddenKeys(ld)).toEqual([]);
  });

  it('закрытый заказ → 200 + noindex; черновик → 404', async () => {
    const order = (status: string) => ({
      id: 'o-1', title: 'Сведение трека', budgetFrom: 1000, budgetTo: 5000, deadline: null, description: 'Пишите на a@b.ru',
      status, executorChosenAt: null, createdAt: NOW, updatedAt: NOW,
      service: { id: 's', name: 'Сведение', section: { id: 'sec', name: 'Продакшн' } }, selectedCustomFilterValues: [],
      author: person('u-np', { consent: false }), executor: null, posts: [{ id: 'p-1' }],
      _count: { responses: 2, referenceFiles: 1, referenceLinks: 0 },
    });
    m('order').findUnique.mockResolvedValueOnce(order('archived'));
    let res = await request(app).get('/seo/render/orders/o-1');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(metaRobots(res.text)).toBe('noindex, nofollow');
    expect(res.text).not.toContain('a@b.ru');
    expect(res.text).toContain('Заказчик на Moooza');
    const ld = jsonLdOf(res.text);
    expect(typesOf(ld)).toContain('Demand');
    expect(publicData.findGuestForbiddenKeys(ld)).toEqual([]);

    cache.invalidateSeoCache('test');
    m('order').findUnique.mockResolvedValueOnce(order('draft'));
    res = await request(app).get('/seo/render/orders/o-1');
    expect(res.status).toBe(404);
  });

  it('хвостовой слэш → 301', async () => {
    const res = await request(app).get('/seo/render/feed/?post=1');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/feed?post=1');
  });

  it('лента → CollectionPage + ItemList, без запрещённых ключей', async () => {
    m('post').findMany.mockResolvedValue([{
      id: 'p-1', type: 'blog', title: null, content: '<p>Новый трек</p>', images: [], tags: [], genres: [], links: [],
      mentions: [], repostDeleted: false, repostOfId: null, repostOf: null, artistId: null, artist: null,
      channelId: null, channel: null, serviceId: null, service: null, orderId: null, order: null, vacancyId: null, vacancy: null,
      author: person('u-pub'), createdAt: NOW, updatedAt: NOW, _count: { likes: 1, comments: 0, savedBy: 0, reactions: 0, reposts: 0 },
    }]);
    const res = await request(app).get('/seo/render/feed');
    expect(res.status).toBe(200);
    const ld = jsonLdOf(res.text);
    expect(typesOf(ld)).toEqual(['CollectionPage', 'BreadcrumbList']);
    expect(ld['@graph'][0].mainEntity['@type']).toBe('ItemList');
    expect(publicData.findGuestForbiddenKeys(ld)).toEqual([]);
    expect(res.text).toContain('href="/profile/u-pub"');
  });

  it('приватный подпуть под публичным префиксом → шаблон без изменений + noindex', async () => {
    const res = await request(app).get('/seo/render/artist/create');
    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('SEO_SNAPSHOTS выключен → шаблон без изменений (без 301)', async () => {
    process.env.SEO_SNAPSHOTS = 'false';
    mockArtist(artistRow());
    const res = await request(app).get(`/seo/render/artist/${ARTIST_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
    expect(m('artist').findUnique).not.toHaveBeenCalled();
  });

  it('гостевой режим выключен (аварийный выключатель) → шаблон без изменений + noindex, легаси-sitemap', async () => {
    setGuestBrowsing(false);
    mockArtist(artistRow());
    const res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(m('artist').findUnique).not.toHaveBeenCalled();
    const sm = await request(app).get('/seo/sitemap.xml');
    expect(sm.status).toBe(200);
    expect(sm.text).toBe(LEGACY_SITEMAP);
    expect((await request(app).get('/seo/sitemap-artists.xml')).status).toBe(404);
  });

  it('getPublicArtist: прежний слаг → данные с текущим slug (клиент заменит адрес)', async () => {
    mockArtist(artistRow(), { 'old-name': ARTIST_ID });
    const r = await publicData.getPublicArtist('old-name');
    expect(r.status).toBe('ok');
    expect(r.data.slug).toBe('gruppa');
    expect(r.data.id).toBe(ARTIST_ID);
  });

  it('SEO_INDEXABLE=false → meta robots noindex,nofollow + X-Robots-Tag на индексируемой странице', async () => {
    process.env.SEO_INDEXABLE = 'false';
    mockArtist(artistRow());
    const res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(metaRobots(res.text)).toBe('noindex, nofollow');
  });

  it('шаблон без маркеров → фолбэк-вставка (дефолтный title заменён, тело в #root)', async () => {
    templateBody = '<html><head><title>Old</title><meta name="description" content="x"></head><body><div id="root"></div></body></html>';
    mockArtist(artistRow());
    const res = await request(app).get('/seo/render/artist/gruppa');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<title>Old</title>');
    expect(res.text.match(/<title>/g)).toHaveLength(1);
    expect(res.text).toMatch(/<div id="root"><div data-ssr/);
  });

  it('шаблон недоступен → 503 (nginx отдаст SPA)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/seo/render/feed');
    expect(res.status).toBe(503);
  });

  it('API за /seo — со своим CSP (helmet после роутера)', async () => {
    const res = await request(app).get('/api/x');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

// ── Режимы индексации: легаси (SEO_INDEXABLE=false) и открытый ─────────────

describe('режим индексации', () => {
  const legacy = () => { process.env.SEO_INDEXABLE = 'false'; };

  it('легаси, снимки выключены: / — шаблон как есть, без noindex (как сейчас на PROD)', async () => {
    legacy();
    process.env.SEO_SNAPSHOTS = 'false';
    const res = await request(app).get('/seo/render/');
    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(metaRobots(res.text)).toBe('index, follow');
  });

  it('легаси, снимки включены: / — снимок главной с index, follow и без X-Robots-Tag', async () => {
    legacy();
    const res = await request(app).get('/seo/render/');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(metaRobots(res.text)).toMatch(/^index, follow/);
    expect(res.text).toContain('<link rel="canonical" href="https://moooza.test/" />');
  });

  it('легаси: /privacy, /terms, /login, /register — без noindex; /feed, /search, артист — noindex', async () => {
    legacy();
    for (const path of ['/privacy', '/terms']) {
      const res = await request(app).get(`/seo/render${path}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-robots-tag']).toBeUndefined();
      expect(metaRobots(res.text)).toMatch(/^index, follow/);
    }
    for (const path of ['/login', '/register']) {
      const res = await request(app).get(`/seo/render${path}`);
      expect(res.status).toBe(200);
      expect(res.text).toBe(TEMPLATE);
      expect(res.headers['x-robots-tag']).toBeUndefined();
    }
    mockArtist(artistRow());
    for (const path of ['/feed', '/search', '/artist/gruppa']) {
      const res = await request(app).get(`/seo/render${path}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(metaRobots(res.text)).toBe('noindex, nofollow');
    }
  });

  it('открытый режим: /login и /register — noindex, nofollow; / — index', async () => {
    for (const path of ['/login', '/register']) {
      const res = await request(app).get(`/seo/render${path}`);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    const home = await request(app).get('/seo/render/');
    expect(home.headers['x-robots-tag']).toBeUndefined();
    expect(metaRobots(home.text)).toMatch(/^index, follow/);
  });

  it('robots.txt в легаси-режиме — побайтно прежний (= client/public/robots.txt, фолбэк nginx)', async () => {
    legacy();
    const res = await request(app).get('/seo/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe(CLIENT_ROBOTS_TXT);
    expect(res.text).toContain('Disallow: /artist\n');
    expect(res.text).toContain('Host: moooza.ru');
  });

  it('robots.txt в открытом режиме — открытый вариант плана (Disallow приватного, Clean-param, без Host)', async () => {
    const res = await request(app).get('/seo/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).not.toBe(CLIENT_ROBOTS_TXT);
    expect(res.text).toContain('Allow: /\n');
    expect(res.text).toContain('Disallow: /messages');
    expect(res.text).toContain('Disallow: /artist/*/edit');
    expect(res.text).toContain('Clean-param: post /feed');
    expect(res.text).toContain('Sitemap: https://moooza.test/sitemap.xml');
    expect(res.text).not.toMatch(/^Host:/m);
    expect(res.text).not.toMatch(/^Disallow: \/(artist|releases|clips|services|search)$/m);
    expect(res.text).not.toMatch(/GPTBot|ClaudeBot/); // AI-краулеры не запрещены
  });

  it('SEO_INDEXABLE=true, но гостевой режим выключен → легаси robots.txt', async () => {
    setGuestBrowsing(false);
    const res = await request(app).get('/seo/robots.txt');
    expect(res.text).toBe(CLIENT_ROBOTS_TXT);
  });

  it('GET /api/site-settings отдаёт вычисляемый seoIndexable (env + гостевой режим)', async () => {
    const api = express();
    api.use('/api/site-settings', siteSettings.default);
    let res = await request(api).get('/api/site-settings');
    expect(res.body.seoIndexable).toBe('true');
    legacy();
    siteSettings.clearSiteSettingsCache();
    res = await request(api).get('/api/site-settings');
    expect(res.body.seoIndexable).toBe('false');
    process.env.SEO_INDEXABLE = 'true';
    setGuestBrowsing(false);
    res = await request(api).get('/api/site-settings');
    expect(res.body.seoIndexable).toBe('false');
  });
});

// ── Кэш ─────────────────────────────────────────────────────────────────────

describe('кэш снимков', () => {
  it('shouldInvalidateSeo: lastSeenAt — нет; публичные поля и модели — да', () => {
    expect(cache.shouldInvalidateSeo({ model: 'User', action: 'update', args: { data: { lastSeenAt: new Date() } } })).toBe(false);
    expect(cache.shouldInvalidateSeo({ model: 'User', action: 'update', args: { data: { firstName: 'X' } } })).toBe(true);
    expect(cache.shouldInvalidateSeo({ model: 'User', action: 'update', args: { data: { lastSeenAt: new Date(), bio: 'x' } } })).toBe(true);
    expect(cache.shouldInvalidateSeo({ model: 'Artist', action: 'update', args: { data: { name: 'x' } } })).toBe(true);
    expect(cache.shouldInvalidateSeo({ model: 'Review', action: 'create', args: { data: {} } })).toBe(true);
    expect(cache.shouldInvalidateSeo({ model: 'Notification', action: 'create', args: { data: {} } })).toBe(false);
    expect(cache.shouldInvalidateSeo({ model: 'Artist', action: 'findMany', args: {} })).toBe(false);
  });

  it('повтор из кэша; lastSeenAt не сбрасывает; запись в Artist и onPublicDataChanged — сбрасывают', async () => {
    mockArtist(artistRow());
    await request(app).get('/seo/render/artist/gruppa');
    const calls = () => m('artist').findUnique.mock.calls.length;
    const afterFirst = calls();
    expect(afterFirst).toBeGreaterThan(0);

    await request(app).get('/seo/render/artist/gruppa');
    expect(calls()).toBe(afterFirst);

    const next = jest.fn().mockResolvedValue({});
    await cache.seoCacheMiddleware({ model: 'User', action: 'update', args: { where: { id: 'u' }, data: { lastSeenAt: new Date() } } }, next);
    await request(app).get('/seo/render/artist/gruppa');
    expect(calls()).toBe(afterFirst);

    await cache.seoCacheMiddleware({ model: 'Artist', action: 'update', args: { where: { id: ARTIST_ID }, data: { city: 'СПб' } } }, next);
    await request(app).get('/seo/render/artist/gruppa');
    const afterInvalidate = calls();
    expect(afterInvalidate).toBeGreaterThan(afterFirst);

    publicData.notifyPublicDataChanged({ type: 'user', id: 'u-pub', reason: 'consent_revoked' });
    await request(app).get('/seo/render/artist/gruppa');
    expect(calls()).toBeGreaterThan(afterInvalidate);
  });

  it('LRU: не больше max записей, протухшие не отдаются', () => {
    const lru = new cache.LruCache(2);
    lru.set('a', 1, 1000, 0);
    lru.set('b', 2, 1000, 0);
    lru.get('a', 1);
    lru.set('c', 3, 1000, 2);
    expect(lru.get('b', 3)).toBeUndefined(); // вытеснен самый старый по использованию
    expect(lru.get('a', 3)).toBe(1);
    expect(lru.get('c', 5000)).toBeUndefined(); // TTL
  });
});

// ── Sitemap ─────────────────────────────────────────────────────────────────

describe('sitemap', () => {
  const OLD = new Date(NOW.getTime() - 30 * 86_400_000);
  const goodBio = 'Звукорежиссёр и продюсер. '.repeat(5);

  function mockSitemapData() {
    m('artist').findMany.mockImplementation(async (args: any) => {
      if (!args?.select?.releases) return [];
      return [
        { id: ARTIST_ID, slug: 'gruppa', status: 'VERIFIED', updatedAt: OLD, releases: [{ updatedAt: NOW }], clips: [] },
        { id: 'a-rej', slug: 'rejected', status: 'REJECTED', updatedAt: NOW, releases: [], clips: [] },
      ];
    });
    m('user').findMany.mockImplementation(async () => [
      { ...person('u-good'), publicConsentAt: OLD, avatar: '/uploads/avatars/g.png', bio: goodBio, searchIndexingOptOut: false, _count: { userServices: 0, userArtists: 0 } },
      { ...person('u-noavatar'), publicConsentAt: OLD, avatar: null, bio: goodBio, searchIndexingOptOut: false, _count: { userServices: 1, userArtists: 0 } },
      { ...person('u-noconsent', { consent: false }), avatar: '/a.png', bio: goodBio, searchIndexingOptOut: false, _count: { userServices: 1, userArtists: 1 } },
      { ...person('u-fresh'), publicConsentAt: NOW, avatar: '/a.png', bio: goodBio, searchIndexingOptOut: false, _count: { userServices: 1, userArtists: 0 } },
      { ...person('u-optout'), publicConsentAt: OLD, avatar: '/a.png', bio: goodBio, searchIndexingOptOut: true, _count: { userServices: 1, userArtists: 0 } },
      { ...person('u-short'), publicConsentAt: OLD, avatar: '/a.png', bio: 'коротко', searchIndexingOptOut: false, _count: { userServices: 0, userArtists: 0 } },
      { ...person('u-svc'), publicConsentAt: OLD, avatar: '/a.png', bio: null, searchIndexingOptOut: false, _count: { userServices: 2, userArtists: 0 } },
    ]);
  }

  it('SEO_INDEXABLE=false → легаси-sitemap (/, /login, /register), дочерние — 404', async () => {
    process.env.SEO_INDEXABLE = 'false';
    mockSitemapData();
    const res = await request(app).get('/seo/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expectWellFormedXml(res.text);
    expect(res.text).toBe(LEGACY_SITEMAP);
    expect((await request(app).get('/seo/sitemap-artists.xml')).status).toBe(404);
    expect((await request(app).get('/seo/sitemap-static.xml')).status).toBe(404);
    // в легаси-режиме БД не трогаем
    expect(m('artist').findMany).not.toHaveBeenCalled();
  });

  it('индекс: корректный XML, только непустые типы', async () => {
    mockSitemapData();
    const res = await request(app).get('/seo/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expectWellFormedXml(res.text);
    expect(res.text).toContain('<loc>https://moooza.test/sitemap-static.xml</loc>');
    expect(res.text).toContain('<loc>https://moooza.test/sitemap-artists.xml</loc>');
    expect(res.text).toContain('<loc>https://moooza.test/sitemap-profiles.xml</loc>');
    expect(res.text).not.toContain('sitemap-releases.xml'); // пусто
  });

  it('артисты: адрес по слагу, lastmod = свежайший релиз, REJECTED отфильтрован', async () => {
    mockSitemapData();
    const res = await request(app).get('/seo/sitemap-artists.xml');
    expect(res.status).toBe(200);
    expectWellFormedXml(res.text);
    expect(res.text).toContain('<loc>https://moooza.test/artist/gruppa</loc>');
    expect(res.text).toContain(`<lastmod>${html.isoDateTime(NOW)}</lastmod>`);
    expect(res.text).not.toContain('rejected');
    const where = m('artist').findMany.mock.calls.find((c: any[]) => c[0]?.select?.releases)[0].where;
    expect(where.status.in).toEqual(['VERIFIED', 'APPROVED']);
  });

  it('профили: согласие ≥ 14 дней, порог качества, без запрета индексации, без lastmod', async () => {
    mockSitemapData();
    const res = await request(app).get('/seo/sitemap-profiles.xml');
    expectWellFormedXml(res.text);
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
    expect(locs).toEqual(['https://moooza.test/profile/u-good', 'https://moooza.test/profile/u-svc']);
    expect(res.text).not.toContain('<lastmod>');
    expect(JSON.stringify(m('user').findMany.mock.calls[0][0].where)).toContain('publicConsentAt');
  });

  it('статика и несуществующие страницы', async () => {
    const res = await request(app).get('/seo/sitemap-static.xml');
    expect(res.status).toBe(200);
    expectWellFormedXml(res.text);
    expect(res.text).toContain('<loc>https://moooza.test/search?tab=artists</loc>');
    expect((await request(app).get('/seo/sitemap-foo.xml')).status).toBe(404);
    expect((await request(app).get('/seo/sitemap-static-2.xml')).status).toBe(404);
    expect((await request(app).get('/seo/sitemap-static-1.xml')).status).toBe(404);
  });

  it('нарезка по 45 000 URL', async () => {
    const total = sitemap.SITEMAP_CHUNK_SIZE + 1;
    const ids = Array.from({ length: total }, (_, i) => `r-${String(i).padStart(6, '0')}`);
    m('release').findMany.mockImplementation(async (args: any) => {
      const start = args.cursor ? ids.indexOf(args.cursor.id) + 1 : 0;
      return ids.slice(start, start + args.take).map((id) => ({ id, updatedAt: NOW }));
    });
    const index = await request(app).get('/seo/sitemap.xml');
    expect(index.text).toContain('/sitemap-releases.xml</loc>');
    expect(index.text).toContain('/sitemap-releases-2.xml</loc>');
    const first = await request(app).get('/seo/sitemap-releases.xml');
    expect(first.text.match(/<url>/g)).toHaveLength(sitemap.SITEMAP_CHUNK_SIZE);
    const second = await request(app).get('/seo/sitemap-releases-2.xml');
    expect(second.text.match(/<url>/g)).toHaveLength(1);
    expect(second.text).toContain(`/releases/${ids[total - 1]}</loc>`);
    expect((await request(app).get('/seo/sitemap-releases-3.xml')).status).toBe(404);
  });
});
