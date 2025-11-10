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
		<h1 class="title">🏆 Game Over! 🏆</h1>

		{#if winner}
			<div class="winner-announcement">
				<p class="winner-text">Winner:</p>
				<p class="winner-name">{winner.playerName}</p>
				<p class="winner-score">{winner.totalScore} points</p>
			</div>
		{/if}

		<div class="leaderboard">
			<h2>Final Rankings</h2>
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
									✓ {score.correctAnswers} correct
								</span>
								<span class="stat">
									✗ {score.wrongAnswers} wrong
								</span>
								{#if score.averageAnswerTime > 0}
									<span class="stat">
										⏱ {(score.averageAnswerTime / 1000).toFixed(1)}s avg
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
					🔄 Play Again
				</button>
			{/if}
			{#if onBackToLobby}
				<button class="btn-secondary" onclick={onBackToLobby}>
					🏠 Back to Lobby
				</button>
			{/if}
		</div>
	</section>
</div>

<style>
	.final-scores-container {
		position: relative;
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
	}

	.confetti-wrapper {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 100px;
		pointer-events: none;
		overflow: hidden;
	}

	.confetti {
		position: absolute;
		font-size: 3rem;
		animation: confetti-fall 3s ease-in-out infinite;
		opacity: 0;
	}

	@keyframes confetti-fall {
		0% {
			transform: translateY(-100px) rotate(0deg);
			opacity: 1;
		}
		100% {
			transform: translateY(500px) rotate(360deg);
			opacity: 0;
		}
	}

	.final-scores {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 3rem 2rem;
		border-radius: 16px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		color: white;
		text-align: center;
	}

	.title {
		font-size: 2.5rem;
		font-weight: 800;
		margin-bottom: 2rem;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
	}

	.winner-announcement {
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		padding: 2rem;
		border-radius: 12px;
		margin-bottom: 2rem;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}

	.winner-text {
		font-size: 1.2rem;
		margin-bottom: 0.5rem;
		opacity: 0.9;
	}

	.winner-name {
		font-size: 2.5rem;
		font-weight: 800;
		margin-bottom: 0.5rem;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.4);
	}

	.winner-score {
		font-size: 1.5rem;
		font-weight: 600;
		opacity: 0.95;
	}

	.leaderboard {
		background: white;
		color: #333;
		padding: 2rem;
		border-radius: 12px;
		margin-bottom: 2rem;
	}

	.leaderboard h2 {
		font-size: 1.8rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		color: #667eea;
	}

	.rankings-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.ranking-card {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 1.5rem;
		background: #f8f9fa;
		border-radius: 8px;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.ranking-card:hover {
		transform: translateX(5px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.ranking-card.winner {
		background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
		box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
		font-weight: 700;
	}

	.ranking-card.podium {
		background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
	}

	.rank-medal {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-width: 60px;
	}

	.rank-number {
		font-size: 1.5rem;
		font-weight: 700;
		color: #667eea;
	}

	.medal {
		font-size: 2rem;
	}

	.player-details {
		flex: 1;
		text-align: left;
	}

	.player-name {
		font-size: 1.3rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.stats {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		color: #666;
	}

	.stat {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.stat strong {
		color: #667eea;
		font-size: 1.1rem;
	}

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn-primary,
	.btn-secondary {
		padding: 1rem 2rem;
		font-size: 1.1rem;
		font-weight: 600;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.btn-primary {
		background: white;
		color: #667eea;
	}

	.btn-primary:hover {
		background: #f8f9fa;
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		backdrop-filter: blur(10px);
	}

	.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: translateY(-2px);
	}

	@media (max-width: 640px) {
		.final-scores {
			padding: 2rem 1rem;
		}

		.title {
			font-size: 2rem;
		}

		.winner-name {
			font-size: 2rem;
		}

		.ranking-card {
			flex-direction: column;
			text-align: center;
		}

		.player-details {
			text-align: center;
		}

		.stats {
			justify-content: center;
		}

		.actions {
			flex-direction: column;
			width: 100%;
		}

		.btn-primary,
		.btn-secondary {
			width: 100%;
		}
	}
</style>
