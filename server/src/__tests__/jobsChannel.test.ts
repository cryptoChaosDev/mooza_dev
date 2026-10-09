/**
 * Автопостинг заказов и вакансий в Telegram-канал (lib/jobsChannel + jobsChannelHook).
 *   - формат поста: экранирование, хэштеги, маскирование контактов, нет имени заказчика;
 *   - публикация ровно один раз (в т.ч. при гонке), снятие «застолбления» при ошибке;
 *   - закрытие («⛔ Закрыто», кнопка убрана) и повторное открытие;
 *   - флаг выключен / нет env → ничего не шлём; черновик/непубличное → не шлём;
 *   - не «задним числом»: только созданное/опубликованное после включения;
 *   - hook (prisma.$use) → отложенная синхронизация; тестовый пост из админки.
 * Prisma — in-memory фейк, fetch (релей Bot API) — мок.
 */

import express from 'express';
import request from 'supertest';

process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN';
process.env.TELEGRAM_JOBS_CHANNEL_ID = '@moooza_jobs';
process.env.TELEGRAM_API_BASE = 'https://relay.test';
process.env.APP_URL = 'https://moooza.ru';

// ── In-memory Prisma ────────────────────────────────────────────────────────

type Row = Record<string, any>;

function matches(row: Row, where: any): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'AND') { if (!(cond as any[]).every((w) => matches(row, w))) return false; continue; }
    if (k === 'OR') { if (!(cond as any[]).some((w) => matches(row, w))) return false; continue; }
    const v = row[k];
    if (cond === null) { if (v != null) return false; continue; }
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as any;
      if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
      if ('lt' in c && !(v != null && new Date(v) < new Date(c.lt))) return false;
      if ('in' in c && !c.in.includes(v)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

function fakeModel(store: Map<string, Row>) {
  return {
    findUnique: jest.fn(async ({ where }: any) => {
      const r = store.get(where?.id ?? where?.key);
      return r ? { ...r } : null;
    }),
    findMany: jest.fn(async ({ where, take }: any = {}) =>
      [...store.values()].filter((r) => matches(r, where)).slice(0, take ?? 1e9).map((r) => ({ ...r }))),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const r of store.values()) if (matches(r, where)) { Object.assign(r, data); count++; }
      return { count };
    }),
    upsert: jest.fn(async ({ where, update, create }: any) => {
      const key = where.id ?? where.key;
      const r = store.get(key);
      if (r) { Object.assign(r, update); return { ...r }; }
      store.set(key, { ...create });
      return { ...create };
    }),
  };
}

const db = {
  orders: new Map<string, Row>(),
  vacancies: new Map<string, Row>(),
  settings: new Map<string, Row>(),
  posts: new Map<string, Row>(),
  users: new Map<string, Row>(),
};

const mockPrisma: any = {
  order: fakeModel(db.orders),
  vacancy: fakeModel(db.vacancies),
  siteSetting: fakeModel(db.settings),
  post: fakeModel(db.posts),
  user: fakeModel(db.users),
};

jest.mock('../index', () => ({ prisma: mockPrisma }));
jest.mock('../utils/logger', () => {
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  return { __esModule: true, default: logger, morganStream: { write: noop }, logSecurity: noop };
});
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const id = req.headers['x-test-user-id'];
    if (!id) return res.status(401).json({ error: 'Требуется аутентификация' });
    req.userId = id;
    next();
  },
  optionalAuthenticate: (_req: any, _res: any, next: any) => next(),
}));

// ── fetch (релей Bot API) ───────────────────────────────────────────────────

let messageSeq = 100;
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function tgOk(result: unknown) {
  return { status: 200, json: async () => ({ ok: true, result }) };
}
function tgErr(description: string, code = 400, extra: Record<string, unknown> = {}) {
  return { status: code, json: async () => ({ ok: false, error_code: code, description, ...extra }) };
}
function defaultTelegram() {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith('/sendMessage')) return tgOk({ message_id: ++messageSeq });
    return tgOk(true);
  });
}
function tgCalls(method?: string): Array<{ url: string; body: any }> {
  return fetchMock.mock.calls
    .map(([url, init]: any[]) => ({ url: String(url), body: JSON.parse(init?.body ?? '{}') }))
    .filter((c) => !method || c.url.endsWith(`/${method}`));
}

