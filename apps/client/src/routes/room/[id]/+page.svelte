<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { createRoomSocket } from '$lib/stores/socket.svelte';
	import type { Room, Player } from '@blind-test/shared';
	import MasterGameControl from '$lib/components/MasterGameControl.svelte';
	import PlayerGameInterface from '$lib/components/PlayerGameInterface.svelte';

	const roomId = $derived($page.params.id);

	let roomSocket: ReturnType<typeof createRoomSocket> | null = null;
	let playerName = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let joining = $state(false);
	let starting = $state(false);
	let initialRoom = $state<Room | null>(null);
	let isMaster = $state(false);
	let currentPlayer = $state<Player | null>(null); // Current user's player object if they joined

	// Game configuration
	let songs = $state<any[]>([]);
	let selectedSongIds = $state<string[]>([]);
	let songCount = $state(10);
	let showConfig = $state(false);

	// Reactive access to socket state (prefer WebSocket data, fallback to HTTP)
	const room = $derived(roomSocket?.room || initialRoom);
	const players = $derived(roomSocket?.players || []);
	const connected = $derived(roomSocket?.connected || false);
	const socketError = $derived(roomSocket?.error || null);

	async function loadRoom() {
		if (!roomId) {
			error = 'Invalid room ID';
			loading = false;
			return;
		}

		try {
			error = null;
			const response = await api.api.rooms[roomId].get();

			if (response.data) {
				initialRoom = response.data;
				console.log('Loaded room:', response.data);

				// Validate saved player still exists in the room
				if (currentPlayer && !isMaster) {
					const playerStillExists = response.data.players.some(
						(p: Player) => p.id === currentPlayer.id
					);
					if (!playerStillExists) {
						console.log('[Player] Saved player was removed, clearing localStorage');
						const playerKey = `player_${roomId}`;
						localStorage.removeItem(playerKey);
						currentPlayer = null;
					}
				}

				// WebSocket will update this with real-time changes
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
		if (!playerName.trim() || !room || !roomId) return;

		try {
			joining = true;
			error = null;

			const response = await api.api.rooms[roomId].players.post({
				name: playerName.trim()
			});

			if (response.data) {
				console.log('Joined room as:', response.data);

				// Save player info to localStorage for persistence
				const playerKey = `player_${roomId}`;
				localStorage.setItem(playerKey, JSON.stringify(response.data));
				currentPlayer = response.data;

				playerName = '';
				console.log(`[Player] Saved player info for room ${roomId}`);
				// Player join will be broadcast via WebSocket
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
			await api.api.rooms[room.id].players[playerId].delete();
			console.log('Player removed successfully');
			// Player removal will be broadcast via WebSocket
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to remove player';
			console.error('Error removing player:', err);
		}
	}

	async function loadSongs() {
		try {
			const response = await api.api.songs.get();
			if (response.data) {
				songs = response.data.songs || [];
			}
		} catch (err) {
			console.error('Error loading songs:', err);
		}
	}

	function toggleSongSelection(songId: string) {
		if (selectedSongIds.includes(songId)) {
			selectedSongIds = selectedSongIds.filter(id => id !== songId);
		} else {
			selectedSongIds = [...selectedSongIds, songId];
		}
	}

	async function startGame() {
		if (!room) return;

		try {
			starting = true;
			error = null;

			const body: any = {};

			// Use selected songs or random count
			if (selectedSongIds.length > 0) {
				body.songIds = selectedSongIds;
			} else {
				body.songCount = songCount;
			}

			const response = await api.api.game[room.id].start.post(body);

			if (response.data) {
				console.log('Game started:', response.data);
				showConfig = false;
				// Game start will be broadcast via WebSocket
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
		if (!roomId) return;

		// Check if this user is the master of this room
		const masterKey = `master_${roomId}`;
		isMaster = localStorage.getItem(masterKey) === 'true';

		// Check if this user already joined as a player
		const playerKey = `player_${roomId}`;
		const savedPlayer = localStorage.getItem(playerKey);
		if (savedPlayer && !isMaster) {
			try {
				currentPlayer = JSON.parse(savedPlayer);
				console.log(`[Player] Restored player info:`, currentPlayer);
			} catch (err) {
				console.error('Failed to parse saved player info:', err);
				localStorage.removeItem(playerKey);
			}
		}

		console.log(`[Role] User is ${isMaster ? 'MASTER' : currentPlayer ? 'PLAYER (' + currentPlayer.name + ')' : 'VISITOR'} of room ${roomId}`);

		loadRoom();

		// Create WebSocket connection
		roomSocket = createRoomSocket(roomId, { role: isMaster ? 'master' : 'player' });
		roomSocket.connect();
	});

	onDestroy(() => {
		// Cleanup WebSocket connection
		roomSocket?.destroy();
	});
</script>

<main>
	<div class="header">
		<a href="/" class="back-button">← Back to Rooms</a>
		{#if connected}
			<span class="connection-status connected">● Connected</span>
		{:else}
			<span class="connection-status disconnected">● Connecting...</span>
		{/if}
	</div>

	{#if loading}
		<div class="loading">Loading room...</div>
	{:else if (error || socketError) && !room}
		<div class="error">{error || socketError}</div>
		<a href="/" class="button">Go Back</a>
	{:else if room}
		<div class="room-header">
			<div>
				<h1>{room.name}</h1>
				<div class="header-info">
					<p class="room-code">Join Code: <strong>{room.code}</strong></p>
					<span class="role-badge" class:master={isMaster}>
						{isMaster ? '👑 Master' : '🎮 Player'}
					</span>
				</div>
			</div>
			<span class="status" style="background-color: {getStatusColor(room.status)}">
				{getStatusLabel(room.status)}
			</span>
		</div>

		{#if error || socketError}
			<div class="error">{error || socketError}</div>
		{/if}

		{#if room.status === 'lobby' && isMaster}
			<section class="qr-section">
				<div class="qr-container">
					<h2>📱 Scan to Join</h2>
					<img src={room.qrCode} alt="QR Code to join room" class="qr-code" />
					<p class="qr-hint">
						Players can scan this QR code with their phone camera to join the room
					</p>
				</div>
			</section>
		{/if}

		{#if room.status === 'lobby' && !isMaster}
			{#if !currentPlayer}
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
			{:else}
				<section class="player-status">
					<div class="status-card">
						<span class="status-icon">✅</span>
						<div class="status-info">
							<h3>You are playing as:</h3>
							<p class="player-name-display">{currentPlayer.name}</p>
						</div>
					</div>
				</section>
			{/if}
		{/if}

		<section class="players-section">
			<h2>Players ({players.length}/{room.maxPlayers})</h2>

			{#if players.length === 0}
				<p class="empty">No players yet. Be the first to join!</p>
			{:else}
				<div class="players-list">
					{#each players as player (player.id)}
						<div class="player-card" class:disconnected={!player.connected}>
							<div class="player-info">
								<span class="player-name">
									{player.name}
									{#if !player.connected}
										<span class="status-badge">Disconnected</span>
									{/if}
								</span>
								<span class="player-score">Score: {player.score}</span>
							</div>
							{#if room.status === 'lobby' && isMaster}
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

		{#if room.status === 'lobby' && players.length >= 2 && isMaster}
			{#if !showConfig}
				<section class="game-controls">
					<button
						class="config-button"
						onclick={() => { showConfig = true; loadSongs(); }}
					>
						⚙️ Configure Game
					</button>
					<button
						class="start-button"
						onclick={startGame}
						disabled={starting}
					>
						{starting ? 'Starting...' : 'Quick Start (Random Songs)'}
					</button>
				</section>
			{:else}
				<section class="config-section">
					<div class="config-header">
						<h2>Game Configuration</h2>
						<button class="close-button" onclick={() => showConfig = false}>✕</button>
					</div>

					<div class="config-tabs">
						<h3>Select Songs</h3>
						{#if songs.length === 0}
							<p class="info">No songs in library. <a href="/music">Upload some music</a> first!</p>
						{:else}
							<div class="song-count-controls">
								<label>
									Use Random Songs:
									<input type="number" bind:value={songCount} min="1" max="100" />
								</label>
								<span class="or">OR</span>
								<span>Select specific songs ({selectedSongIds.length} selected)</span>
							</div>

							<div class="songs-grid-mini">
								{#each songs as song (song.id)}
									<button
										class="song-item"
										class:selected={selectedSongIds.includes(song.id)}
										onclick={() => toggleSongSelection(song.id)}
									>
										<span class="song-title">{song.title}</span>
										<span class="song-artist">{song.artist}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="config-actions">
						<button class="cancel-button" onclick={() => showConfig = false}>
							Cancel
						</button>
						<button
							class="start-button"
							onclick={startGame}
							disabled={starting || (songs.length === 0)}
						>
							{starting ? 'Starting...' : `Start Game${selectedSongIds.length > 0 ? ` (${selectedSongIds.length} songs)` : ` (${songCount} random)`}`}
						</button>
					</div>
				</section>
			{/if}
		{:else if room.status === 'lobby' && players.length < 2 && isMaster}
			<section class="game-controls">
				<p class="info">Need at least 2 players to start the game</p>
			</section>
		{:else if room.status === 'lobby' && !isMaster}
			<section class="game-controls">
				<p class="info">Waiting for the master to start the game...</p>
			</section>
		{/if}

		{#if room.status === 'playing'}
			<section class="game-section">
				{#if isMaster}
					<!-- Master Control Panel -->
					<MasterGameControl {room} socket={roomSocket} />
				{:else if currentPlayer}
					<!-- Player Game Interface -->
					<PlayerGameInterface player={currentPlayer} socket={roomSocket} />
				{:else}
					<div class="spectator">
						<h2>👁️ Spectator Mode</h2>
						<p>You are watching the game</p>
					</div>
				{/if}
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
		display: flex;
		justify-content: space-between;
		align-items: center;
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

	.connection-status {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.connection-status.connected {
		color: #10b981;
	}

	.connection-status.disconnected {
		color: #f59e0b;
	}

	.room-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		color: #1f2937;
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.room-code {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.room-code strong {
		font-family: monospace;
		font-size: 1.125rem;
		color: #1f2937;
		background-color: #f3f4f6;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
	}

	.role-badge {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 0.5rem;
		background-color: #e5e7eb;
		color: #374151;
	}

	.role-badge.master {
		background-color: #fef3c7;
		color: #92400e;
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
		transition: opacity 0.2s;
	}

	.player-card.disconnected {
		opacity: 0.6;
		border-color: #f59e0b;
	}

	.player-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.player-name {
		font-weight: 600;
		color: #1f2937;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-badge {
		font-size: 0.75rem;
		font-weight: 500;
		color: #f59e0b;
		background-color: #fef3c7;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
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

	.config-button {
		width: 100%;
		padding: 1rem;
		margin-bottom: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background-color: #6b7280;
		border: none;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.config-button:hover {
		background-color: #4b5563;
	}

	.config-section {
		padding: 1.5rem;
		background-color: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.config-header h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.close-button {
		padding: 0.5rem;
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #6b7280;
	}

	.close-button:hover {
		color: #374151;
	}

	.config-tabs h3 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
	}

	.song-count-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 0.375rem;
		flex-wrap: wrap;
	}

	.song-count-controls label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.song-count-controls input[type="number"] {
		width: 80px;
		padding: 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
	}

	.song-count-controls .or {
		font-weight: 600;
		color: #6b7280;
	}

	.songs-grid-mini {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
		max-height: 300px;
		overflow-y: auto;
		padding: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
	}

	.song-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0.75rem;
		background-color: #f9fafb;
		border: 2px solid #e5e7eb;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.song-item:hover {
		border-color: #3b82f6;
		background-color: #eff6ff;
	}

	.song-item.selected {
		border-color: #10b981;
		background-color: #d1fae5;
	}

	.song-title {
		font-weight: 600;
		color: #1f2937;
		font-size: 0.875rem;
	}

	.song-artist {
		color: #6b7280;
		font-size: 0.75rem;
	}

	.config-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.config-actions .start-button {
		flex: 2;
	}

	.cancel-button {
		flex: 1;
		padding: 1rem;
		font-size: 1rem;
		font-weight: 600;
		color: #374151;
		background-color: white;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cancel-button:hover {
		border-color: #9ca3af;
		background-color: #f9fafb;
	}

	.qr-section {
		margin-bottom: 2rem;
	}

	.qr-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 1rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
	}

	.qr-container h2 {
		margin: 0 0 1.5rem 0;
		color: white;
		font-size: 1.5rem;
		text-align: center;
	}

	.qr-code {
		width: 300px;
		height: 300px;
		padding: 1rem;
		background: white;
		border-radius: 0.75rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		image-rendering: pixelated;
		image-rendering: -moz-crisp-edges;
		image-rendering: crisp-edges;
	}

	.qr-hint {
		margin: 1.5rem 0 0 0;
		color: white;
		text-align: center;
		font-size: 0.875rem;
		max-width: 400px;
		opacity: 0.9;
	}

	.player-status {
		margin-bottom: 2rem;
	}

	.status-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
		border-radius: 0.75rem;
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
	}

	.status-icon {
		font-size: 2.5rem;
		flex-shrink: 0;
	}

	.status-info {
		flex: 1;
	}

	.status-info h3 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.player-name-display {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
	}

	@media (max-width: 640px) {
		.qr-code {
			width: 250px;
			height: 250px;
		}
	}
</style>
