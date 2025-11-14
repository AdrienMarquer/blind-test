<script lang="ts">
	/**
	 * QRSection Component
	 * Displays QR code for players to join the room
	 */

	interface Props {
		qrCode: string;
	}

	let { qrCode }: Props = $props();
</script>

<section class="qr-section">
	<div class="qr-container">
		<h2>📱 Scanne pour rejoindre</h2>
		<img src={qrCode} alt="QR code pour rejoindre la salle" class="qr-code" />
		<p class="qr-hint">
			Les joueurs peuvent scanner ce QR code avec leur téléphone pour rejoindre la salle
		</p>
	</div>
</section>

<style>
	.qr-section {
		margin-top: 1rem;
	}

	.qr-container {
		text-align: center;
		padding: 2rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
	}

	.qr-container h2 {
		font-size: 1.25rem;
		color: #1f2937;
		margin-bottom: 1rem;
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
</style>
