<script lang="ts">
	import { onMount } from 'svelte';
	import { api, getApiUrl, getAdminHeaders, getAuthenticatedApi } from '$lib/api';
	// Note: getAdminHeaders is used for file upload (FormData) which Eden Treaty doesn't handle well
	import type { Song } from '@blind-test/shared';
	import { SONG_CONFIG, CANONICAL_GENRES } from '@blind-test/shared';
	import AudioClipSelector from '$lib/components/AudioClipSelector.svelte';
	import YouTubeImportModal from '$lib/components/YouTubeImportModal.svelte';
	import YouTubeClipSelector from '$lib/components/YouTubeClipSelector.svelte';
	import ImportProgressIndicator from '$lib/components/ImportProgressIndicator.svelte';
	import DuplicateWarningModal from '$lib/components/DuplicateWarningModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';
	import EditableSongCard from '$lib/components/EditableSongCard.svelte';
	import SongStatsCharts from '$lib/components/SongStatsCharts.svelte';
	import AdminGate from '$lib/components/AdminGate.svelte';


	let songs = $state<Song[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let searchQuery = $state('');
	let selectedGenre = $state('');
	let metadataFilter = $state<'all' | 'incomplete-metadata' | 'missing-file'>('all');
	let selectedFile = $state<File | null>(null);
	let showClipSelector = $state(false);
	let clipStart = $state<number>(SONG_CONFIG.DEFAULT_CLIP_START);
	let clipDuration = $state<number>(SONG_CONFIG.DEFAULT_CLIP_DURATION);
	const songsApi = api.api.songs as Record<string, any>;

	let spotifyQuery = $state('');
	let spotifyResults = $state<any[]>([]);
	let searchingSpotify = $state(false);
	let addingFromSpotify = $state(false);
	let selectedSpotifyId = $state<string | null>(null);

	// Spotify clip selection flow
	let spotifyTempFile = $state<File | null>(null);
	let spotifyTempFileId = $state<string | null>(null);
	let spotifyTempMetadata = $state<any>(null);
	let showSpotifyClipSelector = $state(false);

	// Duplicate warning (Spotify)
	let showSpotifyDuplicateWarning = $state(false);
	let spotifyDuplicates = $state<any[]>([]);
	let pendingSpotifyId = $state<string | null>(null);

	// Duplicate warning (Upload)
	let showUploadDuplicateWarning = $state(false);
	let uploadDuplicates = $state<any[]>([]);
	let uploadCandidateSong = $state<any>(null);
	let pendingUploadFile = $state<File | null>(null);
	let pendingUploadClipStart = $state<number>(SONG_CONFIG.DEFAULT_CLIP_START);
	let pendingUploadClipDuration = $state<number>(SONG_CONFIG.DEFAULT_CLIP_DURATION);

	// YouTube import flow
	let showYouTubeModal = $state(false);
	let youtubeVideosForClipSelection = $state<any[]>([]);
	let showYouTubeClipSelector = $state(false);
	let importingFromYouTube = $state(false);

	// Import tabs
	let activeImportTab = $state<'upload' | 'spotify' | 'youtube'>('spotify');

	// Stats modal
	let showStatsModal = $state(false);

	const filteredSongs = $derived(
		songs.filter((song) => {
			// Text search filter
			const matchesSearch = searchQuery.trim()
				? song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				  song.artist.toLowerCase().includes(searchQuery.toLowerCase())
				: true;

			// Genre filter
			const matchesGenre = selectedGenre
				? song.genre === selectedGenre
				: true;

			return matchesSearch && matchesGenre;
		})
	);

	function isTrackInLibrary(spotifyId: string, title: string, artist: string): boolean {
		return songs.some(
			(song) =>
				song.spotifyId === spotifyId ||
				(song.title.toLowerCase() === title.toLowerCase() && song.artist.toLowerCase() === artist.toLowerCase())
		);
	}

	async function searchSpotify() {
		if (!spotifyQuery.trim()) return;

		try {
			searchingSpotify = true;
			error = null;

			const response = await (api.api.songs as any)['search-spotify'].get({ query: { q: spotifyQuery } });

			if (response.error) {
				error = response.error.value?.error || 'Recherche Spotify impossible';
			} else {
				spotifyResults = response.data.results || [];
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Recherche Spotify impossible';
			console.error('Spotify search error:', err);
		} finally {
			searchingSpotify = false;
		}
	}

	async function addFromSpotify(spotifyId: string, title: string, artist: string, force: boolean = false) {
		if (!force && !confirm(`Télécharger "${title}" par ${artist} ?\n\nTu pourras ensuite choisir l'extrait à conserver.`)) return;

		try {
			addingFromSpotify = true;
			selectedSpotifyId = spotifyId;
			error = null;

			// Step 1: Download full song to temp file (with optional force flag)
			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)['spotify-download-temp'].post({ spotifyId, force });

			if (response.error) {
				throw new Error(response.error.value?.error || 'Téléchargement impossible');
			}

			const data = response.data;

			// Check if duplicates were found
			if (data.duplicates && data.duplicates.length > 0) {
				// Show duplicate warning modal
				spotifyDuplicates = data.duplicates;
				spotifyTempMetadata = data.metadata;
				pendingSpotifyId = spotifyId;
				showSpotifyDuplicateWarning = true;
				addingFromSpotify = false;
				selectedSpotifyId = null;
				return;
			}

			// Step 2: Fetch the temp file as a blob (keep as fetch for blob handling)
			const audioResponse = await (api.api.songs as any)[data.tempFileId].stream.get();
			if (audioResponse.error) {
				throw new Error('Impossible de charger le fichier audio');
			}

			const audioBlob = await audioResponse.response.blob();
			const audioFile = new File([audioBlob], data.spotify.title + '.mp3', { type: 'audio/mpeg' });

			// Step 3: Show clip selector
			spotifyTempFile = audioFile;
			spotifyTempFileId = data.tempFileId;
			spotifyTempMetadata = data.spotify;
			showSpotifyClipSelector = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Téléchargement impossible';
			console.error('Spotify download error:', err);
			addingFromSpotify = false;
			selectedSpotifyId = null;
		}
	}

	function handleSpotifyDuplicateProceed() {
		// User wants to force import despite duplicates
		showSpotifyDuplicateWarning = false;
		if (pendingSpotifyId && spotifyTempMetadata) {
			addFromSpotify(pendingSpotifyId, spotifyTempMetadata.title, spotifyTempMetadata.artist, true);
		}
	}

	function handleSpotifyDuplicateCancel() {
		// User cancelled the import
		showSpotifyDuplicateWarning = false;
		spotifyDuplicates = [];
		spotifyTempMetadata = null;
		pendingSpotifyId = null;
	}

	function handleUploadDuplicateProceed() {
		// User wants to force upload despite duplicates
		showUploadDuplicateWarning = false;
		if (pendingUploadFile) {
			// Restore the file and clip settings
			selectedFile = pendingUploadFile;
			clipStart = pendingUploadClipStart;
			clipDuration = pendingUploadClipDuration;
			// Upload with force flag
			uploadSong(true);
		}
	}

	function handleUploadDuplicateCancel() {
		// User cancelled the upload
		showUploadDuplicateWarning = false;
		uploadDuplicates = [];
		uploadCandidateSong = null;
		pendingUploadFile = null;
		// Clear the file input
		selectedFile = null;
		const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (fileInput) fileInput.value = '';
	}

	async function handleSpotifyClipSelect(start: number, duration: number) {
		try {
			error = null;

			// Step 4: Finalize with selected clip
			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)['spotify-finalize'].post({
				tempFileId: spotifyTempFileId,
				clipStart: start,
				clipDuration: duration,
				metadata: spotifyTempMetadata
			});

			if (response.error) {
				throw new Error(response.error.value?.error || 'Finalisation impossible');
			}

			// Clear Spotify search results and reload library
			spotifyResults = [];
			spotifyQuery = '';
			showSpotifyClipSelector = false;
			spotifyTempFile = null;
			spotifyTempFileId = null;
			spotifyTempMetadata = null;
			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Finalisation impossible';
			console.error('Spotify finalize error:', err);
		} finally {
			addingFromSpotify = false;
			selectedSpotifyId = null;
		}
	}

	function handleSpotifyClipCancel() {
		showSpotifyClipSelector = false;
		spotifyTempFile = null;
		spotifyTempFileId = null;
		spotifyTempMetadata = null;
		addingFromSpotify = false;
		selectedSpotifyId = null;
	}

	// YouTube import handlers
	async function handleYouTubeImport(videos: Array<{ videoId: string; title: string; clipStart?: number; clipDuration?: number; artist?: string; uploader?: string; durationInSeconds?: number; force?: boolean }>) {
		try {
			importingFromYouTube = true;
			error = null;

			// Send raw video data to backend - enrichment is handled automatically
			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)['youtube-import-batch'].post({
				videos: videos.map(v => ({
					videoId: v.videoId,
					title: v.title,
					clipStart: v.clipStart,
					clipDuration: v.clipDuration,
					force: v.force,
					artist: v.artist || v.uploader
				}))
			});

			if (response.error) {
				throw new Error(response.error.value?.error || 'Import failed');
			}

			const data = response.data;

			// Close modal
			showYouTubeModal = false;
			showYouTubeClipSelector = false;
			youtubeVideosForClipSelection = [];

			// Show success message
			alert(`Import démarré ! ${videos.length} vidéo(s) en cours de traitement.\nJob ID: ${data.jobId}`);

			// Reload songs after a delay to show progress
			setTimeout(() => loadSongs(), 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Import failed';
			console.error('YouTube import error:', err);
		} finally {
			importingFromYouTube = false;
		}
	}

	function handleYouTubeClipSelections(selections: Array<{ videoId: string; clipStart: number; clipDuration: number }>) {
		// Merge clip selections with video metadata
		const videosWithClips = youtubeVideosForClipSelection.map(video => {
			const selection = selections.find(s => s.videoId === video.videoId);
			return {
				...video,
				clipStart: selection?.clipStart,
				clipDuration: selection?.clipDuration,
			};
		});

		handleYouTubeImport(videosWithClips);
	}

	async function loadSongs() {
		try {
			loading = true;
			error = null;

			// Pass metadata filter as query parameter
			const queryParams = metadataFilter !== 'all' ? { query: { filter: metadataFilter } } : undefined;
			const response = await songsApi.get(queryParams);

			if (response.data) {
				songs = response.data.songs || [];
			} else {
				error = 'Impossible de charger les morceaux';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de charger les morceaux';
			console.error('Error loading songs:', err);
		} finally {
			loading = false;
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			selectedFile = input.files[0];
			showClipSelector = true;
		}
	}

	function handleClipSelect(start: number, duration: number) {
		clipStart = start;
		clipDuration = duration;
		showClipSelector = false;
		uploadSong();
	}

	function handleClipCancel() {
		showClipSelector = false;
		selectedFile = null;
		const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (fileInput) fileInput.value = '';
	}

	async function uploadSong(force: boolean = false) {
		if (!selectedFile) return;

		try {
			uploading = true;
			error = null;

			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('clipStart', clipStart.toString());
			formData.append('clipDuration', clipDuration.toString());

			// Add force query parameter if needed
			const url = force
				? `${getApiUrl()}/api/songs/upload?force=true`
				: `${getApiUrl()}/api/songs/upload`;

			const response = await fetch(url, {
				method: 'POST',
				headers: getAdminHeaders(),
				body: formData
			});

			const data = await response.json();

			// Check for duplicate detection (409 Conflict)
			if (response.status === 409 && data.isDuplicate) {
				// Show duplicate warning modal
				uploadDuplicates = data.matches || [];
				uploadCandidateSong = data.candidateSong;
				pendingUploadFile = selectedFile;
				pendingUploadClipStart = clipStart;
				pendingUploadClipDuration = clipDuration;
				showUploadDuplicateWarning = true;
				uploading = false;
				return;
			}

			if (!response.ok) {
				throw new Error(data.error || 'Upload impossible');
			}

			selectedFile = null;
			const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
			if (fileInput) fileInput.value = '';

			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Upload impossible';
			console.error('Error uploading song:', err);
		} finally {
			uploading = false;
		}
	}

	async function updateSong(songId: string, updates: Partial<Song>) {
		try {
			error = null;
			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)[songId].patch(updates);

			if (response.error) {
				throw new Error(response.error.value?.error || 'Mise à jour impossible');
			}

			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Mise à jour impossible';
			console.error('Error updating song:', err);
		}
	}

	async function deleteSong(songId: string, title: string) {
		if (!confirm(`Supprimer "${title}" ?`)) return;

		try {
			error = null;
			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)[songId].delete();

			if (response.error) {
				throw new Error(response.error.value?.error || 'Suppression impossible');
			}

			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Suppression impossible';
			console.error('Error deleting song:', err);
		}
	}

	function formatDuration(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	function formatFileSize(bytes: number): string {
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(2)} Mo`;
	}

	onMount(() => {
		loadSongs();
	});

	// Reload songs when metadata filter changes
	$effect(() => {
		if (metadataFilter) {
			loadSongs();
		}
	});
</script>

<AdminGate>
<header class="music-header">
	<div class="header-title">🎵 Bibliothèque</div>
	<div class="header-stats">
		<span class="stat">{songs.length} morceaux</span>
	</div>
	<button class="header-stats-btn" onclick={() => showStatsModal = true} type="button" title="Statistiques">
		📊
	</button>
	<a href="/" class="header-back">← Retour</a>
</header>

<section class="import-tabs-container">
	<div class="import-tabs">
		<button
			class="tab"
			class:active={activeImportTab === 'upload'}
			onclick={() => activeImportTab = 'upload'}
			type="button"
		>
			⬆️ Upload
		</button>
		<button
			class="tab"
			class:active={activeImportTab === 'spotify'}
			onclick={() => activeImportTab = 'spotify'}
			type="button"
		>
			🎧 Spotify
		</button>
		<button
			class="tab"
			class:active={activeImportTab === 'youtube'}
			onclick={() => activeImportTab = 'youtube'}
			type="button"
		>
			🎬 YouTube
		</button>
	</div>

	<div class="tab-content">
		{#if activeImportTab === 'upload'}
			<div class="upload-stack">
				<label class={`file-drop ${uploading ? 'disabled' : ''}`}>
					<input type="file" accept=".mp3,.m4a,.wav,.flac" onchange={handleFileSelect} disabled={uploading} />
					<div>
						<strong>{selectedFile ? selectedFile.name : 'Glisse un fichier ou clique ici'}</strong>
						<p>{uploading ? 'Upload en cours...' : 'Tu pourras choisir le meilleur extrait juste après.'}</p>
					</div>
				</label>
				<div class="tips">
					<span>✨ Astuce : coupe entre {SONG_CONFIG.DEFAULT_CLIP_START}s et {SONG_CONFIG.DEFAULT_CLIP_START + SONG_CONFIG.DEFAULT_CLIP_DURATION}s pour un démarrage punchy.</span>
				</div>
			</div>
		{:else if activeImportTab === 'spotify'}
			<form class="spotify-form" onsubmit={(e) => { e.preventDefault(); searchSpotify(); }}>
				<InputField placeholder="Artiste, titre, album..." bind:value={spotifyQuery} />
				<Button type="submit" variant="secondary" disabled={searchingSpotify || !spotifyQuery.trim()}>
					{searchingSpotify ? 'Recherche...' : 'Chercher'}
				</Button>
			</form>

			{#if spotifyResults.length > 0}
				<div class="spotify-results">
					{#each spotifyResults as track (track.spotifyId)}
						<div class="spotify-card">
							{#if track.albumArt}
								<img src={track.albumArt} alt={track.title} />
							{/if}
							<div>
								<h4>{track.title}</h4>
								<p>{track.artist}</p>
								<div class="meta">
									<span>{track.album}</span>
									<span>{track.year}</span>
									<span>{formatDuration(track.duration)}</span>
								</div>
							</div>
							{#if isTrackInLibrary(track.spotifyId, track.title, track.artist)}
								<span class="in-library">✓ Ajouté</span>
							{:else}
								<Button
									variant="primary"
									size="sm"
									onclick={() => addFromSpotify(track.spotifyId, track.title, track.artist)}
									disabled={addingFromSpotify}
								>
									{addingFromSpotify && selectedSpotifyId === track.spotifyId ? 'Téléchargement...' : 'Importer'}
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeImportTab === 'youtube'}
			<div class="youtube-import">
				<p>Importe des morceaux directement depuis YouTube. Tu peux ajouter une vidéo unique ou une playlist entière !</p>
				<Button variant="primary" onclick={() => showYouTubeModal = true} disabled={importingFromYouTube}>
					{importingFromYouTube ? 'Import en cours...' : 'Ouvrir l\'import YouTube'}
				</Button>
			</div>
		{/if}
	</div>
</section>

{#if error}
	<div class="aq-feedback error">{error}</div>
{/if}

<Card title={`Bibliothèque (${songs.length})`} subtitle="Filtre instantané" icon="📚">
	<div class="library-toolbar">
		<InputField placeholder="Rechercher un titre ou un artiste" bind:value={searchQuery} />

		<select class="genre-filter" bind:value={selectedGenre}>
			<option value="">Tous les genres</option>
			{#each CANONICAL_GENRES as genre}
				<option value={genre}>{genre}</option>
			{/each}
		</select>

		<select class="metadata-filter" bind:value={metadataFilter}>
			<option value="all">Toutes les musiques</option>
			<option value="incomplete-metadata">🔍 Métadonnées incomplètes</option>
			<option value="missing-file">📁 Fichier MP3 manquant</option>
		</select>

		<Button variant="primary" onclick={loadSongs} disabled={loading}>
			{loading ? 'Chargement...' : 'Actualiser'}
		</Button>
	</div>

	{#if loading}
		<div class="skeleton-grid">
			<div class="skeleton-card"></div>
			<div class="skeleton-card"></div>
		</div>
	{:else if filteredSongs.length === 0}
		<div class="empty-state">
			<h3>Aucun titre ne correspond</h3>
			<p>{searchQuery ? 'Essaie avec un autre mot clé.' : 'Ajoute un morceau pour démarrer ta collection.'}</p>
		</div>
	{:else}
		<div class="songs-grid">
			{#each filteredSongs as song (song.id)}
				<EditableSongCard
					{song}
					onUpdate={updateSong}
					onDelete={deleteSong}
					{formatDuration}
					{formatFileSize}
				/>
			{/each}
		</div>
	{/if}
</Card>

{#if showClipSelector && selectedFile}
	<AudioClipSelector
		file={selectedFile}
		defaultClipStart={SONG_CONFIG.DEFAULT_CLIP_START}
		defaultClipDuration={SONG_CONFIG.DEFAULT_CLIP_DURATION}
		maxDuration={SONG_CONFIG.MAX_CLIP_DURATION}
		onSelect={handleClipSelect}
		onCancel={handleClipCancel}
	/>
{/if}

{#if showSpotifyClipSelector && spotifyTempFile}
	<AudioClipSelector
		file={spotifyTempFile}
		defaultClipStart={SONG_CONFIG.DEFAULT_CLIP_START}
		defaultClipDuration={SONG_CONFIG.DEFAULT_CLIP_DURATION}
		maxDuration={SONG_CONFIG.MAX_CLIP_DURATION}
		onSelect={handleSpotifyClipSelect}
		onCancel={handleSpotifyClipCancel}
	/>
{/if}

{#if showSpotifyDuplicateWarning && spotifyTempMetadata}
	<DuplicateWarningModal
		candidateSong={{
			title: spotifyTempMetadata.title,
			artist: spotifyTempMetadata.artist,
			album: spotifyTempMetadata.album,
			year: spotifyTempMetadata.year,
			duration: spotifyTempMetadata.duration
		}}
		duplicates={spotifyDuplicates}
		onProceed={handleSpotifyDuplicateProceed}
		onCancel={handleSpotifyDuplicateCancel}
	/>
{/if}

{#if showUploadDuplicateWarning && uploadCandidateSong}
	<DuplicateWarningModal
		candidateSong={{
			title: uploadCandidateSong.title,
			artist: uploadCandidateSong.artist,
			album: uploadCandidateSong.album,
			year: uploadCandidateSong.year,
			duration: uploadCandidateSong.duration
		}}
		duplicates={uploadDuplicates}
		onProceed={handleUploadDuplicateProceed}
		onCancel={handleUploadDuplicateCancel}
	/>
{/if}

{#if showYouTubeModal}
	<YouTubeImportModal
		onImport={handleYouTubeImport}
		onSelectClips={(videos: any[]) => {
			youtubeVideosForClipSelection = videos;
			showYouTubeModal = false;
			showYouTubeClipSelector = true;
		}}
		onCancel={() => showYouTubeModal = false}
	/>
{/if}

{#if showYouTubeClipSelector && youtubeVideosForClipSelection.length > 0}
	<YouTubeClipSelector
		videos={youtubeVideosForClipSelection}
		onComplete={handleYouTubeClipSelections}
		onCancel={() => { showYouTubeClipSelector = false; youtubeVideosForClipSelection = []; }}
	/>
{/if}

<!-- Floating progress indicator for background imports -->
<ImportProgressIndicator />

<!-- Stats Modal -->
{#if showStatsModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" onclick={() => showStatsModal = false} role="presentation">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="stats-modal-title" tabindex="-1">
			<div class="modal-header">
				<h2 id="stats-modal-title">📊 Statistiques</h2>
				<button class="modal-close" onclick={() => showStatsModal = false} type="button" aria-label="Fermer">✕</button>
			</div>
			<div class="modal-body">
				<SongStatsCharts autoExpand={true} />
			</div>
		</div>
	</div>
{/if}
</AdminGate>

<style>
	.music-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 1.5rem;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		border-radius: var(--aq-radius-lg);
		color: white;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.header-title {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.header-stats {
		display: flex;
		gap: 0.75rem;
		flex: 1;
	}

	.header-stats .stat {
		padding: 0.35rem 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	/* Header stats button */
	.header-stats-btn {
		padding: 0.35rem 0.6rem;
		background: rgba(255, 255, 255, 0.2);
		border: none;
		border-radius: 999px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.header-stats-btn:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	/* Header back button */
	.header-back {
		padding: 0.35rem 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		color: white;
		transition: background 0.15s ease;
	}

	.header-back:hover {
		background: rgba(255, 255, 255, 0.35);
	}

	/* Import tabs */
	.import-tabs-container {
		background: white;
		border-radius: var(--aq-radius-lg);
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.import-tabs {
		display: flex;
		gap: 0.5rem;
		border-bottom: 2px solid rgba(0, 0, 0, 0.1);
		padding-bottom: 0.75rem;
		margin-bottom: 1rem;
	}

	.tab {
		padding: 0.5rem 1rem;
		border: none;
		background: transparent;
		border-radius: var(--aq-radius-md);
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.tab:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.tab.active {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
	}

	.tab-content {
		min-height: 120px;
	}

	.upload-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.file-drop {
		border: 2px dashed rgba(255, 255, 255, 0.7);
		border-radius: 24px;
		padding: 1.5rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: border-color 160ms ease, transform 160ms ease;
	}

	.file-drop:hover:not(.disabled) {
		transform: translateY(-3px);
		border-color: var(--aq-color-primary);
	}

	.file-drop input {
		display: none;
	}

	.tips {
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.spotify-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.spotify-results {
		margin-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 360px;
		overflow: auto;
	}

	.spotify-card {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 1rem;
		align-items: center;
		padding: 1rem;
		border-radius: 18px;
		background: rgba(18, 43, 59, 0.05);
	}

	.spotify-card img {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border-radius: 12px;
	}

	.spotify-card h4 {
		margin: 0;
	}

	.spotify-card p {
		margin: 0.2rem 0;
		color: var(--aq-color-muted);
	}

	.spotify-card .meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.in-library {
		font-weight: 600;
		color: #0f9d58;
	}

	.youtube-import {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.youtube-import p {
		margin: 0;
		color: var(--aq-color-muted);
	}

	.library-toolbar {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: nowrap;
	}

	.genre-filter {
		min-width: 180px;
		padding: 0.65rem 1rem;
		border-radius: var(--aq-radius-md);
		border: 2px solid rgba(255, 255, 255, 0.7);
		background: rgba(255, 255, 255, 0.9);
		color: var(--aq-color-deep);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 180ms ease, box-shadow 180ms ease;
	}

	.genre-filter:hover {
		border-color: var(--aq-color-primary);
	}

	.genre-filter:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.1);
	}

	.metadata-filter {
		min-width: 200px;
		padding: 0.65rem 1rem;
		border-radius: var(--aq-radius-md);
		border: 2px solid rgba(255, 255, 255, 0.7);
		background: rgba(255, 255, 255, 0.9);
		color: var(--aq-color-deep);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 180ms ease, box-shadow 180ms ease;
	}

	.metadata-filter:hover {
		border-color: var(--aq-color-primary);
	}

	.metadata-filter:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.1);
	}

	@media (max-width: 768px) {
		.library-toolbar {
			flex-wrap: wrap;
		}

		.genre-filter,
		.metadata-filter {
			flex: 1;
			min-width: 150px;
		}
	}

	.songs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1rem;
	}

	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		background: rgba(255, 255, 255, 0.4);
		border-radius: 24px;
	}

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}

	.skeleton-card {
		height: 140px;
		border-radius: 24px;
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.4));
		background-size: 200% 100%;
		animation: shimmer 1.4s infinite;
	}

	/* Stats Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		background: white;
		border-radius: var(--aq-radius-lg);
		max-width: 800px;
		width: 90%;
		max-height: 85vh;
		overflow-y: auto;
		animation: slideUp 0.25s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--aq-color-deep);
	}

	.modal-close {
		background: transparent;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0.25rem;
		color: var(--aq-color-muted);
		transition: color 0.15s ease;
	}

	.modal-close:hover {
		color: var(--aq-color-deep);
	}

	.modal-body {
		padding: 1.5rem;
	}
</style>
