<script lang="ts">
	import type { Song } from '@blind-test/shared';
	import { CANONICAL_GENRES } from '@blind-test/shared';
	import { getAuthenticatedApi } from '$lib/api';
	import Button from './ui/Button.svelte';
	import InputField from './ui/InputField.svelte';

	interface Props {
		song: Song;
		onUpdate: (songId: string, updates: Partial<Song>) => Promise<void>;
		onDelete: (songId: string, title: string) => Promise<void>;
		formatDuration: (seconds: number) => string;
		formatFileSize: (bytes: number) => string;
	}

	let { song, onUpdate, onDelete, formatDuration, formatFileSize }: Props = $props();

	let editing = $state(false);
	let discovering = $state(false);
	let editedTitle = $state(song.title);
	let editedArtist = $state(song.artist);
	let editedAlbum = $state(song.album || '');
	let editedYear = $state(song.year?.toString() || '');
	let editedGenre = $state(song.genre || '');
	let editedNiche = $state(song.niche);
	let discoveredMetadata = $state<any>(null);
	let showDiscoveryResult = $state(false);

	// Reset edited values when song changes
	$effect(() => {
		editedTitle = song.title;
		editedArtist = song.artist;
		editedAlbum = song.album || '';
		editedYear = song.year?.toString() || '';
		editedGenre = song.genre || '';
		editedNiche = song.niche;
	});

	async function handleSave() {
		const updates: Partial<Song> = {};

		if (editedTitle !== song.title) updates.title = editedTitle;
		if (editedArtist !== song.artist) updates.artist = editedArtist;
		if (editedAlbum !== song.album) updates.album = editedAlbum || undefined;
		if (editedYear !== song.year?.toString()) {
			updates.year = editedYear ? parseInt(editedYear) : undefined;
		}
		if (editedGenre !== song.genre) updates.genre = editedGenre || undefined;
		if (editedNiche !== song.niche) updates.niche = editedNiche;

		if (Object.keys(updates).length > 0) {
			await onUpdate(song.id, updates);
		}

		editing = false;
	}

	function handleCancel() {
		editing = false;
		editedTitle = song.title;
		editedArtist = song.artist;
		editedAlbum = song.album || '';
		editedYear = song.year?.toString() || '';
		editedGenre = song.genre || '';
		editedNiche = song.niche;
	}

	async function handleAutoDiscover() {
		try {
			discovering = true;

			const authApi = getAuthenticatedApi();
			const response = await (authApi.api.songs as any)[song.id]['auto-discover'].post();

			if (response.error) {
				throw new Error(response.error.value?.error || 'Auto-discovery failed');
			}

			discoveredMetadata = response.data;
			showDiscoveryResult = true;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Auto-discovery failed');
		} finally {
			discovering = false;
		}
	}

	async function applyDiscoveredMetadata() {
		if (!discoveredMetadata) return;

		const updates: Partial<Song> = {
			title: discoveredMetadata.enriched.title,
			artist: discoveredMetadata.enriched.artist,
			album: discoveredMetadata.enriched.album,
			year: discoveredMetadata.enriched.year,
			genre: discoveredMetadata.enriched.genre
		};

		await onUpdate(song.id, updates);
		showDiscoveryResult = false;
		discoveredMetadata = null;
	}

	function rejectDiscoveredMetadata() {
		showDiscoveryResult = false;
		discoveredMetadata = null;
	}

	function getConfidenceColor(confidence: number): string {
		if (confidence >= 90) return '#0f9d58'; // High confidence - green
		if (confidence >= 70) return '#f4b400'; // Medium - yellow
		return '#db4437'; // Low - red
	}

	function getConfidenceLabel(confidence: number): string {
		if (confidence >= 90) return 'Haute confiance';
		if (confidence >= 70) return 'Moyenne confiance';
		return 'Faible confiance';
	}
</script>

