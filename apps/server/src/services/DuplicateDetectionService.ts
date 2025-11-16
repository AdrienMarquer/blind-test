/**
 * Duplicate Detection Service
 * Provides fuzzy matching and duplicate detection for song imports
 *
 * Confidence scoring:
 * - 100: Exact source ID match (spotifyId or youtubeId)
 * - 95: Title ≥90% + Artist ≥90%
 * - 90: Title ≥90% + Artist ≥80% + Duration within 5s
 * - 85: Title exact + Artist ≥80%
 * - 85: Title ≥80% + Artist exact
 * - Additional bonuses: album match (+5), year match (+3)
 *
 * Threshold: ≥80% triggers duplicate warning
 */

import Fuzzysort from 'fuzzysort';
import { songRepository } from '../repositories';
import type { Song } from '@blind-test/shared';

export interface DuplicateCandidate {
	title: string;
	artist: string;
	duration?: number;
	spotifyId?: string;
	youtubeId?: string;
	album?: string;
	year?: number;
}

export interface DuplicateMatch {
	song: Song;
	confidence: number;
	reasons: string[];
	titleScore: number;
	artistScore: number;
	durationMatch: boolean;
}

export interface DuplicateDetectionResult {
	isDuplicate: boolean;
	matches: DuplicateMatch[];
	highestConfidence: number;
}

class DuplicateDetectionService {
	private readonly DUPLICATE_THRESHOLD = 80; // Minimum confidence to trigger warning
	private readonly DURATION_TOLERANCE = 5; // ±5 seconds

