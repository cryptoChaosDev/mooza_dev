// «Сцена» — концерты по городам (lib/sceneConcerts). Чтение — всем, в т.ч.
// гостям (публичная афиша, без ПДн); добавить/удалить концерт — админ артиста.
import { Router, Response } from 'express';
import { prisma } from '../index';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { guestReadLimiter } from '../middleware/rateLimiter';
import { getArtistAccess } from '../lib/artistAccess';
import { cityKey } from '../lib/qtickets';
import {
  SCENE_PERIODS, SCENE_SORTS, ScenePeriod, SceneSort, cityUtcOffset, getConcertDetail, listArtistConcerts,
  listSceneCities, listSceneConcerts, notifyNewConcerts, resolveSceneCity, sceneSuggest,
} from '../lib/sceneConcerts';

const router = Router();

const fail500 = (res: Response, where: string, err: unknown) => {
  console.error(`[scene] ${where}`, err);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
};

// GET /api/scene/cities — города с предстоящими концертами.
router.get('/cities', optionalAuthenticate, guestReadLimiter, async (_req, res) => {
  try {
    return res.json({ cities: await listSceneCities() });
  } catch (err) { return fail500(res, 'GET /cities', err); }
});

// GET /api/scene/concerts?city=<slug>&period=today|weekend|week|month|all&page=&limit=
//   &q=<текст>&type=Концерт,Фестиваль&priceMax=1000&moooza=1&sort=date|price_asc|price_desc|new
router.get('/concerts', optionalAuthenticate, guestReadLimiter, async (req: AuthRequest, res) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const period: ScenePeriod = (SCENE_PERIODS as readonly string[]).includes(q.period ?? '') ? (q.period as ScenePeriod) : 'all';
    let city: { slug: string; name: string; key: string } | null = null;
    if (q.city) {
      city = await resolveSceneCity(String(q.city).slice(0, 80));
      if (!city) return res.status(404).json({ error: 'Город не найден' });
    }
    // Гостю — неглубокая выдача (как у лайнапов): листать всю афишу — после входа.
    const page = Math.min(req.userId ? 50 : 10, Math.max(1, parseInt(q.page ?? '1', 10) || 1));
    const limit = Math.min(req.userId ? 50 : 20, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));
    const sort: SceneSort = (SCENE_SORTS as readonly string[]).includes(q.sort ?? '') ? (q.sort as SceneSort) : 'date';
    const priceMax = parseInt(q.priceMax ?? '', 10);
    const filters = {
      q: typeof q.q === 'string' ? q.q : null,
      types: typeof q.type === 'string' ? q.type.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10) : [],
      priceMax: Number.isFinite(priceMax) && priceMax > 0 ? Math.min(priceMax, 1_000_000) : null,
      mooozaOnly: q.moooza === '1' || q.moooza === 'true',
    };
    const data = await listSceneConcerts({ cityKey: city?.key ?? null, period, page, limit, filters, sort });
    return res.json({ city: city ? { slug: city.slug, name: city.name } : null, period, sort, ...data });
  } catch (err) { return fail500(res, 'GET /concerts', err); }
});

// GET /api/scene/suggest?q=&city=<slug> — подсказки по мере набора (события,
// артисты Moooza, площадки, города). Регистр, «ё», раскладка, транслит, опечатки.
router.get('/suggest', optionalAuthenticate, guestReadLimiter, async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const slug = typeof req.query.city === 'string' ? req.query.city.slice(0, 80) : '';
    const city = slug ? await resolveSceneCity(slug) : null;
    return res.json(await sceneSuggest(q, city?.key ?? null));
  } catch (err) { return fail500(res, 'GET /suggest', err); }
});

// GET /api/scene/concerts/:id — страница концерта: подробности + ещё концерты
// артиста и концерты города в тот же день.
router.get('/concerts/:id', optionalAuthenticate, guestReadLimiter, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'Концерт не найден' });
    const data = await getConcertDetail(id);
    if (!data) return res.status(404).json({ error: 'Концерт не найден' });
    return res.json(data);
  } catch (err) { return fail500(res, 'GET /concerts/:id', err); }
});

