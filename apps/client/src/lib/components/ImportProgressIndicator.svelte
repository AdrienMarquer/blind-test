<script lang="ts">
	/**
	 * Import Progress Indicator
	 * Shows real-time progress for background import jobs via WebSocket
	 */
	import { onMount, onDestroy } from 'svelte';
	import { api, getWsUrl } from '$lib/api';

	interface Job {
		jobId: string;
		type: string;
		status: string;
		progress: number;
		currentItem?: number;
		totalItems?: number;
	}

	let activeJobs = $state<Map<string, Job>>(new Map());
	let ws: WebSocket | null = null;
	let wsConnected = $state(false);

	const hasActiveJobs = $derived(activeJobs.size > 0);

	onMount(() => {
		connectWebSocket();
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
		}
	});

	function connectWebSocket() {
		// Connect to a WebSocket endpoint (using a dummy room for global events)
		// In a real implementation, you might want a dedicated WebSocket for job updates
		ws = new WebSocket(`${getWsUrl()}/ws/rooms/global-job-updates`);

		ws.onopen = () => {
			wsConnected = true;
			console.log('WebSocket connected for job updates');
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);

				switch (message.type) {
					case 'job:progress':
						handleJobProgress(message.data);
						break;
					case 'job:completed':
						handleJobCompleted(message.data);
						break;
					case 'job:failed':
						handleJobFailed(message.data);
						break;
				}
			} catch (error) {
				console.error('Error parsing WebSocket message:', error);
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			wsConnected = false;
		};

		ws.onclose = () => {
			wsConnected = false;
			console.log('WebSocket disconnected');
			// Attempt to reconnect after 5 seconds
			setTimeout(() => {
				if (!ws || ws.readyState === WebSocket.CLOSED) {
					connectWebSocket();
				}
			}, 5000);
		};
	}

	function handleJobProgress(data: Job) {
		activeJobs.set(data.jobId, data);
		activeJobs = new Map(activeJobs); // Trigger reactivity
	}

	function handleJobCompleted(data: { jobId: string; type: string }) {
		activeJobs.delete(data.jobId);
		activeJobs = new Map(activeJobs); // Trigger reactivity

		// Show success notification
		showNotification(`✅ Import terminé : ${data.type}`, 'success');
	}

	function handleJobFailed(data: { jobId: string; type: string; error: string }) {
		activeJobs.delete(data.jobId);
		activeJobs = new Map(activeJobs); // Trigger reactivity

		// Show error notification
		showNotification(`❌ Import échoué : ${data.error}`, 'error');
	}

	function showNotification(message: string, type: 'success' | 'error') {
		// Simple notification implementation
		// In a real app, you might want to use a toast library
		console.log(`[${type.toUpperCase()}] ${message}`);
	}

	function getJobLabel(type: string): string {
		switch (type) {
			case 'youtube_download':
				return 'YouTube';
			case 'youtube_playlist':
				return 'Playlist YouTube';
			case 'spotify_download':
				return 'Spotify';
			default:
				return 'Import';
		}
	}

	async function dismissJob(jobId: string) {
		try {
			// Call API to cancel the job backend process
			const { data, error } = await api.api.jobs({ jobId }).delete();

			if (error) {
				console.warn('Failed to cancel job:', error);
				showNotification(`⚠️ Impossible d'annuler`, 'error');
			} else if (data) {
				console.log('Job cancelled successfully:', jobId);
				showNotification('✅ Import annulé', 'success');
			}
		} catch (error) {
			console.error('Error cancelling job:', error);
			showNotification('❌ Erreur lors de l\'annulation', 'error');
		} finally {
			// Remove from UI regardless of API result
			activeJobs.delete(jobId);
			activeJobs = new Map(activeJobs); // Trigger reactivity
		}
	}
</script>

{#if hasActiveJobs}
	<div class="progress-container">
		{#each [...activeJobs.values()] as job (job.jobId)}
			<div class="progress-card">
				<div class="progress-header">
					<h4>{getJobLabel(job.type)}</h4>
					<button onclick={() => dismissJob(job.jobId)} aria-label="Dismiss">×</button>
				</div>

				<div class="progress-info">
					<span class="status">{job.status}</span>
					{#if job.currentItem && job.totalItems}
						<span class="items">{job.currentItem}/{job.totalItems}</span>
					{/if}
					<span class="percentage">{Math.round(job.progress)}%</span>
				</div>

				<div class="progress-bar">
					<div class="progress-fill" style="width: {job.progress}%"></div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.progress-container {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		z-index: 999;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 400px;
	}

	.progress-card {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 248, 255, 0.98));
		border-radius: 24px;
		padding: 1.5rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.8);
		backdrop-filter: blur(10px);
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.progress-header h4 {
		margin: 0;
		font-size: 1rem;
		color: var(--aq-color-deep);
	}

	.progress-header button {
		border: none;
		background: rgba(239, 76, 131, 0.12);
		border-radius: 8px;
		font-size: 1.25rem;
		width: 28px;
		height: 28px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 160ms ease;
	}

	.progress-header button:hover {
		background: rgba(239, 76, 131, 0.2);
		transform: scale(1.1);
	}

	.progress-info {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}

	.status {
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(239, 76, 131, 0.15);
		color: var(--aq-color-primary);
		font-weight: 600;
		text-transform: capitalize;
	}

	.items,
	.percentage {
		color: var(--aq-color-muted);
		font-weight: 600;
	}

	.progress-bar {
		height: 8px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #ef4c83, #e91e63);
		border-radius: 999px;
		transition: width 300ms ease;
	}

	@media (max-width: 768px) {
		.progress-container {
			bottom: 1rem;
			right: 1rem;
			left: 1rem;
			max-width: none;
		}
	}
</style>
