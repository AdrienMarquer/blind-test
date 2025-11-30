/**
 * Answer Generation Service
 * Generates plausible wrong answers for multiple choice gameplay
 */

import type { Song, MediaQuestion, AnswerChoice, MediaType } from '@blind-test/shared';
import { songRepository } from '../repositories';
import { logger } from '../utils/logger';

const serviceLogger = logger.child({ module: 'AnswerGeneration' });
const REQUIRED_CHOICE_COUNT = 4;
const REQUIRED_WRONG_ANSWERS = REQUIRED_CHOICE_COUNT - 1;

export interface WrongAnswer {
	title: string;
	artist: string;
	isInLibrary: boolean; // Always true - only library songs used
	score?: number; // Similarity score (for debugging)
}

export class AnswerGenerationService {
	private repository: { findAll: () => Promise<Song[]> };

	constructor(repository?: { findAll: () => Promise<Song[]> }) {
		// Allow dependency injection for testing, default to real songRepository
		this.repository = repository || songRepository;
	}

	private async getArtistDistractors(correctSong: Song, desiredCount: number): Promise<WrongAnswer[]> {
		const allSongs = await this.repository.findAll();
		if (!allSongs.length) {
			return [];
		}

		const targetGenre = correctSong.genre?.toLowerCase();
		const targetYear = Number.isFinite(correctSong.year) ? correctSong.year : undefined;
		const normalizedCorrectArtist = (correctSong.artist || 'Unknown Artist').toLowerCase();

		type ArtistCandidate = {
			normalizedArtist: string;
			artist: string;
			totalCount: number;
			sameGenreCount: number;
			closestYearDiff: number;
			referenceSong: Song;
		};

		const candidateMap = new Map<string, ArtistCandidate>();

		for (const candidateSong of allSongs) {
			if (candidateSong.id === correctSong.id) continue;
			const candidateArtist = candidateSong.artist || 'Unknown Artist';
			const normalizedArtist = candidateArtist.toLowerCase();
			if (normalizedArtist === normalizedCorrectArtist) continue;

			let candidate = candidateMap.get(normalizedArtist);
			if (!candidate) {
				candidate = {
					normalizedArtist,
					artist: candidateArtist,
					totalCount: 0,
					sameGenreCount: 0,
					closestYearDiff: Number.POSITIVE_INFINITY,
					referenceSong: candidateSong,
				};
				candidateMap.set(normalizedArtist, candidate);
			}

			candidate.totalCount += 1;

			const candidateGenre = candidateSong.genre?.toLowerCase();
			const sameGenre = targetGenre && candidateGenre === targetGenre;
			if (sameGenre) {
				candidate.sameGenreCount += 1;
				if (candidate.referenceSong.genre?.toLowerCase() !== targetGenre) {
					candidate.referenceSong = candidateSong;
				}
			}

			const candidateYear = typeof candidateSong.year === 'number' ? candidateSong.year : undefined;
			if (targetYear !== undefined && candidateYear !== undefined) {
				const yearDiff = Math.abs(candidateYear - targetYear);
				if (yearDiff < candidate.closestYearDiff) {
					candidate.closestYearDiff = yearDiff;
					candidate.referenceSong = candidateSong;
				}
			}
		}

		const candidates = Array.from(candidateMap.values());
		if (!candidates.length) {
			return [];
		}

		candidates.sort((a, b) => {
			if (a.sameGenreCount !== b.sameGenreCount) {
				return b.sameGenreCount - a.sameGenreCount;
			}
			const aYearDiff = Number.isFinite(a.closestYearDiff) ? a.closestYearDiff : Number.MAX_SAFE_INTEGER;
			const bYearDiff = Number.isFinite(b.closestYearDiff) ? b.closestYearDiff : Number.MAX_SAFE_INTEGER;
			if (aYearDiff !== bYearDiff) {
				return aYearDiff - bYearDiff;
			}
			if (a.totalCount !== b.totalCount) {
				return b.totalCount - a.totalCount;
			}
			return a.artist.localeCompare(b.artist);
		});

		return candidates.slice(0, desiredCount).map(candidate => ({
			title: candidate.referenceSong.title,
			artist: candidate.artist,
			isInLibrary: true,
		}));
	}

