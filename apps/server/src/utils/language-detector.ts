/**
 * Detect language from text
 * TODO: Will be replaced with AI-based detection in the future
 */
export function detectLanguageFromText(text: string): string | null {
	// Placeholder - will be implemented with AI later
	return null;
}

/**
 * Detect song language from title and artist
 * TODO: Will be replaced with AI-based detection in the future
 */
export function detectSongLanguage(title: string, artist: string): string {
	// Default to English until AI detection is implemented
	return 'en';
}

/**
 * Detect language from Spotify market code
 */
export function marketToLanguage(marketCode: string): string {
	// Common market to language mapping
	const marketMap: Record<string, string> = {
		US: 'en',
		GB: 'en',
		CA: 'en',
		AU: 'en',
		NZ: 'en',
		IE: 'en',
		FR: 'fr',
		ES: 'es',
		DE: 'de',
		IT: 'it',
		PT: 'pt',
		BR: 'pt',
		NL: 'nl',
		SE: 'sv',
		NO: 'no',
		DK: 'da',
		FI: 'fi',
		PL: 'pl',
		RU: 'ru',
		JP: 'ja',
		KR: 'ko',
		CN: 'zh',
		TR: 'tr',
		AR: 'ar',
		IN: 'hi',
		MX: 'es'
	};

	return marketMap[marketCode.toUpperCase()] || 'en';
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
	const names: Record<string, string> = {
		en: 'English',
		fr: 'French',
		es: 'Spanish',
		de: 'German',
		it: 'Italian',
		pt: 'Portuguese',
		nl: 'Dutch',
		ru: 'Russian',
		ja: 'Japanese',
		ko: 'Korean',
		zh: 'Chinese',
		ar: 'Arabic',
		hi: 'Hindi',
		sv: 'Swedish',
		no: 'Norwegian',
		da: 'Danish',
		fi: 'Finnish',
		pl: 'Polish',
		tr: 'Turkish'
	};

	return names[code] || code.toUpperCase();
}

/**
 * Validate language code (ISO 639-1)
 */
export function isValidLanguageCode(code: string): boolean {
	const validCodes = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'sv', 'no', 'da', 'fi', 'pl', 'tr'];
	return validCodes.includes(code);
}
