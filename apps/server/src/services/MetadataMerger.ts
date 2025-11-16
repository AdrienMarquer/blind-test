/**
 * Metadata Merger
 * Centralized utility for merging metadata from multiple sources
 * Eliminates code duplication across different import flows
 */

import { logger } from '../utils/logger';
import type { EnrichedMetadata } from './MetadataEnrichmentService.v2';

const mergerLogger = logger.child({ module: 'MetadataMerger' });

export interface ExtractedMetadata {
	title: string;
	artist: string;
	album?: string;
	year?: number;
	genre?: string;
	duration: number;
}

export interface ProvidedMetadata {
	title?: string;
	artist?: string;
	album?: string;
	year?: number;
	genre?: string;
}

export interface MergedSongMetadata {
	title: string;
	artist: string;
	album?: string;
	year: number;
	genre?: string;
	subgenre?: string;
	spotifyId?: string;
	language?: string;
}

export interface MergeOptions {
	jobId?: string;
	videoId?: string;
	source: 'youtube' | 'spotify' | 'upload';
	logWarnings?: boolean;
}

/**
 * Validate year is within reasonable range
 */
function isValidYear(year: number | undefined): boolean {
	if (!year) return false;
	const currentYear = new Date().getFullYear();
	return year >= 1900 && year <= currentYear;
}

/**
 * Get current year as fallback
 */
function getCurrentYear(): number {
	return new Date().getFullYear();
}

/**
 * Merge metadata from multiple sources with priority:
 * 1. Enriched metadata (from MetadataEnrichmentService)
 * 2. Provided metadata (from user input or API)
 * 3. Extracted metadata (from MP3 ID3 tags or file)
 * 4. Defaults (for required fields)
 *
 * @param enriched - Metadata from enrichment service (Spotify/AI)
 * @param extracted - Metadata extracted from file (ID3 tags, etc.)
 * @param provided - User-provided or API-provided metadata
 * @param options - Merge options (source, logging, etc.)
 * @returns Merged metadata ready for database insertion
 */
export function mergeMetadata(
	enriched: EnrichedMetadata | undefined,
	extracted: ExtractedMetadata,
	provided: ProvidedMetadata | undefined,
	options: MergeOptions
): MergedSongMetadata {
	const { jobId, videoId, source, logWarnings = true } = options;

	// Title: enriched > provided > extracted
	const finalTitle = enriched?.title || provided?.title || extracted.title;

	// Artist: enriched > provided > extracted
	const finalArtist = enriched?.artist || provided?.artist || extracted.artist;

	// Album: enriched > provided > extracted
	const finalAlbum = enriched?.album || provided?.album || extracted.album;

	// Year: enriched > provided > extracted > current year (with validation)
	let finalYear = enriched?.year || provided?.year || extracted.year;
	if (!isValidYear(finalYear)) {
		if (logWarnings) {
			mergerLogger.warn('Invalid or missing year, using current year', {
				jobId,
				videoId,
				source,
				enrichedYear: enriched?.year,
				providedYear: provided?.year,
				extractedYear: extracted.year,
				fallbackYear: getCurrentYear()
			});
		}
		finalYear = getCurrentYear();
	}

	// Genre: enriched > provided > extracted
	const finalGenre = enriched?.genre || provided?.genre || extracted.genre;

	// Subgenre: enriched only (not in extracted/provided metadata)
	const finalSubgenre = enriched?.subgenre;

	// Spotify ID: enriched only (from Spotify provider)
	const finalSpotifyId = enriched?.providerId;

	// Log metadata quality warnings
	if (logWarnings) {
		if (!finalGenre) {
			mergerLogger.warn('Missing genre metadata', {
				jobId,
				videoId,
				source,
				title: finalTitle,
				artist: finalArtist,
				enrichedConfidence: enriched?.confidence
			});
		}

		if (!finalAlbum) {
			mergerLogger.warn('Missing album metadata', {
				jobId,
				videoId,
				source,
				title: finalTitle,
				artist: finalArtist
			});
		}

		if (enriched && enriched.confidence < 70) {
			mergerLogger.warn('Low confidence metadata enrichment', {
				jobId,
				videoId,
				source,
				title: finalTitle,
				artist: finalArtist,
				confidence: enriched.confidence,
				hasGenre: !!finalGenre,
				hasAlbum: !!finalAlbum
			});
		}
	}

	return {
		title: finalTitle,
		artist: finalArtist,
		album: finalAlbum,
		year: finalYear,
		genre: finalGenre,
		subgenre: finalSubgenre,
		spotifyId: finalSpotifyId,
	};
}

/**
 * Helper to log enrichment statistics
 */
export function logEnrichmentStats(
	enriched: EnrichedMetadata | undefined,
	merged: MergedSongMetadata,
	options: { jobId?: string; videoId?: string; source: string }
): void {
	if (!enriched) {
		mergerLogger.info('Metadata not enriched', {
			...options,
			hasGenre: !!merged.genre,
			hasAlbum: !!merged.album
		});
		return;
	}

	mergerLogger.info('Metadata enriched and merged', {
		...options,
		confidence: enriched.confidence,
		hasGenre: !!merged.genre,
		hasAlbum: !!merged.album,
		hasSubgenre: !!merged.subgenre,
		hasSpotifyId: !!merged.spotifyId
	});
}
