"""
Чистит artists_ru.json:
- Убирает Various/Unknown
- Убирает сплиты (несколько артистов через / , &)
- Убирает мусорные имена (слишком короткие, только символы)
- Дедуплицирует похожие имена (нормализация)
- Маппит Discogs-жанры на жанры из БД Moooza
Результат: artists_ru_clean.json
"""

import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

INPUT  = "scripts/artists_ru.json"
OUTPUT = "scripts/artists_ru_clean.json"

# Жанры которые есть в Discogs → маппинг на наши
GENRE_MAP = {
    "Rock": "Rock",
    "Electronic": "Electronic",
    "Pop": "Pop",
    "Hip Hop": "Hip-Hop",
    "Jazz": "Jazz",
    "Classical": "Classical",
    "Funk / Soul": "Funk",
    "Blues": "Blues",
    "Folk, World, & Country": "Folk",
    "Latin": "Latin",
    "Reggae": "Reggae",
    "Brass & Military": None,
    "Children's": None,
    "Non-Music": None,
    "Stage & Screen": None,
}

SKIP_NAMES = {
    "Various", "Various Artists", "Unknown Artist", "Unknown",
    "V/A", "VA", "No Artist", "?",
}

# Признаки сплита — артист содержит нескольких
SPLIT_PATTERNS = [
    r" / ",       # сплит релиз
    r" \+ ",      # объединение
    r"^\d+ ",     # начинается с числа (часто сборник)
]

def is_split(name: str) -> bool:
    for pat in SPLIT_PATTERNS:
        if re.search(pat, name):
            return True
    # Слишком длинное имя — скорее всего сплит или сборник
    if len(name) > 60:
        return True
    return False

def is_garbage(name: str) -> bool:
    # Только символы без букв
    if not re.search(r'[a-zA-Zа-яА-Я]', name):
        return True
    # Слишком короткое
    if len(name.strip()) < 2:
        return True
    return False

def normalize_name(name: str) -> str:
    # Убираем суффиксы Discogs: "Artist (2)" → "Artist"
    name = re.sub(r'\s*\(\d+\)\s*$', '', name).strip()
    # Убираем asterisk (вариант написания): "Artist*" → "Artist"
    name = name.rstrip('*').strip()
    # Нормализуем пробелы
    name = re.sub(r'\s+', ' ', name)
    return name

def map_genres(genres: list) -> list:
    result = []
    for g in genres:
        mapped = GENRE_MAP.get(g)
        if mapped and mapped not in result:
            result.append(mapped)
    return result

def main():
    with open(INPUT, encoding='utf-8') as f:
        data = json.load(f)

    print(f"Входных артистов: {len(data)}")

    seen_names = set()
    result = []

    for artist in data:
        name = normalize_name(artist["name"])

        if name in SKIP_NAMES:
            continue
        if is_garbage(name):
            continue
        if is_split(name):
            continue

        # Дедупликация по нормализованному имени (case-insensitive)
        key = name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)

        genres = map_genres(artist.get("genres", []))

        result.append({
            "name": name,
            "genres": genres,
            "thumb": artist.get("thumb"),
            "source": "discogs",
            "country": "RU",
        })

    # Сортируем по имени
    result.sort(key=lambda x: x["name"].lower())

    print(f"После чистки: {len(result)}")

    cyrillic = [a for a in result if any(chr(1072) <= c <= chr(1103) or chr(1040) <= c <= chr(1071) for c in a['name'])]
    print(f"С кириллицей: {len(cyrillic)}")
    print(f"С жанрами: {sum(1 for a in result if a['genres'])}")
    print(f"С обложкой: {sum(1 for a in result if a['thumb'])}")

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nСохранено в {OUTPUT}")
    print("\nПримеры русских артистов:")
    for a in cyrillic[:20]:
        genres_str = ', '.join(a['genres']) if a['genres'] else '—'
        print(f"  {a['name']} | {genres_str}")

if __name__ == "__main__":
    main()
