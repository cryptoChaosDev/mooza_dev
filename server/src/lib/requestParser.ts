/**
 * «Ищу музыканта» — разбор одной фразы заказчика по нашим справочникам.
 *
 *   «нужен барабанщик на концерт 20 ноября в Самаре, метал, бюджет 10 000»
 *     → профессия «Барабанщик», жанр «Метал», город «Самара»,
 *       дата 20.11 (конец дня МСК), бюджет до 10 000 ₽.
 *
 * Решение владельца: без внешних AI-API и без новых зависимостей. Поэтому —
 * детерминированный разбор:
 *   1. нормализация (нижний регистр, ё→е, тире/неразрывные пробелы);
 *   2. регулярками вырезаются бюджет и даты (с маскировкой найденного, чтобы
 *      «20 ноября» не стало бюджетом, а «10к» — датой);
 *   3. остаток бьётся на слова и сопоставляется со словарями фраз:
 *      синонимы частых профессий/жанров (ниже) + названия из БД
 *      (Profession «Вокалист / Вокалистка» → два варианта, Genre, City);
 *   4. русская морфология — простым стеммингом: обрезка типичных окончаний
 *      (-а, -у, -ом, -е, -ы, -ов, -ами, -ой, -ии, -ия …) со сравнением основ
 *      ≥ 4 символов, плюс «основа + окончание» для коротких слов
 *      («Уфа» → «в Уфе», «рок» → «рока»).
 *
 * Справочники читаются из БД и кэшируются в памяти на 10 минут
 * (getRequestDictionaries). Сам разбор — чистая функция parseRequestText(),
 * её и тестируем на реальных фразах.
 */
import { prisma } from '../index';
import { endOfDayMsk, parseCalendarDay, type CalendarDay } from './mskDate';

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

export interface RefItem { id: string; name: string }

export interface ServiceRef {
  id: string;
  name: string;
  sectionName: string | null;
  /** Порядок в каталоге: раздел, затем услуга. */
  order: number;
  professionIds: string[];
}

export interface RequestDictionaries {
  professions: RefItem[];
  genres: RefItem[];
  cities: RefItem[];
  services: ServiceRef[];
}

export interface ParsedRequest {
  professionIds: string[];
  /** Как называть профессию в заголовке («Барабанщик», «Вокалистка»). */
  professionLabels: Record<string, string>;
  genreIds: string[];
  cityName: string | null;
  isRemote: boolean;
  /** ISO-момент конца дня по МСК или null. */
  date: string | null;
  /** Срок без точной даты: «на следующей неделе», «срочно», «в декабре». */
  dateHint: string | null;
  budgetFrom: number | null;
  budgetTo: number | null;
  /** «бесплатно», «за спасибо», «бартер». */
  isFree: boolean;
  /** Нормализованные названия услуг каталога, на которые указывает текст («сведение»). */
  serviceHints: string[];
  /** Контекст: concert | wedding | corporate | festival | tour | rehearsal | recording | party | band. */
  eventKey: string | null;
  title: string;
  description: string;
  unknownTokens: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Нормализация и морфология
// ─────────────────────────────────────────────────────────────────────────────

export function normalize(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[    ​]/g, ' ')
    .replace(/[‐‑‒–—―−]/g, '-');
}

/** Название из справочника → слова фразы («Санкт-Петербург» → [санкт, петербург]). */
function phraseWords(s: string): string[] {
  return normalize(s).match(TOKEN_RE_G) ?? [];
}

const TOKEN_RE_G = /[a-zа-я0-9]+(?:&[a-zа-я0-9]+)*/g;

// Окончания — от длинных к коротким. Основа после обрезки — не короче MIN_STEM.
const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'иях', 'ием',
  'ов', 'ев', 'ей', 'ой', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ых', 'их',
  'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях', 'ии', 'ия', 'ию', 'ье', 'ья', 'ью',
  'а', 'я', 'у', 'ю', 'о', 'е', 'ы', 'и', 'ь', 'й',
].sort((a, b) => b.length - a.length);
const ENDING_SET = new Set(ENDINGS);
const MIN_STEM = 4;

/** Простой стемминг: одна обрезка самого длинного подходящего окончания. */
export function stem(word: string): string {
  for (const e of ENDINGS) {
    if (word.length - e.length >= MIN_STEM && word.endsWith(e)) return word.slice(0, -e.length);
  }
  return word;
}

function baseOf(word: string): string {
  return /[аяоеэыиуюьй]$/.test(word) ? word.slice(0, -1) : word;
}

const LATIN_RE = /^[a-z0-9&]+$/;

/**
 * Совпадает ли слово текста со словом словаря с учётом падежа/числа:
 *  - точное совпадение;
 *  - одинаковые основы ≥ 4 символов («барабанщика» ~ «барабанщик», «нижнем» ~ «нижний»);
 *  - словарное слово + окончание («ростове» = «ростов» + «е»);
 *  - основа словарного слова без конечной гласной + окончание («уфе» ~ «уфа»).
 * Латиница (dj, smm, edm, r&b) — только точно.
 */
export function wordMatches(token: string, word: string): boolean {
  if (token === word) return true;
  if (LATIN_RE.test(word) || LATIN_RE.test(token)) return false;
  const ts = stem(token);
  const ws = stem(word);
  if (ts.length >= MIN_STEM && ts === ws) return true;
  if (word.length >= 3 && token.startsWith(word) && ENDING_SET.has(token.slice(word.length))) return true;
  const b = baseOf(word);
  if (b !== word && b.length >= 2 && token.startsWith(b)) {
    const rest = token.slice(b.length);
    if (rest && ENDING_SET.has(rest)) return true;
  }
  return false;
}

