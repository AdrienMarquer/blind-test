<script lang="ts">
	/**
	 * GameConfig Component
	 * Handles game configuration including song selection, filters, and audio playback options
	 */

	interface Props {
		songs: any[];
		selectedSongIds: string[];
		songCount: number;
		useFilters: boolean;
		selectedGenres: string[];
		yearMin: number | undefined;
		yearMax: number | undefined;
		audioPlayback: 'master' | 'players' | 'all';
		availableGenres: string[];
		starting: boolean;
		onToggleSong: (songId: string) => void;
		onToggleGenre: (genre: string) => void;
		onStartGame: () => void;
		onCancel: () => void;
	}

	let {
		songs,
		selectedSongIds = $bindable(),
		songCount = $bindable(),
		useFilters = $bindable(),
		selectedGenres = $bindable(),
		yearMin = $bindable(),
		yearMax = $bindable(),
		audioPlayback = $bindable(),
		availableGenres,
		starting,
		onToggleSong,
		onToggleGenre,
		onStartGame,
		onCancel
	}: Props = $props();
</script>

<section class="config-section">
	<div class="config-header">
		<h2>Game Configuration</h2>
		<button class="close-button" onclick={onCancel}>✕</button>
	</div>

	<div class="config-tabs">
		<h3>Song Selection</h3>
		{#if songs.length === 0}
			<p class="info">No songs in library. <a href="/music">Upload some music</a> first!</p>
		{:else}
			<!-- Filter by Metadata -->
			<div class="filter-toggle">
				<label>
					<input type="checkbox" bind:checked={useFilters} />
					Use metadata filters (genre, year)
				</label>
			</div>

			{#if useFilters}
				<div class="filter-section">
					<h4>Filters</h4>

					<!-- Genre Multi-Select -->
					{#if availableGenres.length > 0}
						<div class="filter-group">
							<div class="filter-label">Genres ({selectedGenres.length} selected):</div>
							<div class="genre-chips">
								{#each availableGenres as genre}
									<button
										class="chip"
										class:selected={selectedGenres.includes(genre)}
										onclick={() => onToggleGenre(genre)}
									>
										{genre}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Year Range -->
					<div class="filter-group">
						<div class="filter-label">Year Range:</div>
						<div class="year-inputs">
							<input
								type="number"
								placeholder="From"
								bind:value={yearMin}
								min="1900"
								max="2100"
								aria-label="Year from"
							/>
							<span>to</span>
							<input
								type="number"
								placeholder="To"
								bind:value={yearMax}
								min="1900"
								max="2100"
								aria-label="Year to"
							/>
						</div>
					</div>

					<!-- Song Count -->
					<div class="filter-group">
						<label>
							Number of songs:
							<input type="number" bind:value={songCount} min="1" max="100" />
						</label>
					</div>
				</div>
			{:else}
				<!-- Manual Selection -->
				<div class="song-count-controls">
					<label>
						Use Random Songs:
						<input type="number" bind:value={songCount} min="1" max="100" />
					</label>
					<span class="or">OR</span>
					<span>Select specific songs ({selectedSongIds.length} selected)</span>
				</div>

				<div class="songs-grid-mini">
					{#each songs as song (song.id)}
						<button
							class="song-item"
							class:selected={selectedSongIds.includes(song.id)}
							onclick={() => onToggleSong(song.id)}
						>
							<span class="song-title">{song.title}</span>
							<span class="song-artist">{song.artist}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Audio Playback Location -->
	<div class="config-tabs">
		<h3>Audio Playback</h3>
		<div class="audio-options">
			<label class="radio-option">
				<input type="radio" bind:group={audioPlayback} value="master" />
				<div class="option-content">
					<strong>Master Only (Default)</strong>
					<span>Audio plays only on the master device</span>
				</div>
			</label>
			<label class="radio-option">
				<input type="radio" bind:group={audioPlayback} value="players" />
				<div class="option-content">
					<strong>Players Only</strong>
					<span>Audio plays on all player devices</span>
				</div>
			</label>
			<label class="radio-option">
				<input type="radio" bind:group={audioPlayback} value="all" />
				<div class="option-content">
					<strong>All Devices</strong>
					<span>Audio plays on both master and players</span>
				</div>
			</label>
		</div>
	</div>

	<div class="config-actions">
		<button class="cancel-button" onclick={onCancel}>
			Cancel
		</button>
		<button
			class="start-button"
			onclick={onStartGame}
			disabled={starting || (songs.length === 0)}
		>
			{starting ? 'Starting Game...' : 'Start Game'}
		</button>
	</div>
</section>

<style>
	.config-section {
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 1.5rem;
		margin-top: 1rem;
	}

	.config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.config-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #1f2937;
	}

	.close-button {
		background: #ef4444;
		color: white;
		border: none;
		border-radius: 0.375rem;
		width: 2rem;
		height: 2rem;
		font-size: 1.25rem;
		cursor: pointer;
		transition: background-color 0.2s;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-button:hover {
		background: #dc2626;
	}

	.config-tabs {
		margin-bottom: 1.5rem;
	}

	.config-tabs h3 {
		font-size: 1.125rem;
		color: #374151;
		margin-bottom: 1rem;
	}

	.config-tabs h4 {
		font-size: 1rem;
		color: #4b5563;
		margin-bottom: 0.75rem;
	}

	.info {
		padding: 1rem;
		background: #fef3c7;
		color: #92400e;
		border-radius: 0.5rem;
		border-left: 4px solid #f59e0b;
	}

	.info a {
		color: #b45309;
		text-decoration: underline;
	}

	.filter-toggle {
		margin-bottom: 1rem;
	}

	.filter-toggle label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.filter-section {
		background: #f9fafb;
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
	}

	.filter-group {
		margin-bottom: 1rem;
	}

	.filter-group:last-child {
		margin-bottom: 0;
	}

	.filter-group label,
	.filter-label {
		display: block;
		font-weight: 600;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.genre-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		padding: 0.5rem 1rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
	}

	.chip:hover {
		border-color: #3b82f6;
	}

	.chip.selected {
		background: #3b82f6;
		color: white;
		border-color: #3b82f6;
	}

	.year-inputs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.year-inputs input {
		flex: 1;
		padding: 0.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.year-inputs span {
		color: #6b7280;
	}

	.song-count-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.song-count-controls .or {
		font-weight: 600;
		color: #6b7280;
	}

	.song-count-controls input {
		width: 4rem;
		padding: 0.25rem 0.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.375rem;
		margin-left: 0.5rem;
	}

	.songs-grid-mini {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
		max-height: 300px;
		overflow-y: auto;
		padding: 0.5rem;
		background: #f9fafb;
		border-radius: 0.5rem;
	}

	.song-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0.75rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.song-item:hover {
		border-color: #3b82f6;
	}

	.song-item.selected {
		background: #dbeafe;
		border-color: #3b82f6;
	}

	.song-title {
		font-weight: 600;
		color: #1f2937;
		font-size: 0.875rem;
	}

	.song-artist {
		color: #6b7280;
		font-size: 0.75rem;
	}

	.audio-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.radio-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: #f9fafb;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.radio-option:hover {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.radio-option input {
		cursor: pointer;
	}

	.option-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.option-content strong {
		color: #1f2937;
		font-size: 0.875rem;
	}

	.option-content span {
		color: #6b7280;
		font-size: 0.75rem;
	}

	.config-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 2px solid #e5e7eb;
	}

	.cancel-button {
		padding: 0.75rem 1.5rem;
		background: #6b7280;
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.cancel-button:hover {
		background: #4b5563;
	}

	.start-button {
		padding: 0.75rem 1.5rem;
		background: #10b981;
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.start-button:hover:not(:disabled) {
		background: #059669;
	}

	.start-button:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}
</style>
