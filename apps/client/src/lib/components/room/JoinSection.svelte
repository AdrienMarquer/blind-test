<script lang="ts">
	/**
	 * JoinSection Component
	 * Displays join form for players or current player status
	 */
	import type { Player } from '@blind-test/shared';

	interface Props {
		currentPlayer: Player | null;
		playerName: string;
		joining: boolean;
		onJoin: () => void;
		onLeave?: () => void;
	}

	let {
		currentPlayer,
		playerName = $bindable(),
		joining,
		onJoin,
		onLeave
	}: Props = $props();
</script>


{#if !currentPlayer}
	<section class="join-section">
		<h2>Rejoindre la salle</h2>
		<form onsubmit={(e) => { e.preventDefault(); onJoin(); }}>
			<input
				type="text"
				placeholder="Entre ton pseudo"
				bind:value={playerName}
				disabled={joining}
				required
			/>
			<button type="submit" disabled={joining || !playerName.trim()}>
				{joining ? 'Connexion...' : 'Rejoindre'}
			</button>
		</form>
	</section>
{:else}
	<section class="player-status">
		<div class="status-card">
			<span class="status-icon">✅</span>
			<div class="status-info">
				<h3>Tu joues en tant que :</h3>
				<p class="player-name-display">{currentPlayer.name}</p>
			</div>
			{#if onLeave}
				<button class="leave-button" onclick={onLeave}>Quitter la salle</button>
			{/if}
		</div>
	</section>
{/if}

<style>
	.join-section {
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 2rem;
		margin-top: 1rem;
	}

	.join-section h2 {
		font-size: 1.5rem;
		color: #1f2937;
		margin-bottom: 1rem;
	}

	form {
		display: flex;
		gap: 1rem;
	}

	input {
		flex: 1;
		padding: 0.75rem;
		font-size: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	input:disabled {
		background: #f3f4f6;
		cursor: not-allowed;
	}

	button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background: #3b82f6;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:hover:not(:disabled) {
		background: #2563eb;
	}

	button:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.player-status {
		margin-top: 1rem;
	}

	.status-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: white;
		border: 2px solid #10b981;
		border-radius: 0.75rem;
	}

	.status-icon {
		font-size: 2rem;
	}

	.status-info h3 {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0 0 0.25rem 0;
	}

	.player-name-display {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0;
	}

	.leave-button {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		background: #ef4444;
		margin-left: auto;
	}

	.leave-button:hover:not(:disabled) {
		background: #dc2626;
	}
</style>
