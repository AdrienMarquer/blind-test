<script lang="ts">
	// Props
	interface Props {
		onSubmit: (titleAnswer: string, artistAnswer: string) => void;
		answerTimeRemaining: number;
		answerTimerMax: number;
	}

	const { onSubmit, answerTimeRemaining, answerTimerMax }: Props = $props();

	// Calculate progress percentage (0-100, decreasing)
	const timerProgress = $derived(answerTimerMax > 0 ? (answerTimeRemaining / answerTimerMax) * 100 : 0);

	let titleInput = $state('');
	let artistInput = $state('');

	function handleSubmit() {
		if (titleInput.trim() || artistInput.trim()) {
			onSubmit(titleInput, artistInput);
			titleInput = '';
			artistInput = '';
		}
	}
</script>

<div class="text-input-ui">
	<div class="input-header">
		<p class="status-text">✍️ Tape le titre et/ou l'artiste</p>
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

	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<div class="input-group">
			<label for="title-input">Titre</label>
			<input
				id="title-input"
				type="text"
				placeholder="Nom du titre..."
				bind:value={titleInput}
				class="text-input"
			/>
		</div>

		<div class="input-group">
			<label for="artist-input">Artiste</label>
			<input
				id="artist-input"
				type="text"
				placeholder="Nom de l'artiste..."
				bind:value={artistInput}
				class="text-input"
			/>
		</div>

		<button type="submit" class="submit-button" disabled={!titleInput.trim() && !artistInput.trim()}>
			Valider
		</button>
	</form>

	<p class="hint">Les petites fautes d'orthographe sont acceptées</p>
</div>

<style>
	.text-input-ui {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-header {
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

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-weight: 600;
		font-size: 0.9rem;
		color: rgba(18, 43, 59, 0.7);
	}

	.text-input {
		padding: 0.85rem 1rem;
		border: 2px solid rgba(18, 43, 59, 0.1);
		border-radius: 12px;
		font-size: 1rem;
		font-family: inherit;
		transition: all 0.2s ease;
	}

	.text-input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 3px rgba(239, 76, 131, 0.1);
	}

	.submit-button {
		padding: 1rem 2rem;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		border: none;
		border-radius: 16px;
		font-weight: 700;
		font-size: 1.1rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.submit-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(239, 76, 131, 0.3);
	}

	.submit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hint {
		text-align: center;
		font-size: 0.85rem;
		color: rgba(18, 43, 59, 0.5);
		font-style: italic;
	}
</style>
