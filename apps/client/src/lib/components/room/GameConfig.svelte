<script lang="ts">
	/**
	 * GameConfig Component
	 * Handles multi-round game configuration with presets
	 */

	import RoundBuilder from './RoundBuilder.svelte';
	import type { RoundConfig } from '@blind-test/shared';

	interface Props {
		songs: any[];
		rounds: RoundConfig[];
		audioPlayback: 'master' | 'players' | 'all';
		availableGenres: string[];
		starting: boolean;
		onUpdateRounds: (rounds: RoundConfig[]) => void;
		onStartGame: () => void;
		onCancel: () => void;
	}

	let {
		songs,
		rounds = $bindable(),
		audioPlayback = $bindable(),
		availableGenres,
		starting,
		onUpdateRounds,
		onStartGame,
		onCancel
	}: Props = $props();
</script>

<section class="config-section">
	<div class="config-header">
		<h2>Configuration de partie</h2>
	</div>

	<!-- Round Builder -->
	<div class="config-tabs">
		<RoundBuilder
			bind:rounds
			{songs}
			{availableGenres}
			{onUpdateRounds}
		/>
	</div>

	<!-- Audio Playback Location -->
	<div class="audio-section">
		<h3>🔊 Diffusion audio</h3>
		<div class="audio-options">
			<label class="audio-chip" class:active={audioPlayback === 'master'}>
				<input type="radio" bind:group={audioPlayback} value="master" />
				<span class="chip-label">Maître seul</span>
			</label>
			<label class="audio-chip" class:active={audioPlayback === 'players'}>
				<input type="radio" bind:group={audioPlayback} value="players" />
				<span class="chip-label">Joueurs seuls</span>
			</label>
			<label class="audio-chip" class:active={audioPlayback === 'all'}>
				<input type="radio" bind:group={audioPlayback} value="all" />
				<span class="chip-label">Tous</span>
			</label>
		</div>
	</div>

	<div class="config-actions">
		<button class="cancel-button" onclick={onCancel}>
			Annuler
		</button>
		<button
			class="start-button"
			onclick={onStartGame}
			disabled={starting || rounds.length === 0}
		>
			{starting
				? 'Lancement...'
				: `Lancer la partie (${rounds.length} ${rounds.length > 1 ? 'manches' : 'manche'})`}
		</button>
	</div>
</section>

<style>
	.config-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 24px;
		padding: 2rem;
		box-shadow: var(--aq-shadow-soft);
		border: 1px solid rgba(18, 43, 59, 0.08);
	}

	.config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.75rem;
	}

	.config-header h2 {
		margin: 0;
		font-size: 1.4rem;
		color: var(--aq-color-deep);
	}

	.config-tabs {
		margin-bottom: 2rem;
	}

	.config-tabs h3 {
		margin: 0 0 0.75rem 0;
		color: var(--aq-color-deep);
	}

	.audio-section {
		margin-bottom: 2rem;
		padding: 1.25rem;
		background: rgba(239, 76, 131, 0.05);
		border-radius: 16px;
		border: 1px solid rgba(239, 76, 131, 0.1);
	}

	.audio-section h3 {
		margin: 0 0 1rem 0;
		color: var(--aq-color-deep);
		font-size: 1rem;
	}

	.audio-options {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.audio-chip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		border-radius: 999px;
		border: 2px solid rgba(18, 43, 59, 0.15);
		background: white;
		cursor: pointer;
		transition: all 160ms ease;
		flex: 1;
		min-width: fit-content;
		justify-content: center;
	}

	.audio-chip:hover {
		border-color: var(--aq-color-primary);
		transform: translateY(-1px);
	}

	.audio-chip.active {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.15), rgba(248, 192, 39, 0.15));
		font-weight: 600;
	}

	.audio-chip input {
		margin: 0;
		cursor: pointer;
	}

	.chip-label {
		color: var(--aq-color-deep);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.config-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		border-top: 1px solid rgba(18, 43, 59, 0.08);
		padding-top: 1.75rem;
		margin-top: 0.25rem;
	}

	.cancel-button,
	.start-button {
		border-radius: 14px;
		padding: 0.85rem 1.75rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
	}

	.cancel-button {
		background: rgba(18, 43, 59, 0.08);
		color: var(--aq-color-deep);
	}

	.start-button {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: #fff;
	}

	.start-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.config-actions {
			flex-direction: column;
		}

		.cancel-button,
		.start-button {
			width: 100%;
		}
	}
</style>
