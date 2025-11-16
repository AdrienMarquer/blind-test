/**
 * Job Worker Service
 * Background worker that processes import jobs from the queue
 */

import { jobQueue, Job, JobType } from './JobQueue';
import { youtubeDownloadService } from './YouTubeDownloadService';
import { songRepository } from '../repositories';
import { extractMetadata, getFileFormat } from '../utils/mp3-metadata';
import { detectSongLanguage } from '../utils/language-detector';
import { logger } from '../utils/logger';
import { SONG_CONFIG } from '@blind-test/shared';
import { stat } from 'fs/promises';

const workerLogger = logger.child({ module: 'JobWorker' });

export interface JobWorkerConfig {
	maxConcurrent: number;
	pollInterval: number; // milliseconds
	autoStart: boolean;
}

const DEFAULT_CONFIG: JobWorkerConfig = {
	maxConcurrent: 2, // Max 2 simultaneous downloads
	pollInterval: 1000, // Poll every second
	autoStart: true,
};

/**
 * Job Worker - processes jobs from the queue
 */
export class JobWorker {
	private config: JobWorkerConfig;
	private running: boolean = false;
	private activeJobs: Set<string> = new Set();
	private pollTimer?: Timer;

	constructor(config: Partial<JobWorkerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		if (this.config.autoStart) {
			this.start();
		}
	}

	/**
	 * Start the worker
	 */
	start(): void {
		if (this.running) {
			workerLogger.warn('Worker already running');
			return;
		}

		this.running = true;
		workerLogger.info('Worker started', { config: this.config });

		// Start polling for jobs
		this.poll();
	}

	/**
	 * Stop the worker
	 */
	stop(): void {
		if (!this.running) {
			return;
		}

		this.running = false;
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = undefined;
		}

