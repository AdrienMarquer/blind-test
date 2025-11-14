<script lang="ts">
	// Props
	interface Props {
		onSubmit: (titleAnswer: string, artistAnswer: string) => void;
		answerTimeRemaining: number;
	}

	const { onSubmit, answerTimeRemaining }: Props = $props();

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
		<div class="timer">
			<span>{answerTimeRemaining}s</span>
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
		margin-bottom: 0.5rem;
	}

	.timer {
		background: rgba(239, 76, 131, 0.15);
		border-radius: 999px;
		padding: 0.5rem 1.25rem;
		display: inline-block;
		font-weight: 700;
		color: var(--aq-color-primary);
		font-size: 1.25rem;
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
