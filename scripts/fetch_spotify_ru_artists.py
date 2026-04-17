"""
Сбор российских артистов через Spotify Web API.
Стратегия:
  1. Собираем артистов из редакционных RU-плейлистов
  2. Для каждого нового артиста получаем related-artists (расширяем граф)
  3. Сохраняем в artists_ru.json и artists_ru.csv

Запуск:
  pip install requests
  python fetch_spotify_ru_artists.py
"""

import requests
import json
import csv
import time
from typing import Optional

CLIENT_ID     = '2d4fce2a45844abdb1b10df1d40eae7d'
CLIENT_SECRET = '8410f7ae6e9d45e69bbbdeca5df53a04'

# Известные редакционные плейлисты Spotify с российской музыкой
SEED_PLAYLISTS = [
    '37i9dQZF1DX7gIoKXt0gmx',  # New Music Russia
    '37i9dQZF1DWZMGBf5MYGSY',  # Хиты России
    '37i9dQZF1DX0ypQ16Fm7bF',  # Рок на русском
    '37i9dQZF1DX3mRVGXJgUxO',  # Русский рэп
    '37i9dQZF1DX6z20IXmBjWI',  # Инди по-русски
    '37i9dQZF1DX9oh43oAzkyx',  # Электронная Россия
    '37i9dQZF1DX2A29LI7xHn1',  # Поп Россия
    '37i9dQZEVXbL8l7ra5vVdB',  # Top 50 Russia (charts)
    '37i9dQZF1DWVRilxSJzAQS',  # Русский рок
    '37i9dQZF1DX9oh43oAzkyx',  # Electronic Russia
    '37i9dQZF1DX5KpyM9HnFJY',  # Русский джаз
]

# Поисковые запросы для дополнительного охвата
SEARCH_QUERIES = [
    'genre:"russian rock"',
    'genre:"russian pop"',
    'genre:"russian hip hop"',
    'genre:"russian metal"',
    'genre:"indie russian"',
    'genre:"russian folk"',
    'genre:"russian jazz"',
]

TOKEN_URL = 'https://accounts.spotify.com/api/token'
API_BASE  = 'https://api.spotify.com/v1'


def get_token() -> str:
    resp = requests.post(TOKEN_URL, data={
        'grant_type':    'client_credentials',
        'client_id':     CLIENT_ID,
        'client_secret': CLIENT_SECRET,
    })
    resp.raise_for_status()
    return resp.json()['access_token']


def headers(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


def safe_get(url: str, token: str, params: dict = {}) -> Optional[dict]:
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers(token), params=params, timeout=10)
            if r.status_code == 429:
                wait = int(r.headers.get('Retry-After', 5))
                print(f'  Rate limit — ждём {wait}s...')
                time.sleep(wait)
                continue
            if r.status_code == 401:
                return None  # токен протух — вызывающий должен обновить
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f'  Ошибка ({attempt+1}/3): {e}')
            time.sleep(2)
    return None


def get_playlist_artists(playlist_id: str, token: str) -> list[dict]:
    artists = {}
    url = f'{API_BASE}/playlists/{playlist_id}/tracks'
    params = {'limit': 100, 'offset': 0, 'fields': 'items(track(artists)),next'}
    while url:
        data = safe_get(url, token, params)
        if not data:
            break
        for item in data.get('items', []):
            track = item.get('track')
            if not track:
                continue
            for a in track.get('artists', []):
                if a['id'] not in artists:
                    artists[a['id']] = {'id': a['id'], 'name': a['name']}
        url = data.get('next')
        params = {}
        time.sleep(0.1)
    return list(artists.values())


def get_artist_details(artist_id: str, token: str) -> Optional[dict]:
    data = safe_get(f'{API_BASE}/artists/{artist_id}', token)
    if not data:
        return None
    return {
        'id':         data['id'],
        'name':       data['name'],
        'genres':     data.get('genres', []),
        'popularity': data.get('popularity', 0),
        'followers':  data.get('followers', {}).get('total', 0),
        'spotify_url': data.get('external_urls', {}).get('spotify', ''),
        'image':      (data.get('images') or [{}])[0].get('url', ''),
    }


