/** Разбор афиши Qtickets (lib/qtickets): города, карточки ленты, ссылки. */
import { parseQticketsCities, parseQticketsListing, qticketsTicketUrl, decodeEntities, cityKey } from '../lib/qtickets';

const card = (o: { id: string; title: string; type: string; dt: string; place?: string; price?: string; img?: boolean }) => `
  <li class="item"> <section>
    <a href="https://samara.qtickets.events/${o.id}-slug" onclick="loadEvent(${o.id}); return false">
      ${o.img === false ? '' : `<div class="img jpg" style="background-image: url('https://cdn.qtickets.tech/thumbs/${o.id}_360.webp'); background-image: -webkit-image-set(url(&quot;https://cdn.qtickets.tech/thumbs/${o.id}_720.webp&quot;) 2x);">`}
      <div class="status"><div class="price for-desktop">${o.price ?? 'от 1&nbsp;500 руб.'}</div></div></div>
      <h2>${o.title}</h2>
      <div class="type"> ${o.type} </div>
      <time class="place" datetime="${o.dt}"><span class="event-date">13 ноября</span>
        ${o.place === undefined ? '' : `<span class="place-name">${o.place}&nbsp;</span>`}</time>
    </a> </section> </li>`;

const page = (cards: string, next = true) => `
  <div id="cities_results"><ul>
    <li><a href="https://moscow.qtickets.events" >Москва</a><br>
        <a href="https://rostovdon.qtickets.events" >Ростов-на-Дону</a>
        <a href="https://orel.qtickets.events" >Орёл</a></li></ul></div>
  <h1> Билеты на мероприятия в городе Самара </h1>
  <ul>${cards}</ul>
  ${next ? '<a href="/?page=2" class="btn" id="next_page">Ещё мероприятия!</a>' : ''}`;

describe('parseQticketsCities', () => {
  it('название города → поддомен, ключ без регистра и ё', () => {
    const m = parseQticketsCities(page(''));
    expect(m.get(cityKey('Москва'))).toBe('moscow');
    expect(m.get(cityKey('Ростов-на-Дону'))).toBe('rostovdon');
    expect(m.get(cityKey('Орел'))).toBe('orel'); // «Орёл» в Qtickets = «Орел» у нас
  });
});

describe('parseQticketsListing', () => {
  it('разбирает карточку: id, ссылка, название, тип, дата с поясом, площадка, цена, картинка', () => {
    const r = parseQticketsListing(page(card({
      id: '225258', title: 'Boulevard Depo &amp; друзья', type: 'Концерт', dt: '2026-11-01T19:00:00+04:00', place: 'Клуб Метелица-С',
    })));
    expect(r.cityName).toBe('Самара');
    expect(r.hasNext).toBe(true);
    expect(r.items).toHaveLength(1);
    const it = r.items[0];
    expect(it).toEqual(expect.objectContaining({
      externalId: '225258',
      url: 'https://samara.qtickets.events/225258-slug',
      title: 'Boulevard Depo & друзья',
      type: 'Концерт',
      venue: 'Клуб Метелица-С',
      priceFrom: 1500,
      imageUrl: 'https://cdn.qtickets.tech/thumbs/225258_360.webp',
    }));
    expect(it.startsAt.toISOString()).toBe('2026-11-01T15:00:00.000Z');
    expect(it.utcOffsetMin).toBe(240);
  });

  it('пропускает битые карточки, без следующей страницы — hasNext=false', () => {
    const r = parseQticketsListing(page(
      card({ id: '1', title: 'Ок', type: 'Рейв', dt: '2026-11-02T23:00:00+03:00', img: false, price: '' })
      + card({ id: '2', title: 'Без даты', type: 'Концерт', dt: 'не дата' })
      + card({ id: '3', title: '   ', type: 'Концерт', dt: '2026-11-03T19:00:00+03:00' }),
      false,
    ));
    expect(r.hasNext).toBe(false);
    expect(r.items.map((i) => i.externalId)).toEqual(['1']);
    expect(r.items[0]).toEqual(expect.objectContaining({ venue: null, imageUrl: null, priceFrom: null }));
  });

  it('пустая или чужая разметка — ноль событий, без исключений', () => {
    expect(parseQticketsListing('<html>изменили вёрстку</html>')).toEqual({ cityName: null, items: [], hasNext: false });
  });
});

describe('ссылки и сущности', () => {
  it('партнёрский код из env добавляется к ссылке', () => {
    const prev = process.env.QTICKETS_PARTNER_QUERY;
    process.env.QTICKETS_PARTNER_QUERY = 'qpartner=moooza';
    expect(qticketsTicketUrl('https://samara.qtickets.events/1-a')).toBe('https://samara.qtickets.events/1-a?qpartner=moooza');
    expect(qticketsTicketUrl('https://samara.qtickets.events/1-a?x=1')).toBe('https://samara.qtickets.events/1-a?x=1&qpartner=moooza');
    delete process.env.QTICKETS_PARTNER_QUERY;
    expect(qticketsTicketUrl('https://samara.qtickets.events/1-a')).toBe('https://samara.qtickets.events/1-a');
    if (prev !== undefined) process.env.QTICKETS_PARTNER_QUERY = prev;
  });

  it('раскрывает именованные и числовые сущности', () => {
    expect(decodeEntities('A&nbsp;&amp;&#1041;&#x411;&laquo;&raquo;&unknown;')).toBe('A &ББ«»&unknown;');
  });
});
