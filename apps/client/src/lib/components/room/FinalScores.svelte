<script lang="ts">
	import type { FinalScore } from '@blind-test/shared';

	interface Props {
		finalScores: FinalScore[];
		onPlayAgain?: () => void;
		onBackToLobby?: () => void;
	}

	let { finalScores, onPlayAgain, onBackToLobby }: Props = $props();

	// Get top 3 for podium display
	const topThree = $derived(finalScores.filter(s => s.rank <= 3));
	const remainingPlayers = $derived(finalScores.filter(s => s.rank > 3));
	const winner = $derived(finalScores[0]);
</script>

<div class="final-scores-container">
	<div class="scores-content">
		<!-- Header -->
		<div class="header">
			<div class="confetti">🎉</div>
			<h1 class="title">Partie terminée !</h1>
			{#if winner}
				<div class="winner-announcement">
					<span class="crown">👑</span>
					<span class="winner-name">{winner.playerName}</span>
					<span class="winner-label">remporte la victoire avec</span>
					<span class="winner-score">{winner.totalScore} points</span>
				</div>
			{/if}
		</div>

		<!-- Top 3 Podium -->
		{#if topThree.length > 0}
			<div class="podium-section">
				<h2 class="section-title">Top 3</h2>
				<div class="podium">
					{#each topThree as player, index (player.playerId)}
						<div class="podium-player" class:first={player.rank === 1} style="--delay: {index * 0.1}s">
							<div class="rank-badge rank-{player.rank}">
								{player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}
							</div>
							<div class="player-avatar">
								{player.playerName.slice(0, 2).toUpperCase()}
							</div>
							<div class="player-name">{player.playerName}</div>
							<div class="player-score">{player.totalScore} pts</div>
							<div class="player-stats">
								<span>✓ {player.correctAnswers}</span>
								<span>✗ {player.wrongAnswers}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- All Players List -->
		{#if remainingPlayers.length > 0}
			<div class="all-players-section">
				<h2 class="section-title">Classement complet</h2>
				<div class="players-list">
					{#each remainingPlayers as player, index (player.playerId)}
						<div class="player-card" style="--delay: {0.3 + index * 0.05}s">
							<div class="player-rank">#{player.rank}</div>
							<div class="player-info">
								<div class="info-header">
									<span class="name">{player.playerName}</span>
									<span class="score">{player.totalScore} pts</span>
								</div>
								<div class="info-stats">
									<span>✓ {player.correctAnswers} bonnes</span>
									<span>•</span>
									<span>✗ {player.wrongAnswers} erreurs</span>
									{#if player.averageAnswerTime > 0}
										<span>•</span>
										<span>⏱ {(player.averageAnswerTime / 1000).toFixed(1)}s</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="actions">
			{#if onBackToLobby}
				<button class="btn btn-secondary" onclick={onBackToLobby}>
					← Retour au lobby
				</button>
			{/if}
			{#if onPlayAgain}
				<button class="btn btn-primary" onclick={onPlayAgain}>
					↻ Nouvelle partie
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.final-scores-container {
		min-height: 100vh;
		padding: 2rem 1rem;
		overflow-y: auto;
	}

	.scores-content {
		max-width: 900px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* Header */
	.header {
		text-align: center;
		animation: slide-down 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes slide-down {
		from {
			opacity: 0;
			transform: translateY(-30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.confetti {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		animation: bounce 1s ease-in-out infinite;
	}

	@keyframes bounce {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-10px); }
	}

	.title {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		margin: 0 0 1.5rem 0;
	}

	.winner-announcement {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem;
		background: linear-gradient(135deg,
			rgba(239, 76, 131, 0.1),
			rgba(248, 192, 39, 0.1)
		);
		border-radius: 24px;
		border: 2px solid rgba(239, 76, 131, 0.2);
		margin: 0 auto;
		max-width: 500px;
	}

	.crown {
		font-size: 2.5rem;
	}

	.winner-name {
		font-size: 2rem;
		font-weight: 700;
		color: var(--aq-color-primary);
	}

	.winner-label {
		font-size: 1rem;
		color: var(--aq-color-deep);
		opacity: 0.7;
	}

	.winner-score {
		font-size: 1.8rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Section Titles */
	.section-title {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		margin: 0 0 1rem 0;
		text-align: center;
	}

	/* Podium Section */
	.podium-section {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		box-shadow: 0 4px 16px rgba(18, 43, 59, 0.08);
		animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
		animation-delay: 0.2s;
		animation-fill-mode: backwards;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.podium {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		justify-items: center;
	}

	.podium-player {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem;
		border-radius: 20px;
		background: rgba(18, 43, 59, 0.03);
		width: 100%;
		max-width: 250px;
		position: relative;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
		animation-delay: var(--delay);
		animation-fill-mode: backwards;
	}

	@keyframes pop-in {
		from {
			opacity: 0;
			transform: scale(0.8) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.podium-player:hover {
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(239, 76, 131, 0.15);
	}

	.podium-player.first {
		background: linear-gradient(135deg,
			rgba(239, 76, 131, 0.1),
			rgba(248, 192, 39, 0.1)
		);
		border: 2px solid rgba(239, 76, 131, 0.3);
	}

	.rank-badge {
		font-size: 2.5rem;
		line-height: 1;
	}

	.player-avatar {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-secondary));
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.8rem;
		font-weight: 700;
		box-shadow: 0 4px 12px rgba(239, 76, 131, 0.3);
	}

	.podium-player.first .player-avatar {
		width: 100px;
		height: 100px;
		font-size: 2.2rem;
	}

	.player-name {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		text-align: center;
	}

	.player-score {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--aq-color-primary);
	}

	.player-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
		color: rgba(18, 43, 59, 0.6);
	}

	/* All Players Section */
	.all-players-section {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		box-shadow: 0 4px 16px rgba(18, 43, 59, 0.08);
		animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
		animation-delay: 0.4s;
		animation-fill-mode: backwards;
	}

	.players-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 400px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	/* Custom scrollbar */
	.players-list::-webkit-scrollbar {
		width: 6px;
	}

	.players-list::-webkit-scrollbar-track {
		background: rgba(18, 43, 59, 0.05);
		border-radius: 10px;
	}

	.players-list::-webkit-scrollbar-thumb {
		background: rgba(239, 76, 131, 0.3);
		border-radius: 10px;
	}

	.players-list::-webkit-scrollbar-thumb:hover {
		background: rgba(239, 76, 131, 0.5);
	}

	.player-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 16px;
		background: rgba(18, 43, 59, 0.03);
		transition: all 0.2s ease;
		animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		animation-delay: var(--delay);
		animation-fill-mode: backwards;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateX(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.player-card:hover {
		background: rgba(239, 76, 131, 0.05);
		transform: translateX(4px);
	}

	.player-rank {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(18, 43, 59, 0.3);
		min-width: 40px;
		text-align: center;
	}

	.player-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.info-header .name {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.info-header .score {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--aq-color-primary);
		white-space: nowrap;
	}

	.info-stats {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: rgba(18, 43, 59, 0.6);
		flex-wrap: wrap;
	}

	/* Actions */
	.actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
		animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
		animation-delay: 0.6s;
		animation-fill-mode: backwards;
	}

	.btn {
		padding: 0.85rem 2rem;
		border-radius: 14px;
		border: none;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
	}

	.btn:active {
		transform: translateY(0);
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
	}

	.btn-secondary {
		background: rgba(18, 43, 59, 0.08);
		color: var(--aq-color-deep);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.final-scores-container {
			padding: 1.5rem 1rem;
		}

		.title {
			font-size: 2rem;
		}

		.winner-name {
			font-size: 1.5rem;
		}

		.winner-score {
			font-size: 1.4rem;
		}

		.podium {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.podium-player {
			max-width: 100%;
		}

		.podium-section,
		.all-players-section {
			padding: 1.5rem;
		}

		.players-list {
			max-height: 300px;
		}

		.actions {
			flex-direction: column;
			align-items: stretch;
		}

		.btn {
			justify-content: center;
		}
	}

	@media (max-width: 480px) {
		.player-card {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.player-rank {
			align-self: flex-start;
		}

		.info-header {
			width: 100%;
		}

		.info-stats {
			font-size: 0.8rem;
		}
	}
</style>