	private collectUniqueArtistAnswers(candidateGroups: WrongAnswer[][], correctArtist: string): WrongAnswer[] {
		const normalizedCorrect = (correctArtist || 'Unknown Artist').toLowerCase();
		const seen = new Set<string>([normalizedCorrect]);
		const unique: WrongAnswer[] = [];

		for (const group of candidateGroups) {
			for (const candidate of group) {
				if (!candidate) continue;
				const normalized = (candidate.artist || 'Unknown Artist').toLowerCase();
				if (seen.has(normalized)) {
					continue;
				}
				seen.add(normalized);
				unique.push({
					title: candidate.title,
					artist: candidate.artist || 'Unknown Artist',
					isInLibrary: candidate.isInLibrary,
					score: candidate.score,
				});

				if (unique.length === REQUIRED_WRONG_ANSWERS) {
					return unique;
				}
			}
		}

		return unique;
	}

	private async buildRandomArtistPool(correctSong: Song): Promise<WrongAnswer[]> {
		try {
			const exclusionIds = new Set<string>();
			exclusionIds.add(correctSong.id);
			const randomSongs = await this.getRandomSongs(correctSong, REQUIRED_WRONG_ANSWERS * 3, exclusionIds);
			return randomSongs.map(song => ({
				title: song.title,
				artist: song.artist || 'Unknown Artist',
				isInLibrary: true,
			}));
		} catch (error) {
			serviceLogger.error('Failed to build random artist pool', { error });
			return [];
		}
	}

	private ensureUniqueChoiceDisplayTexts(choices: AnswerChoice[], placeholderPrefix: string): AnswerChoice[] {
		const orderedChoices = [...choices].sort((a, b) => {
			if (a.correct === b.correct) return 0;
			return a.correct ? -1 : 1;
		});

		const seen = new Set<string>();
		const filtered: AnswerChoice[] = [];

		for (const choice of orderedChoices) {
			const key = choice.displayText.trim().toLowerCase();
			if (seen.has(key)) {
				serviceLogger.warn('Removing duplicate choice', {
					placeholderPrefix,
					displayText: choice.displayText,
				});
				continue;
			}
			seen.add(key);
			filtered.push(choice);
		}

		let placeholderIndex = 1;
		let addedPlaceholder = false;
		while (filtered.length < REQUIRED_CHOICE_COUNT) {
			const placeholderText = `Fallback ${placeholderPrefix} ${placeholderIndex}`;
			const key = placeholderText.toLowerCase();
			if (seen.has(key)) {
				placeholderIndex += 1;
				continue;
			}
			filtered.push({
				id: `choice-fallback-${placeholderPrefix.toLowerCase()}-${placeholderIndex}`,
				correct: false,
				displayText: placeholderText,
			});
			seen.add(key);
			addedPlaceholder = true;
			placeholderIndex += 1;
		}

		if (addedPlaceholder) {
			serviceLogger.warn('Added fallback choices to maintain required choice count', {
				placeholderPrefix,
				choiceCount: filtered.length,
			});
		}

		return filtered.slice(0, REQUIRED_CHOICE_COUNT);
	}

