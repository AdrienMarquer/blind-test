<script lang="ts">
	/**
	 * PresetSelector Component
	 * Grid of preset cards for quick game configuration
	 */

	import type { RoundConfig } from '@blind-test/shared';
	import {
		gamePresets,
		getPresetForMasterPlaying,
		getTotalSongs,
		cloneRounds,
		type GamePreset
	} from '$lib/gamePresets';

	interface Props {
		masterPlaying: boolean;
		selectedPresetId: string | null;
		onSelect: (preset: GamePreset, rounds: RoundConfig[], audioPlayback: 'master' | 'players' | 'all') => void;
		onCustomize: () => void;
	}

	let { masterPlaying, selectedPresetId, onSelect, onCustomize }: Props = $props();

	// Get presets adjusted for master playing mode if needed
	const displayPresets = $derived(
		masterPlaying ? gamePresets.map(getPresetForMasterPlaying) : gamePresets
	);

	function handleSelect(preset: GamePreset) {
		const adjustedPreset = masterPlaying ? getPresetForMasterPlaying(preset) : preset;
		onSelect(adjustedPreset, cloneRounds(adjustedPreset.rounds), adjustedPreset.audioPlayback);
	}

	function getRoundsSummary(preset: GamePreset): string {
		const buzzCount = preset.rounds.filter((r) => r.modeType === 'fast_buzz').length;
		const qcmCount = preset.rounds.filter((r) => r.modeType === 'buzz_and_choice').length;

		const parts = [];
		if (buzzCount > 0) parts.push(`${buzzCount} Buzz`);
		if (qcmCount > 0) parts.push(`${qcmCount} QCM`);
		return parts.join(' + ');
	}
</script>

<div class="preset-selector">
	<div class="preset-grid">
		{#each displayPresets as preset (preset.id)}
			{@const isSelected = selectedPresetId === preset.id}
			{@const totalSongs = getTotalSongs(preset.rounds)}
			<button
				type="button"
				class="preset-card"
				class:selected={isSelected}
				style="--preset-gradient: {preset.gradient}"
				onclick={() => handleSelect(preset)}
			>
				{#if isSelected}
					<div class="selected-badge">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
							<path d="M5 12l5 5L20 7" />
						</svg>
					</div>
				{/if}

				<div class="preset-icon">{preset.icon}</div>
				<h3 class="preset-name">{preset.name}</h3>
				<p class="preset-description">{preset.description}</p>

				<div class="preset-stats">
					<div class="stat">
						<span class="stat-value">{preset.rounds.length}</span>
						<span class="stat-label">manche{preset.rounds.length > 1 ? 's' : ''}</span>
					</div>
					<div class="stat-separator"></div>
					<div class="stat">
						<span class="stat-value">{totalSongs}</span>
						<span class="stat-label">titres</span>
					</div>
					<div class="stat-separator"></div>
					<div class="stat">
						<span class="stat-value">~{preset.estimatedMinutes}</span>
						<span class="stat-label">min</span>
					</div>
				</div>

				<div class="preset-modes">
					{getRoundsSummary(preset)}
				</div>
			</button>
		{/each}
	</div>

	<button type="button" class="customize-card" onclick={onCustomize}>
		<div class="customize-icon">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 3v18M3 12h18" />
			</svg>
		</div>
		<div class="customize-content">
			<h3>Personnaliser</h3>
			<p>Crée ta propre configuration</p>
		</div>
		<svg class="customize-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M9 18l6-6-6-6" />
		</svg>
	</button>
</div>

<style>
	.preset-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
	}

	.preset-card {
		position: relative;
		background: var(--preset-gradient);
		border: none;
		border-radius: 20px;
		padding: 1.5rem;
		color: white;
		text-align: left;
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 200px;
	}

	.preset-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
	}

	.preset-card.selected {
		outline: 3px solid white;
		outline-offset: 3px;
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
	}

	.selected-badge {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 28px;
		height: 28px;
		background: white;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #22c55e;
	}

	.preset-icon {
		font-size: 2.5rem;
		margin-bottom: 0.25rem;
	}

	.preset-name {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}

	.preset-description {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.9;
	}

	.preset-stats {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 0.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 700;
	}

	.stat-label {
		font-size: 0.7rem;
		opacity: 0.85;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-separator {
		width: 1px;
		height: 24px;
		background: rgba(255, 255, 255, 0.3);
	}

	.preset-modes {
		font-size: 0.75rem;
		opacity: 0.85;
		background: rgba(255, 255, 255, 0.15);
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		width: fit-content;
	}

	.customize-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: white;
		border: 2px dashed rgba(18, 43, 59, 0.2);
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.customize-card:hover {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.03);
	}

	.customize-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(18, 43, 59, 0.05);
		border-radius: 12px;
		color: var(--aq-color-muted);
		flex-shrink: 0;
	}

	.customize-card:hover .customize-icon {
		background: rgba(239, 76, 131, 0.1);
		color: var(--aq-color-primary);
	}

	.customize-content {
		flex: 1;
	}

	.customize-content h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.customize-content p {
		margin: 0.25rem 0 0 0;
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	.customize-arrow {
		color: var(--aq-color-muted);
		flex-shrink: 0;
	}

	.customize-card:hover .customize-arrow {
		color: var(--aq-color-primary);
	}

	@media (max-width: 640px) {
		.preset-grid {
			grid-template-columns: 1fr;
		}

		.preset-card {
			padding: 1.25rem;
			min-height: 160px;
		}

		.preset-icon {
			font-size: 2rem;
		}

		.preset-stats {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.stat-separator {
			display: none;
		}
	}
</style>
