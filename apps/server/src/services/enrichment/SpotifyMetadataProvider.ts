/**
 * Spotify Metadata Provider
 * Implements IMetadataProvider using Spotify Web API
 */

import { spotifyService } from '../SpotifyService';
import type { IMetadataProvider, EnrichedTrackMetadata, SearchQuery, ProviderConfig } from './IMetadataProvider';
import Fuzzysort from 'fuzzysort';

export class SpotifyMetadataProvider implements IMetadataProvider {
	readonly name = 'spotify';
	private config: ProviderConfig;

	constructor(config: ProviderConfig = { enabled: true }) {
		this.config = config;
	}

	isReady(): boolean {
		return this.config.enabled && spotifyService.isInitialized();
	}

	async search(query: SearchQuery, limit: number = 10): Promise<EnrichedTrackMetadata[]> {
		if (!this.isReady()) {
			throw new Error('Spotify provider not ready');
		}

		// Build search query string
		const searchString = this.buildSearchQuery(query);

		// Search Spotify
		const spotifyResults = await spotifyService.search(searchString, limit);

		// Convert to EnrichedTrackMetadata with confidence scores
		return spotifyResults.map(track => {
			const confidence = this.calculateConfidence(track, query);

			return {
				title: track.title,
				artist: track.artist,
				album: track.album,
				year: track.year,
				genre: track.genre,
				subgenre: track.subgenre,
				duration: track.duration,
				confidence,
				providerId: track.spotifyId,
				albumArt: track.albumArt,
				previewUrl: track.previewUrl
			};
		}).sort((a, b) => b.confidence - a.confidence); // Sort by confidence
	}

	async getTrack(spotifyId: string): Promise<EnrichedTrackMetadata | null> {
		if (!this.isReady()) {
			throw new Error('Spotify provider not ready');
		}

		const track = await spotifyService.getTrack(spotifyId);
		if (!track) {
			return null;
		}

		return {
			title: track.title,
			artist: track.artist,
			album: track.album,
			year: track.year,
			genre: track.genre,
			subgenre: track.subgenre,
			duration: track.duration,
			confidence: 100, // Direct lookup = 100% confidence
			providerId: track.spotifyId,
			albumArt: track.albumArt,
			previewUrl: track.previewUrl
		};
	}

	async batchSearch(queries: SearchQuery[]): Promise<EnrichedTrackMetadata[]> {
		const results: EnrichedTrackMetadata[] = [];

		// Process sequentially to avoid rate limiting
		for (const query of queries) {
			try {
				const matches = await this.search(query, 1);
				results.push(matches[0] || this.createEmptyResult(query));
			} catch (error) {
				console.error('Batch search failed for query:', query, error);
				results.push(this.createEmptyResult(query));
			}
		}

		return results;
	}

	/**
	 * Build Spotify search query string from SearchQuery
	 */
	private buildSearchQuery(query: SearchQuery): string {
		const parts: string[] = [];

		if (query.artist) {
			parts.push(query.artist);
		}

		if (query.title) {
			parts.push(query.title);
		}

		if (query.year) {
			parts.push(String(query.year));
		}

		return parts.join(' ');
	}

	/**
	 * Calculate confidence score for a Spotify track
	 */
	private calculateConfidence(track: any, query: SearchQuery): number {
		let confidence = 0;

		// Title similarity (40 points)
		if (query.title) {
			const titleSimilarity = this.calculateStringSimilarity(track.title, query.title);
			confidence += (titleSimilarity / 100) * 40;
		}

		// Artist similarity (40 points)
		if (query.artist) {
			const artistSimilarity = this.calculateStringSimilarity(track.artist, query.artist);
			confidence += (artistSimilarity / 100) * 40;
		}

		// Duration match (20 points)
		if (query.duration && track.duration) {
			const durationMatch = this.isDurationSimilar(track.duration, query.duration);
			if (durationMatch) {
				confidence += 20;
			} else {
				// Partial points if close
				const durationDiff = Math.abs(track.duration - query.duration);
				if (durationDiff <= 10) {
					confidence += 10;
				} else if (durationDiff <= 20) {
					confidence += 5;
				}
			}
		} else {
			// No duration to compare, give half points
			confidence += 10;
		}

		return Math.round(confidence);
	}

	/**
	 * Calculate string similarity using fuzzysort
	 */
	private calculateStringSimilarity(str1: string, str2: string): number {
		const normalized1 = this.normalizeString(str1);
		const normalized2 = this.normalizeString(str2);

		if (normalized1 === normalized2) {
			return 100;
		}

		const result = Fuzzysort.single(normalized1, normalized2);
		if (!result) {
			return 0;
		}

		const score = result.score;
		if (score === 0) {
			return 100;
		}

		return Math.max(0, Math.min(100, 100 + score / 10));
	}

	/**
	 * Normalize string for comparison
	 */
	private normalizeString(str: string): string {
		return str
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim();
	}

	/**
	 * Check if durations are similar
	 */
	private isDurationSimilar(duration1: number, duration2: number, toleranceSeconds: number = 5): boolean {
		return Math.abs(duration1 - duration2) <= toleranceSeconds;
	}

	/**
	 * Create empty result with 0 confidence
	 */
	private createEmptyResult(query: SearchQuery): EnrichedTrackMetadata {
		return {
			title: query.title || '',
			artist: query.artist || '',
			confidence: 0
		};
	}
}
