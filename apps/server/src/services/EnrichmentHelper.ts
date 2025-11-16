/**
 * Enrichment Helper
 * Worker-friendly wrapper around MetadataEnrichmentService
 * Provides retry logic and convenience methods for different import types
 */

import { logger } from '../utils/logger';
import { metadataEnrichmentService, type EnrichedMetadata, type YouTubeMetadata } from './MetadataEnrichmentService.v2';

const helperLogger = logger.child({ module: 'EnrichmentHelper' });

export interface EnrichmentConfig {
	maxRetries?: number;
	retryDelayMs?: number;
	exponentialBackoff?: boolean;
}

const DEFAULT_CONFIG: EnrichmentConfig = {
	maxRetries: 3,
	retryDelayMs: 1000,
	exponentialBackoff: true,
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for enrichment calls
 * Implements exponential backoff and comprehensive logging
 */
async function withRetry<T>(
	operation: () => Promise<T>,
	context: { type: string; identifier: string },
	config: EnrichmentConfig = DEFAULT_CONFIG
): Promise<T> {
	const { maxRetries = 3, retryDelayMs = 1000, exponentialBackoff = true } = config;
	let lastError: Error | unknown;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const result = await operation();
			if (attempt > 1) {
				helperLogger.info('Enrichment succeeded after retry', {
					...context,
					attempt,
					maxRetries
				});
			}
			return result;
		} catch (error) {
			lastError = error;
			helperLogger.warn('Enrichment attempt failed', {
				...context,
				attempt,
				maxRetries,
				error: error instanceof Error ? error.message : String(error)
			});

			if (attempt < maxRetries) {
				// Calculate delay with exponential backoff
				const delay = exponentialBackoff
					? Math.pow(2, attempt - 1) * retryDelayMs
					: retryDelayMs;

				helperLogger.info('Retrying enrichment', {
					...context,
					delayMs: delay,
					nextAttempt: attempt + 1
				});

				await sleep(delay);
			}
		}
	}

	// All retries failed
	helperLogger.error('Enrichment failed after all retries', {
		...context,
		maxRetries,
		error: lastError instanceof Error ? lastError.message : String(lastError)
	});

	throw lastError;
}

/**
 * Enrich metadata from YouTube video
 * Uses YouTube title/uploader/duration to search providers
 *
 * @param youtubeData - YouTube video metadata
 * @param config - Retry configuration
 * @returns Enriched metadata with confidence score
 */
export async function enrichFromYouTube(
	youtubeData: YouTubeMetadata,
	config?: EnrichmentConfig
): Promise<EnrichedMetadata> {
	const context = {
		type: 'youtube',
		identifier: youtubeData.youtubeId || youtubeData.title
	};

	helperLogger.info('Starting YouTube enrichment', {
		...context,
		title: youtubeData.title,
		uploader: youtubeData.uploader
	});

	const result = await withRetry(
		async () => {
			const enrichmentResult = await metadataEnrichmentService.enrichFromYouTube(youtubeData);
			return enrichmentResult.enriched;
		},
		context,
		config
	);

	helperLogger.info('YouTube enrichment complete', {
		...context,
		confidence: result.confidence,
		hasGenre: !!result.genre,
		hasAlbum: !!result.album
	});

	return result;
}

/**
 * Enrich metadata from uploaded file
 * Uses extracted metadata (title/artist) to search providers
 *
 * @param fileMetadata - Metadata extracted from uploaded file
 * @param config - Retry configuration
 * @returns Enriched metadata with confidence score
 */
export async function enrichFromFile(
	fileMetadata: { title: string; artist: string; duration: number },
	config?: EnrichmentConfig
): Promise<EnrichedMetadata> {
	const context = {
		type: 'file_upload',
		identifier: `${fileMetadata.artist} - ${fileMetadata.title}`
	};

	helperLogger.info('Starting file upload enrichment', {
		...context,
		title: fileMetadata.title,
		artist: fileMetadata.artist
	});

	// Convert file metadata to YouTube metadata format (service is source-agnostic)
	const youtubeFormat: YouTubeMetadata = {
		title: `${fileMetadata.artist} - ${fileMetadata.title}`,
		uploader: fileMetadata.artist,
		duration: fileMetadata.duration
	};

	const result = await withRetry(
		async () => {
			const enrichmentResult = await metadataEnrichmentService.enrichFromYouTube(youtubeFormat);
			return enrichmentResult.enriched;
		},
		context,
		config
	);

	helperLogger.info('File upload enrichment complete', {
		...context,
		confidence: result.confidence,
		hasGenre: !!result.genre,
		hasAlbum: !!result.album
	});

	return result;
}

/**
 * Enrich metadata from Spotify import
 * Uses Spotify metadata as primary, AI as fallback for missing fields
 *
 * @param spotifyData - Metadata from Spotify API
 * @param config - Retry configuration
 * @returns Enriched metadata (merged Spotify + AI)
 */
export async function enrichFromSpotifyData(
	spotifyData: {
		title: string;
		artist: string;
		album?: string;
		year?: number;
		genre?: string;
		duration: number;
		spotifyId: string;
	},
	config?: EnrichmentConfig
): Promise<EnrichedMetadata> {
	const context = {
		type: 'spotify',
		identifier: spotifyData.spotifyId
	};

	helperLogger.info('Starting Spotify enrichment', {
		...context,
		title: spotifyData.title,
		artist: spotifyData.artist,
		hasGenre: !!spotifyData.genre,
		hasAlbum: !!spotifyData.album
	});

	const result = await withRetry(
		async () => {
			// Use the new enrichFromSpotifyData method (to be added)
			const enrichmentResult = await metadataEnrichmentService.enrichFromSpotifyData(spotifyData);
			return enrichmentResult.enriched;
		},
		context,
		config
	);

	helperLogger.info('Spotify enrichment complete', {
		...context,
		confidence: result.confidence,
		hasGenre: !!result.genre,
		hasAlbum: !!result.album,
		usedFallback: result.confidence < 100 // Spotify alone would be 100%
	});

	return result;
}

/**
 * Helper to check if enrichment should be skipped
 * (e.g., if metadata is already complete)
 */
export function shouldSkipEnrichment(metadata: {
	genre?: string;
	album?: string;
	year?: number;
}): boolean {
	// Only skip if all critical fields are present
	return !!(metadata.genre && metadata.album && metadata.year);
}
