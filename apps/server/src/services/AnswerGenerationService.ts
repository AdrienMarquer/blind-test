/**
 * Answer Generation Service
 * Generates plausible wrong answers for multiple choice gameplay
 */

import type { Song } from '@blind-test/shared';
import { songRepository } from '../repositories';
import { spotifyService } from './SpotifyService';
import { logger } from '../utils/logger';

const serviceLogger = logger.child({ module: 'AnswerGeneration' });

export interface WrongAnswer {
	title: string;
	artist: string;
	isInLibrary: boolean; // True if from our library, false if from Spotify API
	score?: number; // Similarity score (for debugging)
}

export interface AnswerChoice {
	title: string;
	artist: string;
	correct: boolean;
}

export class AnswerGenerationService {
	/**
	 * Generate 3 plausible wrong answers for a song
	 * Strategy: Try library first, fallback to Spotify API
	 */
	async generateWrongAnswers(correctSong: Song): Promise<WrongAnswer[]> {
		serviceLogger.debug('Generating wrong answers', {
			title: correctSong.title,
			artist: correctSong.artist
		});

		// 1. Try to find similar songs from library
		const libraryCandidates = await this.findSimilarFromLibrary(correctSong);

		serviceLogger.debug('Library candidates found', { count: libraryCandidates.length });

		// 2. If we have enough from library, use them
		if (libraryCandidates.length >= 3) {
			const ranked = this.rankBySimilarity(correctSong, libraryCandidates);
			return ranked.slice(0, 3).map(song => ({
				title: song.title,
				artist: song.artist,
				isInLibrary: true,
				score: (song as any).score
			}));
		}

		// 3. Need more answers, fetch from Spotify
		const wrongAnswers: WrongAnswer[] = libraryCandidates.map(song => ({
			title: song.title,
			artist: song.artist,
			isInLibrary: true
		}));

		const needed = 3 - wrongAnswers.length;

		if (needed > 0 && correctSong.spotifyId) {
			serviceLogger.debug('Fetching additional answers from Spotify', { needed });
			const spotifyAnswers = await this.fetchSpotifySimilar(correctSong, needed * 2);
			wrongAnswers.push(...spotifyAnswers.slice(0, needed));
		}

		serviceLogger.info('Generated wrong answers', {
			total: wrongAnswers.length,
			fromLibrary: wrongAnswers.filter(a => a.isInLibrary).length,
			fromSpotify: wrongAnswers.filter(a => !a.isInLibrary).length
		});

		return wrongAnswers;
	}

	/**
	 * Generate 4 shuffled answer choices (1 correct + 3 wrong)
	 */
	async generateAnswerChoices(correctSong: Song): Promise<AnswerChoice[]> {
		const wrongAnswers = await this.generateWrongAnswers(correctSong);

		const allAnswers: AnswerChoice[] = [
			{
				title: correctSong.title,
				artist: correctSong.artist,
				correct: true
			},
			...wrongAnswers.map(wa => ({
				title: wa.title,
				artist: wa.artist,
				correct: false
			}))
		];

		// Shuffle answers
		return this.shuffleArray(allAnswers);
	}

	/**
	 * Find similar songs from library based on metadata
	 */
	private async findSimilarFromLibrary(song: Song): Promise<Song[]> {
		const allSongs = await songRepository.findAll();

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

			// Subgenre match
			if (correct.subgenre && candidate.subgenre === correct.subgenre) {
				score += 6;
			}

			// Artist similarity (same first word)
			const correctFirstWord = correct.artist.split(' ')[0].toLowerCase();
			const candidateFirstWord = candidate.artist.split(' ')[0].toLowerCase();
			if (correctFirstWord === candidateFirstWord && correctFirstWord.length > 3) {
				score += 5;
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
	 * Fetch similar songs from Spotify API (titles only, not downloaded)
	 */
	private async fetchSpotifySimilar(song: Song, limit: number = 10): Promise<WrongAnswer[]> {
		if (!song.spotifyId) {
			serviceLogger.warn('Cannot fetch Spotify recommendations without spotifyId');
			return [];
		}

		try {
			const recommendations = await spotifyService.getRecommendations(song.spotifyId, limit);

			return recommendations.map(track => ({
				title: track.title,
				artist: track.artist,
				isInLibrary: false
			}));
		} catch (error) {
			serviceLogger.error('Failed to fetch Spotify recommendations', error);
			return [];
		}
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
