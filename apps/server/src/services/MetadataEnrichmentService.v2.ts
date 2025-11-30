/**
 * Metadata Enrichment Service V2
 * Enriches YouTube video metadata using pluggable providers (Spotify, AI, etc.)
 *
 * Process:
 * 1. Parse YouTube title to extract artist/title/year
 * 2. Search configured provider (Spotify, OpenAI, Anthropic, etc.)
 * 3. Return enriched metadata with confidence score
 */

import { parseYouTubeTitle, createSpotifyQuery } from '../utils/youtube-title-parser';
import { MetadataProviderFactory } from './enrichment/MetadataProviderFactory';
import type { IMetadataProvider, SearchQuery, EnrichedTrackMetadata } from './enrichment/IMetadataProvider';

export interface YouTubeMetadata {
	title: string;
	uploader: string;
	duration: number; // seconds
	youtubeId?: string;
}

export interface EnrichedMetadata {
	title: string;
	artist: string;
	album?: string;
	year?: number;
	genre?: string;
	providerId?: string; // Provider-specific ID (e.g., Spotify ID)
	confidence: number; // 0-100
}

export interface EnrichmentResult {
	enriched: EnrichedMetadata;
	original: {
		title: string;
		artist: string;
	};
	matches: Array<EnrichedTrackMetadata>;
	parseData: {
		parsedTitle: string | null;
		parsedArtist: string | null;
		parsedYear: number | null;
	};
	provider: string; // Which provider was used
}

export class MetadataEnrichmentService {
	private provider: IMetadataProvider;
	private fallbackProvider: IMetadataProvider | null = null;

	constructor(provider?: IMetadataProvider, fallbackProvider?: IMetadataProvider) {
		// Use provided provider or create from environment
		this.provider = provider || MetadataProviderFactory.createFromEnv();
		this.fallbackProvider = fallbackProvider || null;
	}

	/**
	 * Set a different provider
	 */
	setProvider(provider: IMetadataProvider): void {
		this.provider = provider;
	}

	/**
	 * Set fallback provider
	 */
	setFallbackProvider(provider: IMetadataProvider | null): void {
		this.fallbackProvider = provider;
	}

	/**
	 * Get current provider
	 */
	getProvider(): IMetadataProvider {
		return this.provider;
	}

	/**
	 * Get fallback provider
	 */
	getFallbackProvider(): IMetadataProvider | null {
		return this.fallbackProvider;
	}

	/**
	 * Check if metadata needs fallback enrichment
	 * Triggers on: missing genre, missing album, missing year, or low confidence (<70%)
	 */
	private needsFallback(metadata: EnrichedTrackMetadata): boolean {
		// Missing critical fields
		if (!metadata.genre || !metadata.album || !metadata.year) {
			console.log(`[Enrichment] needsFallback: YES - Missing fields (genre: ${!!metadata.genre}, album: ${!!metadata.album}, year: ${!!metadata.year})`);
			return true;
		}

		// Low confidence match
		if (metadata.confidence < 70) {
			console.log(`[Enrichment] needsFallback: YES - Low confidence (${metadata.confidence})`);
			return true;
		}

		console.log(`[Enrichment] needsFallback: NO - All fields present and confidence OK`);
		return false;
	}

	/**
	 * Merge primary and fallback metadata results
	 * Strategy: Keep all primary data, fill gaps with fallback, validate year
	 */
	private mergeMetadata(
		primary: EnrichedTrackMetadata,
		fallback: EnrichedTrackMetadata
	): EnrichedTrackMetadata {
		// Helper to validate year
		const isValidYear = (year: number | undefined): boolean => {
			if (!year) return false;
			const currentYear = new Date().getFullYear();
			return year >= 1900 && year <= currentYear;
		};

		// For year: use valid year from either provider, prefer primary
		let finalYear = primary.year;
		if (!isValidYear(finalYear)) {
			finalYear = isValidYear(fallback.year) ? fallback.year : undefined;
		}

		// For genre: prefer fallback (AI) if available, as it's often more accurate than Spotify's artist-level genres
		const finalGenre = fallback.genre || primary.genre;

		return {
			// Always use primary for title/artist (more reliable from Spotify)
			title: primary.title,
			artist: primary.artist,

			// Fill missing fields with fallback, with validation
			album: primary.album || fallback.album,
			year: finalYear,
			genre: finalGenre,

			// Duration and confidence
			duration: primary.duration || fallback.duration,
			confidence: Math.max(primary.confidence, fallback.confidence),

			// Keep primary provider's rich media (Spotify has albumArt, AI doesn't)
			providerId: primary.providerId,
			albumArt: primary.albumArt,
			previewUrl: primary.previewUrl
		};
	}

