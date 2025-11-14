<script lang="ts">
	// Props
	interface Props {
		hasBuzzed: boolean;
		answerTimeRemaining: number;
	}

	const { hasBuzzed, answerTimeRemaining }: Props = $props();
</script>

<div class="fast-buzz-ui">
	{#if hasBuzzed}
		<div class="waiting-validation">
			<div class="pulse-icon">⏳</div>
			<p class="status-text">Attente validation du maître...</p>
			<div class="timer">
				<span>{answerTimeRemaining}s</span>
			</div>
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
		margin: 1rem 0 0.5rem 0;
	}

	.timer {
		background: rgba(239, 76, 131, 0.15);
		border-radius: 999px;
		padding: 0.5rem 1.25rem;
		display: inline-block;
		font-weight: 700;
		color: var(--aq-color-primary);
		font-size: 1.25rem;
		margin: 0.5rem 0;
	}

	.instruction {
		font-size: 0.9rem;
		color: rgba(18, 43, 59, 0.6);
		margin-top: 1rem;
		font-style: italic;
	}
</style>
