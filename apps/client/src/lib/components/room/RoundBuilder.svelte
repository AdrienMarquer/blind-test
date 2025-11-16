<script lang="ts">
	/**
	 * RoundBuilder Component
	 * Allows creating multi-round games using presets or custom configuration
	 */

	import { onMount } from 'svelte';
	import { DEFAULT_SONG_DURATION, CANONICAL_GENRES, type RoundConfig } from '@blind-test/shared';
	import { gamePresets, getModeDisplayName, getMediaDisplayName } from '$lib/presets';

	interface Props {
		rounds: RoundConfig[];
		availableGenres: string[];
		onUpdateRounds: (rounds: RoundConfig[]) => void;
		songs: any[];
	}

	let {
		rounds = $bindable(),
		availableGenres,
		onUpdateRounds,
		songs
	}: Props = $props();

	let selectedPreset = $state<string | null>(null);
	let useCustom = $state(false);
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let isDragging = $state(false);

	// Apply default preset on mount if no rounds are configured
	onMount(() => {
		if (rounds.length === 0 && gamePresets.length > 0) {
			console.log('[RoundBuilder] No rounds configured, applying default preset');
			applyPreset(gamePresets[0].id); // Apply first preset (Quick Game)
		}
	});

	// Apply preset
	function applyPreset(presetId: string) {
		const preset = gamePresets.find((p) => p.id === presetId);
		if (preset) {
			selectedPreset = presetId;
			useCustom = false;
			rounds = [...preset.rounds];
			onUpdateRounds(rounds);
		}
	}

	// Add a new round
	function addRound() {
		if (rounds.length >= 5) {
			console.warn('Maximum 5 rounds allowed');
			return;
		}

		const newRound: RoundConfig = {
			modeType: 'buzz_and_choice',
			mediaType: 'music',
			songFilters: {
				songCount: 5
			},
			params: {
				songDuration: DEFAULT_SONG_DURATION,
				answerTimer: 10,
				audioPlayback: 'master'
			}
		};
		rounds = [...rounds, newRound];
		onUpdateRounds(rounds);
	}

	// Remove a round
	function removeRound(index: number) {
		if (rounds.length <= 1) {
			console.warn('Cannot remove the last round');
			return;
		}
		rounds = rounds.filter((_, i) => i !== index);
		onUpdateRounds(rounds);
		// Clear preset selection since we've modified the rounds
		selectedPreset = null;
	}

	// Toggle custom mode
	function toggleCustom() {
		useCustom = !useCustom;
		if (useCustom) {
			selectedPreset = null;
			if (rounds.length === 0) {
				addRound();
			}
		}
	}

	// Update song count for a specific round
	function updateSongCount(index: number, newCount: number) {
		const validCount = Math.max(1, Math.min(30, newCount)); // Min 1, max 30
		const updatedRounds = [...rounds];
		const previousCount = updatedRounds[index].songFilters?.songCount || 5;

		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				songCount: validCount
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);

		console.log(`🎵 Round ${index + 1} song count updated: ${previousCount} → ${validCount}`);
	}

	// Update year range for a specific round
	function updateYearMin(index: number, year: string) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				yearMin: year ? parseInt(year) : undefined
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function updateYearMax(index: number, year: string) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				yearMax: year ? parseInt(year) : undefined
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	// Update genre for a specific round
	function updateGenre(index: number, genre: string) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				genre: genre || undefined
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	// Update includeNiche for a specific round
	function updateIncludeNiche(index: number, include: boolean) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				includeNiche: include
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	// Drag and drop handlers
	function handleDragStart(event: DragEvent, index: number) {
		draggedIndex = index;
		isDragging = true;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
		if (draggedIndex !== index) {
			dragOverIndex = index;
		}
	}

	function handleDragLeave(event: DragEvent) {
		// Only clear if actually leaving the element
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = event.clientX;
		const y = event.clientY;

		if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
			dragOverIndex = null;
		}
	}

	function handleDrop(event: DragEvent, dropIndex: number) {
		event.preventDefault();

		if (draggedIndex === null || draggedIndex === dropIndex) {
			draggedIndex = null;
			dragOverIndex = null;
			isDragging = false;
			return;
		}

		// Reorder rounds with animation
		const reorderedRounds = [...rounds];
		const [movedRound] = reorderedRounds.splice(draggedIndex, 1);
		reorderedRounds.splice(dropIndex, 0, movedRound);

		rounds = reorderedRounds;
		onUpdateRounds(rounds);

		// Reset drag state
		setTimeout(() => {
			draggedIndex = null;
			dragOverIndex = null;
			isDragging = false;
		}, 50);
	}

	function handleDragEnd() {
		setTimeout(() => {
			draggedIndex = null;
			dragOverIndex = null;
			isDragging = false;
		}, 50);
	}