	/**
	 * Enrich YouTube metadata using configured provider with optional fallback
	 */
	async enrichFromYouTube(youtubeMetadata: YouTubeMetadata): Promise<EnrichmentResult> {
		// Step 1: Parse YouTube title
		const parsed = parseYouTubeTitle(youtubeMetadata.title);

		// Step 2: Create search query
		const searchQuery: SearchQuery = {
			title: parsed.title || youtubeMetadata.title,
			artist: parsed.artist || youtubeMetadata.uploader,
			year: parsed.year || undefined,
			duration: youtubeMetadata.duration,
			youtubeId: youtubeMetadata.youtubeId
		};

		// Step 3: Search primary provider
		const providerResults = await this.provider.search(searchQuery, 10);

		if (providerResults.length === 0) {
			// No results from primary - try fallback if available
			if (this.fallbackProvider) {
				console.log(`[Enrichment] No results from ${this.provider.name}, trying fallback ${this.fallbackProvider.name}`);
				const fallbackResults = await this.fallbackProvider.search(searchQuery, 10);

				if (fallbackResults.length > 0) {
					fallbackResults.sort((a, b) => b.confidence - a.confidence);
					const bestFallback = fallbackResults[0];

					return {
						enriched: {
							title: bestFallback.title,
							artist: bestFallback.artist,
							album: bestFallback.album,
							year: bestFallback.year,
							genre: bestFallback.genre,
							providerId: bestFallback.providerId,
							confidence: bestFallback.confidence
						},
						original: {
							title: youtubeMetadata.title,
							artist: youtubeMetadata.uploader
						},
						matches: fallbackResults.slice(0, 5),
						parseData: {
							parsedTitle: parsed.title,
							parsedArtist: parsed.artist,
							parsedYear: parsed.year
						},
						provider: `${this.provider.name} → ${this.fallbackProvider.name}`
					};
				}
			}

			// No results from either provider - return original metadata
			return {
				enriched: {
					title: parsed.title || youtubeMetadata.title,
					artist: parsed.artist || youtubeMetadata.uploader,
					year: parsed.year || undefined,
					confidence: 0
				},
				original: {
					title: youtubeMetadata.title,
					artist: youtubeMetadata.uploader
				},
				matches: [],
				parseData: {
					parsedTitle: parsed.title,
					parsedArtist: parsed.artist,
					parsedYear: parsed.year
				},
				provider: this.provider.name
			};
		}

		// Sort by confidence (highest first)
		providerResults.sort((a, b) => b.confidence - a.confidence);

		// Step 4: Check if best match needs fallback (missing fields or low confidence)
		const bestMatch = providerResults[0];
		let finalMatch = bestMatch;
		let usedFallback = false;

		// Debug: Log what Spotify returned
		console.log(`[Enrichment] Primary provider result:`, {
			title: bestMatch.title,
			artist: bestMatch.artist,
			genre: bestMatch.genre,
			album: bestMatch.album,
			year: bestMatch.year,
			confidence: bestMatch.confidence,
			hasGenre: !!bestMatch.genre,
			hasAlbum: !!bestMatch.album,
			hasYear: !!bestMatch.year
		});

		if (this.fallbackProvider && this.needsFallback(bestMatch)) {
			console.log(`[Enrichment] Primary result needs fallback (genre: ${bestMatch.genre}, album: ${bestMatch.album}, year: ${bestMatch.year}, confidence: ${bestMatch.confidence}), trying fallback`);

			try {
				const fallbackResults = await this.fallbackProvider.search(searchQuery, 5);

				if (fallbackResults.length > 0) {
					fallbackResults.sort((a, b) => b.confidence - a.confidence);
					const bestFallback = fallbackResults[0];

					// Merge: Keep primary data, fill gaps with fallback
					finalMatch = this.mergeMetadata(bestMatch, bestFallback);
					usedFallback = true;
					console.log(`[Enrichment] Merged with fallback - genre: ${finalMatch.genre}, album: ${finalMatch.album}`);
				}
			} catch (error) {
				console.error('[Enrichment] Fallback search failed:', error);
				// Continue with primary result
			}
		}

		// Step 5: Return enriched metadata
		return {
			enriched: {
				title: finalMatch.title,
				artist: finalMatch.artist,
				album: finalMatch.album,
				year: finalMatch.year,
				genre: finalMatch.genre,
				providerId: finalMatch.providerId,
				confidence: finalMatch.confidence
			},
			original: {
				title: youtubeMetadata.title,
				artist: youtubeMetadata.uploader
			},
			matches: providerResults.slice(0, 5), // Return top 5 matches from primary
			parseData: {
				parsedTitle: parsed.title,
				parsedArtist: parsed.artist,
				parsedYear: parsed.year
			},
			provider: usedFallback ? `${this.provider.name} + ${this.fallbackProvider.name}` : this.provider.name
		};
	}

