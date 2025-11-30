<script lang="ts">
	/**
	 * YouTube Clip Selector Component
	 * Allows user to preview a YouTube video and select clip start time + duration
	 * Uses YouTube IFrame Player API for preview
	 */
	import { onMount } from 'svelte';
	import { SONG_CONFIG } from '@blind-test/shared';
	import { getApiUrl } from '$lib/api';
	import Button from './ui/Button.svelte';

	interface Props {
		videos: Array<{ videoId: string; title: string; uploader?: string; duration?: string }>;
		onComplete: (selections: Array<{ videoId: string; clipStart: number; clipDuration: number }>) => void;
		onCancel: () => void;
	}

	let { videos, onComplete, onCancel }: Props = $props();

	let currentIndex = $state(0);
	let clipStart = $state(SONG_CONFIG.DEFAULT_CLIP_START);
	let clipDuration = $state(SONG_CONFIG.DEFAULT_CLIP_DURATION);
	let selections = $state<Array<{ videoId: string; clipStart: number; clipDuration: number; metadata?: any }>>([]);
	let player = $state<any>(null);
	let playerReady = $state(false);

	// Metadata state
	let metadata = $state({
		title: '',
		artist: '',
		year: null as number | null,
		album: '',
		genre: '',
		subgenre: ''
	});
	let enriching = $state(false);
	let enrichmentConfidence = $state(0);
	let enrichmentError = $state<string | null>(null);

	const currentVideo = $derived(videos[currentIndex]);
	const progress = $derived(((currentIndex + 1) / videos.length) * 100);
	const isYearValid = $derived(metadata.year !== null && metadata.year >= 1900 && metadata.year <= new Date().getFullYear() + 1);
	const canProceed = $derived(isYearValid);

	onMount(() => {
		// Load YouTube IFrame Player API
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';
		const firstScriptTag = document.getElementsByTagName('script')[0];
		firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

		// Initialize player when API is ready
		(window as any).onYouTubeIframeAPIReady = () => {
			initPlayer();
		};

		// If API already loaded
		if ((window as any).YT) {
			initPlayer();
		}

		return () => {
			if (player) {
				player.destroy();
			}
		};
	});

	// Auto-enrich metadata when video changes
	$effect(() => {
		if (currentVideo) {
			enrichMetadata();
		}
	});

	async function enrichMetadata() {
		if (!currentVideo) return;

		enriching = true;
		enrichmentError = null;

		try {
			// Parse duration string (e.g., "3:45" -> 225 seconds)
			const durationSeconds = parseDuration(currentVideo.duration || '0:00');

			const response = await fetch(`${getApiUrl()}/api/songs/enrich-metadata`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					youtubeTitle: currentVideo.title,
					uploader: currentVideo.uploader || 'Unknown',
					duration: durationSeconds,
					youtubeId: currentVideo.videoId
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enrich metadata');
			}

			const result = await response.json();

			// Auto-apply if high confidence (≥90%)
			if (result.enriched.confidence >= 90) {
				metadata = {
					title: result.enriched.title,
					artist: result.enriched.artist,
					year: result.enriched.year || null,
					album: result.enriched.album || '',
					genre: result.enriched.genre || '',
					subgenre: result.enriched.subgenre || ''
				};
			} else {
				// Show for review if medium confidence (50-89%)
				metadata = {
					title: result.enriched.title || currentVideo.title,
					artist: result.enriched.artist || currentVideo.uploader || '',
					year: result.enriched.year || null,
					album: result.enriched.album || '',
					genre: result.enriched.genre || '',
					subgenre: result.enriched.subgenre || ''
				};
			}

			enrichmentConfidence = result.enriched.confidence;
		} catch (err) {
			console.error('Failed to enrich metadata:', err);
			enrichmentError = err instanceof Error ? err.message : 'Failed to enrich metadata';

			// Fallback to YouTube metadata
			metadata = {
				title: currentVideo.title,
				artist: currentVideo.uploader || '',
				year: null,
				album: '',
				genre: '',
				subgenre: ''
			};
			enrichmentConfidence = 0;
		} finally {
			enriching = false;
		}
	}

	function parseDuration(duration: string): number {
		// Parse "3:45" or "1:23:45" to seconds
		const parts = duration.split(':').map(Number);
		if (parts.length === 2) {
			return parts[0] * 60 + parts[1];
		} else if (parts.length === 3) {
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		return 0;
	}

	function initPlayer() {
		if (!currentVideo) return;

		player = new (window as any).YT.Player('youtube-player', {
			height: '360',
			width: '640',
			videoId: currentVideo.videoId,
			playerVars: {
				controls: 1,
				modestbranding: 1,
				rel: 0,
			},
			events: {
				onReady: () => {
					playerReady = true;
				},
			},
		});
	}

	function loadVideo(videoId: string) {
		if (player && playerReady) {
			player.loadVideoById(videoId);
		}
	}

	function previewClip() {
		if (player && playerReady) {
			player.seekTo(clipStart, true);
			player.playVideo();

			// Stop after clip duration
			setTimeout(() => {
				if (player) {
					player.pauseVideo();
				}
			}, clipDuration * 1000);
		}
	}

	function handleNext() {
		// Save current selection with metadata
		selections.push({
			videoId: currentVideo.videoId,
			clipStart,
			clipDuration,
			metadata: {
				title: metadata.title,
				artist: metadata.artist,
				year: metadata.year!,
				album: metadata.album || undefined,
				genre: metadata.genre || undefined,
				subgenre: metadata.subgenre || undefined
			}
		});

		if (currentIndex < videos.length - 1) {
			// Move to next video
			currentIndex++;
			clipStart = SONG_CONFIG.DEFAULT_CLIP_START;
			clipDuration = SONG_CONFIG.DEFAULT_CLIP_DURATION;
			loadVideo(videos[currentIndex].videoId);
		} else {
			// All videos processed
			onComplete(selections);
		}
	}

	function handleSkip() {
		// Skip current video without saving
		if (currentIndex < videos.length - 1) {
			currentIndex++;
			clipStart = SONG_CONFIG.DEFAULT_CLIP_START;
			clipDuration = SONG_CONFIG.DEFAULT_CLIP_DURATION;
			loadVideo(videos[currentIndex].videoId);
		} else {
			// Last video - complete with what we have
			onComplete(selections);
		}
	}

	function handleUseDefault() {
		// Use default settings for current video and move to next
		selections.push({
			videoId: currentVideo.videoId,
			clipStart: SONG_CONFIG.DEFAULT_CLIP_START,
			clipDuration: SONG_CONFIG.DEFAULT_CLIP_DURATION,
			metadata: {
				title: metadata.title,
				artist: metadata.artist,
				year: metadata.year!,
				album: metadata.album || undefined,
				genre: metadata.genre || undefined,
				subgenre: metadata.subgenre || undefined
			}
		});

		if (currentIndex < videos.length - 1) {
			currentIndex++;
			clipStart = SONG_CONFIG.DEFAULT_CLIP_START;
			clipDuration = SONG_CONFIG.DEFAULT_CLIP_DURATION;
			loadVideo(videos[currentIndex].videoId);
		} else {
			onComplete(selections);
		}
	}
</script>

<div class="modal-overlay" onclick={onCancel}>
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div>
				<h2>🎬 Sélection des extraits</h2>
				<p>Vidéo {currentIndex + 1} sur {videos.length}</p>
			</div>
			<button class="close-btn" onclick={onCancel} aria-label="Fermer">×</button>
		</div>

		<div class="progress-bar">
			<div class="progress-fill" style="width: {progress}%"></div>
		</div>

		<div class="modal-body">
			{#if currentVideo}
				<div class="video-info">
					<h3>{currentVideo.title}</h3>
					<p>{currentVideo.uploader || 'Inconnu'} • {currentVideo.duration || 'Durée inconnue'}</p>
				</div>

				<div class="video-container">
					<div id="youtube-player"></div>
				</div>

				<div class="controls">
					<div class="control-group">
						<label for="clip-start">Début de l'extrait (secondes)</label>
						<input
							id="clip-start"
							type="number"
							min="0"
							step="1"
							bind:value={clipStart}
						/>
					</div>

					<div class="control-group">
						<label for="clip-duration">Durée de l'extrait (secondes)</label>
						<input
							id="clip-duration"
							type="number"
							min="1"
							max={SONG_CONFIG.MAX_CLIP_DURATION}
							step="1"
							bind:value={clipDuration}
						/>
					</div>

					<Button variant="secondary" onclick={previewClip} disabled={!playerReady}>
						▶️ Prévisualiser l'extrait
					</Button>
				</div>

				<!-- Metadata Form -->
				<div class="metadata-section">
					<div class="metadata-header">
						<h4>📝 Informations de la chanson</h4>
						{#if enriching}
							<span class="confidence-badge loading">Enrichissement en cours...</span>
						{:else if enrichmentConfidence >= 90}
							<span class="confidence-badge high">✓ Confiance élevée ({enrichmentConfidence}%)</span>
						{:else if enrichmentConfidence >= 50}
							<span class="confidence-badge medium">⚠ À vérifier ({enrichmentConfidence}%)</span>
						{:else if enrichmentConfidence > 0}
							<span class="confidence-badge low">⚠ Confiance faible ({enrichmentConfidence}%)</span>
						{/if}
					</div>

					{#if enrichmentError}
						<div class="error-message">
							❌ {enrichmentError}
						</div>
					{/if}

					<div class="metadata-grid">
						<div class="control-group">
							<label for="song-title">Titre *</label>
							<input
								id="song-title"
								type="text"
								placeholder="Nom de la chanson"
								bind:value={metadata.title}
								disabled={enriching}
							/>
						</div>

						<div class="control-group">
							<label for="song-artist">Artiste *</label>
							<input
								id="song-artist"
								type="text"
								placeholder="Nom de l'artiste"
								bind:value={metadata.artist}
								disabled={enriching}
							/>
						</div>

						<div class="control-group">
							<label for="song-year">
								Année * {!isYearValid && metadata.year ? '(1900-' + (new Date().getFullYear() + 1) + ')' : ''}
							</label>
							<input
								id="song-year"
								type="number"
								placeholder="2024"
								min="1900"
								max={new Date().getFullYear() + 1}
								bind:value={metadata.year}
								disabled={enriching}
								class:invalid={!isYearValid && metadata.year}
							/>
						</div>

						<div class="control-group">
							<label for="song-album">Album</label>
							<input
								id="song-album"
								type="text"
								placeholder="Nom de l'album (optionnel)"
								bind:value={metadata.album}
								disabled={enriching}
							/>
						</div>

						<div class="control-group">
							<label for="song-genre">Genre</label>
							<input
								id="song-genre"
								type="text"
								placeholder="Genre musical (optionnel)"
								bind:value={metadata.genre}
								disabled={enriching}
							/>
						</div>

						<div class="control-group">
							<label for="song-subgenre">Sous-genre</label>
							<input
								id="song-subgenre"
								type="text"
								placeholder="Sous-genre (optionnel)"
								bind:value={metadata.subgenre}
								disabled={enriching}
							/>
						</div>
					</div>

					<div class="metadata-actions">
						<Button variant="ghost" onclick={() => enrichMetadata()} disabled={enriching}>
							🔄 Rechercher sur Spotify
						</Button>
					</div>
				</div>

				<div class="modal-actions">
					<Button variant="outline" onclick={handleSkip}>
						Passer
					</Button>
					<Button variant="ghost" onclick={handleUseDefault} disabled={!canProceed}>
						Utiliser les valeurs par défaut
					</Button>
					<Button variant="primary" onclick={handleNext} disabled={!canProceed}>
						{currentIndex < videos.length - 1 ? 'Suivant →' : 'Terminer'}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
		padding: 1rem;
	}

	.modal-content {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 248, 255, 0.95));
		border-radius: 32px;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.modal-header p {
		margin: 0.25rem 0 0 0;
		color: var(--aq-color-muted);
		font-size: 0.9rem;
	}

	.close-btn {
		border: none;
		background: rgba(239, 76, 131, 0.12);
		border-radius: 12px;
		font-size: 1.5rem;
		width: 40px;
		height: 40px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 160ms ease;
	}

	.close-btn:hover {
		background: rgba(239, 76, 131, 0.2);
		transform: scale(1.1);
	}

	.progress-bar {
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		position: relative;
	}

	.progress-fill {
		height: 100%;
		background: var(--aq-color-primary);
		transition: width 300ms ease;
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.video-info {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.video-info h3 {
		margin: 0 0 0.5rem 0;
	}

	.video-info p {
		margin: 0;
		color: var(--aq-color-muted);
	}

	.video-container {
		display: flex;
		justify-content: center;
		margin-bottom: 1.5rem;
		background: #000;
		border-radius: 16px;
		overflow: hidden;
	}

	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 1rem;
		align-items: end;
		margin-bottom: 1.5rem;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 24px;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-group label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.control-group input {
		padding: 0.75rem 1rem;
		border: 2px solid rgba(0, 0, 0, 0.1);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.9);
		font-size: 1rem;
		font-family: inherit;
		transition: all 160ms ease;
	}

	.control-group input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		background: #fff;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	.metadata-section {
		margin: 2rem 0;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 24px;
	}

	.metadata-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.metadata-header h4 {
		margin: 0;
		font-size: 1.1rem;
	}

	.confidence-badge {
		padding: 0.5rem 1rem;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.confidence-badge.loading {
		background: rgba(100, 149, 237, 0.2);
		color: #4169e1;
	}

	.confidence-badge.high {
		background: rgba(34, 197, 94, 0.2);
		color: #16a34a;
	}

	.confidence-badge.medium {
		background: rgba(251, 191, 36, 0.2);
		color: #d97706;
	}

	.confidence-badge.low {
		background: rgba(239, 76, 131, 0.2);
		color: #dc2626;
	}

	.error-message {
		padding: 0.75rem 1rem;
		background: rgba(239, 76, 131, 0.1);
		color: #dc2626;
		border-radius: 12px;
		margin-bottom: 1rem;
	}

	.metadata-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.metadata-actions {
		display: flex;
		justify-content: flex-end;
	}

	.control-group input.invalid {
		border-color: #dc2626;
		background: rgba(239, 76, 131, 0.05);
	}

	@media (max-width: 768px) {
		.controls {
			grid-template-columns: 1fr;
		}

		.metadata-grid {
			grid-template-columns: 1fr;
		}

		.video-container :global(iframe) {
			max-width: 100%;
			height: auto;
		}
	}
</style>
