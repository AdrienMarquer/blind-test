/**
 * Metadata Provider Interface
 * Strategy pattern for different metadata enrichment providers (Spotify, AI, etc.)
 */

export interface EnrichedTrackMetadata {
	title: string;
	artist: string;
	album?: string;
	year?: number;
	genre?: string;
	subgenre?: string;
	duration?: number; // seconds
	confidence: number; // 0-100
	providerId?: string; // Provider-specific ID (e.g., Spotify ID)
	albumArt?: string;
	previewUrl?: string;
}

export interface SearchQuery {
	title?: string;
	artist?: string;
	year?: number;
	duration?: number; // For matching validation
	youtubeId?: string; // Original source
}

/**
 * Abstract metadata provider interface
 * Implement this for different enrichment sources (Spotify, AI, MusicBrainz, etc.)
 */
export interface IMetadataProvider {
	/**
	 * Provider name (e.g., "spotify", "openai", "anthropic")
	 */
	readonly name: string;

	/**
	 * Check if provider is initialized and ready
	 */
	isReady(): boolean;

	/**
	 * Search for tracks matching the query
	 * @param query Search parameters
	 * @param limit Maximum number of results
	 * @returns Array of enriched tracks with confidence scores
	 */
	search(query: SearchQuery, limit?: number): Promise<EnrichedTrackMetadata[]>;

	/**
	 * Get a specific track by provider ID
	 * @param providerId Provider-specific track ID
	 */
	getTrack(providerId: string): Promise<EnrichedTrackMetadata | null>;

	/**
	 * Batch search for multiple tracks
	 * @param queries Array of search queries
	 * @returns Array of results (same order as input)
	 */
	batchSearch(queries: SearchQuery[]): Promise<EnrichedTrackMetadata[]>;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
	enabled: boolean;
	apiKey?: string;
	priority?: number; // Higher priority = used first
	[key: string]: any; // Provider-specific config
}