/* eslint-disable @typescript-eslint/no-require-imports */
const jc = require('../lib/jobsChannel');
const { jobsChannelMiddleware } = require('../lib/jobsChannelHook');
const { CONTACT_MASK } = require('../lib/maskContacts');

// ── Фикстуры ────────────────────────────────────────────────────────────────

// Относительно реального «сейчас»: подсказка активации hook’а — new Date()
const ENABLED_AT = new Date(Date.now() - 60 * 60 * 1000);
const AFTER = new Date(Date.now() - 10 * 60 * 1000);
const BEFORE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
// Срок «15.10.2026» хранится как конец дня по МСК
const DEADLINE = new Date('2026-10-15T20:59:59.999Z');

function enableFlag(at: Date | null = ENABLED_AT) {
  db.settings.set('jobsChannelEnabled', { key: 'jobsChannelEnabled', value: 'true' });
  if (at) db.settings.set('jobsChannelEnabledAt', { key: 'jobsChannelEnabledAt', value: at.toISOString() });
}

function orderRow(over: Row = {}): Row {
  return {
    id: 'ord-1',
    authorId: 'u-1',
    title: 'Сведение <b>трека</b> & мастеринг',
    description: 'Нужно свести 3 трека в стиле рок.\nЗвоните +7 (916) 123-45-67 или пишите ivan@mail.ru, тг @ivan_petrov\nТретья строка не попадает',
    status: 'active',
    budgetFrom: 5000,
    budgetTo: 15000,
    deadline: DEADLINE,
    executorId: null,
    createdAt: AFTER,
    updatedAt: AFTER,
    telegramMessageId: null,
    telegramPostedAt: null,
    telegramClosedAt: null,
    service: {
      name: 'Сведение',
      section: { name: 'Звук' },
      serviceProfessions: [{ profession: { name: 'Звукорежиссёр' } }],
    },
    selectedCustomFilterValues: [
      { value: 'Рок', filter: { name: 'Жанр' } },
      { value: 'Хип-Хоп', filter: { name: 'Жанр' } },
      { value: 'Метал', filter: { name: 'Жанр' } },
      { value: 'Удалённая запись', filter: { name: 'Формат работы' } },
    ],
    // «Грязный» автор: Prisma-фейк игнорирует select — имя не должно попасть в пост
    author: { firstName: 'Иван', lastName: 'Секретов', email: 'secret@mail.ru', isBlocked: false, blockedUntil: null },
    posts: [{ id: 'post-ord-1', createdAt: AFTER, city: null, genres: [] }],
    ...over,
  };
}

function vacancyRow(over: Row = {}): Row {
  return {
    id: 'vac-1',
    artistId: 'art-1',
    authorId: 'u-2',
    title: 'Ищем вокалистку в группу',
    description: 'Репетиции 2 раза в неделю. Пишите t.me/band_manager',
    status: 'active',
    workFormat: 'offline',
    geography: 'city',
    employmentType: 'project',
    paymentType: 'rate',
    compensation: 5000,
    createdAt: AFTER,
    updatedAt: AFTER,
    telegramMessageId: null,
    telegramPostedAt: null,
    telegramClosedAt: null,
    profession: { name: 'Вокалист / Вокалистка' },
    selectedCustomFilterValues: [],
    artist: {
      name: 'Группа «Ночь»',
      status: 'APPROVED',
      city: 'Нижний Новгород',
      genres: [{ genre: { name: 'Инди', sortOrder: 2 } }, { genre: { name: 'Пост-панк', sortOrder: 1 } }],
    },
    posts: [{ id: 'post-vac-1', createdAt: AFTER, city: null, genres: [] }],
    ...over,
  };
}

beforeAll(() => {
  jc.setJobsSyncDelay(60_000); // таймеры не срабатывают сами — сливаем flushJobSyncs()
});

beforeEach(() => {
  for (const m of Object.values(db)) m.clear();
  fetchMock.mockReset();
  defaultTelegram();
  process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN';
  process.env.TELEGRAM_JOBS_CHANNEL_ID = '@moooza_jobs';
});

afterEach(async () => {
  await jc.flushJobSyncs();
});

// ── Формат поста ────────────────────────────────────────────────────────────

