<script lang="ts">
	import type { FinalScore } from '@blind-test/shared';

	interface Props {
		finalScores: FinalScore[];
		onPlayAgain?: () => void;
	}

	let { finalScores, onPlayAgain }: Props = $props();

	function getRankDisplay(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return `#${rank}`;
	}
</script>

<div class="final-scores">
	<div class="card">
		<h1>Partie terminée !</h1>

		<div class="leaderboard">
			{#each finalScores as player (player.playerId)}
				<div class="row" class:top3={player.rank <= 3}>
					<span class="rank">{getRankDisplay(player.rank)}</span>
					<span class="name">{player.playerName}</span>
					<span class="score">{player.totalScore} pts</span>
				</div>
				<div class="stats">
					✓ {player.correctAnswers} · ✗ {player.wrongAnswers}
					{#if player.averageAnswerTime > 0}
						· ⏱ {(player.averageAnswerTime / 1000).toFixed(1)}s
					{/if}
				</div>
			{/each}
		</div>

		{#if onPlayAgain}
			<button class="restart-btn" onclick={onPlayAgain}>
				↻ Relancer la partie
			</button>
		{/if}
	</div>
</div>

<style>
	.final-scores {
		min-height: 80dvh;
		box-sizing: border-box;
		padding: 2rem 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.4s ease;
		overflow: visible;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.card {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		box-shadow: 0 4px 20px rgba(18, 43, 59, 0.1);
		width: 100%;
		max-width: 500px;
	}

	h1 {
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		text-align: center;
		margin: 0 0 1.5rem 0;
	}

	.leaderboard {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 0.75rem;
		border-radius: 12px;
		background: rgba(18, 43, 59, 0.03);
		min-width: 0; /* Allow flex children to shrink below content size */
	}

	.row.top3 {
		background: rgba(239, 76, 131, 0.08);
	}

	.rank {
		min-width: 2rem;
		flex-shrink: 0;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--aq-color-muted);
		text-align: center;
	}

	.row.top3 .rank {
		font-size: 1.4rem;
	}

	.name {
		flex: 1;
		min-width: 0; /* Allow text truncation */
		font-weight: 600;
		color: var(--aq-color-deep);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.score {
		flex-shrink: 0;
		font-weight: 700;
		color: var(--aq-color-primary);
		white-space: nowrap;
	}

	.stats {
		font-size: 0.8rem;
		color: var(--aq-color-muted);
		padding: 0 0.75rem 0.5rem 3.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.restart-btn {
		width: 100%;
		margin-top: 1.5rem;
		padding: 1rem;
		border: none;
		border-radius: 14px;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s, box-shadow 0.15s;
	}

	.restart-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(239, 76, 131, 0.3);
	}

	/* Mobile responsive */
	@media (max-width: 400px) {
		.card {
			padding: 1.5rem 1rem;
		}

		h1 {
			font-size: 1.5rem;
		}

		.row {
			gap: 0.4rem;
			padding: 0.6rem 0.5rem;
		}

		.rank {
			min-width: 1.8rem;
			font-size: 1rem;
		}

		.row.top3 .rank {
			font-size: 1.2rem;
		}

		.name {
			font-size: 0.95rem;
		}

		.score {
			font-size: 0.9rem;
		}

		.stats {
			padding-left: 2.7rem;
			font-size: 0.75rem;
		}
	}
</style>
