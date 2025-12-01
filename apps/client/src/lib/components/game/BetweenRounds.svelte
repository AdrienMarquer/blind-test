<script lang="ts">
	/**
	 * BetweenRounds Component
	 * Displays scores and next round info between rounds
	 */

	import { getModeDisplayName, getMediaDisplayName } from '$lib/presets';

	interface Score {
		playerId: string;
		playerName: string;
		score: number;
		rank: number;
		averageAnswerTime?: number;
	}

	interface Props {
		completedRoundIndex: number;
		nextRoundIndex: number;
		nextRoundMode: string;
		nextRoundMedia: string;
		scores: Score[];
		isMaster: boolean;
		onStartNextRound: () => void;
	}

	let {
		completedRoundIndex,
		nextRoundIndex,
		nextRoundMode,
		nextRoundMedia,
		scores,
		isMaster,
		onStartNextRound
	}: Props = $props();

	// Sort scores by rank
	let sortedScores = $derived(scores.slice().sort((a, b) => a.rank - b.rank));

	// Detect if there are any tiebreakers (players with same score but different ranks)
	let hasTiebreaker = $derived(() => {
		for (let i = 0; i < sortedScores.length - 1; i++) {
			if (sortedScores[i].score === sortedScores[i + 1].score) {
				return true;
			}
		}
		return false;
	});

	// Loading state for starting next round
	let isStartingRound = $state(false);

	function handleStartNextRound() {
		isStartingRound = true;
		onStartNextRound();
	}
</script>

<div class="between-rounds">
	<div class="header">
		<h2>Manche {completedRoundIndex + 1} terminée !</h2>
		<p class="subtitle">Préparation de la manche {nextRoundIndex + 1}</p>
	</div>

	<div class="content-grid">
		<!-- Leaderboard -->
		<div class="leaderboard-section">
			<h3>Résultats manche {completedRoundIndex + 1}</h3>
			<div class="leaderboard">
				{#each sortedScores as score, index}
					{@const prevScore = index > 0 ? sortedScores[index - 1] : null}
					{@const nextScore = index < sortedScores.length - 1 ? sortedScores[index + 1] : null}
					{@const isTied = (prevScore && prevScore.score === score.score) || (nextScore && nextScore.score === score.score)}
					<div class="leaderboard-item" class:winner={index === 0}>
						<div class="rank-badge">
							{#if index === 0}
								🏆
							{:else if index === 1}
								🥈
							{:else if index === 2}
								🥉
							{:else}
								#{score.rank}
							{/if}
						</div>
						<div class="player-info">
							<span class="player-name">{score.playerName}</span>
							{#if isTied && score.averageAnswerTime !== undefined}
								<span class="player-time">⏱ {(score.averageAnswerTime / 1000).toFixed(1)}s</span>
							{/if}
						</div>
						<div class="player-score">{score.score} pts</div>
					</div>
				{/each}
			</div>
			{#if hasTiebreaker()}
				<p class="tiebreaker-note">⏱ En cas d'égalité, le temps de réponse moyen départage les joueurs.</p>
			{/if}
		</div>

		<!-- Next Round Preview -->
		<div class="next-round-section">
			<h3>Prochaine manche</h3>
			<div class="next-round-card">
				<div class="round-number">Manche {nextRoundIndex + 1}</div>
				<div class="round-details">
					<div class="detail-row">
						<span class="label">Mode :</span>
						<span class="mode-badge">{getModeDisplayName(nextRoundMode)}</span>
					</div>
					<div class="detail-row">
						<span class="label">Support :</span>
						<span class="media-badge">{getMediaDisplayName(nextRoundMedia)}</span>
					</div>
				</div>

				{#if isMaster}
					<button
						class="start-next-btn"
						class:loading={isStartingRound}
						onclick={handleStartNextRound}
						disabled={isStartingRound}
					>
						{#if isStartingRound}
							<span class="btn-spinner"></span>
							Chargement...
						{:else}
							Lancer la manche {nextRoundIndex + 1}
						{/if}
					</button>
				{:else}
					<div class="waiting-message">
						<div class="spinner"></div>
						<p>En attente du maître du jeu...</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.between-rounds {
		padding: 2rem;
		border-radius: 32px;
		background: rgba(255, 255, 255, 0.95);
		box-shadow: var(--aq-shadow-soft);
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.header h2 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		color: var(--aq-color-deep);
	}

	.content-grid {
		display: grid;
		gap: 2rem;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	}

	.leaderboard-section,
	.next-round-section {
		border-radius: 24px;
		padding: 1.5rem;
		background: rgba(18, 43, 59, 0.04);
	}

	.leaderboard-section h3,
	.next-round-section h3 {
		margin: 0 0 1.25rem 0;
		font-size: 1.3rem;
		color: var(--aq-color-deep);
	}

	.leaderboard {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.leaderboard-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 2px 8px rgba(18, 43, 59, 0.06);
	}

	.next-round-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.round-number {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--aq-color-primary);
		text-align: center;
	}

	.round-details {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.7);
		border-radius: 12px;
	}

	.label {
		font-weight: 600;
		color: var(--aq-color-muted);
	}

	.mode-badge,
	.media-badge {
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.start-next-btn {
		border: none;
		border-radius: 14px;
		padding: 1rem 2rem;
		font-weight: 600;
		font-size: 1.1rem;
		cursor: pointer;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: #fff;
		margin-top: 0.5rem;
		transition: transform 150ms ease, box-shadow 150ms ease;
	}

	.start-next-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(239, 76, 131, 0.3);
	}

	.start-next-btn:disabled {
		cursor: not-allowed;
		opacity: 0.8;
	}

	.start-next-btn.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn-spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.subtitle {
		color: var(--aq-color-muted);
		margin: 0;
		font-size: 1.1rem;
	}

	.rank-badge {
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: rgba(239, 76, 131, 0.1);
		display: grid;
		place-items: center;
		font-size: 1.3rem;
		flex-shrink: 0;
	}

	.player-info {
		flex: 1;
	}

	.player-name {
		font-weight: 600;
		font-size: 1.05rem;
		color: var(--aq-color-deep);
	}

	.player-time {
		font-size: 0.85rem;
		color: var(--aq-color-muted);
		margin-left: 0.5rem;
	}

	.tiebreaker-note {
		margin: 1rem 0 0 0;
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
		background: rgba(18, 43, 59, 0.04);
		border-radius: 12px;
		text-align: center;
	}

	.player-score {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--aq-color-primary);
		white-space: nowrap;
	}

	.waiting-message {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(18, 43, 59, 0.05);
		border-radius: 12px;
		margin-top: 0.5rem;
	}

	.waiting-message p {
		margin: 0;
		color: var(--aq-color-muted);
		font-weight: 500;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 3px solid rgba(18, 43, 59, 0.1);
		border-top-color: var(--aq-color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
