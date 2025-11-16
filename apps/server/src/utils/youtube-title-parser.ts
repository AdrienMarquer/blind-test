/**
 * YouTube Title Parser
 * Parses YouTube video titles to extract artist, title, and year
 *
 * Common formats:
 * - "Artist - Title"
 * - "Artist - Title (Year)"
 * - "Title by Artist"
 * - "Artist - Title [Official Video]"
 * - "Artist feat. Artist2 - Title"
 */

export interface ParsedYouTubeTitle {
	artist: string | null;
	title: string | null;
	year: number | null;
	originalTitle: string;
}

// Common suffixes to remove from titles
const COMMON_SUFFIXES = [
	/\[official\s+video\]/gi,
	/\(official\s+video\)/gi,
	/\[official\s+music\s+video\]/gi,
	/\(official\s+music\s+video\)/gi,
	/\[official\s+audio\]/gi,
	/\(official\s+audio\)/gi,
	/\[official\s+lyric\s+video\]/gi,
	/\(official\s+lyric\s+video\)/gi,
	/\[lyrics\]/gi,
	/\(lyrics\)/gi,
	/\[hd\]/gi,
	/\(hd\)/gi,
	/\[4k\]/gi,
	/\(4k\)/gi,
	/\[official\]/gi,
	/\(official\)/gi,
	/\[visualizer\]/gi,
	/\(visualizer\)/gi,
	/\[audio\]/gi,
	/\(audio\)/gi,
];

// Words to clean from artist/title
const NOISE_WORDS = [
	'official',
	'video',
	'music',
	'audio',
	'lyric',
	'lyrics',
	'hd',
	'4k',
	'visualizer',
];

/**
 * Clean a string by removing common noise words and extra whitespace
 */
function cleanString(str: string): string {
	let cleaned = str.trim();

	// Remove noise words at the beginning/end
	const noisePattern = new RegExp(`^(${NOISE_WORDS.join('|')})\\s+|\\s+(${NOISE_WORDS.join('|')})$`, 'gi');
	cleaned = cleaned.replace(noisePattern, '');

	// Remove multiple spaces
	cleaned = cleaned.replace(/\s+/g, ' ').trim();

	return cleaned;
}

/**
 * Extract year from a string
 * Looks for 4-digit year in parentheses or brackets
 */
function extractYear(str: string): { year: number | null; cleanedString: string } {
	// Match year in parentheses or brackets: (2020), [2020], (2020)
	const yearPattern = /[\(\[](\d{4})[\)\]]/g;
	const matches = [...str.matchAll(yearPattern)];

	let year: number | null = null;
	let cleanedString = str;

	for (const match of matches) {
		const potentialYear = parseInt(match[1]);
		const currentYear = new Date().getFullYear();

		// Validate year is reasonable (1900 to current year + 1)
		if (potentialYear >= 1900 && potentialYear <= currentYear + 1) {
			year = potentialYear;
			// Remove the year from the string
			cleanedString = cleanedString.replace(match[0], '');
			break;
		}
	}

	return {
		year,
		cleanedString: cleanedString.trim()
	};
}

/**
 * Remove common suffixes from the title
 */
function removeSuffixes(title: string): string {
	let cleaned = title;

	for (const suffix of COMMON_SUFFIXES) {
		cleaned = cleaned.replace(suffix, '');
	}

	return cleaned.trim();
}

/**
 * Parse YouTube title using various format strategies
 */
export function parseYouTubeTitle(title: string): ParsedYouTubeTitle {
	const originalTitle = title;

	// Step 1: Extract year
	const { year, cleanedString } = extractYear(title);
	let workingTitle = cleanedString;

	// Step 2: Remove common suffixes
	workingTitle = removeSuffixes(workingTitle);

	// Step 3: Try different parsing strategies

	// Strategy 1: "Artist - Title" format (most common)
	const dashMatch = workingTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
	if (dashMatch) {
		const [, artistPart, titlePart] = dashMatch;

		// Clean up artist and title
		const artist = cleanString(artistPart);
		const title = cleanString(titlePart);

		if (artist && title) {
			return {
				artist,
				title,
				year,
				originalTitle
			};
		}
	}

	// Strategy 2: "Title by Artist" format
	const byMatch = workingTitle.match(/^(.+?)\s+by\s+(.+)$/i);
	if (byMatch) {
		const [, titlePart, artistPart] = byMatch;

		const artist = cleanString(artistPart);
		const title = cleanString(titlePart);

		if (artist && title) {
			return {
				artist,
				title,
				year,
				originalTitle
			};
		}
	}

	// Strategy 3: "Artist: Title" format
	const colonMatch = workingTitle.match(/^(.+?)\s*:\s*(.+)$/);
	if (colonMatch) {
		const [, artistPart, titlePart] = colonMatch;

		const artist = cleanString(artistPart);
		const title = cleanString(titlePart);

		if (artist && title) {
			return {
				artist,
				title,
				year,
				originalTitle
			};
		}
	}

	// Strategy 4: No clear delimiter found
	// Return the whole cleaned title as title, no artist
	return {
		artist: null,
		title: cleanString(workingTitle) || originalTitle,
		year,
		originalTitle
	};
}

/**
 * Parse multiple YouTube titles in batch
 */
export function parseYouTubeTitles(titles: string[]): ParsedYouTubeTitle[] {
	return titles.map(parseYouTubeTitle);
}

/**
 * Create a Spotify search query from parsed title
 */
export function createSpotifyQuery(parsed: ParsedYouTubeTitle, fallbackArtist?: string): string {
	const artist = parsed.artist || fallbackArtist || '';
	const title = parsed.title || '';

	if (artist && title) {
		return `${artist} ${title}`;
	}

	return title || parsed.originalTitle;
}