<div class="song-card">
	{#if editing}
		<!-- Edit mode -->
		<div class="song-edit">
			<InputField placeholder="Titre" bind:value={editedTitle} />
			<InputField placeholder="Artiste" bind:value={editedArtist} />
			<InputField placeholder="Album (optionnel)" bind:value={editedAlbum} />
			<div class="edit-row">
				<InputField placeholder="Année" bind:value={editedYear} />
				<select class="genre-select" bind:value={editedGenre}>
					<option value="">Sélectionner un genre</option>
					{#each CANONICAL_GENRES as genre}
						<option value={genre}>{genre}</option>
					{/each}
				</select>
			</div>
			<label class="niche-toggle">
				<input type="checkbox" bind:checked={editedNiche} />
				<span>🔒 Niche (ne pas inclure par défaut dans les parties)</span>
			</label>
			<div class="edit-actions">
				<Button variant="primary" size="sm" onclick={handleSave}>
					💾 Enregistrer
				</Button>
				<Button variant="secondary" size="sm" onclick={handleCancel}>
					Annuler
				</Button>
			</div>
		</div>
	{:else}
		<!-- View mode -->
		<div class="song-main">
			<div>
				<h3>
					{song.title}
					{#if song.niche}
						<span class="niche-badge" title="Chanson niche - non incluse par défaut">🔒</span>
					{/if}
				</h3>
				<p>{song.artist}</p>
			</div>
			<div class="song-actions">
				<button
					class="action-btn edit-btn"
					onclick={() => editing = true}
					aria-label={`Modifier ${song.title}`}
					title="Modifier les métadonnées"
				>
					✏️
				</button>
				<button
					class="action-btn discover-btn"
					onclick={handleAutoDiscover}
					disabled={discovering}
					aria-label={`Auto-découverte pour ${song.title}`}
					title="Auto-découverte des métadonnées"
				>
					{discovering ? '⏳' : '🔍'}
				</button>
				<button
					class="action-btn delete-btn"
					onclick={() => onDelete(song.id, song.title)}
					aria-label={`Supprimer ${song.title}`}
					title="Supprimer"
				>
					🗑️
				</button>
			</div>
		</div>
		<div class="song-meta">
			<span>{song.album || 'N/A'}</span>
			<span>{song.genre || 'N/A'}</span>
			<span>{song.year || 'N/A'}</span>
		</div>
		<div class="song-extra">
			<span>{song.format.toUpperCase()}</span>
			<span>{formatDuration(song.duration)}</span>
			<span>{formatFileSize(song.fileSize)}</span>
		</div>
	{/if}
</div>

{#if showDiscoveryResult && discoveredMetadata}
	<div class="modal-overlay" onclick={rejectDiscoveredMetadata} role="button" tabindex="0" onkeydown={(e) => e.key === 'Escape' && rejectDiscoveredMetadata()}>
		<div class="discovery-modal" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
			<h2>🔍 Métadonnées découvertes</h2>

			<div class="confidence-badge" style="background: {getConfidenceColor(discoveredMetadata.enriched.confidence)}20; color: {getConfidenceColor(discoveredMetadata.enriched.confidence)}">
				<strong>{discoveredMetadata.enriched.confidence}%</strong>
				<span>{getConfidenceLabel(discoveredMetadata.enriched.confidence)}</span>
			</div>

			<p class="provider-info">Provider: <strong>{discoveredMetadata.provider}</strong></p>

			<div class="comparison">
				<div class="comparison-column">
					<h3>📝 Actuelles</h3>
					<div class="metadata-list">
						<div><strong>Titre:</strong> {discoveredMetadata.original.title}</div>
						<div><strong>Artiste:</strong> {discoveredMetadata.original.artist}</div>
						<div><strong>Album:</strong> {discoveredMetadata.original.album || 'N/A'}</div>
						<div><strong>Année:</strong> {discoveredMetadata.original.year || 'N/A'}</div>
						<div><strong>Genre:</strong> {discoveredMetadata.original.genre || 'N/A'}</div>
					</div>
				</div>

				<div class="comparison-arrow">→</div>

				<div class="comparison-column highlight">
					<h3>✨ Suggérées</h3>
					<div class="metadata-list">
						<div><strong>Titre:</strong> {discoveredMetadata.enriched.title}</div>
						<div><strong>Artiste:</strong> {discoveredMetadata.enriched.artist}</div>
						<div><strong>Album:</strong> {discoveredMetadata.enriched.album || 'N/A'}</div>
						<div><strong>Année:</strong> {discoveredMetadata.enriched.year || 'N/A'}</div>
						<div><strong>Genre:</strong> {discoveredMetadata.enriched.genre || 'N/A'}</div>
					</div>
				</div>
			</div>

			<div class="modal-actions">
				<Button variant="primary" onclick={applyDiscoveredMetadata}>
					✓ Appliquer les suggestions
				</Button>
				<Button variant="secondary" onclick={rejectDiscoveredMetadata}>
					✗ Annuler
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
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

	.song-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		border: none;
		border-radius: 12px;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
		font-size: 1rem;
		transition: transform 0.15s ease;
	}

	.action-btn:hover:not(:disabled) {
		transform: scale(1.1);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.edit-btn {
		background: rgba(66, 133, 244, 0.12);
	}

	.discover-btn {
		background: rgba(248, 192, 39, 0.12);
	}

	.delete-btn {
		background: rgba(239, 76, 131, 0.12);
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

	.song-edit {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.genre-select {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 2px solid rgba(18, 43, 59, 0.15);
		border-radius: 16px;
		background: white;
		font-size: 1rem;
		font-family: inherit;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.genre-select:hover {
		border-color: rgba(18, 43, 59, 0.25);
	}

	.genre-select:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.1);
	}

	.edit-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.niche-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 12px;
		background: rgba(248, 192, 39, 0.1);
		border: 1px solid rgba(248, 192, 39, 0.3);
	}

	.niche-toggle input[type="checkbox"] {
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.niche-toggle span {
		font-size: 0.9rem;
		color: var(--aq-color-deep);
	}

	.niche-badge {
		display: inline-block;
		margin-left: 0.5rem;
		font-size: 0.85rem;
		opacity: 0.7;
	}

	/* Discovery Modal */
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

	.discovery-modal {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		max-width: 800px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	.discovery-modal h2 {
		margin: 0 0 1rem 0;
	}

	.confidence-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		margin-bottom: 1rem;
		font-weight: 600;
	}

	.confidence-badge strong {
		font-size: 1.2rem;
	}

	.provider-info {
		margin-bottom: 1.5rem;
		color: var(--aq-color-muted);
	}

	.comparison {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1.5rem;
		align-items: center;
		margin-bottom: 2rem;
	}

	.comparison-column {
		background: rgba(18, 43, 59, 0.04);
		border-radius: 18px;
		padding: 1.25rem;
	}

	.comparison-column.highlight {
		background: rgba(248, 192, 39, 0.1);
		border: 2px solid rgba(248, 192, 39, 0.3);
	}

	.comparison-column h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
	}

	.metadata-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.metadata-list strong {
		color: var(--aq-color-deep);
	}

	.comparison-arrow {
		font-size: 2rem;
		color: var(--aq-color-muted);
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		align-items: center;
		width: 100%;
	}

	@media (max-width: 768px) {
		.comparison {
			grid-template-columns: 1fr;
		}

		.comparison-arrow {
			transform: rotate(90deg);
			text-align: center;
		}
	}
</style>
