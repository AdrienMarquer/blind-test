<script lang="ts">
	/**
	 * RoundBuilder Component
	 * Simple round management
	 */

	import { onMount } from 'svelte';
	import { CANONICAL_GENRES, type RoundConfig, type MediaType } from '@blind-test/shared';
	import {
		gameModes,
		mediaTypes,
		getModeInfo,
		getDefaultRounds,
		createDefaultRound,
		type GameModeType
	} from '$lib/presets';

	interface Props {
		rounds: RoundConfig[];
		availableGenres: string[];
		onUpdateRounds: (rounds: RoundConfig[]) => void;
		songs: any[];
		masterPlaying?: boolean;
		compact?: boolean;
	}

	let { rounds = $bindable(), availableGenres, onUpdateRounds, songs, masterPlaying = false, compact = false }: Props = $props();

	// When master starts playing, switch any fast_buzz rounds to buzz_and_choice
	$effect(() => {
		if (masterPlaying) {
			let hasChanges = false;
			const updatedRounds = rounds.map(round => {
				if (round.modeType === 'fast_buzz') {
					hasChanges = true;
					return {
						...createDefaultRound('buzz_and_choice', round.mediaType),
						songFilters: round.songFilters
					};
				}
				return round;
			});
			if (hasChanges) {
				rounds = updatedRounds;
				onUpdateRounds(rounds);
			}
		}
	});

	let expandedRound = $state<number | null>(null);

	onMount(() => {
		if (rounds.length === 0) {
			rounds = getDefaultRounds();
			onUpdateRounds(rounds);
		}
	});

	function addRound(modeType: GameModeType) {
		rounds = [...rounds, createDefaultRound(modeType)];
		onUpdateRounds(rounds);
	}

	function removeRound(index: number) {
		if (rounds.length <= 1) return;
		rounds = rounds.filter((_, i) => i !== index);
		onUpdateRounds(rounds);
		if (expandedRound === index) expandedRound = null;
	}

	function changeRoundMode(index: number, modeType: GameModeType) {
		const updatedRounds = [...rounds];
		const currentMediaType = updatedRounds[index].mediaType;
		updatedRounds[index] = {
			...createDefaultRound(modeType, currentMediaType),
			songFilters: updatedRounds[index].songFilters
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function changeRoundMediaType(index: number, mediaType: MediaType) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			mediaType
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function updateSongCount(index: number, newCount: number) {
		const validCount = Math.max(1, Math.min(30, newCount));
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: { ...updatedRounds[index].songFilters, songCount: validCount }
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

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

	function toggleGenre(index: number, genre: string) {
		const updatedRounds = [...rounds];
		const currentGenres = updatedRounds[index].songFilters?.genre;
		let genreArray: string[] = Array.isArray(currentGenres)
			? [...currentGenres]
			: currentGenres
				? [currentGenres]
				: [];

		const genreIndex = genreArray.indexOf(genre);
		if (genreIndex > -1) genreArray.splice(genreIndex, 1);
		else genreArray.push(genre);

		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: {
				...updatedRounds[index].songFilters,
				genre: genreArray.length > 0 ? genreArray : undefined
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function selectAllGenres(index: number) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: { ...updatedRounds[index].songFilters, genre: [...CANONICAL_GENRES] }
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function clearAllGenres(index: number) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: { ...updatedRounds[index].songFilters, genre: undefined }
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function isGenreSelected(index: number, genre: string): boolean {
		const currentGenres = rounds[index].songFilters?.genre;
		if (!currentGenres) return false;
		return Array.isArray(currentGenres) ? currentGenres.includes(genre) : currentGenres === genre;
	}

	function getSelectedGenresText(index: number): string {
		const currentGenres = rounds[index].songFilters?.genre;
		if (!currentGenres) return 'Tous les genres';
		if (Array.isArray(currentGenres)) {
			if (currentGenres.length === CANONICAL_GENRES.length) return 'Tous les genres';
			if (currentGenres.length <= 2) return currentGenres.join(', ');
			return `${currentGenres.length} genres sélectionnés`;
		}
		return currentGenres;
	}

	function updateIncludeNiche(index: number, include: boolean) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			songFilters: { ...updatedRounds[index].songFilters, includeNiche: include }
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function updatePenaltyEnabled(index: number, enabled: boolean) {
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			params: {
				...updatedRounds[index].params,
				penaltyEnabled: enabled,
				penaltyAmount: enabled ? (updatedRounds[index].params?.penaltyAmount || 1) : 0
			}
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function updatePenaltyAmount(index: number, amount: number) {
		const validAmount = Math.max(1, Math.min(5, amount));
		const updatedRounds = [...rounds];
		updatedRounds[index] = {
			...updatedRounds[index],
			params: { ...updatedRounds[index].params, penaltyAmount: validAmount }
		};
		rounds = updatedRounds;
		onUpdateRounds(rounds);
	}

	function getCompactFiltersSummary(index: number): string {
		const filters = rounds[index].songFilters;
		if (!filters) return 'Tous genres';

		const parts: string[] = [];

		// Genres
		if (filters.genre) {
			const genres = Array.isArray(filters.genre) ? filters.genre : [filters.genre];
			if (genres.length <= 2) {
				parts.push(genres.join(', '));
			} else {
				parts.push(`${genres.length} genres`);
			}
		} else {
			parts.push('Tous genres');
		}

		// Years
		if (filters.yearMin || filters.yearMax) {
			if (filters.yearMin && filters.yearMax) {
				parts.push(`${filters.yearMin}-${filters.yearMax}`);
			} else if (filters.yearMin) {
				parts.push(`depuis ${filters.yearMin}`);
			} else if (filters.yearMax) {
				parts.push(`avant ${filters.yearMax}`);
			}
		}

		return parts.join(' • ');
	}
</script>

<div class="round-builder" class:compact>
	<div class="rounds">
		{#each rounds as round, index}
			{@const modeInfo = getModeInfo(round.modeType)}
			{#if compact}
				<!-- Compact Mode Layout -->
				<div class="round-card-compact">
					<div class="compact-header">
						<span class="compact-round-num">Manche {index + 1}</span>
						<div class="compact-mode-pills">
							{#each gameModes as mode}
								{@const isDisabled = masterPlaying && mode.id === 'fast_buzz'}
								<button
									type="button"
									class="compact-mode-pill"
									class:active={round.modeType === mode.id}
									class:disabled={isDisabled}
									onclick={() => changeRoundMode(index, mode.id)}
									disabled={isDisabled}
								>
									{mode.icon}
								</button>
							{/each}
						</div>
						<div class="compact-song-count">
							<button
								type="button"
								class="compact-stepper-btn"
								onclick={() => updateSongCount(index, (round.songFilters?.songCount || 5) - 1)}
								disabled={(round.songFilters?.songCount || 5) <= 1}
							>−</button>
							<span class="compact-count-value">{round.songFilters?.songCount || 5}</span>
							<button
								type="button"
								class="compact-stepper-btn"
								onclick={() => updateSongCount(index, (round.songFilters?.songCount || 5) + 1)}
								disabled={(round.songFilters?.songCount || 5) >= 30}
							>+</button>
						</div>
						<button
							type="button"
							class="compact-remove-btn"
							onclick={() => removeRound(index)}
							disabled={rounds.length === 1}
							title="Supprimer la manche"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>

					<button
						type="button"
						class="compact-filters-toggle"
						class:expanded={expandedRound === index}
						class:has-filters={round.songFilters?.genre || round.songFilters?.yearMin || round.songFilters?.yearMax}
						onclick={() => (expandedRound = expandedRound === index ? null : index)}
					>
						<span class="compact-filters-text">{getCompactFiltersSummary(index)}</span>
						<svg
							class="compact-chevron"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M6 9l6 6 6-6" />
						</svg>
					</button>

					{#if expandedRound === index}
						<div class="compact-filters-panel">
							<!-- Year Range -->
							<div class="filter-section">
								<span class="field-label">Période</span>
								<div class="year-range">
									<input
										type="number"
										placeholder="Min"
										value={round.songFilters?.yearMin || ''}
										oninput={(e) => updateYearMin(index, e.currentTarget.value)}
									/>
									<span class="year-separator">à</span>
									<input
										type="number"
										placeholder="Max"
										value={round.songFilters?.yearMax || ''}
										oninput={(e) => updateYearMax(index, e.currentTarget.value)}
									/>
								</div>
							</div>

							<!-- Penalty Toggle (compact) -->
							<label class="compact-option-toggle">
								<input
									type="checkbox"
									checked={round.params?.penaltyEnabled || false}
									onchange={(e) => updatePenaltyEnabled(index, e.currentTarget.checked)}
								/>
								<span>Malus</span>
								{#if round.params?.penaltyEnabled}
									<span class="compact-penalty-value">-{round.params?.penaltyAmount || 1} pt</span>
								{/if}
							</label>

							<!-- Niche Toggle -->
							<label class="compact-option-toggle">
								<input
									type="checkbox"
									checked={round.songFilters?.includeNiche || false}
									onchange={(e) => updateIncludeNiche(index, e.currentTarget.checked)}
								/>
								<span>Titres niche</span>
							</label>

							<!-- Genre Selection -->
							<div class="filter-section">
								<div class="genre-header">
									<span class="field-label">Genres</span>
									<div class="genre-actions">
										<button type="button" onclick={() => selectAllGenres(index)}>Tous</button>
										<button type="button" onclick={() => clearAllGenres(index)}>Aucun</button>
									</div>
								</div>
								<div class="genre-grid">
									{#each CANONICAL_GENRES as genre}
										<label class="genre-chip" class:selected={isGenreSelected(index, genre)}>
											<input
												type="checkbox"
												checked={isGenreSelected(index, genre)}
												onchange={() => toggleGenre(index, genre)}
											/>
											{genre}
										</label>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Full Mode Layout -->
				<div class="round-card">
					<div class="round-header">
						<span class="round-num">Manche {index + 1}</span>
						<div class="header-right">
							<div class="mode-badges">
								{#each gameModes as mode}
								{@const isDisabled = masterPlaying && mode.id === 'fast_buzz'}
								<button
									class="mode-badge"
									class:active={round.modeType === mode.id}
									class:disabled={isDisabled}
									onclick={() => changeRoundMode(index, mode.id)}
									disabled={isDisabled}
									title={isDisabled ? 'Indisponible quand l\'hôte joue' : ''}
								>
									<span class="mode-icon">{mode.icon}</span>
									<span class="mode-name">{mode.name}</span>
								</button>
							{/each}
							</div>
							<div class="mode-select-mobile">
								<div class="mode-select-control">
									<select
										id={`round-mode-${index}`}
										aria-label="Type de manche"
										value={round.modeType}
										onchange={(e) => changeRoundMode(index, e.currentTarget.value as GameModeType)}
									>
										{#each gameModes as mode}
											{@const optionDisabled = masterPlaying && mode.id === 'fast_buzz'}
											<option value={mode.id} disabled={optionDisabled}>
												{mode.icon} {mode.name}
											</option>
										{/each}
									</select>
								</div>
							</div>
							<button
								class="remove-btn"
								onclick={() => removeRound(index)}
								disabled={rounds.length === 1}
								title="Supprimer cette manche"
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>

					<div class="round-body">

					<!-- Media Type Selection -->
					<div class="field field-inline">
						<label class="field-label" for="media-type-{index}">Support</label>
						<div class="media-select-control">
							<select
								id="media-type-{index}"
								aria-label="Type de support"
								value={round.mediaType}
								onchange={(e) => changeRoundMediaType(index, e.currentTarget.value as MediaType)}
							>
								{#each mediaTypes as media}
									{@const isSupported = media.id === 'music'}
									<option value={media.id} disabled={!isSupported}>
										{media.icon} {media.name}{!isSupported ? ' (bientôt)' : ''}
									</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Song Count -->
					<div class="field field-inline">
						<label class="field-label" for="song-count-{index}">Nombre de titres</label>
						<div class="song-count-input">
							<button
								class="stepper-btn"
								onclick={() => updateSongCount(index, (round.songFilters?.songCount || 5) - 1)}
								disabled={(round.songFilters?.songCount || 5) <= 1}
							>
								−
							</button>
							<input
								id="song-count-{index}"
								type="number"
								min="1"
								max="30"
								value={round.songFilters?.songCount || 5}
								oninput={(e) => updateSongCount(index, parseInt(e.currentTarget.value) || 1)}
							/>
							<button
								class="stepper-btn"
								onclick={() => updateSongCount(index, (round.songFilters?.songCount || 5) + 1)}
								disabled={(round.songFilters?.songCount || 5) >= 30}
							>
								+
							</button>
						</div>
					</div>

					<!-- Malus Configuration -->
					<div class="field malus-field">
						<label class="malus-toggle">
							<input
								type="checkbox"
								checked={round.params?.penaltyEnabled || false}
								onchange={(e) => updatePenaltyEnabled(index, e.currentTarget.checked)}
							/>
							<span>Activer le malus</span>
						</label>
						{#if round.params?.penaltyEnabled}
							<div class="malus-amount">
								<span class="malus-label">Points retirés</span>
								<div class="malus-stepper">
									<button
										class="stepper-btn"
										onclick={() => updatePenaltyAmount(index, (round.params?.penaltyAmount || 1) - 1)}
										disabled={(round.params?.penaltyAmount || 1) <= 1}
									>
										−
									</button>
									<input
										type="number"
										min="1"
										max="5"
										value={round.params?.penaltyAmount || 1}
										oninput={(e) => updatePenaltyAmount(index, parseInt(e.currentTarget.value) || 1)}
									/>
									<button
										class="stepper-btn"
										onclick={() => updatePenaltyAmount(index, (round.params?.penaltyAmount || 1) + 1)}
										disabled={(round.params?.penaltyAmount || 1) >= 5}
									>
										+
									</button>
								</div>
							</div>
						{/if}
					</div>

					<!-- Filters Toggle (only for music) -->
					{#if round.mediaType === 'music'}
						<button
							class="filters-toggle"
							class:expanded={expandedRound === index}
							class:has-filters={round.songFilters?.genre ||
								round.songFilters?.yearMin ||
								round.songFilters?.yearMax}
							onclick={() => (expandedRound = expandedRound === index ? null : index)}
						>
							<span>Filtres avancés</span>
							{#if round.songFilters?.genre || round.songFilters?.yearMin || round.songFilters?.yearMax}
								<span class="filter-badge">Actifs</span>
							{/if}
							<svg
								class="chevron"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M6 9l6 6 6-6" />
							</svg>
						</button>

						{#if expandedRound === index}
							<div class="filters-panel">
								<!-- Year Range -->
								<div class="filter-section">
									<span class="field-label">Période</span>
									<div class="year-range">
										<input
											type="number"
											placeholder="Année min"
											value={round.songFilters?.yearMin || ''}
											oninput={(e) => updateYearMin(index, e.currentTarget.value)}
										/>
										<span class="year-separator">à</span>
										<input
											type="number"
											placeholder="Année max"
											value={round.songFilters?.yearMax || ''}
											oninput={(e) => updateYearMax(index, e.currentTarget.value)}
										/>
									</div>
								</div>

								<!-- Niche Toggle -->
								<div class="filter-section">
									<label class="niche-toggle">
										<input
											type="checkbox"
											checked={round.songFilters?.includeNiche || false}
											onchange={(e) => updateIncludeNiche(index, e.currentTarget.checked)}
										/>
										<span>Inclure les titres niche</span>
									</label>
								</div>

								<!-- Genre Selection -->
								<div class="filter-section">
									<div class="genre-header">
										<span class="field-label">Genres: {getSelectedGenresText(index)}</span>
										<div class="genre-actions">
											<button onclick={() => selectAllGenres(index)}>Tous</button>
											<button onclick={() => clearAllGenres(index)}>Aucun</button>
										</div>
									</div>
									<div class="genre-grid">
										{#each CANONICAL_GENRES as genre}
											<label class="genre-chip" class:selected={isGenreSelected(index, genre)}>
												<input
													type="checkbox"
													checked={isGenreSelected(index, genre)}
													onchange={() => toggleGenre(index, genre)}
												/>
												{genre}
											</label>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</div>
			{/if}
		{/each}
	</div>

	<div class="add-buttons">
		{#each gameModes as mode}
			{@const isDisabled = masterPlaying && mode.id === 'fast_buzz'}
			<button
				class="add-btn"
				class:disabled={isDisabled}
				onclick={() => addRound(mode.id)}
				disabled={isDisabled}
				title={isDisabled ? 'Indisponible quand l\'hôte joue' : ''}
			>
				<span class="add-icon">+</span>
				<span class="add-mode-icon">{mode.icon}</span>
				<span>{mode.name}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.round-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.rounds {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.round-card {
		background: white;
		border-radius: 16px;
		border: 1px solid rgba(18, 43, 59, 0.08);
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(18, 43, 59, 0.04);
	}

	.round-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.08), rgba(248, 192, 39, 0.08));
		border-bottom: 1px solid rgba(18, 43, 59, 0.06);
		gap: 0.75rem;
	}

	.round-num {
		font-weight: 700;
		font-size: 1rem;
		color: var(--aq-color-deep);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mode-select-mobile {
		display: none;
		flex: 1 1 180px;
		min-width: 140px;
	}

	.mode-select-control {
		width: 100%;
	}

	.mode-select-control select {
		width: 100%;
		padding: 0.65rem 0.75rem;
		padding-right: 2.5rem;
		border-radius: 10px;
		border: 1.5px solid rgba(18, 43, 59, 0.15);
		background: white;
		font-weight: 600;
		font-size: 0.9rem;
		font-family: inherit;
		color: var(--aq-color-deep);
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, rgba(18, 43, 59, 0.4) 50%),
			linear-gradient(135deg, rgba(18, 43, 59, 0.4) 50%, transparent 50%);
		background-position: calc(100% - 18px) calc(50% + 2px), calc(100% - 12px) calc(50% + 2px);
		background-size: 6px 6px;
		background-repeat: no-repeat;
	}

	.mode-select-control select:focus-visible {
		outline: 2px solid var(--aq-color-primary);
		outline-offset: 2px;
	}

	.mode-badges {
		display: flex;
		gap: 0.25rem;
	}

	.mode-badge {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		border: 1.5px solid rgba(18, 43, 59, 0.12);
		background: white;
		border-radius: 999px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.8rem;
	}

	.mode-badge:hover {
		border-color: var(--aq-color-primary);
	}

	.mode-badge.active {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.15), rgba(248, 192, 39, 0.15));
	}

	.mode-badge .mode-icon {
		font-size: 0.9rem;
	}

	.mode-badge .mode-name {
		font-weight: 600;
		font-size: 0.8rem;
		color: var(--aq-color-deep);
	}

	.mode-badge.active .mode-name {
		color: var(--aq-color-primary);
	}

	.mode-badge.disabled,
	.mode-badge:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.mode-badge.disabled:hover,
	.mode-badge:disabled:hover {
		border-color: rgba(18, 43, 59, 0.12);
	}

	.remove-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: rgba(18, 43, 59, 0.3);
		cursor: pointer;
		border-radius: 8px;
		transition: all 0.15s ease;
	}

	.remove-btn:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(220, 38, 38);
	}

	.remove-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.round-header {
			gap: 0.4rem;
		}

		.header-right {
			flex: 1 1 auto;
			justify-content: flex-end;
			flex-wrap: nowrap;
			gap: 0.4rem;
		}

		.mode-badges {
			display: none;
		}

		.mode-select-mobile {
			display: flex;
			flex: 1 1 auto;
			min-width: 0;
		}

		.mode-select-control select {
			font-size: 0.85rem;
		}

		.remove-btn {
			flex: 0 0 auto;
		}
	}

	.round-body {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-inline {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	.field-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(18, 43, 59, 0.7);
	}

	.media-select-control {
		min-width: 160px;
	}

	.media-select-control select {
		width: 100%;
		padding: 0.65rem 0.75rem;
		padding-right: 2.5rem;
		border-radius: 10px;
		border: 1.5px solid rgba(18, 43, 59, 0.15);
		background: white;
		font-weight: 600;
		font-size: 0.9rem;
		font-family: inherit;
		color: var(--aq-color-deep);
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, rgba(18, 43, 59, 0.4) 50%),
			linear-gradient(135deg, rgba(18, 43, 59, 0.4) 50%, transparent 50%);
		background-position: calc(100% - 18px) calc(50% + 2px), calc(100% - 12px) calc(50% + 2px);
		background-size: 6px 6px;
		background-repeat: no-repeat;
	}

	.media-select-control select:focus-visible {
		outline: 2px solid var(--aq-color-primary);
		outline-offset: 2px;
	}

	.media-select-control select option:disabled {
		color: rgba(18, 43, 59, 0.4);
	}

	.song-count-input {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: rgba(18, 43, 59, 0.04);
		border-radius: 10px;
		padding: 0.25rem;
	}

	.stepper-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: white;
		border-radius: 8px;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.stepper-btn:hover:not(:disabled) {
		background: var(--aq-color-primary);
		color: white;
	}

	.stepper-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.song-count-input input {
		width: 50px;
		padding: 0.4rem;
		border: none;
		background: transparent;
		font-size: 1rem;
		font-weight: 700;
		text-align: center;
		color: var(--aq-color-deep);
	}

	.song-count-input input:focus {
		outline: none;
	}

	.filters-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(18, 43, 59, 0.1);
		background: rgba(18, 43, 59, 0.02);
		border-radius: 10px;
		font-size: 0.9rem;
		color: rgba(18, 43, 59, 0.7);
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.filters-toggle:hover {
		background: rgba(18, 43, 59, 0.04);
		border-color: rgba(18, 43, 59, 0.15);
	}

	.filters-toggle.expanded {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.04);
	}

	.filter-badge {
		padding: 0.2rem 0.5rem;
		background: var(--aq-color-primary);
		color: white;
		border-radius: 6px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.chevron {
		margin-left: auto;
		transition: transform 0.2s ease;
	}

	.filters-toggle.expanded .chevron {
		transform: rotate(180deg);
	}

	.filters-panel {
		padding: 1rem;
		background: rgba(18, 43, 59, 0.02);
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.filter-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.year-range {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.year-range input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid rgba(18, 43, 59, 0.15);
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.year-range input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.1);
	}

	.year-separator {
		color: rgba(18, 43, 59, 0.4);
		font-weight: 500;
	}

	.niche-toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		background: rgba(248, 192, 39, 0.1);
		border: 1px solid rgba(248, 192, 39, 0.2);
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--aq-color-deep);
		transition: all 0.15s ease;
	}

	.niche-toggle:hover {
		background: rgba(248, 192, 39, 0.15);
	}

	.niche-toggle input {
		width: 18px;
		height: 18px;
		cursor: pointer;
		accent-color: var(--aq-color-secondary);
	}

	/* Malus Configuration Styles */
	.malus-field {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.malus-toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.15);
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--aq-color-deep);
		transition: all 0.15s ease;
	}

	.malus-toggle:hover {
		background: rgba(239, 68, 68, 0.12);
	}

	.malus-toggle:has(input:checked) {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.malus-toggle input {
		width: 18px;
		height: 18px;
		cursor: pointer;
		accent-color: rgb(239, 68, 68);
	}

	.malus-amount {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.04);
		border-radius: 8px;
		margin-left: 1.5rem;
	}

	.malus-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: rgba(18, 43, 59, 0.7);
	}

	.malus-stepper {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: rgba(18, 43, 59, 0.04);
		border-radius: 8px;
		padding: 0.2rem;
	}

	.malus-stepper input {
		width: 40px;
		padding: 0.3rem;
		border: none;
		background: transparent;
		font-size: 0.95rem;
		font-weight: 700;
		text-align: center;
		color: rgb(239, 68, 68);
	}

	.malus-stepper input:focus {
		outline: none;
	}

	.genre-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.genre-actions {
		display: flex;
		gap: 0.4rem;
	}

	.genre-actions button {
		padding: 0.35rem 0.7rem;
		border: 1px solid rgba(18, 43, 59, 0.15);
		background: white;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.genre-actions button:hover {
		background: var(--aq-color-primary);
		color: white;
		border-color: var(--aq-color-primary);
	}

	.genre-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.genre-chip {
		display: flex;
		align-items: center;
		padding: 0.4rem 0.75rem;
		border: 1px solid rgba(18, 43, 59, 0.12);
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s ease;
		background: white;
		color: rgba(18, 43, 59, 0.8);
	}

	.genre-chip:hover {
		border-color: var(--aq-color-primary);
	}

	.genre-chip.selected {
		background: rgba(239, 76, 131, 0.12);
		border-color: var(--aq-color-primary);
		color: var(--aq-color-primary);
		font-weight: 500;
	}

	.genre-chip input {
		display: none;
	}

	.add-buttons {
		display: flex;
		gap: 0.75rem;
	}

	.add-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		border: 2px dashed rgba(18, 43, 59, 0.15);
		background: transparent;
		border-radius: 14px;
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(18, 43, 59, 0.5);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-btn:hover:not(:disabled) {
		border-color: var(--aq-color-primary);
		color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.03);
	}

	.add-btn.disabled,
	.add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.add-icon {
		font-size: 1.1rem;
	}

	.add-mode-icon {
		font-size: 1.1rem;
	}

	@media (max-width: 640px) {
		.field-inline {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}

		.song-count-input {
			justify-content: center;
		}

		.add-buttons {
			flex-direction: column;
		}
	}

	/* ============================================
	   Compact Mode Styles
	   ============================================ */

	.round-card-compact {
		background: white;
		border-radius: 12px;
		border: 1px solid rgba(18, 43, 59, 0.1);
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.compact-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.compact-round-num {
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--aq-color-deep);
		min-width: 70px;
	}

	.compact-mode-pills {
		display: flex;
		gap: 0.25rem;
	}

	.compact-mode-pill {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1.5px solid rgba(18, 43, 59, 0.12);
		background: white;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.compact-mode-pill:hover:not(:disabled) {
		border-color: var(--aq-color-primary);
	}

	.compact-mode-pill.active {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.15), rgba(248, 192, 39, 0.15));
	}

	.compact-mode-pill.disabled,
	.compact-mode-pill:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.compact-song-count {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		background: rgba(18, 43, 59, 0.04);
		border-radius: 8px;
		padding: 0.15rem;
	}

	.compact-stepper-btn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: white;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.compact-stepper-btn:hover:not(:disabled) {
		background: var(--aq-color-primary);
		color: white;
	}

	.compact-stepper-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.compact-count-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		min-width: 24px;
		text-align: center;
	}

	.compact-remove-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: rgba(18, 43, 59, 0.3);
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.15s ease;
		margin-left: auto;
	}

	.compact-remove-btn:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(220, 38, 38);
	}

	.compact-remove-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.compact-filters-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(18, 43, 59, 0.02);
		border: 1px solid rgba(18, 43, 59, 0.08);
		border-radius: 8px;
		font-size: 0.8rem;
		color: var(--aq-color-muted);
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.compact-filters-toggle:hover {
		background: rgba(18, 43, 59, 0.04);
		border-color: rgba(18, 43, 59, 0.12);
	}

	.compact-filters-toggle.expanded {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.04);
	}

	.compact-filters-toggle.has-filters .compact-filters-text {
		color: var(--aq-color-primary);
		font-weight: 500;
	}

	.compact-filters-text {
		flex: 1;
	}

	.compact-chevron {
		transition: transform 0.2s ease;
		opacity: 0.5;
	}

	.compact-filters-toggle.expanded .compact-chevron {
		transform: rotate(180deg);
	}

	.compact-filters-panel {
		padding: 0.75rem;
		background: rgba(18, 43, 59, 0.02);
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.compact-option-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		background: white;
		border: 1px solid rgba(18, 43, 59, 0.1);
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--aq-color-deep);
		transition: all 0.15s ease;
	}

	.compact-option-toggle:hover {
		border-color: rgba(18, 43, 59, 0.2);
	}

	.compact-option-toggle:has(input:checked) {
		background: rgba(239, 76, 131, 0.05);
		border-color: rgba(239, 76, 131, 0.2);
	}

	.compact-option-toggle input {
		width: 16px;
		height: 16px;
		cursor: pointer;
		accent-color: var(--aq-color-primary);
	}

	.compact-penalty-value {
		margin-left: auto;
		font-weight: 600;
		color: rgb(239, 68, 68);
		font-size: 0.8rem;
	}

	/* Compact mode add buttons */
	.compact .add-buttons {
		flex-direction: row;
	}

	.compact .add-btn {
		padding: 0.75rem;
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.compact-header {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.compact-round-num {
			min-width: auto;
		}

		.compact-remove-btn {
			margin-left: 0;
		}

		.compact .add-buttons {
			flex-direction: column;
		}
	}
</style>
