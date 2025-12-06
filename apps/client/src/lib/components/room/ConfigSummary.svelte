<script lang="ts">
	/**
	 * ConfigSummary Component
	 * Compact visual summary of game configuration with inline editing
	 */

	import { DEFAULT_SONG_DURATION, CANONICAL_GENRES, type RoundConfig } from '@blind-test/shared';
	import { getTotalSongs, estimateDuration } from '$lib/gamePresets';
	import { getModeInfo } from '$lib/presets';

	interface Props {
		rounds: RoundConfig[];
		audioPlayback: 'master' | 'players' | 'all';
		presetName: string;
		penaltyEnabled: boolean;
		penaltyAmount: number;
		masterPlaying?: boolean;
		onEditRounds: () => void;
		onChangeAudio: (value: 'master' | 'players' | 'all') => void;
		onChangePenalty: (enabled: boolean) => void;
		onChangePenaltyAmount: (amount: number) => void;
		onUpdateRounds?: (rounds: RoundConfig[]) => void;
	}

	let { rounds, audioPlayback, presetName, penaltyEnabled, penaltyAmount, masterPlaying = false, onEditRounds, onChangeAudio, onChangePenalty, onChangePenaltyAmount, onUpdateRounds }: Props = $props();

	// Track which round is expanded for editing
	let expandedRoundIndex = $state<number | null>(null);

	const totalSongs = $derived(getTotalSongs(rounds));
	const estimatedMinutes = $derived(estimateDuration(rounds));

	// Available mode types
	const modeTypes = [
		{ value: 'fast_buzz' as const, label: 'Buzz éclair', icon: '⚡', disabled: masterPlaying },
		{ value: 'buzz_and_choice' as const, label: 'QCM', icon: '📝', disabled: false }
	];

	function toggleRoundExpand(index: number) {
		expandedRoundIndex = expandedRoundIndex === index ? null : index;
	}

	function updateRoundMode(index: number, modeType: 'fast_buzz' | 'buzz_and_choice') {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		round.modeType = modeType;

		// Update params based on mode type
		if (modeType === 'buzz_and_choice') {
			round.params = {
				...round.params,
				songDuration: round.params?.songDuration || DEFAULT_SONG_DURATION,
				answerTimer: 8,
				numChoices: 4,
				pointsTitle: 1,
				pointsArtist: 1
			};
		} else {
			round.params = {
				...round.params,
				songDuration: round.params?.songDuration || DEFAULT_SONG_DURATION,
				answerTimer: 5
			};
		}

		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	function updateSongCount(index: number, delta: number) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		const currentCount = round.songFilters?.songCount || 5;
		const newCount = Math.max(1, Math.min(20, currentCount + delta));

		round.songFilters = {
			...round.songFilters,
			songCount: newCount
		};

		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	function addRound() {
		const newRound: RoundConfig = {
			modeType: masterPlaying ? 'buzz_and_choice' : 'fast_buzz',
			mediaType: 'music',
			songFilters: { songCount: 5 },
			params: {
				songDuration: DEFAULT_SONG_DURATION,
				answerTimer: masterPlaying ? 8 : 5,
				penaltyEnabled,
				penaltyAmount: 1,
				...(masterPlaying ? { numChoices: 4, pointsTitle: 1, pointsArtist: 1 } : {})
			}
		};
		onUpdateRounds?.([...rounds, newRound]);
		expandedRoundIndex = rounds.length; // Expand the new round
	}

	function removeRound(index: number) {
		if (rounds.length <= 1) return;
		const newRounds = rounds.filter((_, i) => i !== index);
		onUpdateRounds?.(newRounds);
		expandedRoundIndex = null;
	}

	// Genre filter functions
	function getGenresArray(round: RoundConfig): string[] {
		const genre = round.songFilters?.genre;
		if (!genre) return [];
		return Array.isArray(genre) ? genre : [genre];
	}

	function toggleGenre(index: number, genreToToggle: string) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		const currentGenres = getGenresArray(round);

		let newGenres: string[];
		if (currentGenres.includes(genreToToggle)) {
			newGenres = currentGenres.filter((g: string) => g !== genreToToggle);
		} else {
			newGenres = [...currentGenres, genreToToggle];
		}

		round.songFilters = {
			...round.songFilters,
			genre: newGenres.length > 0 ? newGenres : undefined
		};

		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	function selectAllGenres(index: number) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		round.songFilters = {
			...round.songFilters,
			genre: [...CANONICAL_GENRES]
		};
		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	function clearAllGenres(index: number) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		round.songFilters = {
			...round.songFilters,
			genre: undefined
		};
		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	// Year filter functions
	function updateYearMin(index: number, value: string) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		const year = parseInt(value);
		round.songFilters = {
			...round.songFilters,
			yearMin: isNaN(year) ? undefined : year
		};
		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	function updateYearMax(index: number, value: string) {
		const newRounds = [...rounds];
		const round = { ...newRounds[index] };
		const year = parseInt(value);
		round.songFilters = {
			...round.songFilters,
			yearMax: isNaN(year) ? undefined : year
		};
		newRounds[index] = round;
		onUpdateRounds?.(newRounds);
	}

	// Helper to get genre count label
	function getGenreCountLabel(round: RoundConfig): string {
		const genres = getGenresArray(round);
		if (genres.length === 0 || genres.length === CANONICAL_GENRES.length) {
			return 'Tous les genres';
		}
		return `${genres.length} genre${genres.length > 1 ? 's' : ''}`;
	}

	// Helper to get year range label
	function getYearRangeLabel(round: RoundConfig): string {
		const min = round.songFilters?.yearMin;
		const max = round.songFilters?.yearMax;
		if (!min && !max) return 'Toutes les années';
		if (min && max) return `${min} - ${max}`;
		if (min) return `Depuis ${min}`;
		return `Jusqu'à ${max}`;
	}

	const audioOptions = [
		{ value: 'master' as const, label: 'Maître' },
		{ value: 'players' as const, label: 'Joueurs' },
		{ value: 'all' as const, label: 'Tous' }
	];
</script>

<div class="config-summary">
	<div class="summary-header">
		<span class="preset-badge">{presetName}</span>
	</div>

	<!-- Rounds list - clickable for inline editing -->
	<div class="rounds-list">
		{#each rounds as round, index}
			{@const modeInfo = getModeInfo(round.modeType)}
			{@const isExpanded = expandedRoundIndex === index}
			<div class="round-wrapper">
				<button
					type="button"
					class="round-card"
					class:expanded={isExpanded}
					onclick={() => toggleRoundExpand(index)}
				>
					<div class="round-number">Manche {index + 1}</div>
					<div class="round-details">
						<span class="round-mode">
							<span class="mode-icon">{modeInfo?.icon || '🎵'}</span>
							<span class="mode-name">{modeInfo?.name || round.modeType}</span>
						</span>
						<span class="round-songs">{round.songFilters?.songCount || 5} titres</span>
						<span class="expand-icon">{isExpanded ? '▲' : '▼'}</span>
					</div>
				</button>

				{#if isExpanded}
					<div class="round-editor">
						<!-- Mode selector -->
						<div class="editor-row">
							<span class="editor-label">Mode</span>
							<div class="mode-chips">
								{#each modeTypes as mode}
									<button
										type="button"
										class="mode-chip"
										class:active={round.modeType === mode.value}
										class:disabled={mode.disabled}
										onclick={(e) => {
											e.stopPropagation();
											if (!mode.disabled) updateRoundMode(index, mode.value);
										}}
										disabled={mode.disabled}
									>
										<span>{mode.icon}</span>
										<span>{mode.label}</span>
									</button>
								{/each}
							</div>
						</div>

						<!-- Song count -->
						<div class="editor-row">
							<span class="editor-label">Titres</span>
							<div class="song-stepper">
								<button
									type="button"
									class="stepper-btn"
									onclick={(e) => { e.stopPropagation(); updateSongCount(index, -1); }}
									disabled={(round.songFilters?.songCount || 5) <= 1}
								>−</button>
								<span class="stepper-value">{round.songFilters?.songCount || 5}</span>
								<button
									type="button"
									class="stepper-btn"
									onclick={(e) => { e.stopPropagation(); updateSongCount(index, 1); }}
									disabled={(round.songFilters?.songCount || 5) >= 20}
								>+</button>
							</div>
						</div>

						<!-- Genre filter -->
						<div class="filter-section">
							<div class="filter-header">
								<span class="filter-label">🎵 Genres</span>
								<span class="filter-summary">{getGenreCountLabel(round)}</span>
							</div>
							<div class="genre-grid">
								{#each CANONICAL_GENRES as genre}
									{@const roundGenres = getGenresArray(round)}
									{@const isSelected = roundGenres.includes(genre)}
									{@const isEmpty = roundGenres.length === 0}
									<button
										type="button"
										class="genre-chip"
										class:selected={isSelected || isEmpty}
										onclick={(e) => { e.stopPropagation(); toggleGenre(index, genre); }}
									>
										{genre}
									</button>
								{/each}
							</div>
							<div class="genre-actions">
								<button type="button" class="genre-action" onclick={(e) => { e.stopPropagation(); selectAllGenres(index); }}>
									Tout sélectionner
								</button>
								<button type="button" class="genre-action" onclick={(e) => { e.stopPropagation(); clearAllGenres(index); }}>
									Tout désélectionner
								</button>
							</div>
						</div>

						<!-- Year range filter -->
						<div class="filter-section">
							<div class="filter-header">
								<span class="filter-label">📅 Années</span>
								<span class="filter-summary">{getYearRangeLabel(round)}</span>
							</div>
							<div class="year-range">
								<div class="year-input-group">
									<label class="year-label" for="year-min-{index}">De</label>
									<input
										id="year-min-{index}"
										type="number"
										class="year-input"
										placeholder="1960"
										min="1900"
										max="2030"
										value={round.songFilters?.yearMin || ''}
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => updateYearMin(index, e.currentTarget.value)}
									/>
								</div>
								<span class="year-separator">à</span>
								<div class="year-input-group">
									<label class="year-label" for="year-max-{index}">À</label>
									<input
										id="year-max-{index}"
										type="number"
										class="year-input"
										placeholder="2024"
										min="1900"
										max="2030"
										value={round.songFilters?.yearMax || ''}
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => updateYearMax(index, e.currentTarget.value)}
									/>
								</div>
							</div>
						</div>

						<!-- Delete round -->
						{#if rounds.length > 1}
							<button
								type="button"
								class="delete-round-btn"
								onclick={(e) => { e.stopPropagation(); removeRound(index); }}
							>
								Supprimer cette manche
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<!-- Add round button -->
		<button type="button" class="add-round-btn" onclick={addRound}>
			<span>+</span>
			<span>Ajouter une manche</span>
		</button>
	</div>

	<div class="stats-line">
		<span>{totalSongs} titres au total</span>
		<span class="separator">•</span>
		<span>~{estimatedMinutes} min</span>
	</div>

	<!-- Settings row: Audio + Penalty -->
	<div class="settings-row">
		<div class="setting-group">
			<span class="setting-label">🔊 Audio</span>
			<div class="setting-chips">
				{#each audioOptions as option}
					<button
						type="button"
						class="setting-chip"
						class:active={audioPlayback === option.value}
						onclick={() => onChangeAudio(option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="setting-group penalty-group">
			<span class="setting-label">⚠️ Malus</span>
			<div class="penalty-controls">
				<div class="penalty-amount" class:visible={penaltyEnabled}>
					<button
						type="button"
						class="penalty-stepper-btn"
						onclick={() => onChangePenaltyAmount(Math.max(1, penaltyAmount - 1))}
						disabled={penaltyAmount <= 1}
					>−</button>
					<span class="penalty-value">-{penaltyAmount}</span>
					<button
						type="button"
						class="penalty-stepper-btn"
						onclick={() => onChangePenaltyAmount(Math.min(5, penaltyAmount + 1))}
						disabled={penaltyAmount >= 5}
					>+</button>
				</div>
				<div class="setting-chips">
					<button
						type="button"
						class="setting-chip"
						class:active={!penaltyEnabled}
						onclick={() => onChangePenalty(false)}
					>
						Non
					</button>
					<button
						type="button"
						class="setting-chip"
						class:active={penaltyEnabled}
						onclick={() => onChangePenalty(true)}
					>
						Oui
					</button>
				</div>
			</div>
		</div>
	</div>

</div>

<style>
	.config-summary {
		background: white;
		border-radius: 16px;
		border: 1px solid rgba(18, 43, 59, 0.1);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.summary-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.preset-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.75rem;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.1), rgba(248, 192, 39, 0.1));
		border: 1px solid rgba(239, 76, 131, 0.2);
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-primary);
	}

	/* Rounds list - clickable for inline editing */
	.rounds-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.round-wrapper {
		display: flex;
		flex-direction: column;
	}

	.round-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.06), rgba(248, 192, 39, 0.06));
		border-radius: 12px;
		border: 1px solid rgba(239, 76, 131, 0.12);
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.round-card:hover {
		border-color: rgba(239, 76, 131, 0.25);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.1), rgba(248, 192, 39, 0.1));
	}

	.round-card.expanded {
		border-color: var(--aq-color-primary);
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.round-number {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--aq-color-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.round-details {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.round-mode {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		background: white;
		border-radius: 8px;
		border: 1px solid rgba(18, 43, 59, 0.1);
	}

	.mode-icon {
		font-size: 1rem;
	}

	.mode-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.round-songs {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--aq-color-muted);
	}

	.expand-icon {
		font-size: 0.7rem;
		color: var(--aq-color-muted);
		margin-left: 0.25rem;
	}

	/* Round editor (expanded) */
	.round-editor {
		background: rgba(239, 76, 131, 0.03);
		border: 1px solid var(--aq-color-primary);
		border-top: none;
		border-radius: 0 0 12px 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.editor-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.editor-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.mode-chips {
		display: flex;
		gap: 0.5rem;
	}

	.mode-chip {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 0.75rem;
		border-radius: 999px;
		border: 1.5px solid rgba(18, 43, 59, 0.15);
		background: white;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-chip:hover:not(.disabled) {
		border-color: var(--aq-color-primary);
	}

	.mode-chip.active {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.15), rgba(248, 192, 39, 0.15));
		color: var(--aq-color-primary);
		font-weight: 600;
	}

	.mode-chip.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.song-stepper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stepper-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1.5px solid rgba(18, 43, 59, 0.2);
		background: white;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stepper-btn:hover:not(:disabled) {
		border-color: var(--aq-color-primary);
		color: var(--aq-color-primary);
	}

	.stepper-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.stepper-value {
		min-width: 2rem;
		text-align: center;
		font-size: 1rem;
		font-weight: 700;
		color: var(--aq-color-deep);
	}

	.delete-round-btn {
		background: none;
		border: none;
		color: #dc2626;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		padding: 0.5rem;
		text-align: center;
		opacity: 0.7;
		transition: opacity 0.15s ease;
	}

	.delete-round-btn:hover {
		opacity: 1;
	}

	.add-round-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: transparent;
		border: 2px dashed rgba(18, 43, 59, 0.15);
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--aq-color-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-round-btn:hover {
		border-color: var(--aq-color-primary);
		color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.03);
	}

	.stats-line {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--aq-color-muted);
		flex-wrap: wrap;
		padding: 0.5rem 0;
	}

	.separator {
		opacity: 0.5;
	}

	/* Settings row: Audio + Penalty */
	.settings-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.setting-group {
		flex: 1;
		min-width: 140px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(18, 43, 59, 0.03);
		border-radius: 12px;
	}

	.setting-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		white-space: nowrap;
	}

	.setting-chips {
		display: flex;
		gap: 0.35rem;
	}

	.setting-chip {
		padding: 0.4rem 0.7rem;
		border-radius: 999px;
		border: 1.5px solid rgba(18, 43, 59, 0.15);
		background: white;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.setting-chip:hover {
		border-color: var(--aq-color-primary);
	}

	.setting-chip.active {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.15), rgba(248, 192, 39, 0.15));
		color: var(--aq-color-primary);
		font-weight: 600;
	}

	/* Filter sections */
	.filter-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(239, 76, 131, 0.1);
	}

	.filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.filter-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.filter-summary {
		font-size: 0.8rem;
		color: var(--aq-color-muted);
		background: rgba(18, 43, 59, 0.05);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	/* Genre grid */
	.genre-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.genre-chip {
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		border: 1px solid rgba(18, 43, 59, 0.15);
		background: white;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--aq-color-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.genre-chip:hover {
		border-color: var(--aq-color-primary);
	}

	.genre-chip.selected {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.12), rgba(248, 192, 39, 0.12));
		color: var(--aq-color-primary);
		font-weight: 600;
	}

	.genre-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.genre-action {
		background: none;
		border: none;
		font-size: 0.75rem;
		color: var(--aq-color-muted);
		cursor: pointer;
		padding: 0.25rem;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.genre-action:hover {
		color: var(--aq-color-primary);
	}

	/* Year range */
	.year-range {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.year-input-group {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.year-label {
		font-size: 0.8rem;
		color: var(--aq-color-muted);
	}

	.year-input {
		width: 80px;
		padding: 0.4rem 0.5rem;
		border: 1.5px solid rgba(18, 43, 59, 0.15);
		border-radius: 8px;
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--aq-color-deep);
		background: white;
		text-align: center;
	}

	.year-input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
	}

	.year-input::placeholder {
		color: var(--aq-color-muted);
		opacity: 0.6;
	}

	.year-separator {
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	/* Penalty controls layout */
	.penalty-group {
		flex-wrap: nowrap;
	}

	.penalty-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Penalty amount stepper */
	.penalty-amount {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.15s ease, visibility 0.15s ease;
	}

	.penalty-amount.visible {
		opacity: 1;
		visibility: visible;
	}

	.penalty-stepper-btn {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 1px solid rgba(18, 43, 59, 0.2);
		background: white;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.penalty-stepper-btn:hover:not(:disabled) {
		border-color: var(--aq-color-primary);
		color: var(--aq-color-primary);
	}

	.penalty-stepper-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.penalty-value {
		min-width: 1.5rem;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
		color: #dc2626;
	}

	@media (max-width: 640px) {
		.settings-row {
			flex-direction: column;
		}

		.setting-group {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.setting-chips {
			justify-content: center;
		}

		.round-card {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.round-details {
			width: 100%;
			justify-content: space-between;
		}

		.year-range {
			flex-wrap: wrap;
		}

		.genre-grid {
			max-height: 200px;
			overflow-y: auto;
		}
	}
</style>