def get_related_artists(artist_id: str, token: str) -> list[dict]:
    data = safe_get(f'{API_BASE}/artists/{artist_id}/related-artists', token)
    if not data:
        return []
    return [{'id': a['id'], 'name': a['name']} for a in data.get('artists', [])]


def search_artists(query: str, token: str, market: str = 'RU') -> list[dict]:
    results = []
    for offset in range(0, 1000, 50):
        data = safe_get(f'{API_BASE}/search', token, {
            'q': query, 'type': 'artist', 'market': market,
            'limit': 50, 'offset': offset,
        })
        if not data:
            break
        items = data.get('artists', {}).get('items', [])
        if not items:
            break
        for a in items:
            results.append({'id': a['id'], 'name': a['name']})
        time.sleep(0.15)
    return results


def is_russian_artist(genres: list[str]) -> bool:
    """Эвристика: хотя бы один жанр содержит 'russian' или 'russian-'"""
    ru_keywords = ['russian', 'russisk', 'rus ']
    for g in genres:
        g_low = g.lower()
        if any(kw in g_low for kw in ru_keywords):
            return True
    return False


def main():
    print('=== Spotify RU Artists Fetcher ===\n')

    token = get_token()
    print(f'Токен получен.\n')

    # Все кандидаты: id -> name (ещё без деталей)
    candidates: dict[str, str] = {}

    # 1. Плейлисты
    print(f'[1/3] Собираем из {len(SEED_PLAYLISTS)} плейлистов...')
    for pid in SEED_PLAYLISTS:
        artists = get_playlist_artists(pid, token)
        for a in artists:
            candidates[a['id']] = a['name']
        print(f'  playlist {pid}: +{len(artists)} артистов (итого {len(candidates)})')
        time.sleep(0.2)

    # 2. Поиск по жанрам
    print(f'\n[2/3] Поиск по жанрам...')
    for q in SEARCH_QUERIES:
        found = search_artists(q, token)
        for a in found:
            candidates[a['id']] = a['name']
        print(f'  "{q}": +{len(found)} (итого {len(candidates)})')
        time.sleep(0.3)

    # 3. Загружаем детали и фильтруем/расширяем через related
    print(f'\n[3/3] Загружаем детали для {len(candidates)} кандидатов...')
    artists_final: dict[str, dict] = {}
    processed_related = set()
    ids_to_process = list(candidates.keys())

    i = 0
    while i < len(ids_to_process):
        aid = ids_to_process[i]
        i += 1

        if aid in artists_final:
            continue

        details = get_artist_details(aid, token)
        if not details:
            continue

        artists_final[aid] = details

        if i % 50 == 0:
            print(f'  {i}/{len(ids_to_process)} обработано, финальных: {len(artists_final)}')
            # Обновляем токен каждые 50 запросов на случай истечения
            token = get_token()

        # Расширяем граф через related только для артистов с российскими жанрами
        if aid not in processed_related and is_russian_artist(details['genres']):
            processed_related.add(aid)
            related = get_related_artists(aid, token)
            added = 0
            for ra in related:
                if ra['id'] not in artists_final and ra['id'] not in candidates:
                    ids_to_process.append(ra['id'])
                    candidates[ra['id']] = ra['name']
                    added += 1
            if added:
                pass  # тихо расширяем

        time.sleep(0.05)

    print(f'\nИтого артистов: {len(artists_final)}')

    # Сохраняем JSON
    out_json = 'artists_ru.json'
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(list(artists_final.values()), f, ensure_ascii=False, indent=2)
    print(f'Сохранено: {out_json}')

    # Сохраняем CSV
    out_csv = 'artists_ru.csv'
    fields = ['id', 'name', 'genres', 'popularity', 'followers', 'spotify_url', 'image']
    with open(out_csv, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for a in artists_final.values():
            row = dict(a)
            row['genres'] = ', '.join(a['genres'])
            w.writerow(row)
    print(f'Сохранено: {out_csv}')

    # Краткая статистика
    ru_count = sum(1 for a in artists_final.values() if is_russian_artist(a['genres']))
    print(f'\nСтатистика:')
    print(f'  Всего артистов:          {len(artists_final)}')
    print(f'  С российскими жанрами:   {ru_count}')
    print(f'  Средняя популярность:    {sum(a["popularity"] for a in artists_final.values()) // max(len(artists_final),1)}')


if __name__ == '__main__':
    main()
