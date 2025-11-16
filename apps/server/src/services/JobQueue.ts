/**
 * In-Memory Job Queue Service
 * Manages background import jobs with status tracking and progress updates
 */

import { generateId } from '@blind-test/shared';
import { logger } from '../utils/logger';

const jobLogger = logger.child({ module: 'JobQueue' });

export type JobType = 'spotify_download' | 'youtube_download' | 'youtube_playlist' | 'file_upload' | 'spotify_import';
export type JobStatus = 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobMetadata {
	// Spotify download metadata
	spotifyId?: string;
	spotifyTrack?: {
		title: string;
		artist: string;
		album?: string;
		year?: number;
		genre?: string;
		duration?: number;
	};

	// YouTube download metadata
	videoId?: string;
	videoTitle?: string;
	clipStart?: number;
	clipDuration?: number;
	title?: string; // User-provided or enriched title
	artist?: string; // User-provided or enriched artist
	metadata?: any; // Enriched metadata from MetadataEnrichmentService

	// YouTube playlist metadata
	playlistUrl?: string;
	playlistTitle?: string;
	videos?: Array<{
		videoId: string;
		title: string;
		artist?: string;
		clipStart?: number;
		clipDuration?: number;
		metadata?: any; // Enriched metadata
		force?: boolean; // Skip duplicate check
	}>;

	// File upload metadata
	fileName?: string;
	providedMetadata?: {
		title?: string;
		artist?: string;
		album?: string;
		year?: number;
		genre?: string;
	};

	// Common metadata
	tempFilePath?: string;
	resultSongId?: string;
	genre?: string;
}

export interface Job {
	id: string;
	type: JobType;
	status: JobStatus;
	progress: number; // 0-100
	metadata: JobMetadata;
	error?: string;
	currentItem?: number; // For batch jobs (playlists)
	totalItems?: number; // For batch jobs (playlists)
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	retryCount: number;
}

export type JobEventType = 'job:created' | 'job:progress' | 'job:completed' | 'job:failed' | 'job:cancelled';

export interface JobEvent {
	type: JobEventType;
	job: Job;
}

type JobEventListener = (event: JobEvent) => void;

class JobQueueService {
	private jobs: Map<string, Job> = new Map();
	private listeners: Set<JobEventListener> = new Set();
	private readonly maxRetries = 3;

	/**
	 * Create a new job
	 */
	createJob(type: JobType, metadata: JobMetadata): Job {
		const job: Job = {
			id: generateId(),
			type,
			status: 'pending',
			progress: 0,
			metadata,
			createdAt: new Date(),
			retryCount: 0,
		};

		this.jobs.set(job.id, job);
		jobLogger.info('Job created', { jobId: job.id, type });
		this.emit({ type: 'job:created', job });

		return job;
	}

	/**
	 * Get job by ID
	 */
	getJob(jobId: string): Job | null {
		return this.jobs.get(jobId) || null;
	}

	/**
	 * Get all jobs, optionally filtered by status
	 */
	getAllJobs(options?: { status?: JobStatus; limit?: number }): Job[] {
		let jobs = Array.from(this.jobs.values());

		if (options?.status) {
			jobs = jobs.filter(job => job.status === options.status);
		}

		// Sort by creation date (newest first)
		jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

		if (options?.limit) {
			jobs = jobs.slice(0, options.limit);
		}

		return jobs;
	}

	/**
	 * Update job status
	 */
	updateJobStatus(jobId: string, status: JobStatus, error?: string): void {
		const job = this.jobs.get(jobId);
		if (!job) {
			jobLogger.warn('Attempted to update non-existent job', { jobId });
			return;
		}

		job.status = status;
		if (error) job.error = error;

		if (status === 'downloading' && !job.startedAt) {
			job.startedAt = new Date();
		}

		if (status === 'completed' || status === 'failed' || status === 'cancelled') {
			job.completedAt = new Date();
			job.progress = status === 'completed' ? 100 : job.progress;
		}

		jobLogger.debug('Job status updated', { jobId, status });
		this.emit({
			type: status === 'completed' ? 'job:completed' :
				status === 'failed' ? 'job:failed' :
				status === 'cancelled' ? 'job:cancelled' :
				'job:progress',
			job
		});
	}

