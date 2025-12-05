<script lang="ts">
	/**
	 * RoundTutorial Component
	 * Displays tutorial instructions at the start of each round based on game mode
	 */

	import type { ModeType, MediaType } from '@blind-test/shared';

	interface Props {
		roundIndex: number;
		modeType: ModeType;
		mediaType: MediaType;
		songCount: number;
		onDismiss: () => void;
	}

	let { roundIndex, modeType, mediaType, songCount, onDismiss }: Props = $props();

	// Tutorial content based on mode type
	const modeContent = $derived.by(() => {
		if (modeType === 'fast_buzz') {
			return {
				title: 'Buzz Éclair',
				icon: '⚡',
				description: 'Le premier qui buzze répond à voix haute !',
				steps: [
					{ icon: '🎵', text: 'Écoute la musique' },
					{ icon: '🔔', text: 'Buzze dès que tu reconnais le morceau' },
					{ icon: '🗣️', text: 'Dis le titre et l\'artiste à voix haute' },
					{ icon: '👑', text: 'Le maître valide ta réponse' }
				],
				tip: 'Attention : si tu te trompes, tu es éliminé pour cette musique !'
			};
		} else {
			return {
				title: 'QCM',
				icon: '📝',
				description: 'Buzze et choisis la bonne réponse parmi les propositions !',
				steps: [
					{ icon: '🎵', text: 'Écoute la musique' },
					{ icon: '🔔', text: 'Buzze quand tu penses connaître' },
					{ icon: '✅', text: 'Choisis l\'artiste parmi 4 options' },
					{ icon: '🎯', text: 'Puis choisis le titre du morceau' }
				],
				tip: 'Plus tu réponds vite, plus tu marques de points !'
			};
		}
	});

	// Media type label
	const mediaLabel = $derived(
		mediaType === 'music' ? 'musique' :
		mediaType === 'picture' ? 'image' :
		mediaType === 'video' ? 'vidéo' : 'question'
	);

	// Auto-dismiss after 5 seconds
	let autoDismissTimeout: number | null = null;
	$effect(() => {
		autoDismissTimeout = window.setTimeout(() => {
			onDismiss();
		}, 6000);

		return () => {
			if (autoDismissTimeout) {
				clearTimeout(autoDismissTimeout);
			}
		};
	});
</script>

<div class="tutorial-overlay" onclick={onDismiss} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onDismiss()}>
	<div class="tutorial-card" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="presentation">
		<!-- Header -->
		<div class="tutorial-header">
			<div class="round-badge">Manche {roundIndex + 1}</div>
			<div class="mode-badge">
				<span class="mode-icon">{modeContent.icon}</span>
				<span class="mode-name">{modeContent.title}</span>
			</div>
		</div>

		<!-- Mode Description -->
		<p class="tutorial-description">{modeContent.description}</p>

		<!-- Steps -->
		<div class="tutorial-steps">
			{#each modeContent.steps as step, i}
				<div class="step" style="animation-delay: {0.1 + i * 0.1}s">
					<span class="step-icon">{step.icon}</span>
					<span class="step-text">{step.text}</span>
				</div>
			{/each}
		</div>

		<!-- Tip -->
		<div class="tutorial-tip">
			<span class="tip-icon">💡</span>
			<span class="tip-text">{modeContent.tip}</span>
		</div>

		<!-- Song count info -->
		<div class="song-info">
			<span>{songCount} {mediaLabel}{songCount > 1 ? 's' : ''} à deviner</span>
		</div>

		<!-- Dismiss button -->
		<button class="dismiss-btn" onclick={onDismiss}>
			C'est parti !
		</button>

		<!-- Auto-dismiss progress bar -->
		<div class="auto-dismiss-bar">
			<div class="auto-dismiss-fill"></div>
		</div>
	</div>
</div>

<style>
	.tutorial-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(18, 43, 59, 0.85);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		padding: 1rem;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.tutorial-card {
		background: white;
		border-radius: 24px;
		padding: 2rem;
		max-width: 420px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.4s ease-out;
		position: relative;
		overflow: hidden;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(30px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.tutorial-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.round-badge {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.9rem;
	}

	.mode-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(18, 43, 59, 0.08);
		padding: 0.5rem 1rem;
		border-radius: 999px;
	}

	.mode-icon {
		font-size: 1.2rem;
	}

	.mode-name {
		font-weight: 700;
		color: var(--aq-color-deep);
		font-size: 0.9rem;
	}

	.tutorial-description {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		text-align: center;
		margin: 0 0 1.5rem 0;
		line-height: 1.4;
	}

	.tutorial-steps {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(239, 76, 131, 0.08);
		border-radius: 12px;
		animation: slideIn 0.3s ease-out both;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.step-icon {
		font-size: 1.3rem;
		flex-shrink: 0;
	}

	.step-text {
		font-size: 0.95rem;
		color: var(--aq-color-deep);
	}

	.tutorial-tip {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(248, 192, 39, 0.15);
		border-radius: 12px;
		margin-bottom: 1.25rem;
		border: 1px solid rgba(248, 192, 39, 0.3);
	}

	.tip-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.tip-text {
		font-size: 0.9rem;
		color: var(--aq-color-deep);
		line-height: 1.4;
	}

	.song-info {
		text-align: center;
		margin-bottom: 1.25rem;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.dismiss-btn {
		width: 100%;
		padding: 1rem 1.5rem;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		border: none;
		border-radius: 16px;
		font-size: 1.1rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 4px 16px rgba(239, 76, 131, 0.3);
	}

	.dismiss-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(239, 76, 131, 0.4);
	}

	.dismiss-btn:active {
		transform: translateY(0);
	}

	/* Auto-dismiss progress bar */
	.auto-dismiss-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: rgba(18, 43, 59, 0.1);
	}

	.auto-dismiss-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--aq-color-primary), var(--aq-color-accent));
		animation: shrink 6s linear forwards;
	}

	@keyframes shrink {
		from { width: 100%; }
		to { width: 0%; }
	}

	/* Responsive */
	@media (max-width: 480px) {
		.tutorial-card {
			padding: 1.5rem;
		}

		.tutorial-header {
			flex-direction: column;
			gap: 0.75rem;
			align-items: flex-start;
		}

		.tutorial-description {
			font-size: 1rem;
			text-align: left;
		}
	}
</style>
