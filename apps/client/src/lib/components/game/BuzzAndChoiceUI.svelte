<script lang="ts">
	import type { AnswerChoice } from '@blind-test/shared';

	// Props
	interface Props {
		currentChoices: AnswerChoice[];
		answerType: 'title' | 'artist';
		answerTimeRemaining: number;
		answerTimerMax: number;
		onAnswer: (value: string) => void;
		playerName?: string;
	}

	const { currentChoices, answerType, answerTimeRemaining, answerTimerMax, onAnswer, playerName }: Props = $props();

	// Easter egg: If player is "rodrigue" (case-insensitive), show middle finger emoji
	const isRodrigue = $derived(playerName?.toLowerCase() === 'rodrigue');

	// Calculate progress percentage (0-100, decreasing)
	const timerProgress = $derived(answerTimerMax > 0 ? (answerTimeRemaining / answerTimerMax) * 100 : 0);

	// Get display text for choices (with easter egg)
	function getDisplayText(choice: AnswerChoice): string {
		if (isRodrigue) {
			return '🖕';
		}
		return choice.displayText;
	}
</script>

<div class="buzz-and-choice-ui">
	<!-- Question Header -->
	<div class="question-header">
		<p class="status-text">
			{answerType === 'title' ? '🎵 Choisis le titre' : "🎤 Choisis l'artiste"}
		</p>
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
	</div>

	<!-- Multiple Choice Buttons -->
	<div class="choices">
		{#each currentChoices as choice}
			<button
				class="choice-button"
				onclick={(e) => {
					// Blur button to reset focus before title choices appear
					(e.currentTarget as HTMLButtonElement).blur();
					onAnswer(choice.displayText);
				}}
			>
				{getDisplayText(choice)}
			</button>
		{/each}
	</div>
</div>

<style>
	.buzz-and-choice-ui {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.question-header {
		text-align: center;
	}

	.status-text {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		margin-bottom: 0.75rem;
	}

	.timer-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.timer-bar {
		flex: 1;
		max-width: 200px;
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

	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	.choice-button {
		border: 1px solid rgba(18, 43, 59, 0.1);
		border-radius: 16px;
		padding: 0.85rem 1rem;
		background: rgba(18, 43, 59, 0.03);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 1rem;
	}

	.choice-button:hover {
		background: rgba(239, 76, 131, 0.08);
		border-color: var(--aq-color-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(239, 76, 131, 0.2);
	}

	.choice-button:active {
		transform: translateY(0);
	}
</style>