// GET /api/scene/artist/:id/concerts — предстоящие концерты артиста (визитка).
router.get('/artist/:id/concerts', optionalAuthenticate, guestReadLimiter, async (req, res) => {
  try {
    return res.json({ items: await listArtistConcerts(req.params.id) });
  } catch (err) { return fail500(res, 'GET /artist/:id/concerts', err); }
});

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

// POST /api/scene/concerts — админ артиста добавляет выступление.
// { artistId, date: 'ГГГГ-ММ-ДД', time: 'ЧЧ:ММ' (местное время города), city (из каталога),
//   venue, address?, ticketUrl?, title? }
router.post('/concerts', authenticate, async (req: AuthRequest, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const artistId = typeof b.artistId === 'string' ? b.artistId : '';
    if (!artistId) return res.status(400).json({ error: 'Не указан артист' });
    if (!(await getArtistAccess(artistId, req.userId)).isAdmin) return res.status(403).json({ error: 'Нет прав' });
    const artist = await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true, name: true } });
    if (!artist) return res.status(404).json({ error: 'Артист не найден' });

    const cityRaw = typeof b.city === 'string' ? b.city.trim() : '';
    const city = cityRaw
      ? await prisma.city.findFirst({ where: { name: { equals: cityRaw, mode: 'insensitive' } }, select: { name: true } })
      : null;
    if (!city) return res.status(400).json({ error: 'Выберите город из списка' });

    // Время вводят по местному времени города — переводим в UTC по поясу города.
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.date ?? ''));
    const time = /^(\d{2}):(\d{2})$/.exec(String(b.time ?? ''));
    if (!date || !time) return res.status(400).json({ error: 'Укажите дату и время концерта' });
    const [y, mo, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
    const [hh, mm] = [Number(time[1]), Number(time[2])];
    const asUtc = Date.UTC(y, mo - 1, d, hh, mm);
    const check = new Date(asUtc);
    if (hh > 23 || mm > 59 || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
      return res.status(400).json({ error: 'Укажите существующую дату и время' });
    }
    const utcOffsetMin = await cityUtcOffset(cityKey(city.name));
    const startsAt = new Date(asUtc - utcOffsetMin * 60_000);
    const now = Date.now();
    if (startsAt.getTime() < now - 60 * 60 * 1000) return res.status(400).json({ error: 'Дата концерта уже прошла' });
    if (startsAt.getTime() > now + 2 * 365 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Слишком далёкая дата' });

    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const venue = text(b.venue, 200);
    if (!venue) return res.status(400).json({ error: 'Укажите площадку' });
    const ticketUrl = text(b.ticketUrl, 1000);
    if (ticketUrl && !HTTP_URL.test(ticketUrl)) return res.status(400).json({ error: 'Ссылка на билеты должна начинаться с http(s)://' });

    const concert = await prisma.concert.create({
      data: {
        source: 'MANUAL',
        artistId: artist.id,
        title: text(b.title, 200) ?? artist.name,
        type: 'Концерт',
        startsAt,
        hasTime: true,
        utcOffsetMin,
        cityName: city.name,
        cityKey: cityKey(city.name),
        venue,
        address: text(b.address, 300),
        ticketUrl,
        createdById: req.userId!,
      },
      select: { id: true },
    });
    // Подписчикам из этого города — push (фоном).
    void notifyNewConcerts().catch((e) => console.error('[scene] notify after create', e));
    return res.status(201).json({ id: concert.id });
  } catch (err) { return fail500(res, 'POST /concerts', err); }
});

// DELETE /api/scene/concerts/:id — только добавленные вручную, админ артиста.
router.delete('/concerts/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const c = await prisma.concert.findUnique({ where: { id: req.params.id }, select: { id: true, source: true, artistId: true } });
    if (!c || !c.artistId) return res.status(404).json({ error: 'Концерт не найден' });
    if (c.source !== 'MANUAL') return res.status(400).json({ error: 'Концерт из афиши удалить нельзя — он обновляется автоматически' });
    if (!(await getArtistAccess(c.artistId, req.userId)).isAdmin) return res.status(403).json({ error: 'Нет прав' });
    await prisma.concert.delete({ where: { id: c.id } });
    return res.json({ ok: true });
  } catch (err) { return fail500(res, 'DELETE /concerts/:id', err); }
});

export default router;
