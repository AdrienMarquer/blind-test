<script lang="ts">
	import type { AnswerChoice } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';

	// Props
	interface Props {
		currentChoices: AnswerChoice[];
		answerType: 'title' | 'artist';
		answerTimeRemaining: number;
		onAnswer: (value: string) => void;
	}

	const { currentChoices, answerType, answerTimeRemaining, onAnswer }: Props = $props();
</script>

<div class="buzz-and-choice-ui">
	<!-- Question Header -->
	<div class="question-header">
		<p class="status-text">
			{answerType === 'title' ? '🎵 Choisis le titre' : "🎤 Choisis l'artiste"}
		</p>
		<div class="answer-timer">
			<span>{answerTimeRemaining}s</span>
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
				{choice.displayText}
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
		margin-bottom: 0.5rem;
	}

	.answer-timer {
		background: rgba(239, 76, 131, 0.15);
		border-radius: 999px;
		padding: 0.5rem 1.25rem;
		display: inline-block;
		font-weight: 700;
		color: var(--aq-color-primary);
		font-size: 1.25rem;
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
