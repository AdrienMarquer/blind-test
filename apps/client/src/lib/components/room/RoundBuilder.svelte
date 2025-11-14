<script lang="ts">
	/**
	 * RoundBuilder Component
	 * Allows creating multi-round games using presets or custom configuration
	 */

	import type { RoundConfig } from '@blind-test/shared';
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
		const newRound: RoundConfig = {
			modeType: 'buzz_and_choice',
			mediaType: 'music',
			songFilters: {
				songCount: 5
			},
			params: {
				songDuration: 30,
				answerTimer: 10,
				audioPlayback: 'master'
			}
		};
		rounds = [...rounds, newRound];
		onUpdateRounds(rounds);
	}

	// Remove a round
	function removeRound(index: number) {
		rounds = rounds.filter((_, i) => i !== index);
		onUpdateRounds(rounds);
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
				<h4>Manches ({rounds.length})</h4>
				{#if useCustom}
					<button class="add-round-btn" onclick={addRound}>+ Ajouter une manche</button>
				{/if}
			</div>

			<div class="rounds">
				{#each rounds as round, index}
					<div class="round-card">
					<div class="round-info">
						<div class="round-number">Manche {index + 1}</div>
							<div class="round-details">
								<span class="mode-badge">{getModeDisplayName(round.modeType)}</span>
								<span class="media-badge">{getMediaDisplayName(round.mediaType)}</span>
								<span class="song-count">
									{round.songFilters?.songCount || round.songFilters?.songIds?.length || 0} morceaux
								</span>
							</div>
						</div>
						{#if useCustom}
							<button
								class="remove-btn"
								onclick={() => removeRound(index)}
								disabled={rounds.length === 1}
							>
								Supprimer
							</button>
						{/if}
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

	.add-round-btn,
	.remove-btn {
		border: none;
		border-radius: 12px;
		padding: 0.45rem 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.add-round-btn {
		background: rgba(239, 76, 131, 0.15);
		color: var(--aq-color-primary);
	}

	.remove-btn {
		background: rgba(239, 76, 131, 0.1);
		color: var(--aq-color-primary);
	}
</style>
