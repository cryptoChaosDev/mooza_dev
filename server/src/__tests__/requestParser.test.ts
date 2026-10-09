/**
 * «Ищу музыканта» — разбор фразы по справочникам (без AI-API).
 * Справочники — из реальных сидов каталога (helpers/requestDictFixture).
 * «Сейчас» зафиксировано: пятница 09.10.2026, 12:00 МСК.
 */

jest.mock('../index', () => ({ prisma: {} }));

import {
  parseRequestText, applyOverrides, buildChips, pickService, stem, wordMatches,
  formatBudgetLabel, professionNameVariants, shortProfessionName, buildTitle,
} from '../lib/requestParser';
import { buildRequestDict, pid, gid, sid } from './helpers/requestDictFixture';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const dict = buildRequestDict();
const parse = (text: string) => parseRequestText(text, dict, NOW);
/** Конец дня по МСК для «ГГГГ-ММ-ДД». */
const eod = (ymd: string) => new Date(`${ymd}T20:59:59.999Z`).toISOString();

describe('морфология', () => {
  it('stem обрезает типичные окончания, оставляя основу ≥ 4', () => {
    expect(stem('барабанщика')).toBe('барабанщик');
    expect(stem('барабанщиков')).toBe('барабанщик');
    expect(stem('самаре')).toBe('самар');
    expect(stem('нижнем')).toBe(stem('нижний'));
    expect(stem('уфе')).toBe('уфе'); // короткое слово не режется
  });

  it('wordMatches понимает падежи, но не путает разные слова', () => {
    expect(wordMatches('ростове', 'ростов')).toBe(true);
    expect(wordMatches('уфе', 'уфа')).toBe(true);
    expect(wordMatches('гитарой', 'гитара')).toBe(true);
    expect(wordMatches('вокалист', 'вокал')).toBe(false);
    expect(wordMatches('гитарист', 'гитара')).toBe(false);
    expect(wordMatches('срок', 'рок')).toBe(false);
    expect(wordMatches('djs', 'dj')).toBe(false); // латиница — только точно
  });

  it('варианты названий профессий из справочника', () => {
    expect(professionNameVariants('Вокалист / Вокалистка')).toEqual(['Вокалист', 'Вокалистка']);
    expect(professionNameVariants('Диджей (DJ)')).toEqual(['DJ', 'Диджей']);
    expect(professionNameVariants('Оператор (кинооператор / DP)')).toEqual(['Оператор']);
    expect(shortProfessionName('Пианист / Клавишник')).toBe('Пианист');
  });
});