// Двусмысленные слова справочника («техник» ≠ «техника», «акустик» ≠ «акустика»):
// только точная форма или явные формы мн. ч./твор. п.
const EXACT_ONLY_ALIASES = new Set(['техник', 'акустик', 'оператор', 'декоратор', 'перформер', 'контролер', 'продавец', 'медик']);
const EXACT_ONLY_SUFFIXES = ['', 'ом', 'ов', 'и', 'ам', 'ами'];
function exactishMatches(token: string, word: string): boolean {
  return EXACT_ONLY_SUFFIXES.some((s) => token === word + s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Словари синонимов (сверены с каталогом muza_catalog.json и seed.ts)
// targets — нормализованные названия/варианты профессий в БД; берутся все,
// что есть. fallback — если ни одного target в БД нет.
// ─────────────────────────────────────────────────────────────────────────────

interface ProfessionRule {
  aliases: string[];
  targets: string[];
  fallback?: string[];
  /** Услуги каталога, на которые указывает фраза (нормализованные названия). */
  services?: string[];
  /** Жанры, которые фраза подразумевает («рэпер» → рэп). */
  genres?: string[];
}

export const PROFESSION_RULES: ProfessionRule[] = [
  { aliases: ['барабанщик', 'ударник', 'драммер', 'драмер', 'drummer', 'барабаны', 'барабан', 'ударные', 'на ударных', 'за барабанами'], targets: ['барабанщик', 'ударник'] },
  { aliases: ['барабанщица', 'ударница'], targets: ['барабанщик', 'ударник'] },
  { aliases: ['вокалист', 'певец', 'певца', 'вокал', 'singer', 'бэк вокал', 'бэквокал', 'бэк вокалист'], targets: ['вокалист', 'вокалистка'] },
  { aliases: ['вокалистка', 'певица', 'бэк вокалистка', 'солистка'], targets: ['вокалистка', 'вокалист'] },
  { aliases: ['рэпер', 'рэперша', 'репер', 'mc'], targets: ['вокалист', 'вокалистка'], genres: ['рэп', 'хип хоп'] },
  { aliases: ['гитарист', 'гитаристка', 'гитара', 'гитарные партии', 'электрогитара', 'guitarist', 'на гитаре'], targets: ['гитарист'] },
  { aliases: ['басист', 'басистка', 'бас гитарист', 'бас гитаристка', 'бас гитара', 'бас', 'bassist'], targets: ['басист', 'бас гитарист'], fallback: ['гитарист'] },
  { aliases: ['контрабасист', 'контрабас'], targets: ['контрабасист'] },
  { aliases: ['клавишник', 'клавишница', 'клавишные', 'клавиши', 'синтезатор', 'keys'], targets: ['клавишник', 'пианист'] },
  { aliases: ['пианист', 'пианистка', 'фортепиано', 'пианино', 'рояль', 'аккомпаниатор', 'концертмейстер'], targets: ['пианист', 'клавишник'] },
  { aliases: ['струнный квартет', 'струнное трио', 'струнные'], targets: ['скрипач', 'виолончелист'] },
  { aliases: ['звукорежиссер', 'звукорежиссерка', 'звукарь', 'звукач', 'звуковик', 'звукоинженер', 'саунд инженер', 'sound engineer', 'звукооператор'], targets: ['звукорежиссер', 'звукооператор'], fallback: ['инженер записи'] },
  { aliases: ['сведение', 'свести', 'свести трек', 'сводить', 'сведет', 'сведи', 'микс', 'миксинг', 'mixing', 'микширование'], targets: ['звукорежиссер', 'микс инженер'], services: ['сведение', 'микширование'] },
  { aliases: ['мастеринг', 'mastering'], targets: ['звукорежиссер', 'мастеринг инженер'], services: ['мастеринг'] },
  { aliases: ['тюнинг', 'тюнинг вокала', 'тюн вокала', 'выровнять вокал'], targets: ['звукорежиссер'], services: ['тюнинг вокала'] },
  { aliases: ['запись вокала', 'записать вокал'], targets: ['звукорежиссер', 'инженер записи'], services: ['запись вокала'] },
  { aliases: ['студия звукозаписи', 'студийная запись', 'запись на студии', 'записать трек', 'запись трека'], targets: ['звукорежиссер', 'инженер записи'], services: ['запись музыкальных инструментов', 'студийная запись', 'запись в студии'] },
  { aliases: ['аранжировщик', 'аранжировщица', 'аранжировка', 'аранжировки', 'arrangement'], targets: ['аранжировщик'], services: ['аранжировка'] },
  { aliases: ['битмейкер', 'битмэйкер', 'бит', 'beatmaker', 'минус', 'минусовка', 'написать бит'], targets: ['битмейкер'], services: ['написание бита', 'создание битов'] },
  { aliases: ['продюсер', 'producer', 'продюсирование', 'продакшн', 'продакшен'], targets: ['продюсер'], services: ['продюсирование'] },
  { aliases: ['сессионный музыкант', 'сессионщик', 'сессионник', 'session musician'], targets: ['сессионный музыкант'], fallback: ['мультиинструменталист'] },
  { aliases: ['диджей', 'ди джей', 'dj', 'диско жокей'], targets: ['диджей'] },
  { aliases: ['композитор', 'написать музыку', 'написание музыки'], targets: ['композитор'], services: ['написание мелодии', 'композиция'] },
  { aliases: ['сонграйтер', 'автор песен', 'автор песни', 'написать песню', 'songwriter'], targets: ['сонграйтер'], fallback: ['композитор'] },
  { aliases: ['автор текстов', 'автор текста', 'текстовик', 'написать текст', 'поэт песенник', 'лирик'], targets: ['автор текстов', 'лирик'], services: ['написание текста'] },
  { aliases: ['топлайнер', 'топлайн'], targets: ['топлайнер'] },
  { aliases: ['саксофонист', 'саксофонистка', 'саксофон', 'сакс'], targets: ['саксофонист'] },
  { aliases: ['скрипач', 'скрипачка', 'скрипка'], targets: ['скрипач'] },
  { aliases: ['виолончелист', 'виолончелистка', 'виолончель'], targets: ['виолончелист'] },
  { aliases: ['трубач', 'труба'], targets: ['трубач'] },
  { aliases: ['тромбонист', 'тромбон'], targets: ['тромбонист'] },
  { aliases: ['флейтист', 'флейтистка', 'флейта'], targets: ['флейтист'] },
  { aliases: ['кларнетист', 'кларнет'], targets: ['кларнетист'] },
  { aliases: ['аккордеонист', 'аккордеон'], targets: ['аккордеонист'] },
  { aliases: ['баянист', 'баян'], targets: ['баянист'] },
  { aliases: ['арфист', 'арфистка', 'арфа'], targets: ['арфист'] },
  { aliases: ['перкуссионист', 'перкуссия', 'перкашн', 'кахон'], targets: ['перкуссионист'] },
  { aliases: ['духовик', 'духовики', 'духовая секция', 'духовые'], targets: ['духовик'], fallback: ['саксофонист', 'трубач', 'тромбонист'] },
  { aliases: ['саунд дизайнер', 'саунд дизайн', 'sound design', 'sound designer'], targets: ['саунд дизайнер'] },
  { aliases: ['видеограф', 'видеооператор', 'видеосъемка', 'снять видео', 'видео съемка'], targets: ['видеограф'] },
  { aliases: ['клип', 'снять клип', 'клипмейкер', 'режиссер клипа', 'съемка клипа'], targets: ['режиссер музыкальных клипов'], fallback: ['видеограф'] },
  { aliases: ['фотограф', 'фотосессия', 'фотосъемка', 'фотосет'], targets: ['фотограф'] },
  { aliases: ['обложка', 'дизайн обложки', 'обложка для релиза', 'обложка трека'], targets: ['графический дизайнер'], services: ['дизайн обложки'] },
  { aliases: ['светорежиссер', 'художник по свету', 'световик', 'свет на концерт'], targets: ['художник по свету'] },
  { aliases: ['уроки вокала', 'педагог по вокалу', 'учитель вокала', 'учитель по вокалу', 'преподаватель по вокалу', 'занятия вокалом', 'научиться петь'], targets: ['преподаватель вокала'] },
  { aliases: ['уроки гитары', 'учитель гитары', 'учитель по гитаре', 'преподаватель по гитаре', 'педагог по гитаре', 'уроки игры на гитаре', 'научиться играть на гитаре'], targets: ['преподаватель гитары'] },
  { aliases: ['уроки фортепиано', 'уроки игры на фортепиано', 'учитель фортепиано', 'учитель по фортепиано'], targets: ['преподаватель фортепиано'] },
  { aliases: ['уроки барабанов', 'уроки игры на барабанах', 'учитель по барабанам'], targets: ['преподаватель барабанов'] },
  { aliases: ['менеджер артиста', 'директор артиста', 'менеджер группы'], targets: ['артист менеджер', 'музыкальный менеджер'] },
  { aliases: ['smm', 'смм', 'смм щик', 'smm менеджер', 'продвижение в соцсетях'], targets: ['smm менеджер'] },
  { aliases: ['пиар', 'pr', 'пиарщик'], targets: ['pr менеджер'] },
  { aliases: ['танцор', 'танцовщица', 'танцоры', 'бэк дансер', 'подтанцовка'], targets: ['танцор'] },
];

interface GenreRule { aliases: string[]; targets: string[]; fallback?: string[] }

export const GENRE_RULES: GenreRule[] = [
  { aliases: ['метал', 'металл', 'metal', 'хеви метал', 'хэви метал', 'металкор', 'metalcore', 'дэт метал', 'блэк метал', 'трэш метал'], targets: ['метал', 'металл'] },
  { aliases: ['поп рок'], targets: ['поп рок'], fallback: ['поп', 'рок'] },
  { aliases: ['рок', 'rock', 'рок н ролл', 'рокнролл', 'хард рок'], targets: ['рок'] },
  { aliases: ['панк', 'punk', 'панк рок'], targets: ['панк'], fallback: ['рок'] },
  { aliases: ['поп', 'pop', 'попса', 'поп музыка', 'попсовый'], targets: ['поп'] },
  { aliases: ['хип хоп', 'хипхоп', 'hip hop', 'рэп', 'реп', 'rap'], targets: ['хип хоп', 'рэп'] },
  { aliases: ['джаз', 'jazz', 'джазовый'], targets: ['джаз'] },
  { aliases: ['электроника', 'электронная музыка', 'электронный', 'electronic', 'edm'], targets: ['электроника', 'электронная музыка'] },
  { aliases: ['классика', 'классическая музыка', 'классический', 'classical', 'академическая музыка'], targets: ['классика', 'классическая музыка'] },
  { aliases: ['r&b', 'rnb', 'рнб', 'ритм н блюз', 'соул', 'soul'], targets: ['r&b', 'soul', 'соул'] },
  { aliases: ['инди', 'indie'], targets: ['инди'] },
  { aliases: ['альтернатива', 'альтернативный', 'alternative'], targets: ['альтернатива'] },
  { aliases: ['фолк', 'folk', 'фолковый', 'народная музыка', 'этно'], targets: ['фолк', 'этно'] },
  { aliases: ['блюз', 'blues'], targets: ['блюз'] },
  { aliases: ['регги', 'reggae'], targets: ['регги'] },
  { aliases: ['латино', 'латина', 'латинская музыка', 'latin', 'сальса', 'бачата'], targets: ['латинская музыка', 'латино'] },
  { aliases: ['эмбиент', 'ambient'], targets: ['эмбиент'] },
  { aliases: ['оркестровая музыка', 'оркестровый'], targets: ['оркестровая'] },
  { aliases: ['кантри', 'country'], targets: ['кантри'] },
  { aliases: ['фанк', 'funk', 'фанковый'], targets: ['фанк'] },
  { aliases: ['диско', 'disco'], targets: ['диско'] },
  { aliases: ['хаус', 'house'], targets: ['хаус'] },
  { aliases: ['техно', 'techno'], targets: ['техно'] },
  { aliases: ['дабстеп', 'dubstep'], targets: ['дабстеп'] },
  { aliases: ['трэп', 'трап', 'trap'], targets: ['трэп'] },
  { aliases: ['шансон'], targets: ['шансон'] },
  { aliases: ['детская музыка', 'детские песни'], targets: ['детская музыка'] },
];

/** Разговорные названия городов → название в справочнике City. */
const CITY_ALIASES: Array<{ aliases: string[]; target: string }> = [
  { aliases: ['питер', 'спб', 'петербург', 'санкт петербург'], target: 'санкт петербург' },
  { aliases: ['мск'], target: 'москва' },
  { aliases: ['екб', 'екат'], target: 'екатеринбург' },
  { aliases: ['новосиб'], target: 'новосибирск' },
  { aliases: ['ростов'], target: 'ростов на дону' },
  { aliases: ['орле', 'орла'], target: 'орел' },
];

const REMOTE_ALIASES = [
  'онлайн', 'online', 'удаленно', 'удаленка', 'удаленный', 'удаленная', 'дистанционно', 'дистанционный',
  'дистанционная', 'remote', 'по сети', 'через интернет', 'по интернету', 'из дома', 'любой город', 'в любом городе',
];

interface EventRule { key: string; aliases: string[] }
const EVENT_RULES: EventRule[] = [
  { key: 'concert', aliases: ['концерт', 'выступление', 'выступить', 'гиг', 'gig', 'лайв', 'live', 'живое выступление', 'сыграть концерт'] },
  { key: 'wedding', aliases: ['свадьба', 'свадебный'] },
  { key: 'corporate', aliases: ['корпоратив', 'корпоративный'] },
  { key: 'festival', aliases: ['фестиваль', 'фест'] },
  { key: 'tour', aliases: ['тур', 'гастроли', 'турне'] },
  { key: 'rehearsal', aliases: ['репетиция', 'репетиции', 'репетировать'] },
  { key: 'recording', aliases: ['запись', 'записать', 'студия', 'сессионный', 'сессионная', 'сессия'] },
  { key: 'party', aliases: ['день рождения', 'праздник', 'вечеринка', 'пати', 'party'] },
  { key: 'band', aliases: ['в группу', 'в коллектив', 'в команду', 'в состав', 'кавер группа', 'кавербэнд', 'группа', 'коллектив'] },
];

const EVENT_TITLE: Record<string, string> = {
  concert: 'на концерт', wedding: 'на свадьбу', corporate: 'на корпоратив', festival: 'на фестиваль',
  tour: 'в тур', rehearsal: 'на репетиции', recording: 'на запись', party: 'на праздник', band: 'в группу',
};

/** Предпочтительные услуги каталога для контекста (подстроки нормализованных названий). */
const EVENT_SERVICE_PREF: Record<string, string[]> = {
  concert: ['живое выступление', 'выступлен', 'концерт'],
  wedding: ['живое выступление', 'выступлен', 'концерт'],
  corporate: ['живое выступление', 'выступлен', 'концерт'],
  festival: ['живое выступление', 'выступлен', 'концерт'],
  tour: ['живое выступление', 'выступлен', 'концерт'],
  party: ['живое выступление', 'выступлен', 'dj сет'],
  recording: ['запись', 'сессионн'],
};

// Слова-связки и «вода» — не считаются нераспознанными.
const STOP_WORDS = new Set([
  'нужен', 'нужна', 'нужно', 'нужны', 'ищу', 'ищем', 'ищется', 'ищут', 'требуется', 'требуются', 'хочу', 'хотим',
  'надо', 'необходим', 'необходима', 'необходимо', 'кто', 'может', 'сможет', 'помочь', 'помощь', 'сделать', 'сыграть',
  'играть', 'сыграет', 'на', 'в', 'во', 'для', 'по', 'с', 'со', 'и', 'или', 'а', 'к', 'ко', 'от', 'до', 'за', 'из',
  'у', 'о', 'об', 'при', 'без', 'не', 'но', 'же', 'ли', 'бы', 'мы', 'я', 'нам', 'мне', 'нас', 'наш', 'наша', 'наше',
  'наши', 'нашу', 'нашей', 'нашего', 'мой', 'моя', 'мое', 'мои', 'мою', 'моей', 'моего', 'это', 'этот', 'эта', 'эти',
  'этой', 'тот', 'та', 'то', 'те', 'вас', 'вам', 'вы', 'срочно', 'очень', 'хороший', 'хорошего', 'хорошая', 'хорошую',
  'опытный', 'опытного', 'опытная', 'опытную', 'профессиональный', 'профессионального', 'профессионал', 'профи',
  'музыкант', 'музыканта', 'музыканты', 'музыкантов', 'специалист', 'специалиста', 'исполнитель', 'исполнителя',
  'исполнители', 'исполнителей', 'рублей', 'руб', 'р', 'тыс', 'тысяч', 'бюджет', 'бюджетом', 'оплата', 'оплатой',
  'гонорар', 'плачу', 'заплачу', 'цена', 'стоимость', 'примерно', 'около', 'город', 'городе', 'г', 'есть', 'будет',
  'пожалуйста', 'плз', 'всем', 'привет', 'здравствуйте', 'добрый', 'вечер', 'вечером', 'утром', 'днем', 'ночью',
  'часа', 'часов', 'час', 'минут', 'сет', 'сета', 'программа', 'программу', 'трек', 'трека', 'треки', 'треков',
  'песня', 'песню', 'песни', 'песен', 'альбом', 'альбома', 'сингл', 'сингла', 'релиз', 'релиза', 'ep', 'один',
  'одна', 'одного', 'одну', 'два', 'две', 'три', 'человек', 'человека', 'года', 'год', 'году', 'числа', 'число',
  'неделе', 'неделю', 'недели', 'дату', 'дата', 'даты', 'срок', 'сроки', 'туда', 'там', 'тут', 'здесь', 'чтобы',
  'который', 'которая', 'которые', 'кто-то', 'кого', 'нибудь', 'какой', 'какая', 'также', 'еще', 'уже', 'все',
  'весь', 'вся', 'свой', 'свою', 'своей', 'своего', 'партии', 'партию', 'партий', 'партия', 'кавер', 'каверы',
  'каверов', 'репертуар', 'репертуаром', 'живой', 'живая', 'живую', 'живых', 'группа', 'группы', 'группе',
  'группу', 'коллектив', 'коллектива', 'состав', 'команду', 'команда', 'проект', 'проекта', 'проект', 'работа',
  'работу', 'работы', 'поработать', 'сотрудничество', 'стиле', 'стиль', 'жанре', 'жанр', 'жанра', 'формат',
  'формате', 'игры', 'игра', 'играет', 'играющий', 'играющего', 'умеющий', 'умеющего', 'желательно', 'обязательно',
  'можно', 'спасибо', 'бесплатно', 'подходящего', 'подходящий', 'исполнителя', 'заказ', 'заказа', 'запрос',
  'заказать', 'сделает', 'сделать', 'раза', 'раз', 'урок', 'уроки', 'уроков', 'занятия', 'человек', 'людей',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Компиляция словарей (один раз на версию справочников)
// ─────────────────────────────────────────────────────────────────────────────

type AliasKind = 'profession' | 'genre' | 'city' | 'event' | 'remote';

interface AliasEntry {
  kind: AliasKind;
  words: string[];
  exactOnly: boolean;
  /** profession/genre: id; city: название; event: ключ. */
  ids: string[];
  /** Подпись профессии для заголовка. */
  label?: string;
  services?: string[];
  genreIds?: string[];
  chars: number;
}

interface CompiledDict {
  entries: AliasEntry[];
  professionById: Map<string, RefItem>;
  genreById: Map<string, RefItem>;
  cityByNorm: Map<string, RefItem>;
  /** Нормализованный вариант названия профессии → { id, подпись }. */
  professionAlias: Map<string, { id: string; display: string }[]>;
}

/** «Вокалист / Вокалистка», «Диджей (DJ)» → варианты названия с исходным написанием. */
export function professionNameVariants(name: string): string[] {
  const out: string[] = [];
  const paren = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(name))) {
    const inner = m[1].trim();
    if (inner && !inner.includes('/')) out.push(inner);
  }
  const main = name.replace(/\([^)]*\)/g, ' ');
  // «Вокалист / Вокалистка», двуязычные «Метал, Metal» — каждый вариант отдельно
  for (const part of main.split(/[\/,]/)) {
    const p = part.trim().replace(/\s+/g, ' ');
    if (p) out.push(p);
  }
  return [...new Set(out)].filter((v) => normalize(v).replace(/[^a-zа-я0-9]/g, '').length >= 2);
}

function joinWords(s: string): string {
  return phraseWords(s).join(' ');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const compiledCache = new WeakMap<RequestDictionaries, CompiledDict>();

function compile(dict: RequestDictionaries): CompiledDict {
  const cached = compiledCache.get(dict);
  if (cached) return cached;

  const entries: AliasEntry[] = [];
  const professionById = new Map(dict.professions.map((p) => [p.id, p]));
  const genreById = new Map(dict.genres.map((g) => [g.id, g]));
  const cityByNorm = new Map(dict.cities.map((c) => [joinWords(c.name), c]));

  // Профессии из БД: каждый вариант названия — отдельная фраза.
  const professionAlias = new Map<string, { id: string; display: string }[]>();
  for (const p of dict.professions) {
    for (const v of professionNameVariants(p.name)) {
      const key = joinWords(v);
      if (!key) continue;
      const list = professionAlias.get(key) ?? [];
      if (!list.some((x) => x.id === p.id)) list.push({ id: p.id, display: v });
      professionAlias.set(key, list);
    }
  }
  const resolveProfessionTargets = (targets: string[]) => {
    const ids: string[] = [];
    let label: string | undefined;
    for (const t of targets) {
      for (const hit of professionAlias.get(joinWords(t)) ?? []) {
        if (!ids.includes(hit.id)) ids.push(hit.id);
        if (!label) label = hit.display;
      }
    }
    return { ids, label };
  };

  const genreAlias = new Map<string, string[]>();
  for (const g of dict.genres) {
    // В БД жанры двуязычные через запятую: «Метал, Metal», «Хип-хоп / Рэп, Hip-Hop / Rap»
    const variants = [g.name, ...g.name.split(/[\/,]/)].map((v) => joinWords(v)).filter(Boolean);
    for (const key of new Set(variants)) {
      const list = genreAlias.get(key) ?? [];
      if (!list.includes(g.id)) list.push(g.id);
      genreAlias.set(key, list);
    }
  }
  const resolveGenreTargets = (targets: string[]) => {
    const ids: string[] = [];
    for (const t of targets) for (const id of genreAlias.get(joinWords(t)) ?? []) if (!ids.includes(id)) ids.push(id);
    return ids;
  };

  const push = (e: Omit<AliasEntry, 'chars'>) => {
    if (e.words.length === 0 || e.ids.length === 0) return;
    entries.push({ ...e, chars: e.words.join(' ').length });
  };

  for (const rule of PROFESSION_RULES) {
    let { ids, label } = resolveProfessionTargets(rule.targets);
    if (ids.length === 0 && rule.fallback) {
      // Профессии нет в справочнике — подбираем по смежной, но в заголовке
      // оставляем то, что искал заказчик («Басист», а не «Гитарист»).
      ({ ids } = resolveProfessionTargets(rule.fallback));
      label = rule.aliases[0];
    }
    if (ids.length === 0) continue;
    const genreIds = rule.genres ? resolveGenreTargets(rule.genres) : undefined;
    for (const a of rule.aliases) {
      push({ kind: 'profession', words: phraseWords(a), exactOnly: false, ids, label, services: rule.services, genreIds });
    }
  }
  for (const [key, hits] of professionAlias) {
    const words = key.split(' ');
    push({
      kind: 'profession',
      words,
      exactOnly: words.length === 1 && EXACT_ONLY_ALIASES.has(key),
      ids: hits.map((h) => h.id),
      label: hits[0].display,
    });
  }

  for (const rule of GENRE_RULES) {
    let ids = resolveGenreTargets(rule.targets);
    if (ids.length === 0 && rule.fallback) ids = resolveGenreTargets(rule.fallback);
    for (const a of rule.aliases) push({ kind: 'genre', words: phraseWords(a), exactOnly: false, ids });
  }
  for (const [key, ids] of genreAlias) push({ kind: 'genre', words: key.split(' '), exactOnly: false, ids });

  for (const [key, c] of cityByNorm) push({ kind: 'city', words: key.split(' '), exactOnly: false, ids: [c.name] });
  for (const ca of CITY_ALIASES) {
    const c = cityByNorm.get(ca.target);
    if (!c) continue;
    for (const a of ca.aliases) push({ kind: 'city', words: phraseWords(a), exactOnly: false, ids: [c.name] });
  }

  for (const ev of EVENT_RULES) {
    for (const a of ev.aliases) push({ kind: 'event', words: phraseWords(a), exactOnly: false, ids: [ev.key] });
  }
  for (const a of REMOTE_ALIASES) push({ kind: 'remote', words: phraseWords(a), exactOnly: false, ids: ['remote'] });

  // Длинные фразы раньше коротких: «запись вокала» раньше «вокал», «бас гитара» раньше «гитара».
  const kindOrder: Record<AliasKind, number> = { remote: 0, profession: 1, genre: 2, city: 3, event: 4 };
  entries.sort((a, b) => b.words.length - a.words.length || b.chars - a.chars || kindOrder[a.kind] - kindOrder[b.kind]);

  const compiled: CompiledDict = { entries, professionById, genreById, cityByNorm, professionAlias };
  compiledCache.set(dict, compiled);
  return compiled;
}

// ─────────────────────────────────────────────────────────────────────────────
// Даты (МСК)
// ─────────────────────────────────────────────────────────────────────────────

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function mskToday(now: Date): CalendarDay {
  const t = new Date(now.getTime() + MSK_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function addDays(day: CalendarDay, n: number): CalendarDay {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function addMonths(day: CalendarDay, n: number): CalendarDay {
  const t = new Date(Date.UTC(day.y, day.m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: Math.min(day.d, last) };
}

/** Проверенный календарный день или null (31.02 → null). */
function makeDay(y: number, m: number, d: number): CalendarDay | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return parseCalendarDay(iso);
}

/** День без года → ближайший будущий (сегодня включительно). */
function nearestFutureDay(m: number, d: number, now: Date): CalendarDay | null {
  const today = mskToday(now);
  for (const y of [today.y, today.y + 1]) {
    const day = makeDay(y, m, d);
    if (day && endOfDayMsk(day).getTime() >= now.getTime()) return day;
  }
  return null;
}

const MONTH_FORMS: Record<string, number> = {};
([
  [1, ['январь', 'января', 'январе', 'янв']],
  [2, ['февраль', 'февраля', 'феврале', 'фев', 'февр']],
  [3, ['март', 'марта', 'марте', 'мар']],
  [4, ['апрель', 'апреля', 'апреле', 'апр']],
  [5, ['май', 'мая', 'мае']],
  [6, ['июнь', 'июня', 'июне', 'июн']],
  [7, ['июль', 'июля', 'июле', 'июл']],
  [8, ['август', 'августа', 'августе', 'авг']],
  [9, ['сентябрь', 'сентября', 'сентябре', 'сен', 'сент']],
  [10, ['октябрь', 'октября', 'октябре', 'окт']],
  [11, ['ноябрь', 'ноября', 'ноябре', 'ноя', 'нояб']],
  [12, ['декабрь', 'декабря', 'декабре', 'дек']],
] as Array<[number, string[]]>).forEach(([n, forms]) => forms.forEach((f) => { MONTH_FORMS[f] = n; }));

const MONTH_PREPOSITIONAL: Record<string, string> = {
  январе: 'в январе', феврале: 'в феврале', марте: 'в марте', апреле: 'в апреле', мае: 'в мае', июне: 'в июне',
  июле: 'в июле', августе: 'в августе', сентябре: 'в сентябре', октябре: 'в октябре', ноябре: 'в ноябре', декабре: 'в декабре',
};

const WEEKDAYS: Record<string, number> = {
  понедельник: 1, вторник: 2, среду: 3, среда: 3, четверг: 4, пятницу: 5, пятница: 5, субботу: 6, суббота: 6, воскресенье: 7,
};

const SMALL_NUMBERS: Record<string, number> = { пару: 2, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7 };

// ─────────────────────────────────────────────────────────────────────────────
// Работа с «маскируемой» строкой
// ─────────────────────────────────────────────────────────────────────────────

class Work {
  s: string;
  constructor(s: string) { this.s = s; }
  /** Заменяет найденное на «|» — граница фразы, повторно не разбирается. */
  mask(start: number, end: number) {
    this.s = this.s.slice(0, start) + '|'.repeat(end - start) + this.s.slice(end);
  }
  /** Перебор совпадений regex (флаг g) с возможностью замаскировать каждое. */
  each(re: RegExp, fn: (m: RegExpExecArray) => boolean | void) {
    re.lastIndex = 0;
    const found: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.s))) {
      found.push(m);
      if (m[0].length === 0) re.lastIndex++;
    }
    for (const mm of found) {
      // Пропустить, если область уже замаскирована предыдущим совпадением.
      if (this.s.slice(mm.index, mm.index + mm[0].length).includes('|')) continue;
      if (fn(mm) === true) this.mask(mm.index, mm.index + mm[0].length);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Бюджет
// ─────────────────────────────────────────────────────────────────────────────

const NUM = String.raw`(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)`;
// Множитель: «10к», «10k» — только слитно; «тыс», «т.р.», «млн» — можно через пробел.
const MULT = String.raw`(?:(к|k)(?![а-яa-z])|\s*(тысяч[аи]?|тыс|т\.\s?р|тр|млн|миллион(?:а|ов)?)(?![а-яa-z])\.?)?`;
const CUR = String.raw`(?:\s*(₽|руб(?:л(?:ей|я|ь))?\.?|р\.|р(?![а-яa-z])|rub))?`;
const AMOUNT = `${NUM}${MULT}${CUR}`;
// Число, за которым идёт «не денежная» единица («2 часа», «300 человек»).
const NON_MONEY_AFTER = /^\s*(?:-?х\s+)?(?:дн|день|дня|дней|час|минут|мин(?![а-я])|сек|недел|месяц|год|лет|трек|песн|человек|чел(?![а-я])|гост|зрител|слушател|подписчик|раз(?![а-я])|штук|шт(?![а-я])|сет|%|процент|участник|мест|композиц|номер|минус)/;

function parseAmount(numStr: string, mult?: string): number | null {
  let n: number;
  if (/^\d{1,3}(?:[ .]\d{3})+$/.test(numStr)) n = Number(numStr.replace(/[ .]/g, ''));
  else n = Number(numStr.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const u = (mult || '').replace(/\s/g, '');
  if (/^(тыс|т\.?р|тр|к|k)/.test(u)) n *= 1000;
  else if (/^(млн|миллион)/.test(u)) n *= 1_000_000;
  n = Math.round(n);
  if (n < 0 || n > 100_000_000) return null;
  return n;
}

interface BudgetState { from: number | null; to: number | null; free: boolean }

function setSingle(b: BudgetState, value: number, kind: 'from' | 'to') {
  if (kind === 'from') { if (b.from == null) b.from = value; }
  else if (b.to == null) b.to = value;
}

function extractBudget(w: Work, b: BudgetState, phase: 'units' | 'keywords') {
  if (phase === 'units') {
    w.each(/(?<![а-яa-z])(бесплатно|безвозмездно|за спасибо|без оплаты|без гонорара|бесплатн[а-я]*|по бартеру|бартер|free)(?![а-яa-z])/g, () => {
      b.free = true;
      return true;
    });

    // Диапазон «от 5 до 15 тыс», «5-15к», «от 5000 до 15000 руб».
    w.each(new RegExp(String.raw`(?<![\dа-яa-z])(?:от\s*)?${AMOUNT}\s*(?:-|до|по)\s*${AMOUNT}`, 'g'), (m) => {
      const [, n1, k1, t1, c1, n2, k2, t2, c2] = m;
      const mult1 = k1 || t1;
      const mult2 = k2 || t2;
      const hasMoney = !!(mult1 || mult2 || c1 || c2);
      const after = w.s.slice(m.index + m[0].length);
      if (!hasMoney || NON_MONEY_AFTER.test(after)) return false;
      let a = parseAmount(n1, mult1);
      let z = parseAmount(n2, mult2);
      if (a == null || z == null) return false;
      // Множитель второй границы распространяется на первую («от 5 до 15 тыс»).
      if (!mult1 && mult2 && a < 1000) a = parseAmount(n1, mult2)!;
      if (mult1 && !mult2 && z < 1000) z = parseAmount(n2, mult1)!;
      if (a > z) [a, z] = [z, a];
      b.from = a;
      b.to = z;
      return true;
    });

    // Сумма с явной единицей: «10к», «15 000 ₽», «до 30 тыс», «от 5000 руб».
    w.each(new RegExp(String.raw`(?<![\dа-яa-z])(?:(от|до|не больше|не более|максимум|в пределах)\s*)?${AMOUNT}`, 'g'), (m) => {
      const [, prep, n, k, t, c] = m;
      if (!(k || t || c)) return false;
      const after = w.s.slice(m.index + m[0].length);
      if (NON_MONEY_AFTER.test(after)) return false;
      const v = parseAmount(n, k || t);
      if (v == null) return false;
      setSingle(b, v, prep === 'от' ? 'from' : 'to');
      return true;
    });
    return;
  }

  // Без единиц — только с денежным словом рядом: «бюджет 10000», «за 5000», «до 10 000».
  w.each(new RegExp(String.raw`(?<![а-яa-z])(бюджет[а-я]*|оплат[а-я]*|плачу|заплачу|гонорар[а-я]*|цен[аеуы]|стоимост[а-я]*|за|до|от|не больше|не более|максимум|в пределах|около|примерно|порядка)\s*:?\s*(?:(до|от)\s*)?${NUM}(?![\d.,]*\d)`, 'g'), (m) => {
    const [, kw, prep, n] = m;
    const after = w.s.slice(m.index + m[0].length);
    if (NON_MONEY_AFTER.test(after)) return false;
    let v = parseAmount(n);
    if (v == null) return false;
    const isBudgetWord = /^(бюджет|оплат|плачу|заплачу|гонорар|цен|стоимост)/.test(kw);
    if (!isBudgetWord && v < 100) return false;
    // «бюджет 15» в разговорной речи — 15 тысяч.
    if (isBudgetWord && v < 100) v *= 1000;
    const kind = (prep || kw) === 'от' ? 'from' : 'to';
    setSingle(b, v, kind);
    return true;
  });

  // Число с разрядами «10 000» — почти всегда деньги (но не хвост телефона/списка цифр).
  w.each(new RegExp(String.raw`(?<![\d.,+])(\d{1,3}(?:[ ]\d{3})+)(?![\d.,]*\d)`, 'g'), (m) => {
    const after = w.s.slice(m.index + m[0].length);
    if (NON_MONEY_AFTER.test(after) || /^\s*\d/.test(after)) return false;
    const v = parseAmount(m[1]);
    if (v == null || v < 1000 || v > 10_000_000) return false;
    setSingle(b, v, 'to');
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Даты
// ─────────────────────────────────────────────────────────────────────────────

interface DateState { day: CalendarDay | null; hint: string | null }

function extractDates(w: Work, ds: DateState, now: Date) {
  const today = mskToday(now);
  const setDay = (day: CalendarDay | null) => {
    if (!day || ds.day) return !!day;
    if (endOfDayMsk(day).getTime() < now.getTime()) return false;
    ds.day = day;
    return true;
  };

  // «20 ноября», «20-го ноября 2026», «1 янв.»
  w.each(/(?<![\d.,])(\d{1,2})(?:-?(?:го|е|ое))?\s+([а-я]{3,8})\.?(?:\s+(\d{4})(?:\s*(?:г\.?|года?))?)?(?![а-я])/g, (m) => {
    const month = MONTH_FORMS[m[2]];
    if (!month) return false;
    const d = Number(m[1]);
    const day = m[3] ? makeDay(Number(m[3]), month, d) : nearestFutureDay(month, d, now);
    if (!day) return false;
    setDay(day);
    return true;
  });

  // «20.11», «20.11.26», «20/11/2026»
  w.each(/(?<![\d.,])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d.,]*\d)(?!\s*(?:к|k|тыс|руб|р\.|₽))/g, (m) => {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    let day: CalendarDay | null;
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      day = makeDay(y, mo, d);
    } else {
      day = nearestFutureDay(mo, d, now);
    }
    if (!day) return false;
    setDay(day);
    return true;
  });

  // «сегодня», «завтра», «послезавтра»
  w.each(/(?<![а-я])(сегодня|послезавтра|завтра)(?![а-я])/g, (m) => {
    const n = m[1] === 'сегодня' ? 0 : m[1] === 'завтра' ? 1 : 2;
    setDay(addDays(today, n));
    return true;
  });

  // «через 3 дня», «через неделю», «через пару недель», «через месяц»
  w.each(/(?<![а-я])через\s+(?:(\d{1,2}|пару|два|две|три|четыре|пять|шесть|семь)\s+)?(дн[а-я]*|день|недел[а-я]*|месяц[а-я]*)(?![а-я])/g, (m) => {
    const raw = m[1];
    const n = raw ? (/^\d+$/.test(raw) ? Number(raw) : SMALL_NUMBERS[raw] ?? 1) : 1;
    const unit = m[2];
    const day = unit.startsWith('месяц') ? addMonths(today, n) : addDays(today, unit.startsWith('недел') ? n * 7 : n);
    setDay(day);
    return true;
  });

  // «в субботу», «в эту пятницу», «в следующий вторник»
  w.each(/(?<![а-я])(?:(?:в|во)\s+)?(?:(эту|этот|это|ближайш(?:ую|ий|ее)|следующ(?:ую|ий|ее)|след\.?)\s+)?(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)(?![а-я])/g, (m) => {
    const target = WEEKDAYS[m[2]];
    const dow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
    const todayIso = dow === 0 ? 7 : dow;
    let diff = (target - todayIso + 7) % 7;
    const mod = m[1] || '';
    if (diff === 0 && !/^(эт)/.test(mod)) diff = 7;
    if (/^след/.test(mod) && diff <= 7 - todayIso) diff += 7;
    setDay(addDays(today, diff));
    return true;
  });

  // Срок без точной даты.
  const hintRes: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/(?<![а-я])на\s+(следующей|след\.?|будущей|этой)\s+неделе(?![а-я])/g, (m) => (m[1] === 'этой' ? 'на этой неделе' : 'на следующей неделе')],
    [/(?<![а-я])(?:в\s+течени[ея]\s+недели|на\s+неделе)(?![а-я])/g, () => 'в течение недели'],
    [/(?<![а-я])(?:на\s+выходных|в\s+(?:эти|ближайшие|следующие)\s+выходные)(?![а-я])/g, () => 'на выходных'],
    [/(?<![а-я])в\s+ближайш(?:ее\s+время|ие\s+дни)(?![а-я])/g, () => 'в ближайшее время'],
    [/(?<![а-я])в\s+(этом|следующем)\s+месяце(?![а-я])/g, (m) => (m[1] === 'этом' ? 'в этом месяце' : 'в следующем месяце')],
    [/(?<![а-я])в\s+(январе|феврале|марте|апреле|мае|июне|июле|августе|сентябре|октябре|ноябре|декабре)(?![а-я])/g, (m) => MONTH_PREPOSITIONAL[m[1]]],
    [/(?<![а-я])(срочно|как можно скорее|асап|asap)(?![а-я])/g, () => 'срочно'],
  ];
  for (const [re, label] of hintRes) {
    w.each(re, (m) => {
      if (!ds.hint) ds.hint = label(m);
      return true;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Токены и словарные фразы
// ─────────────────────────────────────────────────────────────────────────────

interface Tok { t: string; start: number; end: number; used: boolean; breakBefore: boolean }

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = new RegExp(TOKEN_RE_G.source, 'g');
  let m: RegExpExecArray | null;
  let prevEnd = 0;
  while ((m = re.exec(s))) {
    const gap = s.slice(prevEnd, m.index);
    out.push({
      t: m[0],
      start: m.index,
      end: m.index + m[0].length,
      used: false,
      breakBefore: out.length === 0 || /[|,.;:!?()\n]/.test(gap),
    });
    prevEnd = m.index + m[0].length;
  }
  return out;
}

function matchAt(toks: Tok[], start: number, e: AliasEntry): boolean {
  for (let k = 0; k < e.words.length; k++) {
    const tk = toks[start + k];
    if (!tk || tk.used) return false;
    if (k > 0 && tk.breakBefore) return false;
    const w = e.words[k];
    // Падеж меняет окончание, а не начало: без общих двух первых букв совпадения нет.
    if (tk.t.charCodeAt(0) !== w.charCodeAt(0) || (w.length > 1 && tk.t.charCodeAt(1) !== w.charCodeAt(1))) return false;
    if (e.exactOnly ? !exactishMatches(tk.t, w) : !wordMatches(tk.t, w)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Публичный API разбора
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_REQUEST_TEXT = 1000;
export const ORDER_TITLE_MAX = 50;

export function emptyParsed(text = ''): ParsedRequest {
  return {
    professionIds: [], professionLabels: {}, genreIds: [], cityName: null, isRemote: false,
    date: null, dateHint: null, budgetFrom: null, budgetTo: null, isFree: false,
    serviceHints: [], eventKey: null, title: '', description: text.trim(), unknownTokens: [],
  };
}

/** Разбор фразы заказчика. Чистая функция: справочники и «сейчас» передаются явно. */
export function parseRequestText(text: string, dict: RequestDictionaries, now: Date = new Date()): ParsedRequest {
  const raw = String(text ?? '').slice(0, MAX_REQUEST_TEXT);
  const result = emptyParsed(raw);
  const cd = compile(dict);
  const w = new Work(normalize(raw));

  // Контакты не разбираем: телефон — не бюджет, «drummer@mail.ru» — не профессия.
  w.each(/(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, () => true);
  w.each(/[^\s|]+@[^\s|]+|https?:\/\/[^\s|]+|(?<![a-zа-я0-9])(?:t\.me|vk\.com|wa\.me)\/[^\s|]+|(?<![a-zа-я0-9])@[a-z0-9_]{3,}/g, () => true);

  const budget: BudgetState = { from: null, to: null, free: false };
  const dates: DateState = { day: null, hint: null };
  extractBudget(w, budget, 'units');
  extractDates(w, dates, now);
  extractBudget(w, budget, 'keywords');

  const toks = tokenize(w.s);
  const professionHits: Array<{ pos: number; ids: string[]; label?: string }> = [];
  const genreHits: Array<{ pos: number; ids: string[] }> = [];
  const cityHits: Array<{ pos: number; name: string }> = [];
  const eventHits: Array<{ pos: number; key: string }> = [];
  const serviceHints: string[] = [];

  for (const e of cd.entries) {
    for (let i = 0; i + e.words.length <= toks.length; i++) {
      if (!matchAt(toks, i, e)) continue;
      for (let k = 0; k < e.words.length; k++) toks[i + k].used = true;
      const pos = toks[i].start;
      if (e.kind === 'profession') {
        professionHits.push({ pos, ids: e.ids, label: e.label });
        for (const s of e.services ?? []) if (!serviceHints.includes(s)) serviceHints.push(s);
        if (e.genreIds?.length) genreHits.push({ pos, ids: e.genreIds });
      } else if (e.kind === 'genre') genreHits.push({ pos, ids: e.ids });
      else if (e.kind === 'city') cityHits.push({ pos, name: e.ids[0] });
      else if (e.kind === 'event') eventHits.push({ pos, key: e.ids[0] });
      else if (e.kind === 'remote') result.isRemote = true;
    }
  }

  // Порядок — как в тексте: первая названная профессия задаёт заголовок.
  professionHits.sort((a, b) => a.pos - b.pos);
  for (const h of professionHits) {
    for (const id of h.ids) {
      if (!result.professionIds.includes(id)) {
        result.professionIds.push(id);
        if (h.label) result.professionLabels[id] = capitalize(h.label);
      }
    }
  }
  genreHits.sort((a, b) => a.pos - b.pos);
  for (const h of genreHits) for (const id of h.ids) if (!result.genreIds.includes(id)) result.genreIds.push(id);
  cityHits.sort((a, b) => a.pos - b.pos);
  result.cityName = cityHits[0]?.name ?? null;
  eventHits.sort((a, b) => a.pos - b.pos);
  result.eventKey = eventHits[0]?.key ?? null;
  result.serviceHints = serviceHints;

  if (dates.day) result.date = endOfDayMsk(dates.day).toISOString();
  else result.dateHint = dates.hint;

  result.isFree = budget.free;
  if (budget.free) {
    result.budgetFrom = null;
    result.budgetTo = 0;
  } else {
    let { from, to } = budget;
    if (from != null && to != null && from > to) [from, to] = [to, from];
    result.budgetFrom = from;
    result.budgetTo = to;
  }

  result.unknownTokens = [...new Set(
    toks
      .filter((t) => !t.used && t.t.length >= 3 && !/^\d+$/.test(t.t) && !STOP_WORDS.has(t.t))
      .map((t) => t.t),
  )].slice(0, 10);

  result.title = buildTitle(result, dict, raw);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Заголовок, чипы, бюджет — общие для разбора и для применения правок
// ─────────────────────────────────────────────────────────────────────────────

export function formatRub(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatBudgetLabel(from: number | null, to: number | null, isFree = false): string | null {
  if (isFree || (from == null && to === 0)) return 'бесплатно';
  if (from != null && to != null) return from === to ? `${formatRub(to)} ₽` : `от ${formatRub(from)} до ${formatRub(to)} ₽`;
  if (to != null) return `до ${formatRub(to)} ₽`;
  if (from != null) return `от ${formatRub(from)} ₽`;
  return null;
}

/** ISO-момент → «ДД.ММ.ГГГГ» по МСК. */
export function isoToMskDay(iso: string): string {
  const t = new Date(new Date(iso).getTime() + MSK_OFFSET_MS);
  return `${String(t.getUTCDate()).padStart(2, '0')}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${t.getUTCFullYear()}`;
}

/** Короткое название профессии: «Вокалист / Вокалистка» → «Вокалист», «Диджей (DJ)» → «Диджей». */
export function shortProfessionName(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').split('/')[0].trim().replace(/\s+/g, ' ') || name;
}

// Работа, которую стоит назвать в заголовке («Звукорежиссёр: сведение»). Для
// «Битмейкер: бит», «Продюсер: продюсирование» подпись избыточна — их нет.
const SERVICE_TITLE: Record<string, string> = {
  'сведение': 'сведение', 'микширование': 'сведение', 'мастеринг': 'мастеринг', 'тюнинг вокала': 'тюнинг вокала',
  'запись вокала': 'запись вокала', 'дизайн обложки': 'обложка',
};

/** Подпись работы — только если эта услуга относится к первой профессии. */
function serviceTitleFor(p: ParsedRequest, dict: RequestDictionaries, firstId: string): string | undefined {
  for (const h of p.serviceHints) {
    const label = SERVICE_TITLE[h];
    if (!label) continue;
    const services = dict.services.filter((s) => joinWords(s.name) === h);
    if (services.length === 0 || services.some((s) => s.professionIds.includes(firstId))) return label;
  }
  return undefined;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, '')}…`;
}

export function buildTitle(p: ParsedRequest, dict: RequestDictionaries, text: string): string {
  const firstId = p.professionIds[0];
  if (!firstId) {
    const first = String(text ?? '').trim().split(/[.!?\n]/)[0].trim().replace(/\s+/g, ' ');
    return clip(capitalize(first) || 'Ищу исполнителя', ORDER_TITLE_MAX);
  }
  const prof = dict.professions.find((x) => x.id === firstId);
  const label = p.professionLabels[firstId] || (prof ? shortProfessionName(prof.name) : 'Исполнитель');
  const svc = serviceTitleFor(p, dict, firstId);
  const head = svc ? `${label}: ${svc}` : p.eventKey && EVENT_TITLE[p.eventKey] ? `${label} ${EVENT_TITLE[p.eventKey]}` : label;
  const place = p.cityName || (p.isRemote ? 'онлайн' : null);
  const date = p.date ? isoToMskDay(p.date).slice(0, 5) : null;
  const variants = [
    [head, place, date],
    [head, place],
    [head],
  ].map((parts) => parts.filter(Boolean).join(', '));
  const fit = variants.find((v) => v.length <= ORDER_TITLE_MAX);
  return fit ?? clip(variants[variants.length - 1], ORDER_TITLE_MAX);
}

export interface RequestChip {
  kind: 'profession' | 'genre' | 'city' | 'remote' | 'date' | 'dateHint' | 'budget' | 'service';
  id?: string;
  label: string;
  removable: boolean;
}

export function buildChips(p: ParsedRequest, dict: RequestDictionaries, service: { id: string; name: string } | null): RequestChip[] {
  const chips: RequestChip[] = [];
  for (const id of p.professionIds) {
    const prof = dict.professions.find((x) => x.id === id);
    if (prof) chips.push({ kind: 'profession', id, label: `Профессия: ${prof.name}`, removable: true });
  }
  if (service) chips.push({ kind: 'service', id: service.id, label: `Раздел: ${service.name}`, removable: false });
  for (const id of p.genreIds) {
    const g = dict.genres.find((x) => x.id === id);
    // «Метал, Metal» → «Метал»: в БД жанры двуязычные, в чипе — русский вариант
    if (g) chips.push({ kind: 'genre', id, label: `Жанр: ${g.name.split(',')[0].trim() || g.name}`, removable: true });
  }
  if (p.cityName) chips.push({ kind: 'city', label: `Город: ${p.cityName}`, removable: true });
  if (p.isRemote) chips.push({ kind: 'remote', label: 'Онлайн / удалённо', removable: true });
  if (p.date) chips.push({ kind: 'date', label: `Дата: ${isoToMskDay(p.date)}`, removable: true });
  else if (p.dateHint) chips.push({ kind: 'dateHint', label: `Когда: ${p.dateHint}`, removable: true });
  const b = formatBudgetLabel(p.budgetFrom, p.budgetTo, p.isFree);
  if (b) chips.push({ kind: 'budget', label: `Бюджет: ${b}`, removable: true });
  return chips;
}

// ─────────────────────────────────────────────────────────────────────────────
// Раздел каталога для заказа (Order.serviceId обязателен)
// ─────────────────────────────────────────────────────────────────────────────

export function servicesForProfessions(dict: RequestDictionaries, professionIds: string[]): ServiceRef[] {
  return dict.services
    .filter((s) => s.professionIds.some((id) => professionIds.includes(id)))
    .sort((a, b) => {
      // Услуги первой названной профессии — раньше услуг остальных.
      const ra = professionIds.findIndex((id) => a.professionIds.includes(id));
      const rb = professionIds.findIndex((id) => b.professionIds.includes(id));
      return ra - rb || a.order - b.order || a.name.localeCompare(b.name, 'ru');
    });
}

/**
 * Выбор услуги каталога: подсказка из текста («сведение») → контекст
 * («концерт» → «Живое выступление», если есть) → первая услуга профессии.
 */
export function pickService(
  dict: RequestDictionaries,
  p: Pick<ParsedRequest, 'professionIds' | 'serviceHints' | 'eventKey'>,
): ServiceRef | null {
  const linked = servicesForProfessions(dict, p.professionIds);
  const norm = (s: string) => joinWords(s);
  for (const hint of p.serviceHints) {
    const h = norm(hint);
    const hit = linked.find((s) => norm(s.name) === h) ?? linked.find((s) => norm(s.name).includes(h));
    if (hit) return hit;
  }
  for (const pref of (p.eventKey && EVENT_SERVICE_PREF[p.eventKey]) || []) {
    const hit = linked.find((s) => norm(s.name).includes(pref));
    if (hit) return hit;
  }
  return linked[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Правки пользователя поверх разбора (чипы ✕, выбор профессии и т.п.)
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestOverrides {
  professionIds?: unknown;
  genreIds?: unknown;
  city?: unknown;
  isRemote?: unknown;
  /** «ДД.ММ.ГГГГ», «ГГГГ-ММ-ДД» или ISO; null — без даты. */
  date?: unknown;
  /** { from, to } | null; to = 0 и from = null — «бесплатно». */
  budget?: unknown;
  serviceId?: unknown;
  /** Убрать срок без точной даты. */
  dateHint?: unknown;
}

export interface AppliedRequest extends ParsedRequest {
  serviceId: string | null;
}

function toIdList(v: unknown, allowed: Map<string, unknown>): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && allowed.has(x)))].slice(0, 5);
}

function toBudgetValue(v: unknown): number | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : 'invalid';
}

/**
 * Применяет правки к разбору. Возвращает итог и ошибки валидации
 * (несуществующие id молча отбрасываются, некорректные дата/бюджет — ошибка).
 */
export function applyOverrides(
  parsed: ParsedRequest,
  overrides: RequestOverrides | null | undefined,
  dict: RequestDictionaries,
  text: string,
  now: Date = new Date(),
): { result: AppliedRequest; errors: string[] } {
  const cd = compile(dict);
  const errors: string[] = [];
  const r: AppliedRequest = { ...parsed, professionLabels: { ...parsed.professionLabels }, serviceId: null };
  const o = overrides && typeof overrides === 'object' ? overrides : {};

  if (o.professionIds !== undefined) {
    const ids = toIdList(o.professionIds, cd.professionById);
    if (ids) r.professionIds = ids;
    for (const id of r.professionIds) {
      if (!r.professionLabels[id]) r.professionLabels[id] = shortProfessionName(cd.professionById.get(id)!.name);
    }
  }
  if (o.genreIds !== undefined) {
    const ids = toIdList(o.genreIds, cd.genreById);
    if (ids) r.genreIds = ids;
  }
  if (o.city !== undefined) {
    if (o.city === null || o.city === '') r.cityName = null;
    else if (typeof o.city === 'string') {
      const c = cd.cityByNorm.get(joinWords(o.city));
      if (c) r.cityName = c.name;
      else errors.push('Город не найден в справочнике');
    }
  }
  if (o.isRemote !== undefined) r.isRemote = o.isRemote === true;
  if (o.date !== undefined) {
    if (o.date === null || o.date === '') r.date = null;
    else {
      const day = parseCalendarDay(o.date);
      if (!day) errors.push('Некорректная дата');
      else {
        const end = endOfDayMsk(day);
        if (end.getTime() < now.getTime()) errors.push('Дата не может быть в прошлом');
        else { r.date = end.toISOString(); r.dateHint = null; }
      }
    }
  }
  if (o.dateHint === null) r.dateHint = null;
  if (o.budget !== undefined) {
    if (o.budget === null) { r.budgetFrom = null; r.budgetTo = null; r.isFree = false; }
    else if (typeof o.budget === 'object') {
      const bf = toBudgetValue((o.budget as any).from);
      const bt = toBudgetValue((o.budget as any).to);
      if (bf === 'invalid' || bt === 'invalid') errors.push('Некорректный бюджет');
      else if (bf != null && bt != null && bf > bt) errors.push('«Бюджет от» не может быть больше «Бюджет до»');
      else {
        r.budgetFrom = bf;
        r.budgetTo = bt;
        r.isFree = bf == null && bt === 0;
      }
    }
  }

  if (o.serviceId !== undefined && typeof o.serviceId === 'string') {
    const svc = dict.services.find((s) => s.id === o.serviceId);
    if (svc) r.serviceId = svc.id;
    else errors.push('Раздел каталога не найден');
  }
  if (!r.serviceId) r.serviceId = pickService(dict, r)?.id ?? null;

  r.title = buildTitle(r, dict, text);
  return { result: r, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Справочники из БД (кэш 10 минут)
// ─────────────────────────────────────────────────────────────────────────────

export const DICTIONARY_TTL_MS = 10 * 60 * 1000;
let dictCache: { at: number; data: RequestDictionaries } | null = null;
let dictInflight: Promise<RequestDictionaries> | null = null;

export async function loadRequestDictionaries(): Promise<RequestDictionaries> {
  const [professions, genres, cities, services] = await Promise.all([
    prisma.profession.findMany({ select: { id: true, name: true } }),
    prisma.genre.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.city.findMany({ select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.service.findMany({
      select: {
        id: true, name: true, sortOrder: true,
        section: { select: { name: true, sortOrder: true } },
        serviceProfessions: { select: { professionId: true } },
      },
    }),
  ]);
  return {
    professions,
    genres,
    cities,
    services: services.map((s: any) => ({
      id: s.id,
      name: s.name,
      sectionName: s.section?.name ?? null,
      order: (s.section?.sortOrder ?? 999) * 10_000 + (s.sortOrder ?? 0),
      professionIds: (s.serviceProfessions ?? []).map((sp: any) => sp.professionId),
    })),
  };
}

export async function getRequestDictionaries(): Promise<RequestDictionaries> {
  if (dictCache && Date.now() - dictCache.at < DICTIONARY_TTL_MS) return dictCache.data;
  if (dictInflight) return dictInflight;
  dictInflight = loadRequestDictionaries()
    .then((data) => {
      dictCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => { dictInflight = null; });
  return dictInflight;
}

/** Сброс кэша (тесты; правки справочников в админке подхватятся максимум через 10 минут). */
export function invalidateRequestDictionaries(): void {
  dictCache = null;
}
