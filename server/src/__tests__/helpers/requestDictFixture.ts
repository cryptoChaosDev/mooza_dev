/**
 * Справочники для тестов «Ищу музыканта» — из реальных сидов каталога:
 * профессии и услуги — prisma/seeds/muza_catalog.json и services_catalog.json
 * (как на проде), жанры — seed.ts, города — часть prisma/seeds/cities.ts.
 * id детерминированные: `p:<название>`, `g:<название>`, `c:<название>`, `s:<название>`.
 */
import fs from 'fs';
import path from 'path';
import type { RequestDictionaries } from '../../lib/requestParser';

const SEEDS = path.join(__dirname, '..', '..', '..', 'prisma', 'seeds');

const GENRES = [
  'Поп', 'Рок', 'Хип-хоп / Рэп', 'Электроника', 'Джаз', 'Классика', 'R&B / Soul', 'Метал', 'Инди', 'Альтернатива',
  'Фолк', 'Блюз', 'Регги', 'Латинская музыка', 'Эмбиент', 'Оркестровая', 'Кантри', 'Фанк', 'Поп-рок', 'Диско',
  'Хаус', 'Техно', 'Дабстеп', 'Трэп', 'Шансон', 'Детская музыка',
];

const CITIES = [
  'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск',
  'Красноярск', 'Самара', 'Уфа', 'Ростов-на-Дону', 'Омск', 'Краснодар', 'Воронеж', 'Пермь', 'Волгоград',
  'Саратов', 'Тюмень', 'Тольятти', 'Набережные Челны', 'Тула', 'Сочи', 'Великий Новгород', 'Орёл',
  'Улан-Удэ', 'Петропавловск-Камчатский', 'Владимир', 'Калининград',
];

let cached: RequestDictionaries | null = null;

export function buildRequestDict(): RequestDictionaries {
  if (cached) return cached;
  const catalog: Array<{ profession: string }> = JSON.parse(fs.readFileSync(path.join(SEEDS, 'muza_catalog.json'), 'utf-8'));
  const services: Array<{ service: string; section: string; professions: string[] }> =
    JSON.parse(fs.readFileSync(path.join(SEEDS, 'services_catalog.json'), 'utf-8'));
  const names = [...new Set(catalog.map((c) => c.profession))];
  const sectionOrder = [...new Set(services.map((s) => s.section))];
  cached = {
    professions: names.map((name) => ({ id: `p:${name}`, name })),
    genres: GENRES.map((name) => ({ id: `g:${name}`, name })),
    cities: CITIES.map((name) => ({ id: `c:${name}`, name })),
    services: services.map((s, i) => ({
      id: `s:${s.service}`,
      name: s.service,
      sectionName: s.section,
      order: sectionOrder.indexOf(s.section) * 10_000 + i,
      professionIds: s.professions.filter((p) => names.includes(p)).map((p) => `p:${p}`),
    })),
  };
  return cached;
}

export const pid = (name: string) => `p:${name}`;
export const gid = (name: string) => `g:${name}`;
export const sid = (name: string) => `s:${name}`;
