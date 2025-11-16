/**
 * GenreMapper - Normalizes music genres from various sources to canonical forms
 *
 * This service maps provider-specific genre strings (Spotify, AI, etc.) to a
 * standardized set of canonical genres. It handles:
 * - Case normalization
 * - Multi-word variations ("hip hop" vs "hip-hop")
 * - Subgenre to parent genre mapping
 * - Provider-specific format differences
 */

export const CANONICAL_GENRES = [
  // Rock Family
  'Rock',
  'Metal',
  'Punk',
  'Alternative',
  'Indie',

  // Pop Family
  'Pop',
  'K-Pop',
  'Chanson',

  // Urban Family
  'Hip-Hop/Rap',
  'R&B',
  'Soul',
  'Funk',

  // Electronic Family
  'Electronic',
  'House',
  'Techno',
  'Trance',
  'Drum & Bass',
  'Dubstep',
  'Ambient',

  // Traditional/World
  'Jazz',
  'Blues',
  'Country',
  'Folk',
  'Classical',
  'Latin',
  'Reggae',
  'Reggaeton',
  'Afrobeat',
] as const;

export type CanonicalGenre = typeof CANONICAL_GENRES[number];

/**
 * Mapping from provider-specific genre strings to canonical genres
 * Keys are lowercase for case-insensitive matching
 */