		workerLogger.info('Worker stopped', { activeJobs: this.activeJobs.size });
	}

	/**
	 * Poll for pending jobs
	 */
	private poll(): void {
		if (!this.running) {
			return;
		}

		// Check if we can process more jobs
		const availableSlots = this.config.maxConcurrent - this.activeJobs.size;

		if (availableSlots > 0) {
			// Get next pending jobs
			for (let i = 0; i < availableSlots; i++) {
				const job = jobQueue.getNextPendingJob();
				if (job) {
					this.processJob(job);
				}
			}
		}

		// Schedule next poll
		this.pollTimer = setTimeout(() => this.poll(), this.config.pollInterval);
	}

	/**
	 * Check if a job has been cancelled
	 */
	private isJobCancelled(jobId: string): boolean {
		const job = jobQueue.getJob(jobId);
		return job?.status === 'cancelled';
	}

	/**
	 * Process a single job
	 */
	private async processJob(job: Job): Promise<void> {
		this.activeJobs.add(job.id);

		workerLogger.info('Processing job', { jobId: job.id, type: job.type });

		try {
			// Check if job was cancelled before starting
			if (this.isJobCancelled(job.id)) {
				workerLogger.info('Job was cancelled before processing started', { jobId: job.id });
				return;
			}

			// Route to appropriate handler based on job type
			switch (job.type) {
				case 'youtube_download':
					await this.processYouTubeDownload(job);
					break;
				case 'youtube_playlist':
					await this.processYouTubePlaylist(job);
					break;
				case 'file_upload':
					await this.processFileUpload(job);
					break;
				case 'spotify_import':
					await this.processSpotifyImport(job);
					break;
				case 'spotify_download':
					// Not implemented yet - Spotify uses temp download + finalize flow
					workerLogger.warn('Spotify download jobs not supported in worker', { jobId: job.id });
					jobQueue.updateJobStatus(job.id, 'failed', 'Spotify jobs should use temp download flow');
					break;
				default:
					workerLogger.error('Unknown job type', { jobId: job.id, type: job.type });
					jobQueue.updateJobStatus(job.id, 'failed', `Unknown job type: ${job.type}`);
			}
		} catch (error) {
			// Don't mark as failed if it was cancelled
			if (this.isJobCancelled(job.id)) {
				workerLogger.info('Job cancelled during processing', { jobId: job.id });
				return;
			}

			workerLogger.error('Job processing failed', error, { jobId: job.id });
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			jobQueue.updateJobStatus(job.id, 'failed', errorMsg);
		} finally {
			this.activeJobs.delete(job.id);
		}
	}

	/**
	 * Process a single YouTube video download job
	 */
	private async processYouTubeDownload(job: Job): Promise<void> {
		const { videoId, clipStart, clipDuration, title, artist, metadata: enrichedMetadata } = job.metadata;

		if (!videoId) {
			throw new Error('Missing videoId in job metadata');
		}

		// Check cancellation before starting download
		if (this.isJobCancelled(job.id)) {
			workerLogger.info('Job cancelled before download', { jobId: job.id });
			return;
		}

		// Update status to downloading
		jobQueue.updateJobStatus(job.id, 'downloading');
		jobQueue.updateJobProgress(job.id, 0);

		workerLogger.info('Downloading YouTube video', { jobId: job.id, videoId });

		// Download the clip (or full video if no clip specified)
		const downloadResult = clipStart !== undefined && clipDuration !== undefined
			? await youtubeDownloadService.downloadClip(videoId, clipStart, clipDuration, { format: 'mp3', quality: '192' })
			: await youtubeDownloadService.download(videoId, { format: 'mp3', quality: '192' });

		if (!downloadResult.success || !downloadResult.filePath) {
			throw new Error(downloadResult.error || 'Download failed');
		}

		// Check cancellation after download
		if (this.isJobCancelled(job.id)) {
			workerLogger.info('Job cancelled after download', { jobId: job.id });
			return;
		}

		// Download complete - update progress to 50%
		jobQueue.updateJobProgress(job.id, 50);

		// Update status to processing
		jobQueue.updateJobStatus(job.id, 'processing');

		workerLogger.info('Processing downloaded file', { jobId: job.id, filePath: downloadResult.filePath });

		// Extract metadata
		const metadata = await extractMetadata(downloadResult.filePath);

		// Get file stats
		const stats = await stat(downloadResult.filePath);

		// Merge metadata using MetadataMerger
		const { mergeMetadata, logEnrichmentStats } = await import('./MetadataMerger');
		const finalMetadata = mergeMetadata(
			enrichedMetadata,
			{
				title: metadata.title,
				artist: metadata.artist,
				album: metadata.album,
				year: metadata.year,
				genre: metadata.genre,
				duration: metadata.duration
			},
			title || artist ? { title, artist } : undefined, // User-provided metadata if available
			{ jobId: job.id, videoId, source: 'youtube', logWarnings: true }
		);

		// Log enrichment statistics
		logEnrichmentStats(enrichedMetadata, finalMetadata, { jobId: job.id, videoId, source: 'youtube' });

		// Detect language
		const language = detectSongLanguage(finalMetadata.title, finalMetadata.artist);

		// Check for duplicates
		const existingSong = await songRepository.findByTitleAndArtist(finalMetadata.title, finalMetadata.artist);
		if (existingSong) {
			throw new Error(`Song already exists: "${finalMetadata.title}" by ${finalMetadata.artist}`);
		}

		// Create song record
		const song = await songRepository.create({
			filePath: downloadResult.filePath,
			fileName: downloadResult.fileName!,
			title: finalMetadata.title,
			artist: finalMetadata.artist,
			album: finalMetadata.album,
			year: finalMetadata.year,
			genre: finalMetadata.genre,
			subgenre: finalMetadata.subgenre,
			duration: metadata.duration,
			clipStart: clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START,
			clipDuration: clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION,
			fileSize: stats.size,
			format: getFileFormat(downloadResult.fileName!),
			language,
			source: 'youtube',
			spotifyId: finalMetadata.spotifyId, // Store Spotify ID from enrichment
			youtubeId: videoId,
		});

		// Job complete
		jobQueue.updateJobProgress(job.id, 100);
		jobQueue.updateJobStatus(job.id, 'completed');

		workerLogger.info('Job completed successfully', {
			jobId: job.id,
			songId: song.id,
			title: song.title,
			artist: song.artist
		});
	}

	/**
	 * Process a YouTube playlist import job
	 */
	private async processYouTubePlaylist(job: Job): Promise<void> {
		const { videos } = job.metadata;

		if (!videos || !Array.isArray(videos)) {
			throw new Error('Missing videos array in job metadata');
		}

		// Check cancellation before starting
		if (this.isJobCancelled(job.id)) {
			workerLogger.info('Playlist job cancelled before processing', { jobId: job.id });
			return;
		}

		const totalVideos = videos.length;
		jobQueue.updateJobStatus(job.id, 'downloading');
		jobQueue.updateJobProgress(job.id, 0, 0, totalVideos);

		workerLogger.info('Processing YouTube playlist', {
			jobId: job.id,
			totalVideos
		});

		// BATCH ENRICHMENT: Enrich all videos at once to minimize API calls
		workerLogger.info('Starting batch metadata enrichment', {
			jobId: job.id,
			videoCount: totalVideos
		});

		const { metadataEnrichmentService } = await import('./MetadataEnrichmentService.v2');
		const batchEnrichmentInput = videos.map(v => ({
			title: v.title || 'Unknown',
			uploader: v.artist || 'Unknown',
			duration: 180, // Use default 3 minutes (duration is used as a matching hint, not critical for enrichment)
			youtubeId: v.videoId
		}));

		const batchEnrichmentResults = await metadataEnrichmentService.enrichBatch(batchEnrichmentInput);

		// Store enrichment results in a Map for quick lookup
		const enrichmentMap = new Map();
		videos.forEach((video, index) => {
			enrichmentMap.set(video.videoId, batchEnrichmentResults[index]?.enriched || null);
		});

		workerLogger.info('Batch metadata enrichment complete', {
			jobId: job.id,
			enrichedCount: batchEnrichmentResults.length
		});

		const results: { success: boolean; video: any; error?: string }[] = [];

		// Process videos sequentially (to avoid overwhelming the system)
		for (let i = 0; i < videos.length; i++) {
			// Check cancellation before each video
			if (this.isJobCancelled(job.id)) {
				workerLogger.info('Playlist job cancelled during processing', {
					jobId: job.id,
					processedCount: i,
					totalVideos
				});
				return;
			}

			const video = videos[i];
			const currentItem = i + 1;

			try {
				workerLogger.info('Processing video', {
					jobId: job.id,
					currentItem,
					totalVideos,
					videoId: video.videoId,
					title: video.title
				});

				// Update progress
				const progress = Math.floor((currentItem / totalVideos) * 100);
				jobQueue.updateJobProgress(job.id, progress, currentItem, totalVideos);

				// Download clip (or full video if no clip specified)
				const downloadResult = video.clipStart !== undefined && video.clipDuration !== undefined
					? await youtubeDownloadService.downloadClip(
						video.videoId,
						video.clipStart,
						video.clipDuration,
						{ format: 'mp3', quality: '192' }
					)
					: await youtubeDownloadService.download(
						video.videoId,
						{ format: 'mp3', quality: '192' }
					);

				if (!downloadResult.success || !downloadResult.filePath) {
					throw new Error(downloadResult.error || 'Download failed');
				}

				// Extract metadata
				const metadata = await extractMetadata(downloadResult.filePath);

				// Get pre-enriched metadata from batch enrichment
				const enriched = enrichmentMap.get(video.videoId) || {
					title: metadata.title,
					artist: metadata.artist,
					confidence: 0
				};

				// Get file stats
				const stats = await stat(downloadResult.filePath);

				// Detect language
				const language = detectSongLanguage(metadata.title, metadata.artist);

				// Merge metadata using MetadataMerger utility
				const { mergeMetadata, logEnrichmentStats } = await import('./MetadataMerger');
				const finalMetadata = mergeMetadata(
					enriched, // enriched metadata from batch enrichment
					{
						title: metadata.title,
						artist: metadata.artist,
						album: metadata.album,
						year: metadata.year,
						genre: metadata.genre,
						duration: metadata.duration
					},
					video.title || video.artist ? { title: video.title, artist: video.artist } : undefined,
					{ jobId: job.id, videoId: video.videoId, source: 'youtube', logWarnings: true }
				);

				// Log enrichment statistics
				logEnrichmentStats(enriched, finalMetadata, { jobId: job.id, videoId: video.videoId, source: 'youtube' });

				// Check for duplicates (unless force flag is set)
				if (!video.force) {
					const { duplicateDetectionService } = await import('./DuplicateDetectionService');
					const duplicateCheck = await duplicateDetectionService.detectDuplicates({
						title: finalMetadata.title,
						artist: finalMetadata.artist,
						duration: metadata.duration,
						youtubeId: video.videoId,
					});

					if (duplicateCheck.isDuplicate) {
						workerLogger.warn('Duplicate song detected, skipping', {
							jobId: job.id,
							title: finalMetadata.title,
							artist: finalMetadata.artist,
							confidence: duplicateCheck.highestConfidence,
							matchCount: duplicateCheck.matches.length
						});
						results.push({
							success: false,
							video,
							error: `Duplicate detected (${duplicateCheck.highestConfidence}% confidence): "${finalMetadata.title}" by ${finalMetadata.artist}`
						});
						continue;
					}
				} else {
					workerLogger.info('Force flag set, skipping duplicate check', {
						jobId: job.id,
						title: finalMetadata.title,
						artist: finalMetadata.artist
					});
				}

				// Create song record
				const song = await songRepository.create({
					filePath: downloadResult.filePath,
					fileName: downloadResult.fileName!,
					title: finalMetadata.title,
					artist: finalMetadata.artist,
					album: finalMetadata.album,
					year: finalMetadata.year,
					genre: finalMetadata.genre,
					subgenre: finalMetadata.subgenre,
					duration: metadata.duration,
					clipStart: video.clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START,
					clipDuration: video.clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION,
					fileSize: stats.size,
					format: getFileFormat(downloadResult.fileName!),
					language,
					source: 'youtube',
					spotifyId: finalMetadata.spotifyId,
					youtubeId: video.videoId,
				});

				workerLogger.info('Video processed successfully', {
					jobId: job.id,
					songId: song.id,
					title: song.title,
					artist: song.artist
				});

				results.push({ success: true, video });
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				workerLogger.error('Video processing failed', error, {
					jobId: job.id,
					currentItem,
					videoId: video.videoId
				});

				results.push({
					success: false,
					video,
					error: errorMsg
				});
			}
		}

		// Job complete
		const successCount = results.filter(r => r.success).length;
		const failureCount = results.filter(r => !r.success).length;

		jobQueue.updateJobProgress(job.id, 100, totalVideos, totalVideos);
		jobQueue.updateJobStatus(job.id, 'completed');

		workerLogger.info('Playlist job completed', {
			jobId: job.id,
			totalVideos,
			successCount,
			failureCount
		});
	}

	/**
	 * Process a file upload job
	 */
	private async processFileUpload(job: Job): Promise<void> {
		const { tempFilePath, fileName, providedMetadata, clipStart, clipDuration, force } = job.metadata;

		if (!tempFilePath || !fileName) {
			throw new Error('Missing tempFilePath or fileName in job metadata');
		}

		// Check cancellation before starting
		if (this.isJobCancelled(job.id)) {
			workerLogger.info('Job cancelled before processing', { jobId: job.id });
			return;
		}

		// Update status to processing
		jobQueue.updateJobStatus(job.id, 'processing');
		jobQueue.updateJobProgress(job.id, 0);

		workerLogger.info('Processing file upload', { jobId: job.id, fileName });

		// Extract metadata from uploaded file
		const { extractMetadata } = await import('../utils/mp3-metadata');
		const extractedMetadata = await extractMetadata(tempFilePath);

		// Update progress to 30%
		jobQueue.updateJobProgress(job.id, 30);

		// Enrich metadata using EnrichmentHelper
		const { enrichFromFile } = await import('./EnrichmentHelper');
		const enriched = await enrichFromFile({
			title: extractedMetadata.title,
			artist: extractedMetadata.artist,
			duration: extractedMetadata.duration
		});

		// Update progress to 60%
		jobQueue.updateJobProgress(job.id, 60);

		// Merge metadata using MetadataMerger
		const { mergeMetadata, logEnrichmentStats } = await import('./MetadataMerger');
		const finalMetadata = mergeMetadata(
			enriched,
			{
				title: extractedMetadata.title,
				artist: extractedMetadata.artist,
				album: extractedMetadata.album,
				year: extractedMetadata.year,
				genre: extractedMetadata.genre,
				duration: extractedMetadata.duration
			},
			providedMetadata,
			{ jobId: job.id, source: 'upload', logWarnings: true }
		);

		// Log enrichment statistics
		logEnrichmentStats(enriched, finalMetadata, { jobId: job.id, source: 'upload' });

		// Check for duplicates (unless force flag is set)
		if (!force) {
			const { duplicateDetectionService } = await import('./DuplicateDetectionService');
			const duplicateCheck = await duplicateDetectionService.detectDuplicates({
				title: finalMetadata.title,
				artist: finalMetadata.artist,
				duration: extractedMetadata.duration,
			});

			if (duplicateCheck.isDuplicate) {
				throw new Error(`Duplicate detected (${duplicateCheck.highestConfidence}% confidence): "${finalMetadata.title}" by ${finalMetadata.artist}`);
			}
		} else {
			workerLogger.info('Force flag set, skipping duplicate check', {
				jobId: job.id,
				title: finalMetadata.title,
				artist: finalMetadata.artist
			});
		}

		// Get file stats
		const { stat, rename } = await import('fs/promises');
		const stats = await stat(tempFilePath);

		// Move file from temp to uploads directory
		const { getFileFormat, detectSongLanguage } = await import('../utils/mp3-metadata');
		const targetPath = `uploads/${fileName}`;
		await rename(tempFilePath, targetPath);

		// Detect language
		const language = detectSongLanguage(finalMetadata.title, finalMetadata.artist);

		// Create song record
		const song = await songRepository.create({
			filePath: targetPath,
			fileName: fileName,
			title: finalMetadata.title,
			artist: finalMetadata.artist,
			album: finalMetadata.album,
			year: finalMetadata.year,
			genre: finalMetadata.genre,
			subgenre: finalMetadata.subgenre,
			duration: extractedMetadata.duration,
			clipStart: clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START,
			clipDuration: clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION,
			fileSize: stats.size,
			format: getFileFormat(fileName),
			language,
			source: 'upload',
			spotifyId: finalMetadata.spotifyId
		});

		// Job complete
		jobQueue.updateJobProgress(job.id, 100);
		jobQueue.updateJobStatus(job.id, 'completed');

		workerLogger.info('File upload job completed successfully', {
			jobId: job.id,
			songId: song.id,
			title: song.title,
			artist: song.artist
		});
	}

	/**
	 * Process a Spotify import job
	 */
	private async processSpotifyImport(job: Job): Promise<void> {
		const { spotifyTrack } = job.metadata;

		if (!spotifyTrack) {
			throw new Error('Missing spotifyTrack in job metadata');
		}

		// Check cancellation before starting
		if (this.isJobCancelled(job.id)) {
			workerLogger.info('Job cancelled before processing', { jobId: job.id });
			return;
		}

		// Update status to processing
		jobQueue.updateJobStatus(job.id, 'processing');
		jobQueue.updateJobProgress(job.id, 0);

		workerLogger.info('Processing Spotify import', {
			jobId: job.id,
			title: spotifyTrack.title,
			artist: spotifyTrack.artist
		});

		// Enrich Spotify data using EnrichmentHelper
		const { enrichFromSpotifyData } = await import('./EnrichmentHelper');
		const enriched = await enrichFromSpotifyData({
			title: spotifyTrack.title,
			artist: spotifyTrack.artist,
			album: spotifyTrack.album,
			year: spotifyTrack.year,
			genre: spotifyTrack.genre,
			duration: spotifyTrack.duration || 30, // Default duration if not provided
			spotifyId: job.metadata.spotifyId || ''
		});

		// Update progress to 50%
		jobQueue.updateJobProgress(job.id, 50);

		// Merge metadata using MetadataMerger
		const { mergeMetadata } = await import('./MetadataMerger');
		const finalMetadata = mergeMetadata(
			enriched,
			{
				title: spotifyTrack.title,
				artist: spotifyTrack.artist,
				album: spotifyTrack.album,
				year: spotifyTrack.year,
				genre: spotifyTrack.genre,
				duration: spotifyTrack.duration || 30
			},
			undefined, // No additional provided metadata
			{ jobId: job.id, source: 'spotify', logWarnings: true }
		);

		// Check for duplicates
		const existingSong = await songRepository.findByTitleAndArtist(finalMetadata.title, finalMetadata.artist);
		if (existingSong) {
			throw new Error(`Song already exists: "${finalMetadata.title}" by ${finalMetadata.artist}`);
		}

		// Detect language
		const { detectSongLanguage } = await import('../utils/mp3-metadata');
		const language = detectSongLanguage(finalMetadata.title, finalMetadata.artist);

		// Create song record (Spotify imports don't have local files)
		const song = await songRepository.create({
			filePath: '', // Spotify streaming, no local file
			fileName: '', // Spotify streaming, no local file
			title: finalMetadata.title,
			artist: finalMetadata.artist,
			album: finalMetadata.album,
			year: finalMetadata.year,
			genre: finalMetadata.genre,
			subgenre: finalMetadata.subgenre,
			duration: spotifyTrack.duration || 30,
			clipStart: SONG_CONFIG.DEFAULT_CLIP_START,
			clipDuration: SONG_CONFIG.DEFAULT_CLIP_DURATION,
			fileSize: 0, // Spotify streaming, no file
			format: 'spotify', // Special format for Spotify streaming
			language,
			source: 'spotify',
			spotifyId: finalMetadata.spotifyId
		});

		// Job complete
		jobQueue.updateJobProgress(job.id, 100);
		jobQueue.updateJobStatus(job.id, 'completed');

		workerLogger.info('Spotify import job completed successfully', {
			jobId: job.id,
			songId: song.id,
			title: song.title,
			artist: song.artist
		});
	}

	/**
	 * Get worker status
	 */
	getStatus() {
		return {
			running: this.running,
			activeJobs: this.activeJobs.size,
			maxConcurrent: this.config.maxConcurrent,
			availableSlots: this.config.maxConcurrent - this.activeJobs.size,
		};
	}
}

// Create and export singleton instance
export const jobWorker = new JobWorker();