	/**
	 * Batch enrich multiple YouTube videos with intelligent fallback
	 * Optimized for AI providers that can process batches efficiently
	 */
	async enrichBatch(youtubeVideos: YouTubeMetadata[]): Promise<EnrichmentResult[]> {
		// Parse all titles
		const queries: SearchQuery[] = youtubeVideos.map(video => {
			const parsed = parseYouTubeTitle(video.title);
			return {
				title: parsed.title || video.title,
				artist: parsed.artist || video.uploader,
				year: parsed.year || undefined,
				duration: video.duration,
				youtubeId: video.youtubeId
			};
		});

		try {
			// Step 1: Get primary provider results
			const batchResults = await this.provider.batchSearch(queries);

			// Step 2: Identify which results need fallback (missing fields or low confidence)
			const needsFallbackIndices: number[] = [];
			const fallbackQueries: SearchQuery[] = [];

			batchResults.forEach((result, index) => {
				if (this.fallbackProvider && this.needsFallback(result)) {
					needsFallbackIndices.push(index);
					fallbackQueries.push(queries[index]);
				}
			});

			// Step 3: Batch call fallback provider for incomplete results
			let fallbackResults: EnrichedTrackMetadata[] = [];
			if (needsFallbackIndices.length > 0 && this.fallbackProvider) {
				console.log(`[Enrichment] ${needsFallbackIndices.length} results need fallback (missing fields or low confidence), using batch fallback`);
				try {
					fallbackResults = await this.fallbackProvider.batchSearch(fallbackQueries);
					console.log(`[Enrichment] Got ${fallbackResults.length} fallback results`);
				} catch (error) {
					console.error('[Enrichment] Batch fallback failed:', error);
				}
			}

			// Step 4: Merge results
			const finalResults: EnrichmentResult[] = batchResults.map((result, index) => {
				const video = youtubeVideos[index];
				const parsed = parseYouTubeTitle(video.title);

				// Check if this result needed fallback
				const fallbackIndex = needsFallbackIndices.indexOf(index);
				let finalMetadata = result;
				let usedFallback = false;

				if (fallbackIndex !== -1 && fallbackResults[fallbackIndex]) {
					finalMetadata = this.mergeMetadata(result, fallbackResults[fallbackIndex]);
					usedFallback = true;
				}

				return {
					enriched: {
						title: finalMetadata.title,
						artist: finalMetadata.artist,
						album: finalMetadata.album,
						year: finalMetadata.year,
						genre: finalMetadata.genre,
						providerId: finalMetadata.providerId,
						confidence: finalMetadata.confidence
					},
					original: {
						title: video.title,
						artist: video.uploader
					},
					matches: [finalMetadata],
					parseData: {
						parsedTitle: parsed.title,
						parsedArtist: parsed.artist,
						parsedYear: parsed.year
					},
					provider: usedFallback && this.fallbackProvider
						? `${this.provider.name} + ${this.fallbackProvider.name}`
						: this.provider.name
				};
			});

			return finalResults;
		} catch (error) {
			console.error('Batch enrichment failed, falling back to sequential:', error);

			// Fallback to sequential processing
			const results: EnrichmentResult[] = [];
			for (const video of youtubeVideos) {
				try {
					const result = await this.enrichFromYouTube(video);
					results.push(result);
				} catch (err) {
					console.error('Failed to enrich video:', video.title, err);
					const parsed = parseYouTubeTitle(video.title);
					results.push({
						enriched: {
							title: video.title,
							artist: video.uploader,
							confidence: 0
						},
						original: {
							title: video.title,
							artist: video.uploader
						},
						matches: [],
						parseData: {
							parsedTitle: parsed.title,
							parsedArtist: parsed.artist,
							parsedYear: parsed.year
						},
						provider: this.provider.name
					});
				}
			}
			return results;
		}
	}