describe('toHashtag', () => {
  it.each([
    ['Нижний Новгород', '#нижнийновгород'],
    ['Ростов-на-Дону', '#ростовнадону'],
    ['Звукорежиссёр', '#звукорежиссёр'],
    ['Вокалист / Вокалистка', '#вокалист'],
    ['Диджей (DJ)', '#диджей'],
    ['Хип-Хоп', '#хипхоп'],
    ['R&B', '#rnb'],
    ['AR / VR-дизайнер', '#arvrдизайнер'],
  ])('%p → %p', (raw, tag) => {
    expect(jc.toHashtag(raw)).toBe(tag);
  });

  it('пусто / без букв → null', () => {
    expect(jc.toHashtag('')).toBeNull();
    expect(jc.toHashtag(null)).toBeNull();
    expect(jc.toHashtag('123 - 45')).toBeNull();
  });
});

describe('buildJobPost — заказ', () => {
  const post = jc.buildJobPost('order', orderRow());

  it('тип, заголовок и описание экранированы (HTML parse_mode)', () => {
    expect(post.text).toContain('🎯 <b>Заказ</b>');
    expect(post.text).toContain('<b>Сведение &lt;b&gt;трека&lt;/b&gt; &amp; мастеринг</b>');
    expect(post.text).not.toContain('<b>трека</b>');
  });

  it('контакты в описании замаскированы, третья строка не попала', () => {
    expect(post.text).toContain(CONTACT_MASK);
    expect(post.text).not.toMatch(/916|ivan@mail\.ru|@ivan_petrov/);
    expect(post.text).not.toContain('Третья строка');
    expect(post.text).toContain('Нужно свести 3 трека в стиле рок.');
  });

  it('нет ПДн заказчика', () => {
    expect(post.text).not.toMatch(/Иван|Секретов|secret@mail\.ru/);
  });

  it('услуга, бюджет, срок ДД.ММ.ГГГГ по МСК, удалённо', () => {
    expect(post.text).toContain('🛠 Услуга: Сведение');
    expect(post.text).toContain('💰 Бюджет: от 5 000 до 15 000 ₽');
    expect(post.text).toContain('⏳ Срок: до 15.10.2026 (МСК)');
    expect(post.text).toContain('🌐 Удалённо');
  });

  it('хэштеги: профессия, до двух жанров, #удалённо', () => {
    const tagsLine = post.text.split('\n').pop();
    expect(tagsLine).toBe('#звукорежиссёр #рок #хипхоп #удалённо');
    expect(post.text).not.toContain('#метал');
  });

  it('кнопка «Откликнуться на Moooza» со ссылкой и UTM', () => {
    expect(post.url).toBe('https://moooza.ru/orders/ord-1?utm_source=telegram&utm_medium=channel');
    expect(post.replyMarkup).toEqual({
      inline_keyboard: [[{ text: 'Откликнуться на Moooza', url: post.url }]],
    });
  });

  it('без бюджета и срока — «по договорённости» / «Срок не ограничен»; город из поста', () => {
    const p = jc.buildJobPost('order', orderRow({
      budgetFrom: null, budgetTo: null, deadline: null, selectedCustomFilterValues: [],
      posts: [{ id: 'p', createdAt: AFTER, city: 'Санкт-Петербург', genres: [] }],
    }));
    expect(p.text).toContain('💰 Бюджет: по договорённости');
    expect(p.text).toContain('⏳ Срок не ограничен');
    expect(p.text).toContain('📍 Санкт-Петербург');
    expect(p.text).toContain('#санктпетербург #звукорежиссёр');
    expect(p.text).not.toContain('#удалённо');
  });

  it('закрытый пост: пометка сверху, клавиатура пустая', () => {
    const closed = jc.buildJobPost('order', orderRow(), { closed: true });
    expect(closed.text.startsWith('⛔ <b>Закрыто</b>')).toBe(true);
    expect(closed.replyMarkup).toEqual({ inline_keyboard: [] });
  });
});

