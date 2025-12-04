<script lang="ts">
	/**
	 * QRSection Component
	 * Displays QR code for players to join the room
	 */

	interface Props {
		qrCode: string;
	}

	let { qrCode }: Props = $props();
	let showQr = $state(false);
</script>

<section class="qr-section">
	<div class="qr-container">
		<div class="qr-header">
			<div>
				<h2>📱 Scanne pour rejoindre</h2>
				<p class="qr-subtitle">Partage ce code quand les joueurs sont prêts à se connecter</p>
			</div>
			<button
				type="button"
				class="qr-toggle"
				onclick={() => (showQr = !showQr)}
				aria-expanded={showQr}
				aria-controls="room-qr-block"
			>
				{showQr ? 'Masquer' : 'Afficher'} le QR code
			</button>
		</div>

		{#if showQr}
			<div id="room-qr-block" class="qr-visual" aria-live="polite">
				<img src={qrCode} alt="QR code pour rejoindre la salle" class="qr-code" />
				<p class="qr-hint">
					Les joueurs peuvent scanner ce QR code avec leur téléphone pour rejoindre la salle
				</p>
			</div>
		{/if}
	</div>
</section>

<style>
	.qr-section {
		margin-top: 1rem;
	}

	.qr-container {
		text-align: center;
		padding: clamp(1rem, 3vw, 2rem);
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.qr-container h2 {
		font-size: 1.25rem;
		color: #1f2937;
		margin-bottom: 1rem;
	}

	.qr-subtitle {
		margin: 0;
		color: #6b7280;
		font-size: 0.9rem;
	}

	.qr-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		text-align: left;
	}

	.qr-toggle {
		border: 1px solid #d1d5db;
		background: transparent;
		color: #1f2937;
		border-radius: 999px;
		padding: 0.4rem 1rem;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
	}

	.qr-toggle:hover,
	.qr-toggle:focus-visible {
		background: #1f2937;
		color: #fff;
		border-color: #1f2937;
	}

	.qr-toggle:focus-visible {
		outline: 2px solid #1f2937;
		outline-offset: 3px;
	}

	.qr-visual {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.qr-code {
		max-width: 300px;
		width: 100%;
		height: auto;
		border: 4px solid #e5e7eb;
		border-radius: 0.5rem;
		margin: 0 auto;
		display: block;
	}

	.qr-hint {
		margin-top: 1rem;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.qr-hint.compact {
		margin: 0;
	}

	@media (max-width: 640px) {
		.qr-header {
			flex-direction: column;
			align-items: flex-start;
			text-align: left;
		}

		.qr-container {
			align-items: stretch;
			text-align: left;
		}

		.qr-code {
			max-width: 240px;
		}
	}
</style>
