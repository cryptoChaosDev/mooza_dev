/**
 * POST /api/requests/transcribe — голосовой ввод «Ищу музыканта».
 * STT-сервис замокан через global fetch (как его вызывает lib/sttClient),
 * auth и prisma — моки. Аудио — синтетический буфер: проверяем приём, лимиты,
 * коды ошибок и то, что запись не пишется на диск.
 */

import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

jest.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { userId?: string }, res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user-id'];
    if (!id) return res.status(401).json({ error: 'Требуется аутентификация', code: 'TOKEN_MISSING' });
    req.userId = id as string;
    next();
  },
  optionalAuthenticate: (req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user-id'];
    if (id) req.userId = id as string;
    next();
  },
}));
jest.mock('../utils/notify', () => ({ notify: jest.fn(), isNotificationEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../index', () => ({ prisma: {} }));

const STT_URL = 'http://stt-test:5005';
process.env.STT_URL = STT_URL;

function buildApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const router = require('../routes/requests').default;
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/requests', router);
  return app;
}

// Лимит гостя — 5 записей с IP за 10 минут: у каждого теста свой IP.
let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

const AUDIO = Buffer.alloc(6000, 7);
const sttJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: jest.SpyInstance;
const app = buildApp();

function send(opts: { ip?: string; user?: string; buf?: Buffer; type?: string; field?: string } = {}) {
  let r = request(app).post('/api/requests/transcribe').set('X-Forwarded-For', opts.ip ?? nextIp());
  if (opts.user) r = r.set('x-test-user-id', opts.user);
  return r.attach(opts.field ?? 'audio', opts.buf ?? AUDIO, { filename: 'voice.webm', contentType: opts.type ?? 'audio/webm' });
}

beforeEach(() => {
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sttJson({ text: '  нужен барабанщик  на концерт ', duration: 4.2 }));
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/requests/transcribe', () => {
  it('гость: запись уходит в STT из памяти, ответ — { text }', async () => {
    const res = await send({ type: 'audio/webm;codecs=opus' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'нужен барабанщик на концерт' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${STT_URL}/transcribe`);
    expect(init.method).toBe('POST');
    const fd = init.body as FormData;
    const file = fd.get('file') as Blob;
    expect(file.size).toBe(AUDIO.length);
    expect(file.type).toBe('audio/webm');
    expect(Buffer.from(await file.arrayBuffer()).equals(AUDIO)).toBe(true);
    // Предел длительности для STT: 30 с + 1 с запаса на таймер браузера
    expect(fd.get('max_seconds')).toBe('31');
  });

  it.each(['audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'])('принимает %s', async (type) => {
    const res = await send({ type });
    expect(res.status).toBe(200);
  });

  it('тишина (STT вернул пустой текст) → 422 «Не расслышали…»', async () => {
    fetchMock.mockImplementation(async () => sttJson({ text: '', duration: 3 }));
    const res = await send();
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Не расслышали — попробуйте ещё раз ближе к микрофону');
  });

  it('нечитаемое аудио (STT 422 от ffmpeg) → 422', async () => {
    fetchMock.mockImplementation(async () => sttJson({ error: 'ffmpeg failed' }, 422));
    const res = await send();
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NOT_HEARD');
  });

  it('STT занят (503) → 503 с понятным текстом', async () => {
    fetchMock.mockImplementation(async () => sttJson({ error: 'busy' }, 503));
    const res = await send();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STT_BUSY');
    expect(res.body.error).toMatch(/занято/);
  });

  it('STT недоступен (сеть) → 503, а не 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(async () => { throw new TypeError('fetch failed'); });
    const res = await send();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STT_UNAVAILABLE');
  });

  it('файл больше 2 МБ → 413, в STT не отправляется', async () => {
    const res = await send({ buf: Buffer.alloc(2 * 1024 * 1024 + 1, 1) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('TOO_LONG');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запись длиннее 30 с по данным STT → 413', async () => {
    fetchMock.mockImplementation(async () => sttJson({ error: 'too long', duration: 32 }, 413));
    expect((await send()).status).toBe(413);

    // старый образ STT без max_seconds, но с длительностью в ответе
    fetchMock.mockImplementation(async () => sttJson({ text: 'очень длинный текст', duration: 95 }));
    const res = await send();
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/30 секунд/);
  });

  it('неподдерживаемый тип → 415; без файла → 400; в STT не отправляется', async () => {
    const bad = await send({ type: 'image/png' });
    expect(bad.status).toBe(415);
    const flac = await send({ type: 'audio/flac' });
    expect(flac.status).toBe(415);
    const none = await request(app).post('/api/requests/transcribe').set('X-Forwarded-For', nextIp()).field('x', '1');
    expect(none.status).toBe(400);
    const wrongField = await send({ field: 'file' });
    expect(wrongField.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запись не сохраняется на диск (memoryStorage, без временных файлов)', async () => {
    const writeStream = jest.spyOn(fs, 'createWriteStream');
    const writeFile = jest.spyOn(fs, 'writeFile');
    const writeFileSync = jest.spyOn(fs, 'writeFileSync');
    const promisesWrite = jest.spyOn(fs.promises, 'writeFile');
    const mkdtemp = jest.spyOn(fs, 'mkdtempSync');
    const res = await send();
    expect(res.status).toBe(200);
    for (const spy of [writeStream, writeFile, writeFileSync, promisesWrite, mkdtemp]) expect(spy).not.toHaveBeenCalled();
  });

  it('распознанный текст обрезается до 1000 символов и схлопывает пробелы', async () => {
    fetchMock.mockImplementation(async () => sttJson({ text: `${'слово   '.repeat(300)}` }));
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body.text.length).toBeLessThanOrEqual(1000);
    expect(res.body.text).not.toMatch(/\s{2}/);
  });
});

describe('rate limit голосового ввода', () => {
  it('гость: 5 записей за 10 минут с IP, шестая — 429 (в STT не уходит)', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) expect((await send({ ip })).status).toBe(200);
    const res = await send({ ip });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/голосовых/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // другой IP — свой лимит
    expect((await send()).status).toBe(200);
  });

  it('вошедший: 20 записей за 10 минут на аккаунт, не делит лимит с гостями того же IP', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await send({ ip });
    expect((await send({ ip })).status).toBe(429);
    for (let i = 0; i < 20; i++) expect((await send({ ip, user: 'user-voice' })).status).toBe(200);
    expect((await send({ ip, user: 'user-voice' })).status).toBe(429);
    // другой IP не обходит лимит аккаунта
    expect((await send({ user: 'user-voice' })).status).toBe(429);
  });
});