	/**
	 * Update job progress (0-100)
	 */
	updateJobProgress(
		jobId: string,
		progress: number,
		currentItem?: number,
		totalItems?: number
	): void {
		const job = this.jobs.get(jobId);
		if (!job) {
			jobLogger.warn('Attempted to update progress for non-existent job', { jobId });
			return;
		}

		job.progress = Math.min(100, Math.max(0, progress));
		if (currentItem !== undefined) job.currentItem = currentItem;
		if (totalItems !== undefined) job.totalItems = totalItems;

		this.emit({ type: 'job:progress', job });
	}

	/**
	 * Mark job for retry
	 */
	retryJob(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;

		if (job.retryCount >= this.maxRetries) {
			jobLogger.warn('Job exceeded max retries', { jobId, retryCount: job.retryCount });
			this.updateJobStatus(jobId, 'failed', 'Maximum retry attempts exceeded');
			return false;
		}

		job.retryCount++;
		job.status = 'pending';
		job.error = undefined;
		job.progress = 0;

		jobLogger.info('Job queued for retry', { jobId, retryCount: job.retryCount });
		this.emit({ type: 'job:progress', job });

		return true;
	}

	/**
	 * Cancel a pending or active job
	 */
	cancelJob(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;

		if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
			jobLogger.warn('Cannot cancel already finished job', { jobId, status: job.status });
			return false;
		}

		this.updateJobStatus(jobId, 'cancelled');
		jobLogger.info('Job cancelled', { jobId });

		return true;
	}

	/**
	 * Delete a job from the queue
	 */
	deleteJob(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;

		// Only allow deletion of completed, failed, or cancelled jobs
		if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled') {
			jobLogger.warn('Cannot delete active job', { jobId, status: job.status });
			return false;
		}

		this.jobs.delete(jobId);
		jobLogger.info('Job deleted', { jobId });

		return true;
	}

	/**
	 * Get next pending job for processing
	 */
	getNextPendingJob(): Job | null {
		const pendingJobs = this.getAllJobs({ status: 'pending' });
		return pendingJobs[0] || null;
	}

	/**
	 * Get active job count (downloading or processing)
	 */
	getActiveJobCount(): number {
		return Array.from(this.jobs.values()).filter(
			job => job.status === 'downloading' || job.status === 'processing'
		).length;
	}

	/**
	 * Subscribe to job events
	 */
	on(listener: JobEventListener): () => void {
		this.listeners.add(listener);

		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Emit job event to all listeners
	 */
	private emit(event: JobEvent): void {
		this.listeners.forEach(listener => {
			try {
				listener(event);
			} catch (error) {
				jobLogger.error('Error in job event listener', error);
			}
		});
	}

	/**
	 * Clean up old completed/failed jobs (older than specified hours)
	 */
	cleanupOldJobs(hoursOld: number = 24): number {
		const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
		let cleanedCount = 0;

		for (const [jobId, job] of this.jobs.entries()) {
			if (
				(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
				job.completedAt &&
				job.completedAt < cutoffDate
			) {
				this.jobs.delete(jobId);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			jobLogger.info('Cleaned up old jobs', { count: cleanedCount, hoursOld });
		}

		return cleanedCount;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): {
		total: number;
		pending: number;
		downloading: number;
		processing: number;
		completed: number;
		failed: number;
		cancelled: number;
	} {
		const jobs = Array.from(this.jobs.values());

		return {
			total: jobs.length,
			pending: jobs.filter(j => j.status === 'pending').length,
			downloading: jobs.filter(j => j.status === 'downloading').length,
			processing: jobs.filter(j => j.status === 'processing').length,
			completed: jobs.filter(j => j.status === 'completed').length,
			failed: jobs.filter(j => j.status === 'failed').length,
			cancelled: jobs.filter(j => j.status === 'cancelled').length,
		};
	}
}

// Export singleton instance
export const jobQueue = new JobQueueService();

// Auto-cleanup every hour
setInterval(() => {
	jobQueue.cleanupOldJobs(24);
}, 60 * 60 * 1000);