	/**
	 * Generate 3 plausible wrong answers for a song
	 * Strategy: Use similar songs from library, fallback to random songs
	 *
	 * GUARANTEED to return exactly 3 wrong answers
	 */
	async generateWrongAnswers(correctSong: Song): Promise<WrongAnswer[]> {
		serviceLogger.debug('Generating wrong answers', {
			title: correctSong.title,
			artist: correctSong.artist || 'Unknown Artist'
		});

		// Normalize artist field (handle undefined/empty)
		const normalizedCorrectSong = {
			...correctSong,
			artist: correctSong.artist || 'Unknown Artist'
		};

		try {
			// 1. Try to find similar songs from library
			const libraryCandidates = await this.findSimilarFromLibrary(normalizedCorrectSong);

			serviceLogger.debug('Library candidates found', { count: libraryCandidates.length });

			// 2. If we have enough from library, use them
			if (libraryCandidates.length >= REQUIRED_WRONG_ANSWERS) {
				const ranked = this.rankBySimilarity(normalizedCorrectSong, libraryCandidates);
				return ranked.slice(0, REQUIRED_WRONG_ANSWERS).map(song => ({
					title: song.title,
					artist: song.artist || 'Unknown Artist',
					isInLibrary: true,
					score: (song as any).score
				}));
			}

			// 3. Need more answers, start with library candidates
			const wrongAnswers: WrongAnswer[] = libraryCandidates.map(song => ({
				title: song.title,
				artist: song.artist || 'Unknown Artist',
				isInLibrary: true
			}));

			// 4. Still need more? Use random songs from entire library as fallback
			if (wrongAnswers.length < REQUIRED_WRONG_ANSWERS) {
				const stillNeeded = REQUIRED_WRONG_ANSWERS - wrongAnswers.length;
				serviceLogger.warn('Insufficient similar songs, using random fallback', {
					have: wrongAnswers.length,
					need: stillNeeded
				});

				// Get existing song IDs to avoid duplicates
				const existingIds = new Set<string>();
				existingIds.add(normalizedCorrectSong.id);
				libraryCandidates.forEach(s => existingIds.add(s.id));

				const randomSongs = await this.getRandomSongs(normalizedCorrectSong, stillNeeded * 2, existingIds);

				// Add unique random songs
				for (const song of randomSongs) {
					if (wrongAnswers.length >= REQUIRED_WRONG_ANSWERS) break;
					// Check if this song is already in our answers (by title/artist combo)
					const isDuplicate = wrongAnswers.some(
						wa => wa.title === song.title && wa.artist === (song.artist || 'Unknown Artist')
					);
					if (!isDuplicate) {
						wrongAnswers.push({
							title: song.title,
							artist: song.artist || 'Unknown Artist',
							isInLibrary: true
						});
					}
				}
			}

			serviceLogger.info('Generated wrong answers', {
				total: wrongAnswers.length,
				fromLibrary: wrongAnswers.length
			});

			// GUARANTEE: Always return exactly 3 answers
			if (wrongAnswers.length < REQUIRED_WRONG_ANSWERS) {
				// Emergency fallback - generate placeholder answers
				serviceLogger.error('CRITICAL: Could not generate 3 wrong answers, using placeholders', {
					generated: wrongAnswers.length
				});
				while (wrongAnswers.length < REQUIRED_WRONG_ANSWERS) {
					wrongAnswers.push({
						title: `Song ${wrongAnswers.length + 1}`,
						artist: 'Various Artists',
						isInLibrary: false
					});
				}
			}

			return wrongAnswers.slice(0, REQUIRED_WRONG_ANSWERS);
		} catch (error) {
			serviceLogger.error('CRITICAL: generateWrongAnswers failed completely', { error });
			// Emergency fallback - return placeholder answers
			return [
				{ title: 'Song A', artist: 'Artist A', isInLibrary: false },
				{ title: 'Song B', artist: 'Artist B', isInLibrary: false },
				{ title: 'Song C', artist: 'Artist C', isInLibrary: false }
			];
		}
	}