	/**
	 * Enrich from Spotify import
	 * Uses Spotify metadata as primary provider, AI as fallback for missing fields
	 * This is used when importing from Spotify to supplement Spotify's metadata with AI genres
	 */
	async enrichFromSpotifyData(spotifyData: {
		title: string;
		artist: string;
		album?: string;
		year?: number;
		genre?: string;
		duration: number;
		spotifyId: string;
	}): Promise<EnrichmentResult> {
		// Create primary result from Spotify data (treat as perfect match)
		const spotifyResult: EnrichedTrackMetadata = {
			title: spotifyData.title,
			artist: spotifyData.artist,
			album: spotifyData.album,
			year: spotifyData.year,
			genre: spotifyData.genre,
			duration: spotifyData.duration,
			providerId: spotifyData.spotifyId,
			confidence: 100, // Spotify data is authoritative
		};

		// Check if we need fallback (missing genre/album/year)
		if (this.fallbackProvider && this.needsFallback(spotifyResult)) {
			console.log(`[Enrichment] Spotify data incomplete (genre: ${spotifyData.genre}, album: ${spotifyData.album}, year: ${spotifyData.year}), using AI fallback`);

			try {
				// Create search query for fallback provider
				const searchQuery: SearchQuery = {
					title: spotifyData.title,
					artist: spotifyData.artist,
					duration: spotifyData.duration
				};

				const fallbackResults = await this.fallbackProvider.search(searchQuery, 5);

				if (fallbackResults.length > 0) {
					fallbackResults.sort((a, b) => b.confidence - a.confidence);
					const bestFallback = fallbackResults[0];

					// Merge: Spotify data (primary) + AI data (fallback)
					const merged = this.mergeMetadata(spotifyResult, bestFallback);

					console.log(`[Enrichment] Merged Spotify + AI - genre: ${merged.genre}, album: ${merged.album}, year: ${merged.year}`);

					return {
						enriched: {
							title: merged.title,
							artist: merged.artist,
							album: merged.album,
							year: merged.year,
							genre: merged.genre,
							providerId: merged.providerId,
							confidence: merged.confidence
						},
						original: {
							title: spotifyData.title,
							artist: spotifyData.artist
						},
						matches: [merged],
						parseData: {
							parsedTitle: null,
							parsedArtist: null,
							parsedYear: null
						},
						provider: `Spotify + ${this.fallbackProvider.name}`
					};
				}
			} catch (error) {
				console.error('[Enrichment] Fallback failed for Spotify import:', error);
				// Continue with Spotify data only
			}
		}

		// Return Spotify data only (no fallback needed or fallback failed)
		return {
			enriched: {
				title: spotifyResult.title,
				artist: spotifyResult.artist,
				album: spotifyResult.album,
				year: spotifyResult.year,
				genre: spotifyResult.genre,
				providerId: spotifyResult.providerId,
				confidence: spotifyResult.confidence
			},
			original: {
				title: spotifyData.title,
				artist: spotifyData.artist
			},
			matches: [spotifyResult],
			parseData: {
				parsedTitle: null,
				parsedArtist: null,
				parsedYear: null
			},
			provider: 'Spotify'
		};
	}

	/**
	 * Re-search with custom query
	 * Useful when auto-enrichment confidence is low
	 */
	async searchCustom(
		query: string,
		youtubeMetadata: YouTubeMetadata
	): Promise<EnrichedTrackMetadata[]> {
		const searchQuery: SearchQuery = {
			title: query,
			duration: youtubeMetadata.duration,
			youtubeId: youtubeMetadata.youtubeId
		};

		return await this.provider.search(searchQuery, 10);
	}
}

// Singleton instance with default provider and optional fallback
const { primary, fallback } = MetadataProviderFactory.createProvidersFromEnv();
export const metadataEnrichmentService = new MetadataEnrichmentService(primary, fallback || undefined);
