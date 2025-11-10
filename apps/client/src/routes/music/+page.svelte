<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Song } from '@blind-test/shared';
	import { SONG_CONFIG } from '@blind-test/shared';
	import AudioClipSelector from '$lib/components/AudioClipSelector.svelte';

	let songs = $state<Song[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let searchQuery = $state('');
	let selectedFile = $state<File | null>(null);
	let showClipSelector = $state(false);
	let clipStart = $state(SONG_CONFIG.DEFAULT_CLIP_START);
	let clipDuration = $state(SONG_CONFIG.DEFAULT_CLIP_DURATION);

	// Spotify search state
	let spotifyQuery = $state('');
	let spotifyResults = $state<any[]>([]);
	let searchingSpotify = $state(false);
	let addingFromSpotify = $state(false);
	let selectedSpotifyId = $state<string | null>(null);

	// Check if a Spotify track already exists in library
	function isTrackInLibrary(spotifyId: string, title: string, artist: string): boolean {
		return songs.some(song =>
			song.spotifyId === spotifyId ||
			(song.title.toLowerCase() === title.toLowerCase() &&
			 song.artist.toLowerCase() === artist.toLowerCase())
		);
	}

	async function searchSpotify() {
		if (!spotifyQuery.trim()) return;

		try {
			searchingSpotify = true;
			error = null;

			const response = await fetch(`http://localhost:3007/api/songs/search-spotify?q=${encodeURIComponent(spotifyQuery)}`);
			const data = await response.json();

			if (response.ok) {
				spotifyResults = data.results || [];
			} else {
				error = data.error || 'Failed to search Spotify';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to search Spotify';
			console.error('Spotify search error:', err);
		} finally {
			searchingSpotify = false;
		}
	}

	async function addFromSpotify(spotifyId: string, title: string) {
		if (!confirm(`Add "${title}" to library?\n\nThis will download the audio from YouTube.`)) return;

		try {
			addingFromSpotify = true;
			selectedSpotifyId = spotifyId;
			error = null;

			const response = await fetch('http://localhost:3007/api/songs/add-from-spotify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spotifyId })
			});

			const data = await response.json();

			if (response.ok) {
				console.log('Song added successfully:', data);
				spotifyResults = [];
				spotifyQuery = '';
				await loadSongs();
			} else {
				error = data.error || 'Failed to add song';
				console.error('Add from Spotify error:', data);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add song';
			console.error('Add from Spotify error:', err);
		} finally {
			addingFromSpotify = false;
			selectedSpotifyId = null;
		}
	}

	async function loadSongs() {
		try {
			loading = true;
			error = null;
			const response = await api.api.songs.get();

			if (response.data) {
				songs = response.data.songs || [];
				console.log('Loaded songs:', songs);
			} else {
				error = 'Failed to load songs';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load songs';
			console.error('Error loading songs:', err);
		} finally {
			loading = false;
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			selectedFile = input.files[0];
			// Show clip selector modal
			showClipSelector = true;
		}
	}

	function handleClipSelect(start: number, duration: number) {
		clipStart = start;
		clipDuration = duration;
		showClipSelector = false;
		// Proceed with upload
		uploadSong();
	}

	function handleClipCancel() {
		showClipSelector = false;
		selectedFile = null;
		// Reset file input
		const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
		if (fileInput) fileInput.value = '';
	}

	async function uploadSong() {
		if (!selectedFile) return;

		try {
			uploading = true;
			error = null;

			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('clipStart', clipStart.toString());
			formData.append('clipDuration', clipDuration.toString());

			// Use fetch directly for file upload since Eden Treaty doesn't handle FormData well
			const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3007'}/api/songs/upload`, {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Upload failed');
			}

			const song = await response.json();
			console.log('Song uploaded:', song);

			selectedFile = null;
			// Reset file input
			const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
			if (fileInput) fileInput.value = '';

			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to upload song';
			console.error('Error uploading song:', err);
		} finally {
			uploading = false;
		}
	}

	async function deleteSong(songId: string, title: string) {
		if (!confirm(`Delete "${title}"?`)) return;

		try {
			error = null;
			await api.api.songs[songId].delete();
			console.log('Song deleted successfully');
			await loadSongs();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete song';
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
		return `${mb.toFixed(2)} MB`;
	}

	const filteredSongs = $derived(
		searchQuery.trim()
			? songs.filter(
					(song) =>
						song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
						song.artist.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: songs
	);

	onMount(() => {
		loadSongs();
	});
</script>

<main>
	<div class="header">
		<div>
			<h1>🎵 Music Library</h1>
			<p class="subtitle">Manage your song collection</p>
		</div>
		<a href="/" class="back-button">← Back to Rooms</a>
	</div>

	<section class="upload-section">
		<h2>Upload New Song</h2>
		<div class="file-input-wrapper">
			<input
				type="file"
				accept=".mp3,.m4a,.wav,.flac"
				onchange={handleFileSelect}
				disabled={uploading}
			/>
			{#if uploading}
				<p class="file-name">Uploading...</p>
			{/if}
		</div>
		<p class="help-text">Supported formats: MP3, M4A, WAV, FLAC (max 50MB)</p>
	</section>

	<section class="spotify-section">
		<h2>🎧 Add from Spotify</h2>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				searchSpotify();
			}}
		>
			<div class="spotify-search">
				<input
					type="text"
					class="search-input"
					placeholder="Search Spotify (artist, song, album)..."
					bind:value={spotifyQuery}
					disabled={searchingSpotify}
				/>
				<button type="submit" disabled={searchingSpotify || !spotifyQuery.trim()}>
					{searchingSpotify ? 'Searching...' : 'Search'}
				</button>
			</div>
		</form>

		{#if spotifyResults.length > 0}
			<div class="spotify-results">
				{#each spotifyResults as track (track.spotifyId)}
					<div class="spotify-track">
						{#if track.albumArt}
							<img src={track.albumArt} alt={track.title} class="album-art" />
						{/if}
						<div class="track-info">
							<h4>{track.title}</h4>
							<p class="artist">{track.artist}</p>
							{#if track.album}
								<p class="album-name">{track.album}</p>
							{/if}
							<div class="track-meta">
								<span class="year">{track.year}</span>
								<span class="duration">{formatDuration(track.duration)}</span>
							</div>
						</div>
						{#if isTrackInLibrary(track.spotifyId, track.title, track.artist)}
							<span class="already-added">✓ In Library</span>
						{:else}
							<button
								class="add-button"
								onclick={() => addFromSpotify(track.spotifyId, track.title)}
								disabled={addingFromSpotify}
							>
								{addingFromSpotify && selectedSpotifyId === track.spotifyId ? '⏳ Adding...' : '➕ Add'}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<section class="library-section">
		<div class="library-header">
			<h2>Song Library ({songs.length} songs)</h2>
			<input
				type="text"
				class="search-input"
				placeholder="Search songs..."
				bind:value={searchQuery}
			/>
		</div>

		{#if loading}
			<p class="loading">Loading songs...</p>
		{:else if filteredSongs.length === 0}
			<p class="empty">
				{searchQuery ? 'No songs found matching your search.' : 'No songs in library. Upload some music to get started!'}
			</p>
		{:else}
			<div class="songs-grid">
				{#each filteredSongs as song (song.id)}
					<div class="song-card">
						<div class="song-info">
							<h3>{song.title}</h3>
							<p class="artist">{song.artist}</p>
							{#if song.album}
								<p class="album">Album: {song.album}</p>
							{/if}
							<div class="metadata">
								<span class="year">{song.year}</span>
								{#if song.genre}
									<span class="genre">{song.genre}</span>
								{/if}
								<span class="duration">{formatDuration(song.duration)}</span>
							</div>
							<div class="file-info">
								<span class="format">{song.format.toUpperCase()}</span>
								<span class="size">{formatFileSize(song.fileSize)}</span>
							</div>
						</div>
						<button class="delete-button" onclick={() => deleteSong(song.id, song.title)}>
							🗑️
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Audio Clip Selector Modal -->
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
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2.5rem;
		margin: 0 0 0.5rem 0;
		color: #1f2937;
	}

	.subtitle {
		margin: 0;
		color: #6b7280;
		font-size: 1rem;
	}

	.back-button {
		display: inline-block;
		color: #3b82f6;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.2s;
	}

	.back-button:hover {
		color: #2563eb;
	}

	h2 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		color: #374151;
	}

	section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background-color: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.file-input-wrapper {
		flex: 1;
		min-width: 250px;
	}

	input[type='file'] {
		padding: 0.75rem;
		font-size: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background-color: white;
		cursor: pointer;
		width: 100%;
	}

	input[type='file']:disabled {
		background-color: #f3f4f6;
		cursor: not-allowed;
	}

	.file-name {
		margin-top: 0.5rem;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.help-text {
		width: 100%;
		color: #6b7280;
		font-size: 0.875rem;
		margin-top: 0.5rem;
	}

	button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background-color: #3b82f6;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: background-color 0.2s;
		white-space: nowrap;
	}

	button:hover:not(:disabled) {
		background-color: #2563eb;
	}

	button:disabled {
		background-color: #9ca3af;
		cursor: not-allowed;
	}

	.error {
		padding: 1rem;
		margin-bottom: 1rem;
		background-color: #fee2e2;
		color: #991b1b;
		border-radius: 0.5rem;
		border-left: 4px solid #dc2626;
	}

	.loading,
	.empty {
		text-align: center;
		color: #6b7280;
		padding: 2rem;
		font-style: italic;
	}

	.library-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.search-input {
		padding: 0.5rem 1rem;
		font-size: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		min-width: 250px;
		transition: border-color 0.2s;
	}

	.search-input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.songs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1rem;
	}

	.song-card {
		position: relative;
		padding: 1.5rem;
		padding-right: 4rem;
		background-color: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		transition: all 0.2s;
	}

	.song-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.song-info h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		color: #1f2937;
	}

	.artist {
		margin: 0 0 0.25rem 0;
		color: #6b7280;
		font-weight: 600;
	}

	.album {
		margin: 0 0 0.5rem 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.metadata {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.metadata span {
		padding: 0.25rem 0.5rem;
		background-color: white;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		color: #374151;
	}

	.year {
		font-weight: 600;
	}

	.file-info {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.file-info span {
		padding: 0.125rem 0.5rem;
		background-color: #e5e7eb;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.delete-button {
		position: absolute;
		top: 1rem;
		right: 1rem;
		padding: 0.5rem;
		background-color: #ef4444;
		border: none;
		border-radius: 0.375rem;
		font-size: 1.25rem;
		cursor: pointer;
		transition: background-color 0.2s;
		line-height: 1;
	}

	.delete-button:hover {
		background-color: #dc2626;
	}

	/* Spotify Section */
	.spotify-search {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.spotify-search input {
		flex: 1;
		min-width: 300px;
	}

	.spotify-results {
		margin-top: 1.5rem;
		display: grid;
		gap: 1rem;
	}

	.spotify-track {
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 1rem;
		background-color: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		transition: all 0.2s;
	}

	.spotify-track:hover {
		border-color: #1db954;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.album-art {
		width: 80px;
		height: 80px;
		border-radius: 0.375rem;
		object-fit: cover;
		flex-shrink: 0;
	}

	.track-info {
		flex: 1;
		min-width: 0;
	}

	.track-info h4 {
		margin: 0 0 0.25rem 0;
		font-size: 1.125rem;
		color: #1f2937;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-info .artist {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
	}

	.album-name {
		margin: 0 0 0.5rem 0;
		color: #9ca3af;
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.add-button {
		padding: 0.625rem 1.25rem;
		background-color: #1db954;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.add-button:hover:not(:disabled) {
		background-color: #1ed760;
	}

	.already-added {
		color: #059669;
		font-weight: 500;
		padding: 0.625rem 1.25rem;
		white-space: nowrap;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
</style>