	/**
	 * Generate MediaQuestion for title
	 * Returns 4 shuffled choices with title as displayText
	 */
	async generateTitleQuestion(correctSong: Song, mediaType: MediaType = 'music'): Promise<MediaQuestion> {
		try {
			const wrongAnswers = await this.generateWrongAnswers(correctSong);
			const normalizedCorrectSong = {
				...correctSong,
				artist: correctSong.artist || 'Unknown Artist'
			};

			// Create answer choices with title as displayText
			const choices: AnswerChoice[] = [
				{
					id: `choice-${correctSong.id}`,
					correct: true,
					displayText: normalizedCorrectSong.title,
					metadata: {
						artist: normalizedCorrectSong.artist,
						year: normalizedCorrectSong.year,
						genre: normalizedCorrectSong.genre
					}
				},
				...wrongAnswers.map((wa, idx) => ({
					id: `choice-wrong-${idx}`,
					correct: false,
					displayText: wa.title,
					metadata: {
						artist: wa.artist
					}
				}))
			];

			// Shuffle choices
			const uniqueChoices = this.ensureUniqueChoiceDisplayTexts(choices, 'Title');
			const shuffledChoices = this.shuffleArray(uniqueChoices);

			serviceLogger.debug('Generated title question', {
				songTitle: normalizedCorrectSong.title,
				choicesCount: shuffledChoices.length,
				correctIndex: shuffledChoices.findIndex(c => c.correct)
			});

			return {
				type: mediaType,
				phase: 'title',
				choices: shuffledChoices
			};
		} catch (error) {
			serviceLogger.error('CRITICAL: generateTitleQuestion failed', { error, song: correctSong.title });
			// Emergency fallback
			return {
				type: mediaType,
				phase: 'title',
				choices: this.shuffleArray([
					{ id: 'choice-0', correct: true, displayText: correctSong.title },
					{ id: 'choice-1', correct: false, displayText: 'Song A' },
					{ id: 'choice-2', correct: false, displayText: 'Song B' },
					{ id: 'choice-3', correct: false, displayText: 'Song C' }
				])
			};
		}
	}

	/**
	 * Generate MediaQuestion for artist
	 * Returns 4 shuffled choices with artist as displayText
	 */
	async generateArtistQuestion(correctSong: Song, mediaType: MediaType = 'music'): Promise<MediaQuestion> {
		try {
			const normalizedCorrectSong = {
				...correctSong,
				artist: correctSong.artist || 'Unknown Artist'
			};

			const prioritizedArtists = await this.getArtistDistractors(normalizedCorrectSong, REQUIRED_WRONG_ANSWERS);
			const fallbackPool = await this.generateWrongAnswers(normalizedCorrectSong);
			const randomFillPool = await this.buildRandomArtistPool(normalizedCorrectSong);
			const combinedCandidates = [prioritizedArtists, fallbackPool, randomFillPool];
			const wrongArtists = this.collectUniqueArtistAnswers(combinedCandidates, normalizedCorrectSong.artist);

			// Create answer choices with artist as displayText
			const choices: AnswerChoice[] = [
				{
					id: `choice-${correctSong.id}`,
					correct: true,
					displayText: normalizedCorrectSong.artist,
					metadata: {
						title: normalizedCorrectSong.title,
						year: normalizedCorrectSong.year,
						genre: normalizedCorrectSong.genre
					}
				},
				...wrongArtists.map((wa, idx) => ({
					id: `choice-wrong-${idx}`,
					correct: false,
					displayText: wa.artist,
					metadata: {
						title: wa.title
					}
				}))
			];

			// Shuffle choices
			const uniqueChoices = this.ensureUniqueChoiceDisplayTexts(choices, 'Artist');
			const shuffledChoices = this.shuffleArray(uniqueChoices);

			serviceLogger.debug('Generated artist question', {
				songArtist: normalizedCorrectSong.artist,
				choicesCount: shuffledChoices.length,
				correctIndex: shuffledChoices.findIndex(c => c.correct)
			});

			return {
				type: mediaType,
				phase: 'artist',
				choices: shuffledChoices
			};
		} catch (error) {
			serviceLogger.error('CRITICAL: generateArtistQuestion failed', { error, song: correctSong.title });
			// Emergency fallback
			return {
				type: mediaType,
				phase: 'artist',
				choices: this.shuffleArray([
					{ id: 'choice-0', correct: true, displayText: correctSong.artist || 'Unknown Artist' },
					{ id: 'choice-1', correct: false, displayText: 'Artist A' },
					{ id: 'choice-2', correct: false, displayText: 'Artist B' },
					{ id: 'choice-3', correct: false, displayText: 'Artist C' }
				])
			};
		}
	}

