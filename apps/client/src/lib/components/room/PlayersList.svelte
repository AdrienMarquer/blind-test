<script lang="ts">
	import type { Player, Room } from '@blind-test/shared';

	interface Props {
		players: Player[];
		room: Room;
		isMaster: boolean;
		onRemovePlayer: (playerId: string) => void;
	}

	let { players, room, isMaster, onRemovePlayer }: Props = $props();
</script>

<section class="players-section">
	<h2>Joueurs ({players.length}/{room.maxPlayers})</h2>

	{#if players.length === 0}
		<p class="empty">Aucun joueur pour l’instant. Lance-toi !</p>
	{:else}
		<div class="players-list">
			{#each players as player (player.id)}
				<div class="player-card" class:disconnected={!player.connected}>
					<div class="player-info">
						<span class="player-name">
							{player.name}
							{#if !player.connected}
								<span class="status-badge">Hors ligne</span>
							{/if}
						</span>
						<span class="player-score">Score : {player.score}</span>
					</div>
					{#if room.status === 'lobby' && isMaster}
						<button
							class="remove-button"
							onclick={() => onRemovePlayer(player.id)}
						>
							Retirer
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.players-section {
		background: white;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		margin-bottom: 2rem;
	}

	h2 {
		margin: 0 0 1.5rem 0;
		color: #333;
		font-size: 1.5rem;
	}

	.empty {
		text-align: center;
		color: #666;
		padding: 2rem;
		background: #f5f5f5;
		border-radius: 8px;
	}

	.players-list {
		display: grid;
		gap: 1rem;
	}

	.player-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: #f9f9f9;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.player-card:hover {
		background: #f0f0f0;
		transform: translateY(-2px);
	}

	.player-card.disconnected {
		opacity: 0.6;
		background: #fafafa;
	}

	.player-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.player-name {
		font-weight: 600;
		font-size: 1.1rem;
		color: #333;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.player-score {
		color: #666;
		font-size: 0.9rem;
	}

	.status-badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: #ff9800;
		color: white;
		border-radius: 12px;
		font-weight: 500;
	}

	.remove-button {
		padding: 0.5rem 1rem;
		background: #f44336;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		transition: background 0.2s;
	}

	.remove-button:hover {
		background: #d32f2f;
	}
</style>
