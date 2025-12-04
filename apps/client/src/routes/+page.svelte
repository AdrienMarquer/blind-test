<svelte:head>
	<title>Music Quiz - Crée ou rejoins une partie</title>
	<meta name="description" content="Lance un blind test musical et invite tes amis via QR code. Devine les artistes et titres pour marquer des points !" />
</svelte:head>

<script lang="ts">
	import { roomApi } from '$lib/api-helpers';
	import Logo from '$lib/components/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';
	import Card from '$lib/components/ui/Card.svelte';

	const isApiErrorResponse = (data: unknown): data is { error: string } =>
		!!data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string';

	let newRoomName = $state('');
	let roomCode = $state('');
	let error = $state<string | null>(null);
	let creating = $state(false);
	let joiningByCode = $state(false);

	async function createRoom() {
		if (!newRoomName.trim()) return;

		try {
			creating = true;
			error = null;

			const response = await roomApi.create(newRoomName.trim());
			const data = response.data;

			if (data && !isApiErrorResponse(data)) {
				const roomId = data.id;
				const masterToken = data.masterToken;

				if (masterToken) {
					window.location.href = `/room/${roomId}?token=${masterToken}`;
				} else {
					window.location.href = `/room/${roomId}`;
				}
			} else {
				error = data && isApiErrorResponse(data) ? data.error : 'Création impossible';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Création impossible';
			console.error('Error creating room:', err);
		} finally {
			creating = false;
		}
	}

	async function joinByCode() {
		if (!roomCode.trim()) return;

		try {
			joiningByCode = true;
			error = null;

			const response = await roomApi.getByCode(roomCode.trim().toUpperCase());
			const data = response.data;

			if (data && !isApiErrorResponse(data)) {
				window.location.href = `/room/${data.id}`;
			} else {
				error = data && isApiErrorResponse(data) ? data.error : 'Salle introuvable avec ce code';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Code de salle invalide';
			console.error('Error joining by code:', err);
		} finally {
			joiningByCode = false;
		}
	}
</script>

<div class="page-header">
	<Logo size={200} />
</div>

<div class="actions-grid">
	<Card title="Lancer une partie" subtitle="Donne un nom à ta salle et invite tes amis" icon="🚀">
		<form
			class="quick-create"
			onsubmit={(e) => { e.preventDefault(); createRoom(); }}
		>
			<InputField
				label={null}
				placeholder="Ex: Soirée Adri 🎵"
				bind:value={newRoomName}
				required
			/>
			<Button type="submit" variant="primary" size="lg" disabled={!newRoomName.trim()} loading={creating}>
				{creating ? 'Création...' : '✨ Créer ma salle'}
			</Button>
		</form>
		<div class="quick-info">
			<p>→ Tu obtiendras un <strong>QR code</strong> à scanner</p>
			<p>→ Configure les rounds et lance quand tout le monde est prêt</p>
		</div>
	</Card>

	<Card title="Rejoindre une partie" subtitle="Entre le code de la salle" icon="🎮">
		<form
			class="quick-create"
			onsubmit={(e) => { e.preventDefault(); joinByCode(); }}
		>
			<InputField
				label={null}
				placeholder="Ex: B7UN"
				bind:value={roomCode}
				required
			/>
			<Button type="submit" variant="secondary" size="lg" disabled={!roomCode.trim()} loading={joiningByCode}>
				{joiningByCode ? 'Connexion...' : '🚪 Rejoindre'}
			</Button>
		</form>
		<div class="quick-info">
			<p>→ Le code est affiché sur l'écran du maître</p>
			<p>→ Tu pourras aussi scanner le <strong>QR code</strong></p>
		</div>
	</Card>
</div>

{#if error}
	<div class="aq-feedback error">{error}</div>
{/if}

<style>
	.page-header {
		display: flex;
		align-items: center;
		overflow-x: visible;
	}

	.actions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1.5rem;
		width: 100%;
		margin: 0 auto 2.5rem;
	}

	.quick-create {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.quick-info {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--aq-color-border);
	}

	.quick-info p {
		margin: 0.5rem 0;
		color: var(--aq-color-muted);
		font-size: 0.95rem;
	}
</style>