	/**
	 * Get random songs from library (excluding specified songs)
	 * Used as last resort fallback when not enough similar songs available
	 */
	private async getRandomSongs(excludeSong: Song, count: number, additionalExclusions?: Set<string>): Promise<Song[]> {
		try {
			const allSongs = await this.repository.findAll();

			// Build exclusion set
			const exclusions = new Set<string>(additionalExclusions || []);
			exclusions.add(excludeSong.id);

			// Filter out excluded songs
			const otherSongs = allSongs.filter(s => !exclusions.has(s.id));

			if (otherSongs.length === 0) {
				serviceLogger.error('CRITICAL: No other songs in library for random fallback');
				return [];
			}

			// Shuffle and take random songs
			const shuffled = this.shuffleArray(otherSongs);
			return shuffled.slice(0, Math.min(count, shuffled.length));
		} catch (error) {
			serviceLogger.error('Failed to get random songs', { error });
			return [];
		}
	}

	/**
	 * Find similar songs from library based on metadata
	 */
	private async findSimilarFromLibrary(song: Song): Promise<Song[]> {
		const allSongs = await this.repository.findAll();

		// Filter candidates based on similarity criteria
		const candidates = allSongs.filter(candidate => {
			// Exclude the song itself
			if (candidate.id === song.id) return false;

			// Same genre (required if both have genre)
			if (song.genre && candidate.genre && song.genre !== candidate.genre) {
				return false;
			}

			// Similar year (±5 years)
			const yearDiff = Math.abs(candidate.year - song.year);
			if (yearDiff > 5) return false;

			// Same language (if both have language)
			if (song.language && candidate.language && song.language !== candidate.language) {
				return false;
			}

			return true;
		});

		return candidates;
	}

	/**
	 * Rank songs by similarity score
	 */
	private rankBySimilarity(correct: Song, candidates: Song[]): Song[] {
		const scored = candidates.map(candidate => {
			let score = 0;

			// Genre match (highest priority)
			if (correct.genre && candidate.genre === correct.genre) {
				score += 10;
			}

			// Year proximity
			const yearDiff = Math.abs(candidate.year - correct.year);
			if (yearDiff <= 5) {
				score += (5 - yearDiff) * 2; // 10 points for same year, 8 for ±1, etc.
			}

			// Language match
			if (correct.language && candidate.language === correct.language) {
				score += 8;
			}

			// Artist similarity (same first word)
			if (correct.artist && candidate.artist) {
				const correctFirstWord = correct.artist.split(' ')[0].toLowerCase();
				const candidateFirstWord = candidate.artist.split(' ')[0].toLowerCase();
				if (correctFirstWord === candidateFirstWord && correctFirstWord.length > 3) {
					score += 5;
				}
			}

			// Penalize if titles are too similar (might confuse players)
			const titleSimilarity = this.calculateStringSimilarity(
				correct.title.toLowerCase(),
				candidate.title.toLowerCase()
			);
			if (titleSimilarity > 0.7) {
				score -= 10; // Avoid very similar titles
			}

			return { ...candidate, score };
		});

		// Sort by score (descending)
		return scored.sort((a, b) => (b as any).score - (a as any).score);
	}

	/**
	 * Calculate string similarity (Levenshtein-based)
	 */
	private calculateStringSimilarity(str1: string, str2: string): number {
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.length === 0) return 1.0;

		const editDistance = this.levenshteinDistance(longer, shorter);
		return (longer.length - editDistance) / longer.length;
	}

	/**
	 * Levenshtein distance algorithm
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = [];

		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1, // substitution
						matrix[i][j - 1] + 1,     // insertion
						matrix[i - 1][j] + 1      // deletion
					);
				}
			}
		}

		return matrix[str2.length][str1.length];
	}

	/**
	 * Shuffle array using Fisher-Yates algorithm
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}
}

// Singleton instance
export const answerGenerationService = new AnswerGenerationService();
