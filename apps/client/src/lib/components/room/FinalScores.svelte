<script lang="ts">
	import type { FinalScore } from '@blind-test/shared';

	interface Props {
		finalScores: FinalScore[];
		onPlayAgain?: () => void;
		onBackToLobby?: () => void;
	}

	let { finalScores, onPlayAgain, onBackToLobby }: Props = $props();

	// Get winner (rank 1)
	const winner = $derived(finalScores.find(s => s.rank === 1));

	// Get medal emoji based on rank
	function getMedal(rank: number): string {
		switch (rank) {
			case 1: return '🥇';
			case 2: return '🥈';
			case 3: return '🥉';
			default: return '';
		}
	}
</script>

<div class="final-scores-container">
	<div class="confetti-wrapper">
		<!-- Confetti effect for winner -->
		{#if winner}
			<div class="confetti">🎉</div>
		{/if}
	</div>

	<section class="final-scores">
		<h1 class="title">🏆 Fin de partie ! 🏆</h1>

		{#if winner}
			<div class="winner-announcement">
				<p class="winner-text">Vainqueur :</p>
				<p class="winner-name">{winner.playerName}</p>
				<p class="winner-score">{winner.totalScore} points</p>
			</div>
		{/if}

		<div class="leaderboard">
			<h2>Classement final</h2>
			<div class="rankings-list">
				{#each finalScores as score (score.playerId)}
					<div class="ranking-card" class:winner={score.rank === 1} class:podium={score.rank <= 3}>
						<div class="rank-medal">
							<span class="rank-number">{score.rank}</span>
							<span class="medal">{getMedal(score.rank)}</span>
						</div>
						<div class="player-details">
							<p class="player-name">{score.playerName}</p>
							<div class="stats">
								<span class="stat">
									<strong>{score.totalScore}</strong> pts
								</span>
								<span class="stat">
									✓ {score.correctAnswers} bonnes réponses
								</span>
								<span class="stat">
									✗ {score.wrongAnswers} erreurs
								</span>
								{#if score.averageAnswerTime > 0}
									<span class="stat">
										⏱ {(score.averageAnswerTime / 1000).toFixed(1)}s de moyenne
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="actions">
			{#if onPlayAgain}
				<button class="btn-primary" onclick={onPlayAgain}>
					🔄 Relancer une partie
				</button>
			{/if}
			{#if onBackToLobby}
				<button class="btn-secondary" onclick={onBackToLobby}>
					🏠 Retour au lobby
				</button>
			{/if}
		</div>
	</section>
</div>

<style>
	.final-scores {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		border-radius: 32px;
		padding: 2rem;
		color: #fff;
		text-align: center;
		box-shadow: var(--aq-shadow-card);
	}

	.leaderboard {
		background: rgba(255, 255, 255, 0.95);
		color: var(--aq-color-deep);
		border-radius: 24px;
		padding: 1.5rem;
	}

	.ranking-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-radius: 18px;
		background: rgba(18, 43, 59, 0.05);
	}

	.ranking-card.winner {
		background: rgba(248, 192, 39, 0.15);
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}

	.btn-primary,
	.btn-secondary {
		border: none;
		border-radius: 16px;
		padding: 0.85rem 1.5rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.9);
		color: var(--aq-color-deep);
	}
</style>
