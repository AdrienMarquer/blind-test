#!/usr/bin/env python3
"""Generate the consolidated 3k-song catalog for seeding the blind-test database."""

from __future__ import annotations

import csv
import json
import math
import random
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
RAW_DATA = ROOT / "apps" / "server" / "data" / "raw" / "spotify_songs_2020-01-21.csv"
MANUAL_FR_FILE = ROOT / "apps" / "server" / "data" / "manual-french-songs.tsv"
OUTPUT_PATH = ROOT / "apps" / "server" / "data" / "song-catalog.json"

DECADE_TARGETS: Dict[int, int] = {
    1960: 150,
    1970: 350,
    1980: 400,
    1990: 500,
    2000: 600,
    2010: 800,
    2020: 100,
}

FILM_KEYWORDS = [
    "motion picture",
    "soundtrack",
    "ost",
    "original score",
    "original film",
    "from the film",
    "from \u201c",
    "from \"",
    "anime",
    "animé",
    "opening theme",
    "ending theme",
    "netflix film",
    "pixar",
    "marvel",
    "ost",
    "score version",
]

FRENCH_ARTIST_PATTERNS = [
    "stromae",
    "angele",
    "aya nakamura",
    "indila",
    "christine and the queens",
    "orelsan",
    "soprano",
    "jul",
    "nekfeu",
    "pnl",
    "maitre gims",
    "maître gims",
    "gims",
    "black m",
    "clara luciani",
    "louane",
    "vianney",
    "camelia jordana",
    "camélia jordana",
    "mc solaar",
    "iam",
    "ntm",
    "yelle",
    "booba",
    "keny arkana",
    "lomepal",
    "hoshi",
    "bigflo & oli",
    "alonzo",
    "kaaris",
    "sch",
    "sexion d'assaut",
    "sexion d\'assaut",
    "dadju",
    "phoenix",
    "justice",
    "caravan palace",
    "daft punk",
    "air",
    "david guetta",
    "madeon",
    "petit biscuit",
    "kavinsky",
    "breakbot",
    "yuksek",
    "rone",
    "cassius",
    "charlotte gainsbourg",
    "vanessa paradis",
    "indochine",
    "noir desir",
    "tryo",
    "manau",
    "louise attaque",
    "jacques brel",
    "serge gainsbourg",
    "francis cabrel",
    "jean-jacques goldman",
    "mylene farmer",
    "zaz",
    "zazie",
    "patrick bruel",
    "renaud",
    "benabar",
    "bénabar",
    "raphael",
    "raphäel",
    "calogero",
    "kyo",
    "diam's",
    "vitaa",
    "jenifer",
    "amel bent",
    "chimene badi",
    "chimène badi",
    "tal",
    "bb brunes",
    "louise attaque",
    "suprême ntm",
    "suprême n.t.m",
]

rng = random.Random(42)


def parse_year(date_str: str) -> int | None:
    if not date_str:
        return None
    year_part = date_str.strip().split('-')[0]
    return int(year_part) if year_part.isdigit() else None


def is_soundtrack(row: Dict[str, str]) -> bool:
    combined = f"{row['track_name']} {row['track_album_name']}".lower()
    return any(keyword in combined for keyword in FILM_KEYWORDS)


def detect_language(row: Dict[str, str]) -> str:
    artist = row['track_artist'].lower()
    if any(pattern in artist for pattern in FRENCH_ARTIST_PATTERNS):
        return 'fr'
    if row['playlist_genre'] == 'latin':
        return 'es'
    return 'en'


def origin_markets(language: str) -> List[str]:
    if language == 'fr':
        return ['FR', 'BE', 'CA']
    if language == 'es':
        return ['ES', 'MX', 'AR']
    return ['GLOBAL']


