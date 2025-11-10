import { SpotifyApi } from '@spotify/web-api-ts-sdk';

export interface SpotifyTrack {
	spotifyId: string;
	title: string;
	artist: string;
	album?: string;
	year?: number;
	genre?: string;
	duration: number; // seconds
	albumArt?: string;
	previewUrl?: string; // 30s preview MP3 URL
}

export class SpotifyService {
	private api: SpotifyApi | null = null;
	private initializationPromise: Promise<void> | null = null;

	constructor() {
		// Initialize asynchronously
		this.initializationPromise = this.initialize();
	}

	private async initialize(): Promise<void> {
		const clientId = process.env.SPOTIFY_CLIENT_ID;
		const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

		if (!clientId || !clientSecret) {
			console.warn(
				'Spotify API credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env'
			);
			return;
		}

		try {
			this.api = SpotifyApi.withClientCredentials(clientId, clientSecret);
			console.log('✅ Spotify API initialized successfully');
		} catch (error) {
			console.error('❌ Failed to initialize Spotify API:', error);
		}
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initializationPromise) {
			await this.initializationPromise;
		}
	}

	async search(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
		await this.ensureInitialized();

		if (!this.api) {
			throw new Error('Spotify API not initialized. Check your credentials.');
		}

		try {
			const results = await this.api.search(query, ['track'], undefined, limit);

			return results.tracks.items.map((track) => {
				// Extract year from release date
				const year = track.album.release_date
					? parseInt(track.album.release_date.substring(0, 4))
					: undefined;

				// Get primary genre from artist (requires additional API call, so we'll skip for now)
				// Genre will be detected from other sources or left empty

				return {
					spotifyId: track.id,
					title: track.name,
					artist: track.artists.map((a) => a.name).join(', '),
					album: track.album.name,
					year,
					duration: Math.floor(track.duration_ms / 1000),
					albumArt: track.album.images[0]?.url,
					previewUrl: track.preview_url || undefined
				};
			});
		} catch (error) {
			console.error('Spotify search error:', error);
			throw new Error('Failed to search Spotify');
		}
	}

	async getTrack(spotifyId: string): Promise<SpotifyTrack | null> {
		await this.ensureInitialized();

		if (!this.api) {
			throw new Error('Spotify API not initialized');
		}

		try {
			const track = await this.api.tracks.get(spotifyId);

			const year = track.album.release_date
				? parseInt(track.album.release_date.substring(0, 4))
				: undefined;

			return {
				spotifyId: track.id,
				title: track.name,
				artist: track.artists.map((a) => a.name).join(', '),
				album: track.album.name,
				year,
				duration: Math.floor(track.duration_ms / 1000),
				albumArt: track.album.images[0]?.url,
				previewUrl: track.preview_url || undefined
			};
		} catch (error) {
			console.error('Failed to fetch Spotify track:', error);
			return null;
		}
	}

	async getRecommendations(seedTrackId: string, limit: number = 10): Promise<SpotifyTrack[]> {
		await this.ensureInitialized();

		if (!this.api) {
			throw new Error('Spotify API not initialized');
		}

		try {
			const recommendations = await this.api.recommendations.get({
				seed_tracks: [seedTrackId],
				limit
			});

			return recommendations.tracks.map((track) => {
				const year = track.album.release_date
					? parseInt(track.album.release_date.substring(0, 4))
					: undefined;

				return {
					spotifyId: track.id,
					title: track.name,
					artist: track.artists.map((a) => a.name).join(', '),
					album: track.album.name,
					year,
					duration: Math.floor(track.duration_ms / 1000),
					albumArt: track.album.images[0]?.url,
					previewUrl: track.preview_url || undefined
				};
			});
		} catch (error) {
			console.error('Failed to get Spotify recommendations:', error);
			throw new Error('Failed to get recommendations');
		}
	}

	/**
	 * Get artist's top tracks (useful for finding similar songs by same artist)
	 */
	async getArtistTopTracks(artistId: string, limit: number = 10): Promise<SpotifyTrack[]> {
		await this.ensureInitialized();

		if (!this.api) {
			throw new Error('Spotify API not initialized');
		}

		try {
			// Get top tracks for US market (can be configurable)
			const topTracks = await this.api.artists.topTracks(artistId, 'US');

			return topTracks.tracks.slice(0, limit).map((track) => {
				const year = track.album.release_date
					? parseInt(track.album.release_date.substring(0, 4))
					: undefined;

				return {
					spotifyId: track.id,
					title: track.name,
					artist: track.artists.map((a) => a.name).join(', '),
					album: track.album.name,
					year,
					duration: Math.floor(track.duration_ms / 1000),
					albumArt: track.album.images[0]?.url,
					previewUrl: track.preview_url || undefined
				};
			});
		} catch (error) {
			console.error('Failed to get artist top tracks:', error);
			return [];
		}
	}

	isInitialized(): boolean {
		return this.api !== null;
	}
}

// Singleton instance
export const spotifyService = new SpotifyService();