	/**
	 * Normalize string for comparison
	 * - Convert to lowercase
	 * - Remove accents/diacritics
	 * - Trim whitespace
	 * - Remove extra spaces
	 */
	normalizeString(text: string): string {
		return text
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '') // Remove diacritics
			.trim()
			.replace(/\s+/g, ' '); // Collapse multiple spaces
	}

	/**
	 * Calculate fuzzy match score using fuzzysort
	 * Returns 0-100 (percentage match)
	 */
	calculateSimilarity(str1: string, str2: string): number {
		const normalized1 = this.normalizeString(str1);
		const normalized2 = this.normalizeString(str2);

		// Exact match
		if (normalized1 === normalized2) {
			return 100;
		}

		// Use fuzzysort for fuzzy matching
		const result = Fuzzysort.single(normalized1, normalized2);

		if (!result) {
			return 0;
		}

		// Convert fuzzysort score (-infinity to 0) to percentage (0-100)
		// fuzzysort scores: 0 is perfect, more negative is worse
		// We'll use a heuristic: score >= -100 maps to 90-100%, etc.
		const score = result.score;

		if (score >= -10) return 100;
		if (score >= -50) return 95;
		if (score >= -100) return 90;
		if (score >= -200) return 85;
		if (score >= -300) return 80;
		if (score >= -500) return 75;
		if (score >= -1000) return 70;
		if (score >= -2000) return 60;
		if (score >= -3000) return 50;
		return 40;
	}

	/**
	 * Check if durations are similar within tolerance
	 */
	areDurationsSimilar(
		duration1: number,
		duration2: number,
		tolerance: number = this.DURATION_TOLERANCE
	): boolean {
		return Math.abs(duration1 - duration2) <= tolerance;
	}

	/**
	 * Calculate confidence score for a potential duplicate
	 */
	private calculateConfidence(
		candidate: DuplicateCandidate,
		existingSong: Song,
		titleScore: number,
		artistScore: number
	): { confidence: number; reasons: string[] } {
		const reasons: string[] = [];
		let confidence = 0;

		// Exact source ID matches = 100%
		if (candidate.spotifyId && existingSong.spotifyId === candidate.spotifyId) {
			return { confidence: 100, reasons: ['Exact Spotify ID match'] };
		}

		if (candidate.youtubeId && existingSong.youtubeId === candidate.youtubeId) {
			return { confidence: 100, reasons: ['Exact YouTube ID match'] };
		}

		// Title + Artist fuzzy matching
		if (titleScore >= 90 && artistScore >= 90) {
			confidence = 95;
			reasons.push(`Title ${titleScore}% match`, `Artist ${artistScore}% match`);
		} else if (titleScore >= 90 && artistScore >= 80) {
			confidence = 90;
			reasons.push(`Title ${titleScore}% match`, `Artist ${artistScore}% match`);
		} else if (titleScore === 100 && artistScore >= 80) {
			confidence = 85;
			reasons.push('Title exact match', `Artist ${artistScore}% match`);
		} else if (titleScore >= 80 && artistScore === 100) {
			confidence = 85;
			reasons.push(`Title ${titleScore}% match`, 'Artist exact match');
		} else if (titleScore >= 80 && artistScore >= 80) {
			confidence = 80;
			reasons.push(`Title ${titleScore}% match`, `Artist ${artistScore}% match`);
		} else if (titleScore >= 70 && artistScore >= 70) {
			confidence = 70;
			reasons.push(`Title ${titleScore}% match`, `Artist ${artistScore}% match`);
		} else {
			confidence = Math.max(titleScore, artistScore) * 0.6; // Lower confidence for weaker matches
			reasons.push(`Weak match: Title ${titleScore}%, Artist ${artistScore}%`);
		}

		// Duration bonus
		if (candidate.duration && existingSong.duration) {
			if (this.areDurationsSimilar(candidate.duration, existingSong.duration)) {
				confidence += 5;
				const diff = Math.abs(candidate.duration - existingSong.duration);
				reasons.push(`Duration within ${diff}s`);
			}
		}

		// Album bonus
		if (
			candidate.album &&
			existingSong.album &&
			this.normalizeString(candidate.album) === this.normalizeString(existingSong.album)
		) {
			confidence += 5;
			reasons.push('Same album');
		}

		// Year bonus
		if (candidate.year && existingSong.year && candidate.year === existingSong.year) {
			confidence += 3;
			reasons.push(`Same year (${candidate.year})`);
		}

		// Cap at 100
		confidence = Math.min(100, confidence);

		return { confidence, reasons };
	}

	/**
	 * Main duplicate detection method
	 * Returns all potential duplicates above the threshold (≥80%)
	 */
	async detectDuplicates(candidate: DuplicateCandidate): Promise<DuplicateDetectionResult> {
		const matches: DuplicateMatch[] = [];

		// Step 1: Check for exact source ID matches
		if (candidate.spotifyId) {
			const spotifyMatch = await songRepository.findBySpotifyId(candidate.spotifyId);
			if (spotifyMatch) {
				matches.push({
					song: spotifyMatch,
					confidence: 100,
					reasons: ['Exact Spotify ID match'],
					titleScore: 100,
					artistScore: 100,
					durationMatch: true,
				});
			}
		}

		if (candidate.youtubeId) {
			const youtubeMatch = await songRepository.findByYoutubeId(candidate.youtubeId);
			if (youtubeMatch) {
				matches.push({
					song: youtubeMatch,
					confidence: 100,
					reasons: ['Exact YouTube ID match'],
					titleScore: 100,
					artistScore: 100,
					durationMatch: true,
				});
			}
		}

		// If exact ID match found, return early
		if (matches.length > 0) {
			return {
				isDuplicate: true,
				matches,
				highestConfidence: 100,
			};
		}

		// Step 2: Fuzzy matching on title + artist
		const potentialMatches = await songRepository.findPotentialDuplicates({
			title: candidate.title,
			artist: candidate.artist,
		});

		// Calculate confidence for each potential match
		for (const existingSong of potentialMatches) {
			const titleScore = this.calculateSimilarity(candidate.title, existingSong.title);
			const artistScore = this.calculateSimilarity(candidate.artist, existingSong.artist);

			// Skip if both scores are very low
			if (titleScore < 60 && artistScore < 60) {
				continue;
			}

			const { confidence, reasons } = this.calculateConfidence(
				candidate,
				existingSong,
				titleScore,
				artistScore
			);

			// Only include matches above threshold
			if (confidence >= this.DUPLICATE_THRESHOLD) {
				const durationMatch =
					candidate.duration && existingSong.duration
						? this.areDurationsSimilar(candidate.duration, existingSong.duration)
						: false;

				matches.push({
					song: existingSong,
					confidence: Math.round(confidence),
					reasons,
					titleScore: Math.round(titleScore),
					artistScore: Math.round(artistScore),
					durationMatch,
				});
			}
		}

		// Sort by confidence (highest first)
		matches.sort((a, b) => b.confidence - a.confidence);

		const highestConfidence = matches.length > 0 ? matches[0].confidence : 0;

		return {
			isDuplicate: matches.length > 0,
			matches,
			highestConfidence,
		};
	}

	/**
	 * Convenience method: Check if a song is a duplicate (yes/no)
	 */
	async isDuplicate(candidate: DuplicateCandidate): Promise<boolean> {
		const result = await this.detectDuplicates(candidate);
		return result.isDuplicate;
	}

	/**
	 * Convenience method: Get the best match for a candidate
	 */
	async findBestMatch(candidate: DuplicateCandidate): Promise<DuplicateMatch | null> {
		const result = await this.detectDuplicates(candidate);
		return result.matches.length > 0 ? result.matches[0] : null;
	}
}

// Export singleton instance
export const duplicateDetectionService = new DuplicateDetectionService();