</script>

<div class="round-builder">
	<h3>Mode de jeu</h3>

	<div class="mode-selector">
		<!-- Preset Selection -->
		<div class="presets">
			{#each gamePresets as preset}
				<button
					class="preset-card"
					class:selected={selectedPreset === preset.id}
					onclick={() => applyPreset(preset.id)}
				>
					<div class="preset-header">
						<strong>{preset.name}</strong>
						<span class="round-badge">{preset.rounds.length} manches</span>
					</div>
					<p class="preset-description">{preset.description}</p>
				</button>
			{/each}
		</div>

		<!-- Custom Game Toggle -->
		<div class="custom-toggle">
			<label>
				<input type="checkbox" checked={useCustom} onchange={toggleCustom} />
				<strong>Jeu personnalisé</strong>
				<span>Compose tes propres manches</span>
			</label>
		</div>
	</div>

	<!-- Round List -->
	{#if rounds.length > 0}
		<div class="rounds-list">
			<div class="rounds-header">
				<h4>Manches</h4>
				<button
					class="icon-btn add-btn"
					onclick={addRound}
					disabled={rounds.length >= 5}
					title="Ajouter une manche"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="rounds">
				{#each rounds as round, index}
					<div
						class="round-card"
						class:dragging={draggedIndex === index}
						class:drag-over={dragOverIndex === index && draggedIndex !== index}
						class:is-dragging-active={isDragging}
						style="transition-delay: {index * 30}ms;"
						draggable="true"
						ondragstart={(e) => handleDragStart(e, index)}
						ondragover={(e) => handleDragOver(e, index)}
						ondragleave={(e) => handleDragLeave(e)}
						ondrop={(e) => handleDrop(e, index)}
						ondragend={handleDragEnd}
					>
						<div class="drag-handle" title="Glisser pour réorganiser">
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<circle cx="6" cy="4" r="1.5" fill="currentColor"/>
								<circle cx="10" cy="4" r="1.5" fill="currentColor"/>
								<circle cx="6" cy="8" r="1.5" fill="currentColor"/>
								<circle cx="10" cy="8" r="1.5" fill="currentColor"/>
								<circle cx="6" cy="12" r="1.5" fill="currentColor"/>
								<circle cx="10" cy="12" r="1.5" fill="currentColor"/>
							</svg>
						</div>
						<div class="round-info">
							<div class="round-number">Manche {index + 1}</div>
							<div class="round-details">
								<span class="mode-badge">{getModeDisplayName(round.modeType)}</span>
								<span class="media-badge">{getMediaDisplayName(round.mediaType)}</span>
								<div class="song-count-input">
									<input
										type="number"
										min="1"
										max="30"
										value={round.songFilters?.songCount || round.songFilters?.songIds?.length || 5}
										oninput={(e) => updateSongCount(index, parseInt(e.currentTarget.value) || 1)}
									/>
									<span>morceaux</span>
								</div>
							</div>

							<!-- Music Filters -->
							{#if round.mediaType === 'music'}
								<div class="filter-controls">
									<!-- Genre Filter -->
									<div class="filter-group">
										<label for="genre-{index}">Genre</label>
										<select
											id="genre-{index}"
											value={round.songFilters?.genre || ''}
											onchange={(e) => updateGenre(index, e.currentTarget.value)}
										>
											<option value="">Tous les genres</option>
											{#each CANONICAL_GENRES as genre}
												<option value={genre}>{genre}</option>
											{/each}
										</select>
									</div>

									<!-- Year Range Filter -->
									<div class="filter-group">
										<label for="year-min-{index}">Année min</label>
										<input
											id="year-min-{index}"
											type="number"
											min="1900"
											max="2099"
											placeholder="Ex: 1980"
											value={round.songFilters?.yearMin || ''}
											oninput={(e) => updateYearMin(index, e.currentTarget.value)}
										/>
									</div>

									<div class="filter-group">
										<label for="year-max-{index}">Année max</label>
										<input
											id="year-max-{index}"
											type="number"
											min="1900"
											max="2099"
											placeholder="Ex: 2000"
											value={round.songFilters?.yearMax || ''}
											oninput={(e) => updateYearMax(index, e.currentTarget.value)}
										/>
									</div>

									<!-- Include Niche Toggle -->
									<div class="filter-group filter-checkbox">
										<label for="niche-{index}">
											<input
												id="niche-{index}"
												type="checkbox"
												checked={round.songFilters?.includeNiche || false}
												onchange={(e) => updateIncludeNiche(index, e.currentTarget.checked)}
											/>
											<span>Inclure chansons niche</span>
										</label>
									</div>
								</div>
							{/if}
						</div>
						<button
							class="icon-btn remove-btn"
							onclick={() => removeRound(index)}
							disabled={rounds.length === 1}
							title="Supprimer cette manche"
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
								<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
							</svg>
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.round-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.preset-card {
		padding: 1rem;
		border-radius: 18px;
		border: 1px solid rgba(18, 43, 59, 0.08);
		background: rgba(255, 255, 255, 0.9);
		text-align: left;
		cursor: pointer;
		transition: border-color 160ms ease, box-shadow 160ms ease;
	}

	.preset-card:hover {
		border-color: var(--aq-color-primary);
		box-shadow: var(--aq-shadow-soft);
	}

	.preset-card.selected {
		border-color: var(--aq-color-primary);
		box-shadow: var(--aq-shadow-card);
	}

	.preset-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.round-badge {
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		background: rgba(239, 76, 131, 0.12);
		color: var(--aq-color-primary);
		font-size: 0.8rem;
	}

	.custom-toggle {
		margin-top: 1.25rem;
		padding: 0.75rem 1rem;
		border-radius: 16px;
		border: 1px dashed rgba(18, 43, 59, 0.2);
	}

	.rounds-list {
		margin-top: 1.5rem;
	}

	.rounds-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.rounds-header h4 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--aq-color-deep);
	}

	.rounds {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.round-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.85rem 1rem;
		border-radius: 16px;
		background: rgba(18, 43, 59, 0.04);
		cursor: grab;
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			opacity 0.25s ease,
			background 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.25s ease;
		position: relative;
		border: 2px solid transparent;
		will-change: transform, opacity;
	}

	.round-card:hover {
		background: rgba(18, 43, 59, 0.06);
		box-shadow: 0 2px 8px rgba(18, 43, 59, 0.08);
	}

	.round-card:active {
		cursor: grabbing;
	}

	.round-card.dragging {
		opacity: 0.4;
		transform: scale(0.98) rotate(2deg);
		box-shadow: 0 8px 24px rgba(239, 76, 131, 0.3);
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.05);
		z-index: 1000;
	}

	.round-card.drag-over {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.12);
		transform: translateY(-4px) scale(1.02);
		box-shadow:
			0 0 0 2px rgba(239, 76, 131, 0.2),
			0 8px 16px rgba(239, 76, 131, 0.15);
	}

	.round-card.drag-over::before {
		content: '';
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		width: 60%;
		height: 3px;
		background: var(--aq-color-primary);
		border-radius: 999px;
		animation: pulse-line 0.6s ease-in-out infinite;
	}

	@keyframes pulse-line {
		0%, 100% {
			opacity: 0.5;
			width: 60%;
		}
		50% {
			opacity: 1;
			width: 80%;
		}
	}

	.round-card.is-dragging-active:not(.dragging):not(.drag-over) {
		transform: scale(0.98);
		opacity: 0.7;
	}

	.drag-handle {
		display: flex;
		align-items: center;
		color: rgba(18, 43, 59, 0.3);
		margin-right: 0.75rem;
		cursor: grab;
		transition: all 0.2s ease;
		padding: 0.25rem;
		border-radius: 6px;
	}

	.drag-handle:hover {
		color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.1);
	}

	.drag-handle:active {
		cursor: grabbing;
		transform: scale(0.95);
	}

	.dragging .drag-handle {
		color: var(--aq-color-primary);
	}

	.mode-badge,
	.media-badge {
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.8rem;
		background: rgba(239, 76, 131, 0.12);
		color: var(--aq-color-primary);
	}

	.media-badge {
		background: rgba(248, 192, 39, 0.15);
		color: var(--aq-color-secondary);
	}

	.song-count-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: rgba(18, 43, 59, 0.06);
		font-size: 0.8rem;
	}

	.song-count-input input {
		width: 3.5rem;
		padding: 0.2rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		text-align: center;
		background: transparent;
		transition: all 0.2s ease;
	}

	.song-count-input input:hover {
		border-color: rgba(239, 76, 131, 0.2);
		background: rgba(255, 255, 255, 0.5);
	}

	.song-count-input input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		background: rgba(255, 255, 255, 0.8);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.15);
		transform: scale(1.05);
	}

	.song-count-input input:active {
		transform: scale(0.98);
	}

	.song-count-input span {
		color: rgba(18, 43, 59, 0.6);
		font-weight: 500;
	}

	.round-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
	}

	.round-number {
		font-weight: 700;
		color: var(--aq-color-deep);
		min-width: 80px;
	}

	.round-details {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		background: transparent;
		color: rgba(18, 43, 59, 0.5);
	}

	.icon-btn:hover:not(:disabled) {
		background: rgba(239, 76, 131, 0.1);
		color: var(--aq-color-primary);
		transform: scale(1.05);
	}

	.icon-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Filter Controls */
	.filter-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.75rem;
		padding: 0.75rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(18, 43, 59, 0.08);
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 120px;
	}

	.filter-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(18, 43, 59, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.filter-group input[type="number"],
	.filter-group select {
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(18, 43, 59, 0.15);
		border-radius: 8px;
		font-size: 0.85rem;
		color: var(--aq-color-deep);
		background: white;
		transition: all 0.2s ease;
	}

	.filter-group input[type="number"]:focus,
	.filter-group select:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.15);
	}

	.filter-group input[type="number"]::placeholder {
		color: rgba(18, 43, 59, 0.3);
		font-size: 0.8rem;
	}

	.filter-checkbox {
		justify-content: center;
	}

	.filter-checkbox label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.4rem 0.6rem;
		border-radius: 8px;
		background: rgba(248, 192, 39, 0.08);
		border: 1px solid rgba(248, 192, 39, 0.2);
		transition: all 0.2s ease;
		text-transform: none;
		font-size: 0.8rem;
	}

	.filter-checkbox label:hover {
		background: rgba(248, 192, 39, 0.15);
		border-color: rgba(248, 192, 39, 0.3);
	}

	.filter-checkbox input[type="checkbox"] {
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.filter-checkbox span {
		color: var(--aq-color-deep);
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.filter-controls {
			flex-direction: column;
		}

		.filter-group {
			min-width: 100%;
		}
	}
</style>
