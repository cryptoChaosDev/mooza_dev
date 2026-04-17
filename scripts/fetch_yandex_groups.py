"""
Выкачивает российские музыкальные группы с Яндекс.Музыки.

Установка:
    pip install yandex-music

Запуск:
    python fetch_yandex_groups.py --token YOUR_TOKEN

Результат: russian_groups.json
"""

import argparse
import json
import re
import time
import sys
from typing import Optional

try:
    from yandex_music import Client
except ImportError:
    print("Установите библиотеку: pip install yandex-music")
    sys.exit(1)


# ── Жанры для поиска (русскоязычный каталог) ──────────────────────────────────
GENRES = [
    "rock", "alternative", "metal", "hard-rock", "punk",
    "pop", "rusrap", "rusrock", "rnb",
    "electronic", "dance", "techno", "house",
    "jazz", "blues", "folk", "ethnic",
    "classical", "indie", "experimental",
    "reggae", "ska", "post-rock",
]

# Стартовые известные российские группы для обхода похожих
SEED_ARTISTS = [
    "Кино", "Аквариум", "ДДТ", "Алиса", "Пикник",
    "Сплин", "Земфира", "Ночные снайперы", "Мумий Тролль", "Би-2",
    "Ария", "Король и Шут", "Тараканы", "Наутилус Помпилиус",
    "Ленинград", "Машина времени", "Кино", "Воплі Відоплясова",
    "Brainstorm", "Агата Кристи", "Чиж и Ко", "Ногу свело",
    "Animal ДжаZ", "Сансара", "Shortparis", "Молчат Дома",
    "IC3PEAK", "Аигел", "Хаски", "Оксимирон",
    "Twenty One Pilots", "Гречка", "Антоха МС",
]

# Паттерны типичных «сольных» имён (Имя Фамилия, инициалы и т.д.)
# Если имя артиста совпадает — скорее всего сольник
SOLO_PATTERNS = [
    r"^[А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+$",          # Иван Иванов
    r"^[A-Z][a-z]+\s[A-Z][a-z]+$",                  # Ivan Ivanov
    r"^[А-ЯЁ][а-яё]+\s[А-ЯЁ]\.$",                  # Иван И.
    r"^[А-ЯЁ]\.\s[А-ЯЁ][а-яё]+$",                  # И. Иванов
    r"^DJ\s.+$",                                      # DJ ...
    r"^MC\s.+$",                                      # MC ...
]

SOLO_RE = [re.compile(p, re.IGNORECASE) for p in SOLO_PATTERNS]


def looks_like_solo(name: str) -> bool:
    """Эвристика: имя похоже на сольного исполнителя."""
    return any(r.match(name.strip()) for r in SOLO_RE)


def artist_to_dict(artist) -> Optional[dict]:
    """Преобразует объект Artist в словарь для сохранения."""
    try:
        name = artist.name
        if not name:
            return None

        genres = []
        if hasattr(artist, "genres") and artist.genres:
            genres = list(artist.genres)

        cover = None
        if hasattr(artist, "cover") and artist.cover:
            uri = getattr(artist.cover, "uri", None)
            if uri:
                cover = "https://" + uri.replace("%%", "200x200")

        description = None
        if hasattr(artist, "description") and artist.description:
            description = getattr(artist.description, "text", str(artist.description))

        return {
            "id": str(artist.id),
            "name": name,
            "genres": genres,
            "cover": cover,
            "description": description,
        }
    except Exception:
        return None


def fetch_all(token: str, output: str = "russian_groups.json"):
    client = Client(token).init()
    print("✓ Авторизация успешна\n")

    found: dict[str, dict] = {}   # id → dict
    visited_ids: set[str] = set()
    similar_queue: list[int] = []  # очередь для обхода похожих

    def add(artist) -> bool:
        d = artist_to_dict(artist)
        if not d:
            return False
        aid = d["id"]
        if aid in found:
            return False
        if looks_like_solo(d["name"]):
            return False
        found[aid] = d
        similar_queue.append(int(aid))
        return True

    # ── 1. Поиск по жанрам ────────────────────────────────────────────────────
    print("=== Поиск по жанрам ===")
    for genre in GENRES:
        page = 0
        while True:
            try:
                result = client.search(genre, type_="artist", page=page)
                if not result or not result.artists or not result.artists.results:
                    break
                batch = result.artists.results
                new = sum(1 for a in batch if add(a))
                print(f"  [{genre}] стр.{page} → +{new} групп (всего {len(found)})")
                # Если результатов меньше 20 — больше страниц нет
                if len(batch) < 20:
                    break
                page += 1
                time.sleep(0.3)
            except Exception as e:
                print(f"  [{genre}] ошибка стр.{page}: {e}")
                time.sleep(1)
                break

    # ── 2. Поиск по именам-сидам ──────────────────────────────────────────────
    print("\n=== Поиск по стартовым группам ===")
    for seed_name in SEED_ARTISTS:
        try:
            result = client.search(seed_name, type_="artist", page=0)
            if result and result.artists and result.artists.results:
                a = result.artists.results[0]
                if add(a):
                    print(f"  + {a.name}")
            time.sleep(0.2)
        except Exception as e:
            print(f"  Ошибка '{seed_name}': {e}")

    # ── 3. Обход похожих артистов (граф) ──────────────────────────────────────
    print(f"\n=== Обход похожих артистов (очередь: {len(similar_queue)}) ===")
    processed = 0
    while similar_queue:
        aid = similar_queue.pop(0)
        if aid in visited_ids:
            continue
        visited_ids.add(str(aid))

        try:
            brief = client.artists_brief_info(aid)
            if brief and brief.similar_artists:
                for a in brief.similar_artists:
                    add(a)
            processed += 1
            if processed % 50 == 0:
                print(f"  Обработано {processed}, найдено {len(found)}, в очереди {len(similar_queue)}")
            time.sleep(0.25)
        except Exception as e:
            time.sleep(0.5)

    # ── 4. Поиск по буквам русского алфавита ─────────────────────────────────
    print("\n=== Поиск по буквам алфавита ===")
    letters = "абвгдеёжзийклмнопрстуфхцчшщэюя"
    for ch in letters:
        page = 0
        while page < 5:  # не более 5 страниц на букву
            try:
                result = client.search(ch, type_="artist", page=page)
                if not result or not result.artists or not result.artists.results:
                    break
                batch = result.artists.results
                new = sum(1 for a in batch if add(a))
                if new == 0 and page > 0:
                    break
                print(f"  [{ch}] стр.{page} → +{new} (всего {len(found)})")
                if len(batch) < 20:
                    break
                page += 1
                time.sleep(0.3)
            except Exception as e:
                print(f"  [{ch}] ошибка: {e}")
                time.sleep(1)
                break

    # ── Сохранение ────────────────────────────────────────────────────────────
    result_list = sorted(found.values(), key=lambda x: x["name"])
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result_list, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Готово: {len(result_list)} групп сохранено в {output}")
    return result_list


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Выкачать российские группы с Яндекс.Музыки")
    parser.add_argument("--token", required=True, help="Токен Яндекс.Музыки")
    parser.add_argument("--output", default="russian_groups.json", help="Файл для сохранения")
    args = parser.parse_args()

    fetch_all(args.token, args.output)