describe('buildJobPost — вакансия', () => {
  it('артист, профессия, город артиста, оплата, хэштеги', () => {
    const { text, url } = jc.buildJobPost('vacancy', vacancyRow());
    expect(text).toContain('🎸 <b>Вакансия</b>');
    expect(text).toContain('🎤 Артист: Группа «Ночь»');
    expect(text).toContain('👤 Профессия: Вокалист / Вокалистка');
    expect(text).toContain('📍 Нижний Новгород · Офлайн · в своём городе');
    expect(text).toContain('💼 Занятость: Проектная');
    expect(text).toContain('💰 Оплата: Ставка · 5 000 ₽');
    expect(text).not.toContain('t.me/band_manager');
    expect(text.split('\n').pop()).toBe('#нижнийновгород #вокалист #постпанк #инди');
    expect(url).toBe('https://moooza.ru/vacancies/vac-1?utm_source=telegram&utm_medium=channel');
  });

  it('online → «Удалённо», #удалённо, без города', () => {
    const { text } = jc.buildJobPost('vacancy', vacancyRow({ workFormat: 'online', geography: 'country', paymentType: 'percent', compensation: 30 }));
    expect(text).toContain('🌐 Удалённо · по всей стране');
    expect(text).toContain('💰 Оплата: Процент · 30%');
    expect(text).not.toContain('#нижнийновгород');
    expect(text).toContain('#удалённо');
  });

  it('имя артиста экранируется', () => {
    const { text } = jc.buildJobPost('vacancy', vacancyRow({ artist: { name: '<i>Bad</i> & Co', status: 'APPROVED', city: null, genres: [] } }));
    expect(text).toContain('🎤 Артист: &lt;i&gt;Bad&lt;/i&gt; &amp; Co');
  });
});

describe('descriptionSnippet', () => {
  it('обрезка ~300 символов по слову с «…»', () => {
    const long = Array.from({ length: 120 }, (_, i) => `слово${i}`).join(' ');
    const s = jc.descriptionSnippet(long);
    expect(s.endsWith('…')).toBe(true);
    expect(Array.from(s).length).toBeLessThanOrEqual(301);
    // обрезано по границе слова: после префикса в исходнике идёт пробел
    const prefix = s.slice(0, -1);
    expect(long.startsWith(prefix)).toBe(true);
    expect(long[prefix.length]).toBe(' ');
  });

  it('пустое описание → пусто', () => {
    expect(jc.descriptionSnippet(null)).toBe('');
    expect(jc.descriptionSnippet('  \n \n')).toBe('');
  });
});

// ── Публикация ──────────────────────────────────────────────────────────────

describe('syncJobPost — когда публиковать', () => {
  it('нет TELEGRAM_JOBS_CHANNEL_ID → ничего (даже в БД не ходим)', async () => {
    delete process.env.TELEGRAM_JOBS_CHANNEL_ID;
    enableFlag();
    db.orders.set('ord-1', orderRow());
    mockPrisma.siteSetting.findMany.mockClear();
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.siteSetting.findMany).not.toHaveBeenCalled();
  });

  it('флаг выключен → ничего не шлём', async () => {
    db.settings.set('jobsChannelEnabled', { key: 'jobsChannelEnabled', value: 'false' });
    db.orders.set('ord-1', orderRow());
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('disabled');
    expect(await jc.publishOrder('ord-1')).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['черновик', orderRow({ status: 'draft', posts: [] })],
    ['без поста в ленте', orderRow({ posts: [] })],
    ['в архиве', orderRow({ status: 'archived' })],
    ['исполнитель выбран', orderRow({ executorId: 'u-9' })],
    ['автор заблокирован', orderRow({ author: { isBlocked: true, blockedUntil: null } })],
    ['временная блокировка автора', orderRow({ author: { isBlocked: false, blockedUntil: new Date(Date.now() + 86400000) } })],
  ])('заказ: %s → не шлём', async (_name, row) => {
    enableFlag();
    db.orders.set('ord-1', row);
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('not_public');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['черновик', vacancyRow({ status: 'draft', posts: [] })],
    ['артист REJECTED', vacancyRow({ artist: { name: 'X', status: 'REJECTED', city: null, genres: [] } })],
    ['без поста', vacancyRow({ posts: [] })],
  ])('вакансия: %s → не шлём', async (_name, row) => {
    enableFlag();
    db.vacancies.set('vac-1', row);
    expect(await jc.syncJobPost('vacancy', 'vac-1')).toBe('not_public');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('старое (создано и опубликовано до включения) → не шлём задним числом', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ createdAt: BEFORE, posts: [{ id: 'p', createdAt: BEFORE, city: null, genres: [] }] }));
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('too_old');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('старое, но опубликовано (пост создан) после включения → шлём', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ createdAt: BEFORE, posts: [{ id: 'p', createdAt: AFTER, city: null, genres: [] }] }));
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('posted');
  });

  it('старое, активировано из архива после включения (подсказка hook’а) → шлём', async () => {
    enableFlag();
    db.vacancies.set('vac-1', vacancyRow({ createdAt: BEFORE, posts: [{ id: 'p', createdAt: BEFORE, city: null, genres: [] }] }));
    expect(await jc.syncJobPost('vacancy', 'vac-1', { activatedAt: new Date() })).toBe('posted');
  });

  it('флаг включён без момента включения → момент = сейчас, старое не шлём', async () => {
    enableFlag(null);
    db.orders.set('ord-1', orderRow({ createdAt: BEFORE, posts: [{ id: 'p', createdAt: BEFORE, city: null, genres: [] }] }));
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('too_old');
    expect(db.settings.get('jobsChannelEnabledAt')?.value).toBeTruthy();
  });
});