def stratified_sample(bucket: List[Dict[str, str]], target: int) -> List[Dict[str, str]]:
    if len(bucket) <= target:
        return list(bucket)

    groups: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in bucket:
        groups[row['playlist_genre']].append(row)

    total = sum(len(items) for items in groups.values())
    allocations: Dict[str, int] = {}
    for genre, items in groups.items():
        allocations[genre] = max(1, int(round(target * len(items) / total)))
        allocations[genre] = min(allocations[genre], len(items))

    current = sum(allocations.values())
    if current < target:
        diff = target - current
        ordered = sorted(
            groups.items(),
            key=lambda kv: (len(kv[1]) - allocations[kv[0]], len(kv[1])),
            reverse=True,
        )
        for genre, items in ordered:
            if diff <= 0:
                break
            available = len(items) - allocations[genre]
            if available <= 0:
                continue
            add = min(diff, available)
            allocations[genre] += add
            diff -= add
    elif current > target:
        diff = current - target
        for genre, _ in sorted(allocations.items(), key=lambda kv: kv[1], reverse=True):
            if diff == 0:
                break
            while allocations[genre] > 1 and diff > 0:
                allocations[genre] -= 1
                diff -= 1
                if diff == 0:
                    break

    sampled: List[Dict[str, str]] = []
    for genre, items in groups.items():
        count = allocations.get(genre, 0)
        if count <= 0:
            continue
        if count >= len(items):
            sampled.extend(items)
        else:
            sampled.extend(rng.sample(items, count))
    return sampled