const GENRE_MAPPING: Record<string, CanonicalGenre> = {
  // Rock Family
  'rock': 'Rock',
  'classic rock': 'Rock',
  'hard rock': 'Rock',
  'soft rock': 'Rock',
  'rock and roll': 'Rock',
  'rock n roll': 'Rock',
  'garage rock': 'Rock',
  'psychedelic rock': 'Rock',
  'progressive rock': 'Rock',
  'southern rock': 'Rock',
  'glam rock': 'Rock',

  'metal': 'Metal',
  'heavy metal': 'Metal',
  'death metal': 'Metal',
  'black metal': 'Metal',
  'metalcore': 'Metal',
  'thrash metal': 'Metal',
  'nu metal': 'Metal',
  'power metal': 'Metal',
  'doom metal': 'Metal',
  'progressive metal': 'Metal',

  'punk': 'Punk',
  'punk rock': 'Punk',
  'pop punk': 'Punk',
  'hardcore punk': 'Punk',
  'post-punk': 'Punk',
  'skate punk': 'Punk',
  'anarcho-punk': 'Punk',

  'alternative': 'Alternative',
  'alternative rock': 'Alternative',
  'grunge': 'Alternative',
  'post-grunge': 'Alternative',
  'britpop': 'Alternative',
  'shoegaze': 'Alternative',

  'indie': 'Indie',
  'indie rock': 'Indie',
  'indie pop': 'Indie',
  'indie folk': 'Indie',
  'indie electronic': 'Indie',
  'lo-fi': 'Indie',
  'bedroom pop': 'Indie',

  // Pop Family
  'pop': 'Pop',
  'dance pop': 'Pop',
  'electropop': 'Pop',
  'art pop': 'Pop',
  'pop rock': 'Pop',
  'synth pop': 'Pop',
  'synthpop': 'Pop',
  'bubblegum pop': 'Pop',
  'dream pop': 'Pop',
  'power pop': 'Pop',
  'europop': 'Pop',

  'k-pop': 'K-Pop',
  'kpop': 'K-Pop',
  'korean pop': 'K-Pop',

  'chanson': 'Chanson',
  'chanson française': 'Chanson',
  'chanson francaise': 'Chanson',
  'french pop': 'Chanson',
  'variété française': 'Chanson',
  'variete francaise': 'Chanson',

  // Urban Family
  'hip hop': 'Hip-Hop/Rap',
  'hip-hop': 'Hip-Hop/Rap',
  'rap': 'Hip-Hop/Rap',
  'rap français': 'Hip-Hop/Rap',
  'rap francais': 'Hip-Hop/Rap',
  'french rap': 'Hip-Hop/Rap',
  'trap': 'Hip-Hop/Rap',
  'drill': 'Hip-Hop/Rap',
  'gangsta rap': 'Hip-Hop/Rap',
  'conscious hip hop': 'Hip-Hop/Rap',
  'underground hip hop': 'Hip-Hop/Rap',
  'old school hip hop': 'Hip-Hop/Rap',
  'boom bap': 'Hip-Hop/Rap',
  'cloud rap': 'Hip-Hop/Rap',
  'mumble rap': 'Hip-Hop/Rap',
  'emo rap': 'Hip-Hop/Rap',

  'r&b': 'R&B',
  'r and b': 'R&B',
  'rnb': 'R&B',
  'contemporary r&b': 'R&B',
  'neo soul': 'R&B',
  'alternative r&b': 'R&B',

  'soul': 'Soul',
  'funk soul': 'Soul',
  'northern soul': 'Soul',
  'southern soul': 'Soul',
  'motown': 'Soul',

  'funk': 'Funk',
  'funk rock': 'Funk',
  'p-funk': 'Funk',
  'p funk': 'Funk',
  'disco funk': 'Funk',
  'electro-funk': 'Funk',
  'g-funk': 'Funk',

  // Electronic Family
  'electronic': 'Electronic',
  'edm': 'Electronic',
  'electro': 'Electronic',
  'electronica': 'Electronic',
  'electronic dance music': 'Electronic',
  'idm': 'Electronic',
  'downtempo': 'Electronic',
  'glitch': 'Electronic',
  'breakbeat': 'Electronic',
  'uk garage': 'Electronic',
  '2-step': 'Electronic',

  'house': 'House',
  'deep house': 'House',
  'progressive house': 'House',
  'tech house': 'House',
  'electro house': 'House',
  'future house': 'House',
  'tropical house': 'House',
  'acid house': 'House',
  'chicago house': 'House',

  'techno': 'Techno',
  'detroit techno': 'Techno',
  'minimal techno': 'Techno',
  'acid techno': 'Techno',
  'hard techno': 'Techno',

  'trance': 'Trance',
  'progressive trance': 'Trance',
  'uplifting trance': 'Trance',
  'psytrance': 'Trance',
  'vocal trance': 'Trance',
  'hard trance': 'Trance',

  'drum and bass': 'Drum & Bass',
  'drum & bass': 'Drum & Bass',
  'dnb': 'Drum & Bass',
  'jungle': 'Drum & Bass',
  'liquid dnb': 'Drum & Bass',
  'liquid drum and bass': 'Drum & Bass',
  'neurofunk': 'Drum & Bass',

  'dubstep': 'Dubstep',
  'brostep': 'Dubstep',
  'chillstep': 'Dubstep',
  'riddim': 'Dubstep',
  'deep dubstep': 'Dubstep',

  'ambient': 'Ambient',
  'ambient electronic': 'Ambient',
  'dark ambient': 'Ambient',
  'drone': 'Ambient',
  'space music': 'Ambient',

  // Traditional/World
  'jazz': 'Jazz',
  'smooth jazz': 'Jazz',
  'jazz fusion': 'Jazz',
  'bebop': 'Jazz',
  'swing': 'Jazz',
  'cool jazz': 'Jazz',
  'free jazz': 'Jazz',
  'hard bop': 'Jazz',
  'latin jazz': 'Jazz',
  'gypsy jazz': 'Jazz',
  'modal jazz': 'Jazz',

  'blues': 'Blues',
  'blues rock': 'Blues',
  'electric blues': 'Blues',
  'delta blues': 'Blues',
  'chicago blues': 'Blues',
  'acoustic blues': 'Blues',
  'country blues': 'Blues',

  'country': 'Country',
  'country pop': 'Country',
  'country rock': 'Country',
  'alt-country': 'Country',
  'bluegrass': 'Country',
  'outlaw country': 'Country',
  'contemporary country': 'Country',
  'honky tonk': 'Country',

  'folk': 'Folk',
  'folk rock': 'Folk',
  'contemporary folk': 'Folk',
  'folk pop': 'Folk',
  'traditional folk': 'Folk',
  'celtic': 'Folk',
  'americana': 'Folk',

  'classical': 'Classical',
  'baroque': 'Classical',
  'romantic': 'Classical',
  'contemporary classical': 'Classical',
  'opera': 'Classical',
  'orchestral': 'Classical',
  'chamber music': 'Classical',
  'symphony': 'Classical',

  'latin': 'Latin',
  'latin pop': 'Latin',
  'salsa': 'Latin',
  'bachata': 'Latin',
  'cumbia': 'Latin',
  'merengue': 'Latin',
  'son': 'Latin',
  'tropical': 'Latin',
  'latin rock': 'Latin',

  'reggae': 'Reggae',
  'dub': 'Reggae',
  'ska': 'Reggae',
  'dancehall': 'Reggae',
  'roots reggae': 'Reggae',
  'lovers rock': 'Reggae',

  'reggaeton': 'Reggaeton',
  'urbano latino': 'Reggaeton',
  'latin urban': 'Reggaeton',

  'afrobeat': 'Afrobeat',
  'afro-pop': 'Afrobeat',
  'afropop': 'Afrobeat',
  'afro house': 'Afrobeat',
  'afrobeats': 'Afrobeat',
  'afro-fusion': 'Afrobeat',
};

