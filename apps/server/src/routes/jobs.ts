/**
 * Import Jobs Routes
 * Handles job queue management, status tracking, and cancellation
 */

import { Elysia, t } from 'elysia';
import { jobQueue } from '../services/JobQueue';
import { logger } from '../utils/logger';

const apiLogger = logger.child({ module: 'API:Jobs' });

export const jobRoutes = new Elysia({ prefix: '/api/jobs' })
	// Get all jobs
	.get('/', async ({ query }) => {
		apiLogger.debug('Fetching all jobs', query);

		const { status, limit } = query;

		const jobs = jobQueue.getAllJobs({
			status: status as any,
			limit: limit ? parseInt(limit as string) : undefined
		});

		const stats = jobQueue.getStats();

		return {
			jobs,
			stats,
			total: jobs.length
		};
	}, {
		query: t.Object({
			status: t.Optional(t.String()), // Filter by status
			limit: t.Optional(t.String())   // Limit number of results
		})
	})

	// Get job by ID
	.get('/:jobId', async ({ params: { jobId }, set }) => {
		apiLogger.debug('Fetching job', { jobId });

		const job = jobQueue.getJob(jobId);

		if (!job) {
			set.status = 404;
			return { error: 'Job not found' };
		}

		return job;
	})

	// Cancel a job
	.delete('/:jobId', async ({ params: { jobId }, set }) => {
		apiLogger.info('Cancelling job', { jobId });

		const job = jobQueue.getJob(jobId);

		if (!job) {
			set.status = 404;
			return { error: 'Job not found' };
		}

		const cancelled = jobQueue.cancelJob(jobId);

		if (!cancelled) {
			set.status = 400;
			return {
				error: 'Cannot cancel job',
				reason: 'Job is already completed, failed, or cancelled'
			};
		}

		apiLogger.info('Job cancelled successfully', { jobId });

		return {
			success: true,
			message: 'Job cancelled',
			job: jobQueue.getJob(jobId)
		};
	})

	// Retry a failed job
	.post('/:jobId/retry', async ({ params: { jobId }, set }) => {
		apiLogger.info('Retrying job', { jobId });

		const job = jobQueue.getJob(jobId);

		if (!job) {
			set.status = 404;
			return { error: 'Job not found' };
		}

		if (job.status !== 'failed') {
			set.status = 400;
			return {
				error: 'Cannot retry job',
				reason: 'Only failed jobs can be retried'
			};
		}

		const retried = jobQueue.retryJob(jobId);

		if (!retried) {
			set.status = 400;
			return {
				error: 'Cannot retry job',
				reason: 'Maximum retry attempts exceeded'
			};
		}

		apiLogger.info('Job queued for retry', { jobId });

		return {
			success: true,
			message: 'Job queued for retry',
			job: jobQueue.getJob(jobId)
		};
	})

	// Get queue statistics
	.get('/stats/overview', async () => {
		apiLogger.debug('Fetching queue statistics');

		const stats = jobQueue.getStats();
		const activeCount = jobQueue.getActiveJobCount();
		const nextPending = jobQueue.getNextPendingJob();

		return {
			...stats,
			activeCount,
			hasNext: !!nextPending,
			nextJobId: nextPending?.id
		};
	})

	// Clean up old completed jobs
	.post('/cleanup', async ({ body }) => {
		const { hoursOld = 24 } = body;

		apiLogger.info('Cleaning up old jobs', { hoursOld });

		const cleanedCount = jobQueue.cleanupOldJobs(hoursOld);

		return {
			success: true,
			cleanedCount,
			message: `Cleaned up ${cleanedCount} old jobs`
		};
	}, {
		body: t.Object({
			hoursOld: t.Optional(t.Number({ minimum: 1 }))
		})
	});
