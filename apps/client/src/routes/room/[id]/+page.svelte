<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api';

	interface Player {
		id: string;
		name: string;
		score: number;
	}

	interface Room {
		id: string;
		name: string;
		players: Player[];
		currentTrack?: string;
		status: 'waiting' | 'playing' | 'finished';
	}

	const roomId = $derived($page.params.id);

	let room = $state<Room | null>(null);
	let playerName = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let joining = $state(false);
	let starting = $state(false);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function loadRoom() {
		try {
			error = null;
			const response = await api.api.rooms({ id: roomId }).get();

			if (response.data) {
				room = response.data as Room;
				console.log('Loaded room:', room);
			} else if (response.error) {
				error = 'Room not found';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load room';
			console.error('Error loading room:', err);
		} finally {
			loading = false;
		}
	}

	async function joinRoom() {
		if (!playerName.trim() || !room) return;

		try {
			joining = true;
			error = null;

			const response = await api.api.rooms({ id: roomId }).players.post({
				name: playerName.trim()
			});

			if (response.data) {
				console.log('Joined room as:', response.data);
				playerName = '';
				await loadRoom();
			} else {
				error = 'Failed to join room';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join room';
			console.error('Error joining room:', err);
		} finally {
			joining = false;
		}
	}

	async function removePlayer(playerId: string) {
		if (!room || !confirm('Remove this player?')) return;

		try {
			error = null;

			const response = await api.api.rooms({ roomId: room.id }).players({ playerId }).delete();

			if (response.data) {
				console.log('Removed player:', response.data);
				await loadRoom();
			} else {
				error = 'Failed to remove player';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to remove player';
			console.error('Error removing player:', err);
		}
	}

	async function startGame() {
		if (!room) return;

		try {
			starting = true;
			error = null;

			const response = await api.api.rooms({ id: room.id }).start.post();

			if (response.data) {
				console.log('Game started:', response.data);
				await loadRoom();
			} else {
				error = 'Failed to start game';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to start game';
			console.error('Error starting game:', err);
		} finally {
			starting = false;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'waiting':
				return '#3b82f6'; // blue
			case 'playing':
				return '#10b981'; // green
			case 'finished':
				return '#6b7280'; // gray
			default:
				return '#6b7280';
		}
	}

	onMount(() => {
		loadRoom();

		// Poll for updates every 2 seconds
		pollInterval = setInterval(() => {
			loadRoom();
		}, 2000);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});
</script>

<main>
	<div class="header">
		<a href="/" class="back-button">← Back to Rooms</a>
	</div>

	{#if loading}
		<div class="loading">Loading room...</div>
	{:else if error && !room}
		<div class="error">{error}</div>
		<a href="/" class="button">Go Back</a>
	{:else if room}
		<div class="room-header">
			<h1>{room.name}</h1>
			<span class="status" style="background-color: {getStatusColor(room.status)}">
				{room.status}
			</span>
		</div>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		{#if room.status === 'waiting'}
			<section class="join-section">
				<h2>Join Room</h2>
				<form onsubmit={(e) => { e.preventDefault(); joinRoom(); }}>
					<input
						type="text"
						placeholder="Enter your name"
						bind:value={playerName}
						disabled={joining}
						required
					/>
					<button type="submit" disabled={joining || !playerName.trim()}>
						{joining ? 'Joining...' : 'Join'}
					</button>
				</form>
			</section>
		{/if}

		<section class="players-section">
			<h2>Players ({room.players.length})</h2>

			{#if room.players.length === 0}
				<p class="empty">No players yet. Be the first to join!</p>
			{:else}
				<div class="players-list">
					{#each room.players as player (player.id)}
						<div class="player-card">
							<div class="player-info">
								<span class="player-name">{player.name}</span>
								<span class="player-score">Score: {player.score}</span>
							</div>
							{#if room.status === 'waiting'}
								<button
									class="remove-button"
									onclick={() => removePlayer(player.id)}
								>
									Remove
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		{#if room.status === 'waiting' && room.players.length >= 2}
			<section class="game-controls">
				<button
					class="start-button"
					onclick={startGame}
					disabled={starting}
				>
					{starting ? 'Starting...' : 'Start Game'}
				</button>
			</section>
		{:else if room.status === 'waiting' && room.players.length < 2}
			<section class="game-controls">
				<p class="info">Need at least 2 players to start the game</p>
			</section>
		{/if}

		{#if room.status === 'playing'}
			<section class="game-section">
				<div class="placeholder">
					<h2>🎵 Game in Progress</h2>
					<p>Music playback and game controls will be implemented here</p>
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		margin-bottom: 2rem;
	}

	.back-button {
		display: inline-block;
		color: #3b82f6;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.2s;
	}

	.back-button:hover {
		color: #2563eb;
	}

	.room-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin: 0;
		color: #1f2937;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 1rem;
		color: #374151;
	}

	.status {
		padding: 0.5rem 1rem;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		border-radius: 1rem;
		text-transform: uppercase;
		white-space: nowrap;
	}

	section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background-color: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.join-section form {
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

	.players-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.player-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
	}

	.player-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.player-name {
		font-weight: 600;
		color: #1f2937;
	}

	.player-score {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.remove-button {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		background-color: #ef4444;
	}

	.remove-button:hover:not(:disabled) {
		background-color: #dc2626;
	}

	.game-controls {
		text-align: center;
	}

	.start-button {
		padding: 1rem 2rem;
		font-size: 1.125rem;
		background-color: #10b981;
	}

	.start-button:hover:not(:disabled) {
		background-color: #059669;
	}

	.info {
		color: #6b7280;
		font-style: italic;
	}

	.game-section {
		background-color: #f9fafb;
	}

	.placeholder {
		text-align: center;
		padding: 3rem 2rem;
	}

	.placeholder h2 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.placeholder p {
		color: #6b7280;
	}
</style>
