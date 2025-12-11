<script lang="ts">
	// Props
	interface Props {
		hasBuzzed: boolean;
		answerTimeRemaining: number;
		answerTimerMax: number;
	}

	const { hasBuzzed, answerTimeRemaining, answerTimerMax }: Props = $props();

	// Calculate progress percentage (0-100, decreasing)
	const timerProgress = $derived(answerTimerMax > 0 ? (answerTimeRemaining / answerTimerMax) * 100 : 0);
</script>

<div class="fast-buzz-ui">
	{#if hasBuzzed}
		<div class="waiting-validation">
			<div class="pulse-icon">⏳</div>
			<p class="status-text">Attente validation du maître...</p>
			{#if answerTimeRemaining > 0}
				<div class="timer-container">
					<div class="timer-bar">
						<div
							class="timer-fill"
							class:urgent={answerTimeRemaining <= 2}
							style="width: {timerProgress}%"
						></div>
					</div>
					<span class="timer-text" class:urgent={answerTimeRemaining <= 2}>{answerTimeRemaining}s</span>
				</div>
			{/if}
			<p class="instruction">Donne ta réponse à voix haute</p>
		</div>
	{/if}
</div>

<style>
	.fast-buzz-ui {
		text-align: center;
	}

	.waiting-validation {
		padding: 2rem 1rem;
		background: rgba(248, 192, 39, 0.08);
		border-radius: 24px;
		border: 2px dashed rgba(248, 192, 39, 0.3);
	}

	.pulse-icon {
		font-size: 3rem;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.7;
		}
	}

	.status-text {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		margin: 1rem 0 0.75rem 0;
	}

	.timer-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin: 0.75rem auto;
		max-width: 280px;
	}

	.timer-bar {
		flex: 1;
		height: 8px;
		background: rgba(18, 43, 59, 0.1);
		border-radius: 999px;
		overflow: hidden;
	}

	.timer-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--aq-color-primary), var(--aq-color-secondary));
		border-radius: 999px;
		transition: width 0.3s linear;
	}

	.timer-fill.urgent {
		background: linear-gradient(90deg, #ef4444, #f97316);
		animation: pulse-urgent 0.5s ease-in-out infinite;
	}

	@keyframes pulse-urgent {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.timer-text {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--aq-color-primary);
		min-width: 2.5rem;
		text-align: center;
	}

	.timer-text.urgent {
		color: #ef4444;
		animation: pulse-urgent 0.5s ease-in-out infinite;
	}

	.instruction {
		font-size: 0.9rem;
		color: rgba(18, 43, 59, 0.6);
		margin-top: 1rem;
		font-style: italic;
	}
</style>
