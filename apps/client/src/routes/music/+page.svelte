<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Song } from '@blind-test/shared';

	let songs = $state<Song[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let searchQuery = $state('');
	let selectedFile = $state<File | null>(null);

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

	async function uploadSong() {
		if (!selectedFile) return;

		try {
			uploading = true;
			error = null;

			const formData = new FormData();
			formData.append('file', selectedFile);

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

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		selectedFile = input.files?.[0] || null;
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
		<form
			onsubmit={(e) => {
				e.preventDefault();
				uploadSong();
			}}
		>
			<div class="file-input-wrapper">
				<input
					type="file"
					accept=".mp3,.m4a,.wav,.flac"
					onchange={handleFileSelect}
					disabled={uploading}
					required
				/>
				{#if selectedFile}
					<p class="file-name">Selected: {selectedFile.name}</p>
				{/if}
			</div>
			<button type="submit" disabled={uploading || !selectedFile}>
				{uploading ? 'Uploading...' : 'Upload Song'}
			</button>
		</form>
		<p class="help-text">Supported formats: MP3, M4A, WAV, FLAC (max 50MB)</p>
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

	.upload-section form {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		flex-wrap: wrap;
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
</style>
