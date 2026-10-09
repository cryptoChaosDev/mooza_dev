/**
 * Unit tests for lib/maskContacts — контакты в свободном тексте для гостя.
 */

import {
  maskContacts,
  maskContactsDeep,
  containsContact,
  stripLinksForGuest,
  CONTACT_MASK,
  GUEST_HIDDEN_LINK_KEYS,
} from '../lib/maskContacts';

describe('maskContacts', () => {
  const cases: Array<[string, string]> = [
    ['Звоните +7 (916) 123-45-67 после 18', '+7 (916) 123-45-67'],
    ['тел: 8 916 123 45 67', '8 916 123 45 67'],
    ['номер 89161234567', '89161234567'],
    ['пишите на ivan.petrov@mail.ru', 'ivan.petrov@mail.ru'],
    ['мой тг t.me/ivan_petrov', 't.me/ivan_petrov'],
    ['https://t.me/joinchat/AAAA', 'https://t.me/joinchat/AAAA'],
    ['или telegram.me/ivan', 'telegram.me/ivan'],
    ['WhatsApp: https://wa.me/79161234567', 'https://wa.me/79161234567'],
    ['vk: https://vk.com/id123456', 'https://vk.com/id123456'],
    ['vk.me/ivan_petrov — личка', 'vk.me/ivan_petrov'],
    ['контакт @ivan_petrov в телеге', '@ivan_petrov'],
    ['mailto:ivan@mail.ru', 'mailto:ivan@mail.ru'],
  ];

  it.each(cases)('masks contact in %p', (text, contact) => {
    const out = maskContacts(text);
    expect(out).toContain(CONTACT_MASK);
    expect(out).not.toContain(contact);
  });

  it('keeps ordinary text, prices, dates and short numbers intact', () => {
    const text = 'Бюджет от 5 000 до 15 000 ₽, срок 14 дней, дата 09.10.2026, трек #1 на vk.com/club123';
    expect(maskContacts(text)).toBe(text);
  });

  it('does not treat Cyrillic mentions as @handles', () => {
    expect(maskContacts('спасибо @Иван за помощь')).toBe('спасибо @Иван за помощь');
  });

  it('passes null / undefined / empty through', () => {
    expect(maskContacts(null)).toBeNull();
    expect(maskContacts(undefined)).toBeUndefined();
    expect(maskContacts('')).toBe('');
  });

  it('containsContact detects contacts', () => {
    expect(containsContact('звони 8-916-123-45-67')).toBe(true);
    expect(containsContact('просто текст')).toBe(false);
  });

  it('maskContactsDeep masks strings inside JSON (priceItems)', () => {
    const items = [{ name: 'Сведение, пишите @mixer_pro', price: 5000 }, { name: 'Мастеринг', price: 3000 }];
    const out = maskContactsDeep(items);
    expect(out[0].name).toContain(CONTACT_MASK);
    expect(out[0].price).toBe(5000);
    expect(out[1].name).toBe('Мастеринг');
  });
});

describe('stripLinksForGuest', () => {
  const links = {
    phone: '+79161234567',
    email: 'a@b.ru',
    tg_profile: '@ivan',
    vk: 'https://vk.com/ivan',
    telegram: 'https://t.me/ivan_channel',
    yandex_music: 'https://music.yandex.ru/artist/1',
    website: 'https://ivan.ru',
    soundcloud: '+7 916 123 45 67', // контакт под «безобидным» ключом
    empty: '',
  };

  it('user: hides contacts and personal social networks, reports contactsAvailable', () => {
    const { links: out, contactsAvailable } = stripLinksForGuest(links, 'user');
    expect(contactsAvailable).toBe(true);
    for (const k of GUEST_HIDDEN_LINK_KEYS.user) expect(out).not.toHaveProperty(k);
    expect(out).toEqual({ yandex_music: 'https://music.yandex.ru/artist/1', website: 'https://ivan.ru' });
  });

  it('artist: hides only contact keys (band pages stay visible)', () => {
    const { links: out, contactsAvailable } = stripLinksForGuest(links, 'artist');
    expect(contactsAvailable).toBe(true);
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('tg_profile');
    expect(out).not.toHaveProperty('soundcloud');
    expect(out.vk).toBe('https://vk.com/ivan');
    expect(out.telegram).toBe('https://t.me/ivan_channel');
  });

  it('no links → empty, contactsAvailable false', () => {
    expect(stripLinksForGuest(null, 'user')).toEqual({ links: {}, contactsAvailable: false });
    expect(stripLinksForGuest({ website: 'https://x.ru' }, 'user')).toEqual({ links: { website: 'https://x.ru' }, contactsAvailable: false });
  });
});
