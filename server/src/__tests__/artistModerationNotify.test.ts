/**
 * Уведомления модерации артистов: заявка на верификацию → Telegram-чат команды
 * и админам платформы; решения / отзыв → отметка в чате.
 */

const mockFindMany = jest.fn();
const mockNotifyMany = jest.fn();
const mockWarn = jest.fn();

jest.mock('../index', () => ({ prisma: { user: { findMany: (...a: unknown[]) => mockFindMany(...a) } } }));
jest.mock('../utils/notify', () => ({ notifyMany: (...a: unknown[]) => mockNotifyMany(...a) }));
jest.mock('../utils/logger', () => ({ __esModule: true, default: { warn: (...a: unknown[]) => mockWarn(...a), info: jest.fn(), error: jest.fn() } }));

type Mod = typeof import('../lib/artistModerationNotify');

const fetchMock = jest.fn();
const ARTIST = {
  id: 'a1', name: 'Kursha <b>&</b>', type: 'GROUP', city: 'Самара', verificationProofUrl: 'https://vk.com/kursha',
};

/** Загрузить модуль заново: utils/telegram читает токен и чат из env при загрузке. */
function load(withTelegram = true): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    if (withTelegram) {
      process.env.TELEGRAM_LOG_TOKEN = 'tok';
      process.env.TELEGRAM_LOG_CHAT_ID = '-100';
    } else {
      delete process.env.TELEGRAM_LOG_TOKEN;
      delete process.env.TELEGRAM_LOG_CHAT_ID;
    }
    mod = require('../lib/artistModerationNotify');
  });
  return mod;
}

function sentText(): string {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.chat_id).toBe('-100');
  expect(body.parse_mode).toBe('HTML');
  return body.text as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true });
  (global as any).fetch = fetchMock;
  delete process.env.APP_URL;
  mockFindMany.mockResolvedValue([{ id: 'admin1' }, { id: 'admin2' }]);
  mockNotifyMany.mockResolvedValue(undefined);
});

describe('notifyVerificationRequested', () => {
  it('шлёт заявку в чат команды: тип по-русски, город, участники, ссылки; HTML экранирован', async () => {
    const { notifyVerificationRequested } = load();
    await notifyVerificationRequested(ARTIST, 'requester', 3);
    const text = sentText();
    expect(text).toContain('Заявка на верификацию артиста');
    expect(text).toContain('Kursha &lt;b&gt;&amp;&lt;/b&gt;');
    expect(text).not.toContain('<b>&</b>');
    expect(text).toContain('Группа');
    expect(text).toContain('Самара');
    expect(text).toContain('Подтверждённых участников: 3');
    expect(text).toContain('https://vk.com/kursha');
    expect(text).toContain('https://moooza.ru/artist/a1');
    expect(text).toContain('https://moooza.ru/admin?tab=moderation');
  });

  it('уведомляет всех админов платформы, кроме подавшего заявку, со ссылкой на «Модерацию»', async () => {
    const { notifyVerificationRequested } = load();
    await notifyVerificationRequested(ARTIST, 'requester', 2);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { isAdmin: true, id: { not: 'requester' } },
      select: { id: true },
    });
    expect(mockNotifyMany).toHaveBeenCalledWith(['admin1', 'admin2'], expect.objectContaining({
      actorId: 'requester',
      type: 'admin_artist_verification',
      link: '/admin?tab=moderation',
    }));
  });

  it('берёт адрес сайта из APP_URL', async () => {
    process.env.APP_URL = 'https://dev.moooza.ru/';
    const { notifyVerificationRequested } = load();
    await notifyVerificationRequested(ARTIST, 'requester', 2);
    expect(sentText()).toContain('https://dev.moooza.ru/admin?tab=moderation');
  });

  it('без настроенного Telegram админы всё равно получают уведомление', async () => {
    const { notifyVerificationRequested } = load(false);
    await notifyVerificationRequested(ARTIST, 'requester', 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockNotifyMany).toHaveBeenCalledTimes(1);
  });

  it('сбой базы не пробрасывается — только предупреждение в лог', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('db down'));
    const { notifyVerificationRequested } = load();
    await expect(notifyVerificationRequested(ARTIST, 'requester', 2)).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});

describe('notifyVerificationDecision', () => {
  it('отклонение — с причиной (экранированной) и ссылкой на артиста', async () => {
    const { notifyVerificationDecision } = load();
    await notifyVerificationDecision({ id: 'a1', name: 'Kursha' }, 'rejected', 'нет <кода> в профиле');
    const text = sentText();
    expect(text).toContain('Заявка на верификацию отклонена');
    expect(text).toContain('нет &lt;кода&gt; в профиле');
    expect(text).toContain('https://moooza.ru/artist/a1');
  });

  it('верификация и отзыв заявки — свои заголовки', async () => {
    const { notifyVerificationDecision } = load();
    await notifyVerificationDecision({ id: 'a1', name: 'Kursha' }, 'verified');
    expect(sentText()).toContain('Артист верифицирован');
    fetchMock.mockClear();
    await notifyVerificationDecision({ id: 'a1', name: 'Kursha' }, 'withdrawn');
    expect(sentText()).toContain('Заявка на верификацию отозвана');
  });
});
