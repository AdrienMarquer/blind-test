<script lang="ts">
	/**
	 * YouTube Import Modal
	 * Allows importing songs from YouTube videos or playlists
	 */
	import { SONG_CONFIG } from '@blind-test/shared';
	import { getApiUrl } from '$lib/api';
	import Button from './ui/Button.svelte';
	import InputField from './ui/InputField.svelte';

	// Helper to get admin auth headers for API calls
	function getAdminHeaders(): HeadersInit {
		const password = localStorage.getItem('admin_auth');
		return password ? { 'X-Admin-Password': password } : {};
	}

	interface Props {
		onImport: (videos: Array<{ videoId: string; title: string; clipStart?: number; clipDuration?: number; artist?: string; uploader?: string; durationInSeconds?: number; force?: boolean }>) => void;
		onSelectClips: (videos: Array<{ videoId: string; title: string; uploader?: string; duration?: string }>) => void;
		onCancel: () => void;
	}

	let { onImport, onSelectClips, onCancel }: Props = $props();

	let youtubeUrl = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let playlistInfo = $state<any>(null);
	let selectedVideos = $state<Set<string>>(new Set());
	let duplicateResults = $state<Map<string, any>>(new Map());
	let checkingDuplicates = $state(false);
	let excludeDuplicates = $state(true);

	const duplicateCount = $derived(Array.from(duplicateResults.values()).filter(r => r.isDuplicate).length);

	async function fetchPlaylistInfo() {
		if (!youtubeUrl.trim()) {
			error = 'Veuillez entrer une URL YouTube';
			return;
		}

		try {
			loading = true;
			error = null;

			const response = await fetch(`${getApiUrl()}/api/songs/youtube-playlist-info`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
				body: JSON.stringify({ url: youtubeUrl })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Impossible de récupérer les informations');
			}

			playlistInfo = data;

			// Check for duplicates
			await checkForDuplicates(data.videos);

			// Select all non-duplicate videos by default (or all if not excluding duplicates)
			const videoIds = data.videos.map((v: any) => v.videoId);
			const nonDuplicateIds = videoIds.filter((id: string) => {
				const duplicate = duplicateResults.get(id);
				return !duplicate || !duplicate.isDuplicate;
			});

			selectedVideos = new Set(excludeDuplicates ? nonDuplicateIds : videoIds);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur lors de la récupération';
			console.error('YouTube playlist fetch error:', err);
		} finally {
			loading = false;
		}
	}

	async function checkForDuplicates(videos: any[]) {
		try {
			checkingDuplicates = true;

			const response = await fetch(`${getApiUrl()}/api/songs/youtube-check-duplicates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
				body: JSON.stringify({
					videos: videos.map(v => ({
						videoId: v.videoId,
						title: v.title,
						uploader: v.uploader,
						durationInSeconds: v.durationSeconds
					}))
				})
			});

			const data = await response.json();

			if (!response.ok) {
				console.error('Failed to check duplicates:', data.error);
				return;
			}

			// Store duplicate results in a Map for easy lookup
			const resultsMap = new Map();
			data.results.forEach((result: any) => {
				resultsMap.set(result.videoId, result);
			});
			duplicateResults = resultsMap;
		} catch (err) {
			console.error('Duplicate check error:', err);
			// Continue without duplicate checking
		} finally {
			checkingDuplicates = false;
		}
	}

	function toggleVideo(videoId: string) {
		if (selectedVideos.has(videoId)) {
			selectedVideos.delete(videoId);
		} else {
			selectedVideos.add(videoId);
		}
		selectedVideos = new Set(selectedVideos); // Trigger reactivity
	}

	function selectAll() {
		if (!playlistInfo) return;
		selectedVideos = new Set(playlistInfo.videos.map((v: any) => v.videoId));
	}

	function deselectAll() {
		selectedVideos = new Set();
	}

	function handleAcceptAll() {
		if (!playlistInfo) return;

		const videosToImport = playlistInfo.videos
			.filter((v: any) => selectedVideos.has(v.videoId))
			.map((v: any) => {
				const duplicateInfo = duplicateResults.get(v.videoId);
				return {
					videoId: v.videoId,
					title: v.title,
					artist: v.uploader || 'Unknown',
					uploader: v.uploader,
					durationInSeconds: v.durationSeconds, // Pass duration for metadata enrichment
					clipStart: SONG_CONFIG.DEFAULT_CLIP_START,
					clipDuration: SONG_CONFIG.DEFAULT_CLIP_DURATION,
					force: duplicateInfo?.isDuplicate ? true : undefined
				};
			});

		onImport(videosToImport);
	}

	function handleImportWithClipSelection() {
		if (!playlistInfo) return;

		const videosToSelectClips = playlistInfo.videos
			.filter((v: any) => selectedVideos.has(v.videoId));

		onSelectClips(videosToSelectClips);
	}

	function toggleExcludeDuplicates() {
		excludeDuplicates = !excludeDuplicates;

		if (!playlistInfo) return;

		if (excludeDuplicates) {
			// Deselect all duplicates
			playlistInfo.videos.forEach((v: any) => {
				const duplicate = duplicateResults.get(v.videoId);
				if (duplicate?.isDuplicate) {
					selectedVideos.delete(v.videoId);
				}
			});
		} else {
			// Reselect all videos
			playlistInfo.videos.forEach((v: any) => {
				selectedVideos.add(v.videoId);
			});
		}
		selectedVideos = new Set(selectedVideos);
	}
</script>

<div class="modal-overlay" onclick={onCancel}>
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>🎬 Importer depuis YouTube</h2>
			<button class="close-btn" onclick={onCancel} aria-label="Fermer">×</button>
		</div>

		<div class="modal-body">
			{#if !playlistInfo}
				<form onsubmit={(e) => { e.preventDefault(); fetchPlaylistInfo(); }}>
					<InputField
						placeholder="URL YouTube (vidéo ou playlist)"
						bind:value={youtubeUrl}
					/>
					<Button type="submit" disabled={loading || !youtubeUrl.trim()}>
						{loading ? 'Chargement...' : 'Analyser'}
					</Button>
				</form>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<div class="tips">
					<p>✨ Tu peux importer une vidéo ou une playlist entière</p>
					<p>🎯 Chaque vidéo sera ajoutée à ta bibliothèque</p>
				</div>
			{:else}
				<div class="playlist-header">
					<h3>{playlistInfo.title}</h3>
					{#if playlistInfo.type === 'playlist'}
												<p>
							{playlistInfo.videoCount} vidéos
							{#if duplicateCount > 0}
								• {duplicateCount} {duplicateCount === 1 ? 'doublon' : 'doublons'} détecté{duplicateCount === 1 ? '' : 's'}
							{/if}
							• {selectedVideos.size} sélectionnée{selectedVideos.size === 1 ? '' : 's'}
						</p>
					{/if}
				</div>

				<div class="selection-toolbar">
					<div class="toolbar-left">
						<Button variant="ghost" size="sm" onclick={selectAll}>
							Tout sélectionner
						</Button>
						<Button variant="ghost" size="sm" onclick={deselectAll}>
							Tout désélectionner
						</Button>
					</div>
										{#if duplicateCount > 0}
						<label class="exclude-toggle">
							<input
								type="checkbox"
								checked={excludeDuplicates}
								onchange={toggleExcludeDuplicates}
							/>
							<span>Exclure les doublons</span>
						</label>
					{/if}
				</div>

				<div class="videos-list">
					{#each playlistInfo.videos as video (video.videoId)}
						{@const duplicateInfo = duplicateResults.get(video.videoId)}
						<div class="video-card {selectedVideos.has(video.videoId) ? 'selected' : ''} {duplicateInfo?.isDuplicate ? 'duplicate' : ''}">
							<input
								type="checkbox"
								checked={selectedVideos.has(video.videoId)}
								onchange={() => toggleVideo(video.videoId)}
							/>
							{#if video.thumbnail}
								<img src={video.thumbnail} alt={video.title} />
							{/if}
							<div class="video-info">
								<div class="video-title-row">
									<h4>{video.title}</h4>
									{#if duplicateInfo?.isDuplicate}
										<span class="duplicate-badge" title="Doublon détecté ({duplicateInfo.confidence}%)">
											⚠️ Doublon
										</span>
									{/if}
								</div>
								<p>{video.uploader || 'Inconnu'}</p>
								<span class="duration">{video.duration}</span>
								{#if duplicateInfo?.isDuplicate && duplicateInfo.matches?.length > 0}
									<div class="duplicate-info">
										Similaire à : {duplicateInfo.matches[0].song.title} ({duplicateInfo.confidence}%)
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<div class="modal-actions">
					<Button variant="outline" onclick={onCancel}>
						Annuler
					</Button>
					<Button variant="secondary" onclick={handleImportWithClipSelection} disabled={selectedVideos.size === 0}>
						Choisir les extraits
					</Button>
					<Button variant="primary" onclick={handleAcceptAll} disabled={selectedVideos.size === 0}>
						Accepter tout ({selectedVideos.size})
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
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 248, 255, 0.95));
		border-radius: 32px;
		max-width: 800px;
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

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	form {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.error-message {
		padding: 1rem;
		background: rgba(239, 76, 131, 0.1);
		border-radius: 16px;
		color: #c62828;
		margin-bottom: 1rem;
	}

	.tips {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 16px;
		color: var(--aq-color-muted);
	}

	.tips p {
		margin: 0.5rem 0;
	}

	.playlist-header {
		margin-bottom: 1.5rem;
	}

	.playlist-header h3 {
		margin: 0 0 0.5rem 0;
	}

	.playlist-header p {
		margin: 0;
		color: var(--aq-color-muted);
	}

	.selection-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.videos-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		max-height: 400px;
		overflow-y: auto;
	}

	.video-card {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 1rem;
		align-items: center;
		padding: 1rem;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.5);
		border: 2px solid transparent;
		transition: all 160ms ease;
		cursor: pointer;
	}

	.video-card:hover {
		background: rgba(255, 255, 255, 0.8);
		transform: translateX(4px);
	}

	.video-card.selected {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.05);
	}

	.video-card input[type="checkbox"] {
		width: 20px;
		height: 20px;
		cursor: pointer;
	}

	.video-card img {
		width: 120px;
		height: 68px;
		object-fit: cover;
		border-radius: 12px;
	}

	.video-info h4 {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
	}

	.video-info p {
		margin: 0 0 0.25rem 0;
		color: var(--aq-color-muted);
		font-size: 0.9rem;
	}

	.video-info .duration {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.7);
		color: var(--aq-color-deep);
		font-weight: 600;
		font-size: 0.85rem;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
</style>