def load_spotify_records() -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []
    seen_ids = set()

    with RAW_DATA.open(encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row['track_id'] in seen_ids:
                continue
            year = parse_year(row['track_album_release_date'])
            if year is None or year < 1960:
                continue
            decade = (year // 10) * 10
            if decade < 1960 or decade not in DECADE_TARGETS:
                continue
            if is_soundtrack(row):
                continue
            seen_ids.add(row['track_id'])
            row['release_year'] = year
            row['decade'] = decade
            records.append(row)
    return records


def select_spotify_subset(records: List[Dict[str, str]]) -> List[Dict[str, str]]:
    selected: List[Dict[str, str]] = []
    used_ids = set()

    for decade, target in DECADE_TARGETS.items():
        bucket = [r for r in records if r['decade'] == decade and r['track_id'] not in used_ids]
        if not bucket:
            continue
        picks = stratified_sample(bucket, target)
        if len(picks) < target:
            remaining = [r for r in bucket if r['track_id'] not in {p['track_id'] for p in picks}]
            needed = target - len(picks)
            if remaining and needed > 0:
                extra = rng.sample(remaining, min(needed, len(remaining)))
                picks.extend(extra)
        for row in picks:
            used_ids.add(row['track_id'])
        selected.extend(picks[:target])  # guard against over-allocation
    return selected


def spotify_row_to_entry(row: Dict[str, str]) -> Dict[str, object]:
    language = detect_language(row)
    duration_seconds = round(float(row['duration_ms']) / 1000, 2)
    bpm = round(float(row['tempo']), 3)
    popularity = int(row['track_popularity']) if row['track_popularity'] else None
    niche = bool(popularity is not None and popularity < 45)
    audio_features = {
        'danceability': float(row['danceability']),
        'energy': float(row['energy']),
        'speechiness': float(row['speechiness']),
        'acousticness': float(row['acousticness']),
        'instrumentalness': float(row['instrumentalness']),
        'liveness': float(row['liveness']),
        'valence': float(row['valence']),
        'tempo': bpm,
    }
    tags = sorted({row['playlist_genre'], row['playlist_subgenre'], language})
    return {
        'id': f"spotify:{row['track_id']}",
        'title': row['track_name'],
        'artist': row['track_artist'],
        'album': row['track_album_name'],
        'releaseYear': row['release_year'],
        'releaseDate': row['track_album_release_date'],
        'primaryGenre': row['playlist_genre'],
        'subGenre': row['playlist_subgenre'],
        'language': language,
        'originMarkets': origin_markets(language),
        'durationSeconds': duration_seconds,
        'bpm': bpm,
        'audioFeatures': audio_features,
        'popularity': popularity,
        'niche': niche,
        'source': 'spotify-tidytuesday-2020-01-21',
        'availableProviders': ['spotify', 'youtube', 'deezer'],
        'searchHints': {
            'youtube': f"{row['track_artist']} {row['track_name']}",
            'spotify': f"spotify:track:{row['track_id']}",
            'deezer': f"{row['track_artist']} {row['track_name']}",
        },
        'clip': {
            'startSeconds': 30,
            'durationSeconds': 45,
        },
        'languageConfidence': 'heuristic',
        'tags': tags,
        'datasetMeta': {
            'playlistId': row['playlist_id'],
            'playlistName': row['playlist_name'],
        },
    }


def load_manual_french_songs() -> List[Dict[str, object]]:
    manual_rows: List[Dict[str, object]] = []
    with MANUAL_FR_FILE.open(encoding='utf-8') as handle:
        reader = csv.DictReader(handle, delimiter='\t')
        for row in reader:
            year = int(row['year'])
            slug = re.sub(r'[^a-z0-9]+', '-', f"{row['artist']} {row['title']} {year}".lower()).strip('-')
            manual_rows.append({
                'id': f'manual:{slug}',
                'title': row['title'],
                'artist': row['artist'],
                'album': row['album'],
                'releaseYear': year,
                'releaseDate': f"{year}-01-01",
                'primaryGenre': row['primary_genre'],
                'subGenre': row['subgenre'],
                'language': row['language'],
                'originMarkets': ['FR', 'BE', 'CA'],
                'durationSeconds': None,
                'bpm': None,
                'audioFeatures': None,
                'popularity': None,
                'niche': False,
                'source': 'manual-french-classics',
                'availableProviders': ['youtube', 'deezer', 'manual'],
                'searchHints': {
                    'youtube': row['youtube_hint'],
                },
                'clip': {
                    'startSeconds': 30,
                    'durationSeconds': 45,
                },
                'languageConfidence': 'curated',
                'tags': sorted({row['primary_genre'], row['subgenre'], 'francophone'}),
                'datasetMeta': None,
            })
    return manual_rows


def main() -> None:
    if not RAW_DATA.exists():
        raise SystemExit(f"Missing dataset: {RAW_DATA}")

    spotify_records = load_spotify_records()
    spotify_selected = select_spotify_subset(spotify_records)
    spotify_entries = [spotify_row_to_entry(row) for row in spotify_selected]
    key_lookup = {(entry['title'].lower().strip(), entry['artist'].lower().strip()) for entry in spotify_entries}

    manual_entries = []
    skipped_manual = 0
    for entry in load_manual_french_songs():
        key = (entry['title'].lower().strip(), entry['artist'].lower().strip())
        if key in key_lookup:
            skipped_manual += 1
            continue
        manual_entries.append(entry)
        key_lookup.add(key)

    combined = spotify_entries + manual_entries

    if len(combined) < 3000:
        needed = 3000 - len(combined)
        remaining = [row for row in spotify_records if (row['track_name'].lower().strip(), row['track_artist'].lower().strip()) not in key_lookup]
        rng.shuffle(remaining)
        for row in remaining[:needed]:
            entry = spotify_row_to_entry(row)
            key_lookup.add((entry['title'].lower().strip(), entry['artist'].lower().strip()))
            combined.append(entry)

    combined.sort(key=lambda item: (item['releaseYear'], item['title']))

    metadata = {
        'generatedAt': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'sourceFiles': {
            'spotify': str(RAW_DATA.relative_to(ROOT)),
            'manualFrench': str(MANUAL_FR_FILE.relative_to(ROOT)),
        },
        'recordCount': len(combined),
        'notes': [
            'Base dataset built from the Spotify + TidyTuesday 2020-01-21 playlists (pop, rock, latin, rap, r&b, edm).',
            'Filtered out soundtrack/anime keywords and releases before 1960.',
            'Added 100 manually curated French classics spanning 1960-2021.',
            f"Manual duplicates skipped: {skipped_manual}",
        ],
        'breakdown': {
            'byDecade': Counter(entry['releaseYear'] // 10 * 10 for entry in combined),
            'byPrimaryGenre': Counter(entry['primaryGenre'] for entry in combined),
            'byLanguage': Counter(entry['language'] for entry in combined),
        },
    }

    payload = {
        'metadata': metadata,
        'songs': combined,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)

    print(f"Wrote {len(combined)} songs to {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