describe('syncJobPost — однократность', () => {
  it('публикует в канал основным ботом через релей и сохраняет message_id', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow());
    expect(await jc.publishOrder('ord-1')).toBe('posted');
    const sends = tgCalls('sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0].url).toBe('https://relay.test/botTEST_TOKEN/sendMessage');
    expect(sends[0].body).toMatchObject({ chat_id: '@moooza_jobs', parse_mode: 'HTML' });
    expect(sends[0].body.reply_markup.inline_keyboard[0][0].text).toBe('Откликнуться на Moooza');
    const row = db.orders.get('ord-1')!;
    expect(row.telegramMessageId).toBe(messageSeq);
    expect(row.telegramPostedAt).toBeInstanceOf(Date);
  });

  it('повторные события и гонка → ровно одно сообщение', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow());
    const results = await Promise.all([
      jc.syncJobPost('order', 'ord-1'),
      jc.syncJobPost('order', 'ord-1'),
      jc.publishOrder('ord-1'),
    ]);
    expect(results.filter((r: string) => r === 'posted')).toHaveLength(1);
    await jc.flushJobSyncs();
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('noop');
    expect(await jc.publishOrder('ord-1')).toBe('already');
    expect(tgCalls('sendMessage')).toHaveLength(1);
  });

  it('ошибка Telegram → «застолбление» снято, следующее событие публикует', async () => {
    enableFlag();
    db.vacancies.set('vac-1', vacancyRow());
    fetchMock.mockImplementationOnce(async () => tgErr('Bad Request: chat not found'));
    expect(await jc.publishVacancy('vac-1')).toBe('error');
    expect(db.vacancies.get('vac-1')!.telegramPostedAt).toBeNull();
    expect(db.vacancies.get('vac-1')!.telegramMessageId).toBeNull();
    expect(await jc.publishVacancy('vac-1')).toBe('posted');
    expect(tgCalls('sendMessage')).toHaveLength(2);
  });

  it('сбой сети/релея не бросает и ставит повтор', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow());
    fetchMock.mockImplementationOnce(async () => { throw new Error('ECONNRESET'); });
    await expect(jc.syncJobPost('order', 'ord-1')).resolves.toBe('error');
    expect(db.orders.get('ord-1')!.telegramPostedAt).toBeNull();
    await jc.flushJobSyncs(); // повтор (обычно через минуту)
    expect(tgCalls('sendMessage')).toHaveLength(2);
    expect(db.orders.get('ord-1')!.telegramMessageId).toBe(messageSeq);
  });
});

