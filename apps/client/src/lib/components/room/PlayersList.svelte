<script lang="ts">
	import type { Player, Room } from '@blind-test/shared';

	interface Props {
		players: Player[];
		room: Room;
		isMaster: boolean;
		masterPlaying?: { playing: boolean; playerName: string | null } | null;
		onRemovePlayer?: (playerId: string) => void;
	}

	let { players, room, isMaster, masterPlaying, onRemovePlayer }: Props = $props();

	// Sort players: connected first, then by score, then alphabetically
	// Filter out master player if they're shown via masterPlaying (to avoid duplicate)
	const sortedPlayers = $derived(
		players
			.filter(p => !(masterPlaying?.playing && p.id === room.masterPlayerId))
			.slice()
			.sort((a, b) => {
				if (a.connected === b.connected) {
					if (a.score === b.score) {
						return a.name.localeCompare(b.name);
					}
					return b.score - a.score;
				}
				return Number(b.connected) - Number(a.connected);
			})
	);

	// Total player count (master is already included in players array when playing)
	const totalPlayers = $derived(players.length);

	// Check if there are any players to show (including master playing)
	const hasPlayersToShow = $derived(
		totalPlayers > 0 || (masterPlaying?.playing && masterPlaying.playerName)
	);

	// Get master player's score from the players array
	const masterPlayerScore = $derived(
		players.find(p => p.id === room.masterPlayerId)?.score ?? 0
	);
</script>

<section class="players-section">
	{#if !hasPlayersToShow}
		<p class="empty">Aucun joueur pour l'instant. Lance-toi !</p>
	{:else}
		<div class="players-list">
			<!-- Master player entry (shown first with special styling) -->
			{#if masterPlaying?.playing && masterPlaying.playerName}
				<div class="player-chip master-player">
					<div class="chip-avatar master">
						{masterPlaying.playerName.slice(0, 2).toUpperCase()}
					</div>
					<div class="chip-info">
						<strong>{masterPlaying.playerName}</strong>
						<span class="master-badge">Maître du jeu</span>
					</div>
					<span class="chip-score">{masterPlayerScore} pts</span>
				</div>
			{/if}

			<!-- Regular players -->
			{#each sortedPlayers as player (player.id)}
				<div class="player-chip" class:offline={!player.connected}>
					<div class="chip-avatar">
						{player.name.slice(0, 2).toUpperCase()}
					</div>
					<div class="chip-info">
						<strong>{player.name}</strong>
						<span>{player.connected ? 'Connecté' : 'Hors ligne'}</span>
					</div>
					<span class="chip-score">{player.score} pts</span>
					{#if room.status === 'lobby' && isMaster && onRemovePlayer}
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
		width: 100%;
	}

	.empty {
		text-align: center;
		padding: 1rem;
		color: var(--aq-color-muted);
	}

	.players-list {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.player-chip {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.85rem;
		border-radius: var(--aq-radius-lg);
		background: rgba(18, 43, 59, 0.05);
		border: 1px solid rgba(18, 43, 59, 0.08);
		position: relative;
	}

	.player-chip.offline {
		opacity: 0.6;
	}

	/* Master player special styling */
	.player-chip.master-player {
		background: linear-gradient(135deg, rgba(244, 122, 32, 0.15), rgba(248, 192, 39, 0.15));
		border: 2px solid rgba(244, 122, 32, 0.4);
		box-shadow: 0 2px 8px rgba(244, 122, 32, 0.15);
	}

	.chip-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.2), rgba(244, 122, 32, 0.2));
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--aq-color-deep);
	}

	.chip-avatar.master {
		background: linear-gradient(135deg, #f47a20, #f8c027);
		color: white;
	}

	.chip-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.chip-info strong {
		color: var(--aq-color-deep);
	}

	.chip-info span {
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	.master-badge {
		color: #f47a20 !important;
		font-weight: 600;
	}

	.chip-score {
		font-weight: 700;
		color: var(--aq-color-deep);
	}

	.remove-button {
		padding: 0.4rem 0.75rem;
		background: #f44336;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.85rem;
		transition: background 0.2s;
	}

	.remove-button:hover {
		background: #d32f2f;
	}
</style>
