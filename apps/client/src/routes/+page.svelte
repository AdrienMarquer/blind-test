<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { Room } from '@blind-test/shared';

	let rooms = $state<Room[]>([]);
	let newRoomName = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let creating = $state(false);

	async function loadRooms() {
		try {
			loading = true;
			error = null;
			const response = await api.api.rooms.get();

			if (response.data) {
				// New API returns { rooms, total }
				rooms = response.data.rooms || [];
				console.log('Loaded rooms:', rooms);
			} else {
				error = 'Failed to load rooms';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load rooms';
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
				console.log('Room created:', response.data);
				const roomId = response.data.id;

				// Mark this user as the master of this room
				localStorage.setItem(`master_${roomId}`, 'true');
				console.log(`[Master] User marked as master of room ${roomId}`);

				// Navigate to the room
				window.location.href = `/room/${roomId}`;
			} else {
				error = 'Failed to create room';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create room';
			console.error('Error creating room:', err);
		} finally {
			creating = false;
		}
	}

	async function deleteRoom(roomId: string, roomName: string, e: Event) {
		e.preventDefault(); // Prevent navigation
		e.stopPropagation();

		if (!confirm(`Delete room "${roomName}"?`)) return;

		try {
			error = null;
			await api.api.rooms[roomId].delete();
			console.log('Room deleted successfully');
			await loadRooms();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete room';
			console.error('Error deleting room:', err);
		}
	}

	function getStatusColor(status: Room['status']): string {
		switch (status) {
			case 'lobby':
				return '#3b82f6'; // blue
			case 'playing':
				return '#10b981'; // green
			case 'between_rounds':
				return '#f59e0b'; // amber
			case 'finished':
				return '#6b7280'; // gray
			default:
				return '#6b7280';
		}
	}

	function getStatusLabel(status: Room['status']): string {
		switch (status) {
			case 'lobby':
				return 'Waiting';
			case 'playing':
				return 'Playing';
			case 'between_rounds':
				return 'Between Rounds';
			case 'finished':
				return 'Finished';
			default:
				return status;
		}
	}

	onMount(() => {
		loadRooms();
	});
</script>

<main>
	<div class="page-header">
		<h1>🎵 Blind Test</h1>
		<a href="/music" class="music-library-link">📚 Music Library</a>
	</div>

	<section class="create-room">
		<h2>Create New Room</h2>
		<form onsubmit={(e) => { e.preventDefault(); createRoom(); }}>
			<input
				type="text"
				placeholder="Room name"
				bind:value={newRoomName}
				disabled={creating}
				required
			/>
			<button type="submit" disabled={creating || !newRoomName.trim()}>
				{creating ? 'Creating...' : 'Create Room'}
			</button>
		</form>
	</section>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<section class="rooms-list">
		<h2>Available Rooms</h2>

		{#if loading}
			<p class="loading">Loading rooms...</p>
		{:else if rooms.length === 0}
			<p class="empty">No rooms available. Create one to get started!</p>
		{:else}
			<div class="rooms">
				{#each rooms as room (room.id)}
					<div class="room-card-wrapper">
						<a href="/room/{room.id}" class="room-card">
							<div class="room-header">
								<h3>{room.name}</h3>
								<span class="status" style="background-color: {getStatusColor(room.status)}">
									{getStatusLabel(room.status)}
								</span>
							</div>
							<div class="room-info">
								<div class="info-row">
									<span>🔑 Code: <strong>{room.code}</strong></span>
									<span>👥 {room.players.length}/{room.maxPlayers} players</span>
								</div>
							</div>
						</a>
						<button
							class="delete-button"
							onclick={(e) => deleteRoom(room.id, room.name, e)}
							title="Delete room"
						>
							🗑️
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2.5rem;
		margin: 0;
		color: #1f2937;
	}

	.music-library-link {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background-color: #10b981;
		text-decoration: none;
		border-radius: 0.5rem;
		transition: background-color 0.2s;
	}

	.music-library-link:hover {
		background-color: #059669;
	}

	h2 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		color: #374151;
	}

	section {
		margin-bottom: 2rem;
	}

	.create-room form {
		display: flex;
		gap: 1rem;
	}

	input {
		flex: 1;
		padding: 0.75rem;
		font-size: 1rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	input:disabled {
		background-color: #f3f4f6;
		cursor: not-allowed;
	}

	button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background-color: #3b82f6;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button:hover:not(:disabled) {
		background-color: #2563eb;
	}

	button:disabled {
		background-color: #9ca3af;
		cursor: not-allowed;
	}

	.error {
		padding: 1rem;
		margin-bottom: 1rem;
		background-color: #fee2e2;
		color: #991b1b;
		border-radius: 0.5rem;
		border-left: 4px solid #dc2626;
	}

	.loading,
	.empty {
		text-align: center;
		color: #6b7280;
		padding: 2rem;
		font-style: italic;
	}

	.rooms {
		display: grid;
		gap: 1rem;
	}

	.room-card-wrapper {
		position: relative;
	}

	.room-card {
		display: block;
		padding: 1.5rem;
		padding-right: 4rem;
		background-color: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}

	.room-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		transform: translateY(-2px);
	}

	.delete-button {
		position: absolute;
		top: 50%;
		right: 1rem;
		transform: translateY(-50%);
		padding: 0.5rem;
		background-color: #ef4444;
		border: none;
		border-radius: 0.375rem;
		font-size: 1.25rem;
		cursor: pointer;
		transition: background-color 0.2s;
		line-height: 1;
	}

	.delete-button:hover {
		background-color: #dc2626;
	}

	.room-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.room-header h3 {
		margin: 0;
		font-size: 1.25rem;
		color: #1f2937;
	}

	.status {
		padding: 0.25rem 0.75rem;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		border-radius: 1rem;
		text-transform: uppercase;
	}

	.room-info {
		color: #6b7280;
		font-size: 0.875rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.info-row strong {
		color: #1f2937;
		font-family: monospace;
		font-size: 1rem;
	}
</style>