export class GenreMapper {
  /**
   * Normalize a genre string to its canonical form
   * Returns 'Unknown' if no mapping is found
   */
  static normalize(genre: string | undefined | null): CanonicalGenre | 'Unknown' {
    if (!genre || typeof genre !== 'string') {
      return 'Unknown';
    }

    const normalizedInput = genre.trim().toLowerCase();

    // Direct mapping lookup
    const canonical = GENRE_MAPPING[normalizedInput];
    if (canonical) {
      return canonical;
    }

    // Fuzzy matching: check if any mapping key is contained in the input
    // e.g., "alternative indie rock" contains "indie rock" → Indie
    const mappingKeys = Object.keys(GENRE_MAPPING).sort((a, b) => b.length - a.length);
    for (const key of mappingKeys) {
      if (normalizedInput.includes(key)) {
        return GENRE_MAPPING[key];
      }
    }

    // Check if input contains any canonical genre name
    for (const canonical of CANONICAL_GENRES) {
      if (normalizedInput.includes(canonical.toLowerCase())) {
        return canonical;
      }
    }

    return 'Unknown';
  }

  /**
   * Normalize an array of genres, returning primary genre and optional subgenre
   * Useful for providers that return multiple genres (like Spotify)
   */
  static normalizeWithSubgenre(
    genres: string[] | undefined | null
  ): { genre: CanonicalGenre | 'Unknown'; subgenre?: string } {
    if (!genres || genres.length === 0) {
      return { genre: 'Unknown' };
    }

    // Try to normalize each genre until we find a valid one
    let primaryGenre: CanonicalGenre | 'Unknown' = 'Unknown';
    let firstValidIndex = -1;

    for (let i = 0; i < genres.length; i++) {
      const normalized = this.normalize(genres[i]);
      if (normalized !== 'Unknown') {
        primaryGenre = normalized;
        firstValidIndex = i;
        break;
      }
    }

    // If we found a valid genre, use the original string as subgenre
    // If there are multiple genres, pick a different one as subgenre
    let subgenre: string | undefined;
    if (firstValidIndex !== -1 && genres.length > 1) {
      // Pick the first genre that's different from the one we used for primary
      subgenre = genres.find((g, idx) => idx !== firstValidIndex)?.trim();
    } else if (firstValidIndex !== -1) {
      // Only one genre - use it as subgenre too (preserves provider detail)
      subgenre = genres[firstValidIndex].trim();
    }

    return { genre: primaryGenre, subgenre };
  }

  /**
   * Get all canonical genres
   */
  static getAllGenres(): readonly CanonicalGenre[] {
    return CANONICAL_GENRES;
  }

  /**
   * Check if a string is a valid canonical genre
   */
  static isCanonical(genre: string): genre is CanonicalGenre {
    return CANONICAL_GENRES.includes(genre as CanonicalGenre);
  }

  /**
   * Get genre statistics (useful for debugging/admin)
   */
  static getMappingStats(): {
    canonicalCount: number;
    mappingCount: number;
    averageMappingsPerGenre: number;
  } {
    const mappingCount = Object.keys(GENRE_MAPPING).length;
    const canonicalCount = CANONICAL_GENRES.length;

    return {
      canonicalCount,
      mappingCount,
      averageMappingsPerGenre: Math.round(mappingCount / canonicalCount),
    };
  }
}
