/** Терпимый поиск (lib/searchQuery): регистр, «ё», раскладка, транслит. */
import { normSearch, swapLayout, ruToLat, latToRu, searchTokens, tokenVariants } from '../lib/searchQuery';

describe('searchQuery', () => {
  it('регистр и «ё» не важны', () => {
    expect(normSearch('  ИСТОРИЯ  Кино Ёлка ')).toBe('история кино елка');
    expect(searchTokens('КИНО,  ёлка!')).toEqual(['кино', 'елка']);
  });

  it('другая раскладка в обе стороны', () => {
    expect(swapLayout('rehif')).toBe('курша');
    expect(swapLayout('лгкырф')).toBe('kursha');
  });

  it('транслит в обе стороны', () => {
    expect(ruToLat('Курша')).toBe('kursha');
    expect(latToRu('kursha')).toBe('курша');
    expect(latToRu('Zhuki')).toBe('жуки');
    expect(ruToLat('Щелкунчик')).toBe('shchelkunchik');
  });

  it('варианты слова: как набрано, раскладка, транслит; однобуквенные — только если слово одно', () => {
    expect(tokenVariants('Kursha')).toEqual(expect.arrayContaining(['kursha', 'курша']));
    expect(tokenVariants('rehif')).toEqual(expect.arrayContaining(['rehif', 'курша']));
    expect(tokenVariants('rbyj')).toEqual(expect.arrayContaining(['кино', 'kino'])); // раскладка + транслит
    expect(tokenVariants('Курша')).toEqual(expect.arrayContaining(['курша', 'kursha']));
    expect(searchTokens('Б 2')).toEqual(['б', '2']);
    expect(searchTokens('в клубе')).toEqual(['клубе']);
  });
});
