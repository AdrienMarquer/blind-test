import youtubedl from 'youtube-dl-exec';
import YoutubeSearch from 'youtube-search-api';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

export interface YouTubeVideo {
	videoId: string;
	title: string;
	duration: string; // e.g., "3:45"
	thumbnail: string;
}

export interface DownloadResult {
	success: boolean;
	filePath?: string;
	fileName?: string;
	fileSize?: number;
	duration?: number;
	error?: string;
}

export class YouTubeDownloadService {
	private uploadDir: string;

	constructor() {
		// Use environment variable or default to uploads directory
		this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
	}

	/**
	 * Search YouTube for a query
	 */
	async search(query: string, limit: number = 5): Promise<YouTubeVideo[]> {
		try {
			const results = await YoutubeSearch.GetListByKeyword(query, false, limit);

			return results.items.map((item: any) => ({
				videoId: item.id,
				title: item.title,
				duration: item.length?.simpleText || 'Unknown',
				thumbnail: item.thumbnail?.thumbnails?.[0]?.url || ''
			}));
		} catch (error) {
			console.error('YouTube search error:', error);
			throw new Error('Failed to search YouTube');
		}
	}

	/**
	 * Find best YouTube match for a song
	 */
	async findBestMatch(title: string, artist: string): Promise<YouTubeVideo | null> {
		const query = `${artist} ${title} official audio`;
		const results = await this.search(query, 5);

		if (results.length === 0) {
			return null;
		}

		// Return first result (usually most relevant)
		// TODO: Could add scoring logic to find best match
		return results[0];
	}

	/**
	 * Download audio from YouTube video
	 */
	async download(
		videoId: string,
		options: {
			format?: 'mp3' | 'flac' | 'm4a';
			quality?: string;
			maxDuration?: number; // Max duration in seconds (for clip extraction)
		} = {}
	): Promise<DownloadResult> {
		const { format = 'mp3', quality = '192', maxDuration } = options;

		try {
			// Ensure upload directory exists
			await fs.mkdir(this.uploadDir, { recursive: true });

			// Generate unique filename
			const timestamp = Date.now();
			const uniqueId = randomUUID().substring(0, 8);
			const fileName = `${timestamp}_${uniqueId}.${format}`;
			const outputPath = path.join(this.uploadDir, fileName);

			console.log(`📥 Downloading YouTube video: ${videoId}`);

			// Download using yt-dlp
			const ytdlOptions: any = {
				output: outputPath,
				extractAudio: true,
				audioFormat: format,
				audioQuality: quality,
				noCheckCertificates: true,
				noWarnings: true,
				preferFreeFormats: true,
				addMetadata: true,
				noCookies: true,
				noPlaylist: true
			};

			// If maxDuration specified, we'll trim after download
			// yt-dlp doesn't support clip extraction during download

			await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, ytdlOptions);

			// Get file stats
			const stats = await fs.stat(outputPath);

			console.log(`✅ Download complete: ${fileName} (${stats.size} bytes)`);

			return {
				success: true,
				filePath: outputPath,
				fileName,
				fileSize: stats.size
			};
		} catch (error: any) {
			console.error('❌ YouTube download error:', error);
			console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
			console.error('❌ Error details:', JSON.stringify(error, null, 2));
			console.error('❌ Error type:', typeof error);
			console.error('❌ Error keys:', Object.keys(error || {}));

			// Extract error message from various possible sources
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (error?.stderr) {
				errorMessage = `yt-dlp error: ${error.stderr}`;
			} else if (error?.stdout) {
				errorMessage = `yt-dlp output: ${error.stdout}`;
			} else if (typeof error === 'string') {
				errorMessage = error;
			} else {
				errorMessage = 'Unknown download error';
			}

			console.error('❌ Final error message:', errorMessage);
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Download from YouTube based on search query
	 */
	async downloadBySearch(
		query: string,
		options?: { format?: 'mp3' | 'flac' | 'm4a'; quality?: string }
	): Promise<DownloadResult & { youtubeId?: string }> {
		const results = await this.search(query, 1);

		if (results.length === 0) {
			return {
				success: false,
				error: 'No YouTube results found'
			};
		}

		const video = results[0];
		const downloadResult = await this.download(video.videoId, options);

		return {
			...downloadResult,
			youtubeId: video.videoId
		};
	}

	/**
	 * Get video information without downloading
	 */
	async getVideoInfo(videoId: string): Promise<any> {
		try {
			const info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
				dumpSingleJson: true,
				noCheckCertificates: true,
				noWarnings: true,
				skipDownload: true
			});

			return {
				title: info.title,
				duration: info.duration, // seconds
				artist: info.artist || info.uploader,
				album: info.album,
				thumbnail: info.thumbnail
			};
		} catch (error) {
			console.error('Failed to get video info:', error);
			return null;
		}
	}

	/**
	 * Parse duration string (e.g., "3:45") to seconds
	 */
	private parseDuration(durationStr: string): number {
		const parts = durationStr.split(':').map((p) => parseInt(p, 10));

		if (parts.length === 2) {
			// MM:SS
			return parts[0] * 60 + parts[1];
		} else if (parts.length === 3) {
			// HH:MM:SS
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}

		return 0;
	}
}

// Singleton instance
export const youtubeDownloadService = new YouTubeDownloadService();