describe('разбор реальных фраз', () => {
  it('1. пример из ТЗ: барабанщик, концерт, дата, город, жанр, бюджет', () => {
    const r = parse('нужен барабанщик на концерт 20 ноября в Самаре, метал, бюджет 10 000');
    expect(r.professionIds).toEqual([pid('Барабанщик')]);
    expect(r.genreIds).toEqual([gid('Метал')]);
    expect(r.cityName).toBe('Самара');
    expect(r.isRemote).toBe(false);
    expect(r.date).toBe(eod('2026-11-20'));
    expect(r.budgetFrom).toBeNull();
    expect(r.budgetTo).toBe(10000);
    expect(r.eventKey).toBe('concert');
    expect(r.title).toBe('Барабанщик на концерт, Самара, 20.11');
    expect(r.unknownTokens).toEqual([]);
  });

  it('2. звукорежиссёр на сведение онлайн → услуга «Сведение»', () => {
    const r = parse('Нужен звукорежиссёр на сведение трека, онлайн');
    expect(r.professionIds).toEqual([pid('Звукорежиссёр')]);
    expect(r.isRemote).toBe(true);
    expect(r.serviceHints).toContain('сведение');
    expect(r.title).toBe('Звукорежиссёр: сведение, онлайн');
    expect(pickService(dict, r)?.id).toBe(sid('Сведение'));
  });

  it('3. «барабанщика» в родительном падеже', () => {
    const r = parse('Ищу барабанщика на концерт 20 ноября в Самаре');
    expect(r.professionIds).toEqual([pid('Барабанщик')]);
    expect(r.cityName).toBe('Самара');
    expect(r.date).toBe(eod('2026-11-20'));
    expect(r.budgetTo).toBeNull();
  });

  it('4. синоним «ударник», жанр из «рок-группу», группа', () => {
    const r = parse('Требуется ударник в рок-группу, Москва');
    expect(r.professionIds).toEqual([pid('Барабанщик')]);
    expect(r.genreIds).toEqual([gid('Рок')]);
    expect(r.cityName).toBe('Москва');
    expect(r.eventKey).toBe('band');
  });

  it('5. «драммера» + запись', () => {
    const r = parse('ищем драммера для записи альбома');
    expect(r.professionIds).toEqual([pid('Барабанщик')]);
    expect(r.eventKey).toBe('recording');
  });

  it('6. вокалистка на свадьбу в Казани, «бюджет до 30 000»', () => {
    const r = parse('Нужна вокалистка на свадьбу в Казани, бюджет до 30 000');
    expect(r.professionIds).toEqual([pid('Вокалист / Вокалистка')]);
    expect(r.professionLabels[pid('Вокалист / Вокалистка')]).toBe('Вокалистка');
    expect(r.cityName).toBe('Казань');
    expect(r.budgetTo).toBe(30000);
    expect(r.title).toBe('Вокалистка на свадьбу, Казань');
  });

  it('7. певица, корпоратив, 31 декабря, Санкт-Петербург, «50к»', () => {
    const r = parse('певица на корпоратив 31 декабря, Санкт-Петербург, 50к');
    expect(r.professionIds).toEqual([pid('Вокалист / Вокалистка')]);
    expect(r.cityName).toBe('Санкт-Петербург');
    expect(r.date).toBe(eod('2026-12-31'));
    expect(r.budgetTo).toBe(50000);
    expect(r.eventKey).toBe('corporate');
  });

  it('8. «звукарь», «в Нижнем Новгороде», «завтра»', () => {
    const r = parse('Звукарь на концерт в Нижнем Новгороде завтра');
    expect(r.professionIds).toEqual([pid('Звукорежиссёр')]);
    expect(r.cityName).toBe('Нижний Новгород');
    expect(r.date).toBe(eod('2026-10-10'));
  });

  it('9. «звукач», «в Питере», «в субботу»', () => {
    const r = parse('нужен звукач в Питере в субботу');
    expect(r.professionIds).toEqual([pid('Звукорежиссёр')]);
    expect(r.cityName).toBe('Санкт-Петербург');
    expect(r.date).toBe(eod('2026-10-10'));
  });

  it('10. басист → смежная профессия (в каталоге нет «Басиста»), заголовок — как просили', () => {
    const r = parse('Ищу басиста в кавер-группу, Екатеринбург');
    expect(r.professionIds).toEqual([pid('Гитарист')]);
    expect(r.cityName).toBe('Екатеринбург');
    expect(r.eventKey).toBe('band');
    expect(r.title).toBe('Басист в группу, Екатеринбург');
  });

  it('11. клавишник, Ростов-на-Дону, «от 5 до 15 тыс»', () => {
    const r = parse('Клавишник на репетиции, Ростов-на-Дону, от 5 до 15 тыс');
    expect(r.professionIds).toEqual([pid('Пианист / Клавишник')]);
    expect(r.cityName).toBe('Ростов-на-Дону');
    expect(r.budgetFrom).toBe(5000);
    expect(r.budgetTo).toBe(15000);
    expect(r.eventKey).toBe('rehearsal');
  });

  it('12. аранжировщик, поп, удалённо, «от 5000 до 15000 руб»', () => {
    const r = parse('Аранжировщик для поп-трека, удалённо, от 5000 до 15000 руб');
    expect(r.professionIds).toEqual([pid('Аранжировщик')]);
    expect(r.genreIds).toEqual([gid('Поп')]);
    expect(r.isRemote).toBe(true);
    expect([r.budgetFrom, r.budgetTo]).toEqual([5000, 15000]);
    expect(pickService(dict, r)?.id).toBe(sid('Аранжировка'));
  });

  it('13. битмейкер, трэп, «10к»', () => {
    const r = parse('Нужен битмейкер, трэп, 10к');
    expect(r.professionIds).toEqual([pid('Битмейкер')]);
    expect(r.genreIds).toEqual([gid('Трэп')]);
    expect(r.budgetTo).toBe(10000);
  });

  it('14. сведение и мастеринг дистанционно, «бюджет 15» = 15 тысяч', () => {
    const r = parse('Сведение и мастеринг трека дистанционно, бюджет 15');
    expect(r.professionIds).toEqual([pid('Звукорежиссёр')]);
    expect(r.serviceHints).toEqual(expect.arrayContaining(['сведение', 'мастеринг']));
    expect(r.isRemote).toBe(true);
    expect(r.budgetTo).toBe(15000);
  });

  it('15. гитарист на гастроли «через неделю»', () => {
    const r = parse('Ищу гитариста на гастроли через неделю');
    expect(r.professionIds).toEqual([pid('Гитарист')]);
    expect(r.eventKey).toBe('tour');
    expect(r.date).toBe(eod('2026-10-16'));
  });

  it('16. саксофонист, «20.11», «бесплатно»', () => {
    const r = parse('Нужен саксофонист на свадьбу 20.11, бесплатно');
    expect(r.professionIds).toEqual([pid('Саксофонист')]);
    expect(r.date).toBe(eod('2026-11-20'));
    expect(r.isFree).toBe(true);
    expect(r.budgetFrom).toBeNull();
    expect(r.budgetTo).toBe(0);
  });

  it('17. скрипачка «в Уфе», прошедшая дата → следующий год', () => {
    const r = parse('скрипачка в Уфе на 5 марта');
    expect(r.professionIds).toEqual([pid('Скрипач')]);
    expect(r.cityName).toBe('Уфа');
    expect(r.date).toBe(eod('2027-03-05'));
  });

  it('18. диджей на вечеринку «в следующую субботу», Сочи', () => {
    const r = parse('Ищем диджея на вечеринку в следующую субботу, Сочи');
    expect(r.professionIds).toEqual([pid('Диджей (DJ)')]);
    expect(r.cityName).toBe('Сочи');
    expect(r.date).toBe(eod('2026-10-17'));
    expect(r.eventKey).toBe('party');
  });

  it('19. латиница «dj», «до 20 тыс»', () => {
    const r = parse('dj на день рождения, Москва, до 20 тыс');
    expect(r.professionIds).toEqual([pid('Диджей (DJ)')]);
    expect(r.budgetTo).toBe(20000);
    expect(r.budgetFrom).toBeNull();
  });

  it('20. две профессии, «на следующей неделе» → без точной даты', () => {
    const r = parse('Нужен аранжировщик и вокалист для записи песни на следующей неделе');
    expect(r.professionIds).toEqual([pid('Аранжировщик'), pid('Вокалист / Вокалистка')]);
    expect(r.date).toBeNull();
    expect(r.dateHint).toBe('на следующей неделе');
  });

  it('21. составное название из справочника важнее короткого синонима', () => {
    const r = parse('Вокальный продюсер онлайн');
    expect(r.professionIds).toEqual([pid('Вокальный продюсер')]);
    expect(r.isRemote).toBe(true);
  });

  it('22. обложка → графический дизайнер, услуга «Дизайн обложки»', () => {
    const r = parse('нужна обложка для сингла');
    expect(r.professionIds).toEqual([pid('Графический дизайнер')]);
    expect(pickService(dict, r)?.id).toBe(sid('Дизайн обложки'));
  });

  it('23. «пианист», «в Великом Новгороде», сегодняшняя дата', () => {
    const r = parse('Пианист на свадьбу в Великом Новгороде 9 октября');
    expect(r.professionIds).toEqual([pid('Пианист / Клавишник')]);
    expect(r.professionLabels[pid('Пианист / Клавишник')]).toBe('Пианист');
    expect(r.cityName).toBe('Великий Новгород');
    expect(r.date).toBe(eod('2026-10-09'));
  });

  it('24. рэпер → вокалист + жанр хип-хоп, «в Набережных Челнах», нераспознанное', () => {
    const r = parse('Нужен рэпер на фит в Набережных Челнах');
    expect(r.professionIds).toEqual([pid('Вокалист / Вокалистка')]);
    expect(r.genreIds).toEqual([gid('Хип-хоп / Рэп')]);
    expect(r.cityName).toBe('Набережные Челны');
    expect(r.unknownTokens).toEqual(['фит']);
  });

  it('25. видеограф «в Улан-Удэ»', () => {
    const r = parse('Видеограф на концерт в Улан-Удэ');
    expect(r.professionIds).toEqual([pid('Видеограф')]);
    expect(r.cityName).toBe('Улан-Удэ');
  });

  it('26. без профессии — пусто, заголовок из текста', () => {
    const r = parse('Нужен музыкант на праздник');
    expect(r.professionIds).toEqual([]);
    expect(r.unknownTokens).toEqual([]);
    expect(r.title).toBe('Нужен музыкант на праздник');
  });

  it('27. «за 3000 р»', () => {
    const r = parse('Ищу тромбониста за 3000 р');
    expect(r.professionIds).toEqual([pid('Тромбонист')]);
    expect(r.budgetTo).toBe(3000);
  });

  it('28. «бюджет от 7 000» → только нижняя граница', () => {
    const r = parse('Фотограф на концерт, бюджет от 7 000');
    expect(r.professionIds).toEqual([pid('Фотограф')]);
    expect(r.budgetFrom).toBe(7000);
    expect(r.budgetTo).toBeNull();
  });

  it('29. «на 2000 человек» — не бюджет', () => {
    const r = parse('концерт на 2000 человек, нужен звукорежиссер');
    expect(r.budgetFrom).toBeNull();
    expect(r.budgetTo).toBeNull();
    expect(r.professionIds).toEqual([pid('Звукорежиссёр')]);
  });

  it('30. телефон и email не разбираются как бюджет и профессия', () => {
    const r = parse('Ищу перкуссиониста, пишите 8 900 123-45-67 или drummer@mail.ru');
    expect(r.professionIds).toEqual([pid('Перкуссионист')]);
    expect(r.budgetTo).toBeNull();
  });

  it('31. «техника» — не профессия «Техник»', () => {
    const r = parse('техника для концерта');
    expect(r.professionIds).toEqual([]);
  });

  it('32. несуществующая дата 31.02 игнорируется', () => {
    const r = parse('барабанщик 31.02');
    expect(r.date).toBeNull();
  });

  it('33. «преподавателя вокала» — преподаватель, а не вокалист', () => {
    const r = parse('Ищу преподавателя вокала в Самаре');
    expect(r.professionIds).toEqual([pid('Преподаватель вокала')]);
  });

  it('34. «в Орле», «в Туле», «в Петропавловске-Камчатском»', () => {
    expect(parse('Звукорежиссер в Орле').cityName).toBe('Орёл');
    expect(parse('в Туле нужна ударница в пятницу').cityName).toBe('Тула');
    expect(parse('в Туле нужна ударница в пятницу').date).toBe(eod('2026-10-16'));
    expect(parse('Звукорежиссёр в Петропавловске-Камчатском').cityName).toBe('Петропавловск-Камчатский');
  });

  it('35. «в декабре», «срочно» — срок без точной даты', () => {
    expect(parse('Гитарист в декабре').dateHint).toBe('в декабре');
    const r = parse('Срочно нужен трубач!');
    expect(r.professionIds).toEqual([pid('Трубач')]);
    expect(r.dateHint).toBe('срочно');
    expect(r.date).toBeNull();
  });
});