describe('закрытие и повторное открытие', () => {
  async function posted(kind: 'order' | 'vacancy', row: Row) {
    enableFlag();
    (kind === 'order' ? db.orders : db.vacancies).set(row.id, row);
    expect(await jc.syncJobPost(kind, row.id)).toBe('posted');
    await jc.flushJobSyncs();
    fetchMock.mockClear();
    return row;
  }

  it.each([
    ['выполнен (done)', { status: 'done' }],
    ['в архиве', { status: 'archived' }],
    ['выбран исполнитель', { executorId: 'u-9' }],
    ['снят в черновик', { status: 'draft', posts: [] }],
  ])('заказ: %s → «⛔ Закрыто», кнопка убрана, один раз', async (_name, change) => {
    await posted('order', orderRow());
    Object.assign(db.orders.get('ord-1')!, change);
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('closed');
    const edits = tgCalls('editMessageText');
    expect(edits).toHaveLength(1);
    expect(edits[0].body.message_id).toBe(db.orders.get('ord-1')!.telegramMessageId);
    expect(edits[0].body.chat_id).toBe('@moooza_jobs');
    expect(edits[0].body.text.startsWith('⛔ <b>Закрыто</b>')).toBe(true);
    expect(edits[0].body.reply_markup).toEqual({ inline_keyboard: [] });
    expect(db.orders.get('ord-1')!.telegramClosedAt).toBeInstanceOf(Date);
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('noop');
    expect(tgCalls('editMessageText')).toHaveLength(1);
    expect(tgCalls('sendMessage')).toHaveLength(0);
  });

  it('снова опубликован (archived → active) → тот же пост открыт, нового сообщения нет', async () => {
    await posted('vacancy', vacancyRow());
    db.vacancies.get('vac-1')!.status = 'archived';
    expect(await jc.syncJobPost('vacancy', 'vac-1')).toBe('closed');
    db.vacancies.get('vac-1')!.status = 'active';
    expect(await jc.syncJobPost('vacancy', 'vac-1')).toBe('reopened');
    const edits = tgCalls('editMessageText');
    expect(edits).toHaveLength(2);
    expect(edits[1].body.text.startsWith('🎸 <b>Вакансия</b>')).toBe(true);
    expect(edits[1].body.reply_markup.inline_keyboard[0][0].text).toBe('Откликнуться на Moooza');
    expect(tgCalls('sendMessage')).toHaveLength(0);
    expect(db.vacancies.get('vac-1')!.telegramClosedAt).toBeNull();
  });

  it('closePost удалённой сущности — по снимку', async () => {
    const row = await posted('order', orderRow());
    const snapshot = { ...db.orders.get('ord-1')! };
    db.orders.delete(row.id);
    expect(await jc.closePost('order', 'ord-1', snapshot)).toBe('closed');
    const edits = tgCalls('editMessageText');
    expect(edits).toHaveLength(1);
    expect(edits[0].body.text).toContain('⛔ <b>Закрыто</b>');
  });

  it('«message is not modified» — не ошибка', async () => {
    await posted('order', orderRow());
    db.orders.get('ord-1')!.status = 'archived';
    fetchMock.mockImplementationOnce(async () => tgErr('Bad Request: message is not modified'));
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('closed');
    expect(db.orders.get('ord-1')!.telegramClosedAt).toBeInstanceOf(Date);
  });

  it('флаг выключен → и закрытие не шлём', async () => {
    await posted('order', orderRow());
    db.settings.get('jobsChannelEnabled')!.value = 'false';
    db.orders.get('ord-1')!.status = 'archived';
    expect(await jc.syncJobPost('order', 'ord-1')).toBe('disabled');
    expect(await jc.closePost('order', 'ord-1')).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Hook (prisma.$use) ──────────────────────────────────────────────────────

describe('jobsChannelMiddleware', () => {
  function params(model: string, action: string, args: any, runInTransaction = false) {
    return { model, action, args, dataPath: [], runInTransaction };
  }

  it('создание заказа → пост ещё не создан (не шлём) → создание поста → публикация', async () => {
    enableFlag();
    const row = orderRow({ posts: [] });
    await jobsChannelMiddleware(params('Order', 'create', { data: { title: row.title } }), async () => {
      db.orders.set(row.id, row);
      return { ...row };
    });
    await jc.flushJobSyncs();
    expect(fetchMock).not.toHaveBeenCalled();

    const postRow = { id: 'post-ord-1', type: 'order', orderId: 'ord-1', createdAt: AFTER };
    await jobsChannelMiddleware(params('Post', 'create', { data: postRow }), async () => {
      db.posts.set(postRow.id, postRow);
      db.orders.get('ord-1')!.posts = [{ id: postRow.id, createdAt: AFTER, city: null, genres: [] }];
      return postRow;
    });
    await jc.flushJobSyncs();
    expect(tgCalls('sendMessage')).toHaveLength(1);
  });

  it('запрос не ждёт Telegram и не падает от его ошибок', async () => {
    enableFlag();
    const row = orderRow();
    fetchMock.mockImplementation(async () => { throw new Error('relay down'); });
    const result = await jobsChannelMiddleware(params('Order', 'create', { data: {} }), async () => {
      db.orders.set(row.id, row);
      return { ...row };
    });
    expect(result.id).toBe('ord-1');
    expect(fetchMock).not.toHaveBeenCalled(); // отправка отложена
    await jc.flushJobSyncs();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('автоархив (updateMany) → закрытие опубликованного', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ telegramMessageId: 7, telegramPostedAt: AFTER }));
    const args = { where: { id: 'ord-1', status: 'active', executorId: null }, data: { status: 'archived' } };
    await jobsChannelMiddleware(params('Order', 'updateMany', args), async () => mockPrisma.order.updateMany(args));
    await jc.flushJobSyncs();
    const edits = tgCalls('editMessageText');
    expect(edits).toHaveLength(1);
    expect(edits[0].body.message_id).toBe(7);
  });

  it('снятие в черновик (post.deleteMany) → закрытие', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ telegramMessageId: 8, telegramPostedAt: AFTER }));
    db.posts.set('post-ord-1', { id: 'post-ord-1', type: 'order', orderId: 'ord-1' });
    const args = { where: { orderId: 'ord-1', type: 'order' } };
    await jobsChannelMiddleware(params('Post', 'deleteMany', args), async () => {
      db.posts.delete('post-ord-1');
      Object.assign(db.orders.get('ord-1')!, { status: 'draft', posts: [] });
      return { count: 1 };
    });
    await jc.flushJobSyncs();
    expect(tgCalls('editMessageText')).toHaveLength(1);
  });

  it('в транзакции — без предварительных чтений, id берётся из where', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ telegramMessageId: 12, telegramPostedAt: AFTER }));
    mockPrisma.post.findMany.mockClear();
    mockPrisma.post.findUnique.mockClear();
    await jobsChannelMiddleware(params('Post', 'deleteMany', { where: { orderId: 'ord-1', type: 'order' } }, true), async () => {
      Object.assign(db.orders.get('ord-1')!, { status: 'draft', posts: [] });
      return { count: 1 };
    });
    expect(mockPrisma.post.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
    await jc.flushJobSyncs();
    expect(tgCalls('editMessageText')).toHaveLength(1);
  });

  it('удаление опубликованного заказа → закрытие по снимку', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ telegramMessageId: 9, telegramPostedAt: AFTER }));
    await jobsChannelMiddleware(params('Order', 'delete', { where: { id: 'ord-1' } }), async () => {
      const r = db.orders.get('ord-1');
      db.orders.delete('ord-1');
      return r;
    });
    await jc.flushJobSyncs();
    const edits = tgCalls('editMessageText');
    expect(edits).toHaveLength(1);
    expect(edits[0].body.message_id).toBe(9);
    expect(edits[0].body.text).toContain('⛔ <b>Закрыто</b>');
  });

  it('archived → active (update) — подсказка активации: старое публикуется', async () => {
    enableFlag();
    db.vacancies.set('vac-1', vacancyRow({ status: 'archived', createdAt: BEFORE, posts: [{ id: 'p', createdAt: BEFORE, city: null, genres: [] }] }));
    await jobsChannelMiddleware(params('Vacancy', 'update', { where: { id: 'vac-1' }, data: { status: 'active' } }), async () => {
      db.vacancies.get('vac-1')!.status = 'active';
      return { ...db.vacancies.get('vac-1')! };
    });
    await jc.flushJobSyncs();
    expect(tgCalls('sendMessage')).toHaveLength(1);
  });

  it('правка старого активного заказа (без смены статуса) не публикует задним числом', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ createdAt: BEFORE, posts: [{ id: 'p', createdAt: BEFORE, city: null, genres: [] }] }));
    await jobsChannelMiddleware(params('Order', 'update', { where: { id: 'ord-1' }, data: { status: 'active', title: 'Новое' } }), async () => ({ ...db.orders.get('ord-1')! }));
    await jc.flushJobSyncs();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('служебная запись telegram* не порождает событий', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow());
    const spy = jest.spyOn(jc, 'scheduleJobSync');
    await jobsChannelMiddleware(params('Order', 'update', { where: { id: 'ord-1' }, data: { telegramMessageId: 5 } }), async () => ({ ...db.orders.get('ord-1')! }));
    await jobsChannelMiddleware(params('Order', 'updateMany', { where: { id: 'ord-1' }, data: { telegramPostedAt: new Date() } }), async () => ({ count: 1 }));
    expect(spy).not.toHaveBeenCalled();
    // контроль: обычная правка — событие есть (шпион действительно перехватывает)
    await jobsChannelMiddleware(params('Order', 'update', { where: { id: 'ord-1' }, data: { title: 'X' } }), async () => ({ ...db.orders.get('ord-1')! }));
    expect(spy).toHaveBeenCalledWith('order', 'ord-1', expect.any(Object));
    spy.mockRestore();
  });

  it('без env — чистый проход: ни запросов, ни событий', async () => {
    delete process.env.TELEGRAM_JOBS_CHANNEL_ID;
    mockPrisma.order.findUnique.mockClear();
    const next = jest.fn(async () => ({ count: 1 }));
    await jobsChannelMiddleware(params('Order', 'delete', { where: { id: 'ord-1' } }), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('блокировка автора → опубликованный заказ закрывается', async () => {
    enableFlag();
    db.orders.set('ord-1', orderRow({ telegramMessageId: 11, telegramPostedAt: AFTER }));
    await jobsChannelMiddleware(params('User', 'update', { where: { id: 'u-1' }, data: { isBlocked: true } }), async () => {
      db.orders.get('ord-1')!.author = { isBlocked: true, blockedUntil: null };
      return { id: 'u-1' };
    });
    await new Promise((r) => setImmediate(r));
    await jc.flushJobSyncs();
    expect(tgCalls('editMessageText')).toHaveLength(1);
  });
});

// ── Настройки и админка ─────────────────────────────────────────────────────

describe('включение флага', () => {
  it('updateSiteSettings: при включении запоминается момент, повторное включение его не сдвигает', async () => {
    const { updateSiteSettings } = require('../routes/site-settings');
    await updateSiteSettings({ jobsChannelEnabled: 'true' });
    const first = db.settings.get('jobsChannelEnabledAt')?.value;
    expect(first).toBeTruthy();
    expect(db.settings.get('jobsChannelEnabled')?.value).toBe('true');
    await updateSiteSettings({ jobsChannelEnabled: 'true' });
    expect(db.settings.get('jobsChannelEnabledAt')?.value).toBe(first);
  });
});

describe('POST /api/admin/jobs-channel/test', () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/admin/jobs-channel', require('../routes/jobsChannelAdmin').default);
    return a;
  }

  beforeEach(() => {
    db.users.set('admin-1', { id: 'admin-1', isAdmin: true });
    db.users.set('user-1', { id: 'user-1', isAdmin: false });
  });

  it('не админ → 403', async () => {
    const res = await request(app()).post('/api/admin/jobs-channel/test').set('x-test-user-id', 'user-1');
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('успех — шлёт пробное сообщение в канал (и при выключенном флаге)', async () => {
    const res = await request(app()).post('/api/admin/jobs-channel/test').set('x-test-user-id', 'admin-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, channelId: '@moooza_jobs' });
    expect(tgCalls('sendMessage')[0].body.chat_id).toBe('@moooza_jobs');
  });

  it('бот не админ канала → текст ошибки Telegram', async () => {
    fetchMock.mockImplementationOnce(async () => tgErr('Forbidden: bot is not a member of the channel chat', 403));
    const res = await request(app()).post('/api/admin/jobs-channel/test').set('x-test-user-id', 'admin-1');
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('bot is not a member of the channel chat');
  });

  it('канал не задан → 400 с подсказкой', async () => {
    delete process.env.TELEGRAM_JOBS_CHANNEL_ID;
    const res = await request(app()).post('/api/admin/jobs-channel/test').set('x-test-user-id', 'admin-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('TELEGRAM_JOBS_CHANNEL_ID');
  });

  it('GET /status', async () => {
    enableFlag();
    const res = await request(app()).get('/api/admin/jobs-channel/status').set('x-test-user-id', 'admin-1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, channelId: '@moooza_jobs', enabled: true });
  });
});
