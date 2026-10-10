// Терпимый поиск: регистр и «ё» не важны, слова в любом порядке, части слов,
// набор в «не той» раскладке («rehif» → «курша») и транслит («kursha» ↔ «курша»).
// Строки сравниваются с нормализованными колонками (lower + ё→е, см. *Norm в схеме).

/** lower + ё→е, лишние пробелы — как генерируемые колонки *Norm в БД. */
export function normSearch(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';

/** Текст, набранный в другой раскладке: «rehif» → «курша», «ершы» → «this». */
export function swapLayout(s: string): string {
  const latin = (s.match(/[a-z]/gi) ?? []).length;
  const cyr = (s.match(/[а-яё]/gi) ?? []).length;
  const [from, to] = latin >= cyr ? [EN_KEYS, RU_KEYS] : [RU_KEYS, EN_KEYS];
  return Array.from(s.toLowerCase()).map((ch) => {
    const i = from.indexOf(ch);
    return i >= 0 ? to[i] : ch;
  }).join('');
}

const RU_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function ruToLat(s: string): string {
  return Array.from(s.toLowerCase()).map((ch) => RU_LAT[ch] ?? ch).join('');
}

// Многобуквенные сочетания — раньше одиночных букв.
const LAT_RU: Array<[string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['yu', 'ю'], ['ya', 'я'], ['yo', 'е'], ['ye', 'е'], ['ph', 'ф'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'],
  ['y', 'ы'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'],
  ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'к'], ['w', 'в'], ['x', 'кс'],
  ['q', 'к'], ['j', 'дж'],
];

export function latToRu(s: string): string {
  const src = s.toLowerCase();
  let out = '';
  for (let i = 0; i < src.length;) {
    const hit = LAT_RU.find(([lat]) => src.startsWith(lat, i));
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += src[i]; i++; }
  }
  return out;
}

/** Слова запроса: не больше 5, однобуквенные — только если слово одно. */
export function searchTokens(q: string | null | undefined): string[] {
  const words = normSearch(q).split(/[\s,.;:!?«»"'()[\]{}|/\\+-]+/).filter(Boolean);
  const long = words.filter((w) => w.length >= 2);
  return (long.length ? long : words).slice(0, 5);
}

/**
 * Варианты одного слова: как набрано, другая раскладка и транслит каждого из них
 * («rbyj» → «кино» → «kino»).
 */
export function tokenVariants(token: string): string[] {
  const t = normSearch(token);
  const variants: string[] = [];
  for (const v of [t, normSearch(swapLayout(t))]) {
    variants.push(v);
    if (/[а-я]/.test(v)) variants.push(normSearch(ruToLat(v)));
    if (/[a-z]/.test(v)) variants.push(normSearch(latToRu(v)));
  }
  return [...new Set(variants.filter((v) => v.length >= Math.min(2, t.length)))];
}
