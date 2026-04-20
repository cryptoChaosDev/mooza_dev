"""
Discogs RU Artists Parser
Парсит релизы country=Russia, собирает уникальных артистов с жанрами.
Результат: scripts/artists_ru.json
"""

import requests
import json
import time
import re
from collections import defaultdict

TOKEN = "PgSTvBXEkTtBtllaRySHTLggwboRqnufUVugobWP"
HEADERS = {
    "Authorization": f"Discogs token={TOKEN}",
    "User-Agent": "MooozaParser/1.0 +https://moooza.ru",
}

BASE_URL = "https://api.discogs.com/database/search"
OUTPUT_FILE = "scripts/artists_ru.json"

# Discogs rate limit: 60 req/min → 1 req per second с запасом
REQUEST_DELAY = 1.1

# Сколько страниц парсить (100 релизов на стр, max 2000 стр)
# Начнём с 500 страниц = 50,000 релизов
MAX_PAGES = 500


def extract_artist_name(title: str):
    """Вытаскивает имя артиста из строки вида 'Artist - Album Title'"""
    if " - " not in title:
        return None
    artist = title.split(" - ")[0].strip()
    # Убираем номера дублей: "Artist (2)" → "Artist"
    artist = re.sub(r"\s*\(\d+\)$", "", artist).strip()
    return artist if artist else None


def fetch_page(page: int):
    params = {
        "type": "release",
        "country": "Russia",
        "per_page": 100,
        "page": page,
    }
    try:
        r = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=15)
        if r.status_code == 429:
            print(f"  Rate limited, ждём 60с...")
            time.sleep(60)
            return fetch_page(page)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  Ошибка на стр {page}: {e}")
        return None


def main():
    # artists[name] = {"genres": set(), "styles": set(), "thumb": str|None}
    artists: dict[str, dict] = defaultdict(lambda: {"genres": set(), "styles": set(), "thumb": None})

    print(f"Старт парсинга. MAX_PAGES={MAX_PAGES}")

    # Первый запрос — узнать реальное кол-во страниц
    data = fetch_page(1)
    if not data:
        print("Не удалось получить первую страницу")
        return

    total_pages = min(data["pagination"]["pages"], MAX_PAGES)
    total_items = data["pagination"]["items"]
    print(f"Всего релизов из России: {total_items:,}")
    print(f"Будем парсить: {total_pages} страниц ({total_pages * 100:,} релизов)\n")

    def process_page_data(data: dict):
        for release in data.get("results", []):
            title = release.get("title", "")
            artist_name = extract_artist_name(title)
            if not artist_name:
                continue

            genres = release.get("genre", [])
            styles = release.get("style", [])
            thumb = release.get("thumb") or None

            entry = artists[artist_name]
            entry["genres"].update(genres)
            entry["styles"].update(styles)
            if thumb and not entry["thumb"]:
                entry["thumb"] = thumb

    # Обрабатываем первую страницу
    process_page_data(data)
    time.sleep(REQUEST_DELAY)

    for page in range(2, total_pages + 1):
        data = fetch_page(page)
        if data:
            process_page_data(data)

        # Прогресс каждые 50 страниц
        if page % 50 == 0:
            print(f"  Страница {page}/{total_pages} | Уникальных артистов: {len(artists):,}")

        time.sleep(REQUEST_DELAY)

    print(f"\nПарсинг завершён. Уникальных артистов: {len(artists):,}")

    # Сериализуем (sets → lists)
    result = []
    for name, data in sorted(artists.items()):
        result.append({
            "name": name,
            "genres": sorted(data["genres"]),
            "styles": sorted(data["styles"]),
            "thumb": data["thumb"],
            "source": "discogs",
            "country": "RU",
        })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Сохранено в {OUTPUT_FILE}")
    print(f"\nТоп-10 артистов по кол-ву жанров:")
    top = sorted(result, key=lambda x: len(x["genres"]), reverse=True)[:10]
    for a in top:
        print(f"  {a['name']} — {', '.join(a['genres'])}")


if __name__ == "__main__":
    main()
