<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Song } from '@blind-test/shared';
	import { SONG_CONFIG } from '@blind-test/shared';
	import AudioClipSelector from '$lib/components/AudioClipSelector.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';

	let songs = $state<Song[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let searchQuery = $state('');
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

	const filteredSongs = $derived(
		searchQuery.trim()
			? songs.filter(
				(song) =>
					song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
					song.artist.toLowerCase().includes(searchQuery.toLowerCase())
			)
			: songs
	);

	const totalDuration = $derived(songs.reduce((acc, song) => acc + song.duration, 0));

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

			const response = await fetch(`http://localhost:3007/api/songs/search-spotify?q=${encodeURIComponent(spotifyQuery)}`);
			const data = await response.json();

			if (response.ok) {
				spotifyResults = data.results || [];
			} else {
				error = data.error || 'Recherche Spotify impossible';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Recherche Spotify impossible';
			console.error('Spotify search error:', err);
		} finally {
			searchingSpotify = false;
		}
	}

	async function addFromSpotify(spotifyId: string, title: string) {
		if (!confirm(`Ajouter "${title}" à la bibliothèque ?\n\nL’audio sera récupéré automatiquement.`)) return;

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
				spotifyResults = [];
				spotifyQuery = '';
				await loadSongs();
			} else {
				error = data.error || 'Ajout impossible';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ajout impossible';
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
			const response = await songsApi.get();

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

	async function uploadSong() {
		if (!selectedFile) return;

		try {
			uploading = true;
			error = null;

			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('clipStart', clipStart.toString());
			formData.append('clipDuration', clipDuration.toString());

			const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3007'}/api/songs/upload`, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Upload impossible');
			}

			await response.json();
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

	async function deleteSong(songId: string, title: string) {
		if (!confirm(`Supprimer "${title}" ?`)) return;

		try {
			error = null;
			await songsApi[songId].delete();
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
</script>

	<div class="music-hero aq-hero-card">
	<div>
		<h1>🎵 Bibliothèque AdriQuiz</h1>
		<p>Ajoute tes extraits préférés, découpe les meilleurs moments et garde un œil sur ta collection.</p>
	</div>
	<div class="hero-highlights">
		<div>
			<p class="stat-label">Total morceaux</p>
			<strong>{songs.length}</strong>
		</div>
		<div>
			<p class="stat-label">Durée cumulée</p>
			<strong>{formatDuration(totalDuration)}</strong>
		</div>
	</div>
	<div class="hero-links">
		<Button variant="ghost" onclick={() => (window.location.href = '/')}>← Retour lobby</Button>
	</div>
</div>

<section class="tools-grid">
	<Card title="Uploader un extrait" subtitle="Formats MP3, M4A, WAV, FLAC - 50 Mo max" icon="⬆️">
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
	</Card>

	<Card title="Ajouter via Spotify" subtitle="Recherche et import auto" icon="🎧">
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
									onclick={() => addFromSpotify(track.spotifyId, track.title)}
									disabled={addingFromSpotify}
								>
								{addingFromSpotify && selectedSpotifyId === track.spotifyId ? 'Ajout...' : 'Importer'}
							</Button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</section>

{#if error}
	<div class="aq-feedback error">{error}</div>
{/if}

<Card title={`Bibliothèque (${songs.length})`} subtitle="Filtre instantané" icon="📚">
	<div class="library-toolbar">
		<InputField placeholder="Rechercher un titre ou un artiste" bind:value={searchQuery} />
		<Button variant="outline" onclick={loadSongs} disabled={loading}>
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
				<div class="song-card">
					<div class="song-main">
						<div>
							<h3>{song.title}</h3>
							<p>{song.artist}</p>
						</div>
						<button class="ghost-delete" onclick={() => deleteSong(song.id, song.title)} aria-label={`Supprimer ${song.title}`}>
							🗑️
						</button>
					</div>
					<div class="song-meta">
						<span>{song.album}</span>
						<span>{song.genre}</span>
						<span>{song.year}</span>
					</div>
					<div class="song-extra">
						<span>{song.format.toUpperCase()}</span>
						<span>{formatDuration(song.duration)}</span>
						<span>{formatFileSize(song.fileSize)}</span>
					</div>
				</div>
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

<style>
	.music-hero {
		margin-bottom: 2rem;
	}

	.hero-highlights {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.hero-highlights .stat-label {
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.hero-highlights strong {
		font-size: 2rem;
	}

	.hero-links {
		margin-top: 1.5rem;
	}

	.tools-grid {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		margin-bottom: 2rem;
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

	.library-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
	}

	.songs-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1rem;
	}

	.song-card {
		background: rgba(18, 43, 59, 0.04);
		border-radius: 24px;
		padding: 1rem 1.25rem;
		border: 1px solid rgba(255, 255, 255, 0.4);
		position: relative;
	}

	.song-main {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}

	.song-main h3 {
		margin: 0;
	}

	.song-main p {
		margin: 0.2rem 0 0 0;
		color: var(--aq-color-muted);
	}

	.song-meta,
	.song-extra {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-top: 0.5rem;
		color: var(--aq-color-muted);
		font-size: 0.9rem;
	}

	.song-extra span {
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.7);
		color: var(--aq-color-deep);
		font-weight: 600;
	}

	.ghost-delete {
		border: none;
		background: rgba(239, 76, 131, 0.12);
		border-radius: 12px;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
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
</style>
