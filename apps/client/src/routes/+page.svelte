<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import Logo from '$lib/components/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { Room } from '@blind-test/shared';

	type StatusTone = 'primary' | 'success' | 'warning' | 'neutral';

	const statusMeta: Record<Room['status'], { label: string; tone: StatusTone; icon: string; blurb: string }> = {
		lobby: { label: 'Lobby ouvert', tone: 'primary', icon: '🕹️', blurb: 'En attente de joueurs' },
		playing: { label: 'Partie en cours', tone: 'success', icon: '🎧', blurb: 'Le blind test bat son plein' },
		between_rounds: { label: 'Pause', tone: 'warning', icon: '⏱️', blurb: 'Transition de manche' },
		finished: { label: 'Terminée', tone: 'neutral', icon: '🏁', blurb: 'Prêt pour un replay' }
	};

	let rooms = $state<Room[]>([]);
	let newRoomName = $state('');
	let roomCode = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let creating = $state(false);
	let joiningByCode = $state(false);
	const roomsApi = api.api.rooms as Record<string, any>;

	const totalPlayers = $derived(rooms.reduce((sum, room) => sum + room.players.length, 0));
	const activeRooms = $derived(rooms.filter((room) => room.status === 'playing').length);
	const sortedRooms = $derived([...rooms].sort((a, b) => a.name.localeCompare(b.name)));

	async function loadRooms() {
		try {
			loading = true;
			error = null;
			const response = await api.api.rooms.get();

			if (response.data) {
				rooms = response.data.rooms || [];
			} else {
				error = 'Impossible de charger les salles';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de charger les salles';
			console.error('Error loading rooms:', err);
		} finally {
			loading = false;
		}
	}

	async function createRoom() {
		if (!newRoomName.trim()) return;

		try {
			creating = true;
			error = null;

			const response = await api.api.rooms.post({
				name: newRoomName.trim()
			});

			if (response.data) {
				const roomId = response.data.id;
				const masterToken = (response.data as any).masterToken;

				if (masterToken) {
					window.location.href = `/room/${roomId}?token=${masterToken}`;
				} else {
					window.location.href = `/room/${roomId}`;
				}
			} else {
				error = 'Création impossible';
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

			const response = await roomsApi.code[roomCode.trim().toUpperCase()].get();

			if (response.data) {
				window.location.href = `/room/${response.data.id}`;
			} else {
				error = 'Salle introuvable avec ce code';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Code de salle invalide';
			console.error('Error joining by code:', err);
		} finally {
			joiningByCode = false;
		}
	}

	async function deleteRoom(roomId: string, roomName: string, e: Event) {
		e.preventDefault();
		e.stopPropagation();

		if (!confirm(`Supprimer la salle "${roomName}" ?`)) return;

		try {
			error = null;
			await roomsApi[roomId].delete();
			await loadRooms();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Suppression impossible';
			console.error('Error deleting room:', err);
		}
	}

	onMount(() => {
		loadRooms();
	});
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

{#if rooms.length > 0}
	<details class="rooms-collapsible">
		<summary>
			<span class="summary-content">
				<span class="summary-icon">📋</span>
				<div>
					<strong>Salles actives ({rooms.length})</strong>
					<p>Rejoindre ou gérer une salle existante</p>
				</div>
			</span>
			<span class="chevron">▼</span>
		</summary>
		<div class="rooms-content">
			<div class="rooms-actions-inline">
				<Button variant="ghost" size="sm" onclick={loadRooms} disabled={loading}>
					{loading ? '⟳' : '↻ Actualiser'}
				</Button>
			</div>

			{#if loading}
				<div class="skeleton-grid">
					<div class="skeleton-card"></div>
					<div class="skeleton-card"></div>
				</div>
			{:else}
				<div class="rooms-grid">
					{#each sortedRooms as room (room.id)}
						<a href="/room/{room.id}" class="room-card-mini">
							<div class="room-card-mini__header">
								<h4>{room.name}</h4>
								<StatusBadge tone={statusMeta[room.status].tone} icon={statusMeta[room.status].icon}>
									{statusMeta[room.status].label}
								</StatusBadge>
							</div>
							<div class="room-card-mini__meta">
								<span>🔑 <strong>{room.code}</strong></span>
								<span>👥 {room.players.length}/{room.maxPlayers}</span>
							</div>
							<button class="ghost-delete-mini" title="Supprimer" onclick={(e) => deleteRoom(room.id, room.name, e)} aria-label={`Supprimer ${room.name}`}>
								🗑️
							</button>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</details>
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

	.rooms-collapsible {
		margin-top: 3rem;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 20px;
		padding: 1.25rem 1.75rem;
		border: 1px solid var(--aq-color-border);
		box-shadow: var(--aq-shadow-soft);
	}

	.rooms-collapsible summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		justify-content: space-between;
		align-items: center;
		user-select: none;
	}

	.rooms-collapsible summary::-webkit-details-marker {
		display: none;
	}

	.summary-content {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.summary-icon {
		width: 50px;
		height: 50px;
		display: grid;
		place-items: center;
		font-size: 1.5rem;
		background: rgba(239, 76, 131, 0.1);
		border-radius: 14px;
	}

	.summary-content strong {
		font-size: 1.1rem;
		color: var(--aq-color-deep);
	}

	.summary-content p {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.chevron {
		font-size: 0.8rem;
		color: var(--aq-color-muted);
		transition: transform 200ms ease;
	}

	.rooms-collapsible[open] .chevron {
		transform: rotate(180deg);
	}

	.rooms-content {
		margin-top: 1.5rem;
	}

	.rooms-actions-inline {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 1rem;
	}

	.rooms-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}

	.room-card-mini {
		background: rgba(255, 255, 255, 0.8);
		border-radius: 16px;
		padding: 1.25rem;
		text-decoration: none;
		color: inherit;
		position: relative;
		border: 1px solid var(--aq-color-border);
		transition: transform 160ms ease, box-shadow 160ms ease;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.room-card-mini:hover {
		transform: translateY(-2px);
		box-shadow: var(--aq-shadow-soft);
	}

	.room-card-mini__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}

	.room-card-mini__header h4 {
		margin: 0;
		font-size: 1.1rem;
	}

	.room-card-mini__meta {
		display: flex;
		gap: 1.5rem;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.ghost-delete-mini {
		position: absolute;
		top: 12px;
		right: 12px;
		border: none;
		background: rgba(239, 76, 131, 0.08);
		border-radius: 8px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
		transition: background 160ms ease;
	}

	.ghost-delete-mini:hover {
		background: rgba(239, 76, 131, 0.18);
	}

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}

	.skeleton-card {
		height: 100px;
		border-radius: 16px;
		background: linear-gradient(90deg, rgba(18, 43, 59, 0.05), rgba(18, 43, 59, 0.02), rgba(18, 43, 59, 0.05));
		background-size: 200% 100%;
		animation: shimmer 1.4s infinite;
	}

	@keyframes shimmer {
		0% { background-position: -100% 0; }
		100% { background-position: 200% 0; }
	}
</style>