describe('правки поверх разбора и чипы', () => {
  const text = 'нужен барабанщик на концерт 20 ноября в Самаре, метал, бюджет 10 000';

  it('чипы — человекочитаемые', () => {
    const r = parse(text);
    const svc = pickService(dict, r);
    const labels = buildChips(r, dict, svc).map((c) => c.label);
    expect(labels).toEqual([
      'Профессия: Барабанщик',
      'Раздел: Запись барабанных партий',
      'Жанр: Метал',
      'Город: Самара',
      'Дата: 20.11.2026',
      'Бюджет: до 10 000 ₽',
    ]);
  });

  it('пользователь убирает город и дату, меняет профессию и бюджет', () => {
    const r = parse(text);
    const { result, errors } = applyOverrides(r, {
      professionIds: [pid('Гитарист'), 'ghost-id'],
      city: null,
      date: null,
      budget: { from: 5000, to: 8000 },
    }, dict, text, NOW);
    expect(errors).toEqual([]);
    expect(result.professionIds).toEqual([pid('Гитарист')]);
    expect(result.cityName).toBeNull();
    expect(result.date).toBeNull();
    expect([result.budgetFrom, result.budgetTo]).toEqual([5000, 8000]);
    expect(result.serviceId).toBe(sid('Запись гитарных партий'));
    expect(result.title).toBe('Гитарист на концерт');
  });

  it('город и дата из правок валидируются', () => {
    const r = parse('барабанщик');
    const ok = applyOverrides(r, { city: 'казань', date: '25.12.2026' }, dict, 'барабанщик', NOW);
    expect(ok.errors).toEqual([]);
    expect(ok.result.cityName).toBe('Казань');
    expect(ok.result.date).toBe(eod('2026-12-25'));

    const bad = applyOverrides(r, { city: 'Атлантида', date: '01.01.2020', budget: { from: 10, to: 5 } }, dict, 'барабанщик', NOW);
    expect(bad.errors).toEqual([
      'Город не найден в справочнике',
      'Дата не может быть в прошлом',
      '«Бюджет от» не может быть больше «Бюджет до»',
    ]);
  });

  it('бюджет: подписи', () => {
    expect(formatBudgetLabel(null, 10000)).toBe('до 10 000 ₽');
    expect(formatBudgetLabel(5000, 15000)).toBe('от 5 000 до 15 000 ₽');
    expect(formatBudgetLabel(7000, null)).toBe('от 7 000 ₽');
    expect(formatBudgetLabel(null, 0, true)).toBe('бесплатно');
    expect(formatBudgetLabel(null, null)).toBeNull();
  });

  it('длинный текст (1000 символов) разбирается быстро', () => {
    const long = `${'Ищу опытного барабанщика и басиста в метал-группу, репетиции в Самаре, бюджет 10 000. '.repeat(12)}`.slice(0, 1000);
    const t0 = Date.now();
    const r = parse(long);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.professionIds).toContain(pid('Барабанщик'));
  });

  it('длинный заголовок укладывается в 50 символов', () => {
    const r = parse('Технический директор концерта в Петропавловске-Камчатском 20 ноября');
    expect(r.title.length).toBeLessThanOrEqual(50);
    expect(buildTitle({ ...r, professionIds: [] }, dict, 'x'.repeat(80)).length).toBeLessThanOrEqual(50);
  });
});

describe('двуязычные названия жанров как в БД PROD («Метал, Metal»)', () => {
  // Регресс: в БД жанры названы «Рус, Eng»; разбор делил названия только по «/»
  // и не находил ни одного жанра на живых данных.
  const prodGenres = ['Метал, Metal', 'Рок, Rock', 'Хип-хоп / Рэп, Hip-Hop / Rap', 'Электронная музыка, Electronic', 'Панк / Хардкор, Punk / Hardcore'];
  const prodDict = { ...dict, genres: prodGenres.map((name) => ({ id: `g:${name}`, name })) };
  const p = (text: string) => parseRequestText(text, prodDict, NOW);

  it.each([
    ['нужен барабанщик на концерт, метал', 'Метал, Metal'],
    ['ищу гитариста в рок-группу', 'Рок, Rock'],
    ['нужен битмейкер, хип-хоп', 'Хип-хоп / Рэп, Hip-Hop / Rap'],
    ['барабанщик в панк группу', 'Панк / Хардкор, Punk / Hardcore'],
    ['нужен вокалист, metal', 'Метал, Metal'],
  ])('%s → %s', (text, genre) => {
    expect(p(text).genreIds).toContain(`g:${genre}`);
  });
});
