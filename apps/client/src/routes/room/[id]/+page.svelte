<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api';
	import { createRoomSocket } from '$lib/stores/socket.svelte';
	import type { Room, Player } from '@blind-test/shared';
	import MasterGameControl from '$lib/components/MasterGameControl.svelte';
	import PlayerGameInterface from '$lib/components/PlayerGameInterface.svelte';
	import RoomHeader from '$lib/components/room/RoomHeader.svelte';
	import PlayersList from '$lib/components/room/PlayersList.svelte';
	import GameConfig from '$lib/components/room/GameConfig.svelte';
	import JoinSection from '$lib/components/room/JoinSection.svelte';
	import QRSection from '$lib/components/room/QRSection.svelte';
	import FinalScores from '$lib/components/room/FinalScores.svelte';
	import type { FinalScore } from '@blind-test/shared';

	const roomId = $derived($page.params.id);

	let roomSocket = $state<ReturnType<typeof createRoomSocket> | null>(null);
	let playerName = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let joining = $state(false);
	let starting = $state(false);
	let initialRoom = $state<Room | null>(null);
	let isMaster = $state(false);
	let currentPlayer = $state<Player | null>(null); // Current user's player object if they joined
	let authToken = $state<string | null>(null); // Master or player token for authentication

	// Game configuration
	let songs = $state<any[]>([]);
	let selectedSongIds = $state<string[]>([]);
	let songCount = $state(10);
	let showConfig = $state(false);

	// Filter configuration
	let useFilters = $state(false);
	let selectedGenres = $state<string[]>([]);
	let yearMin = $state<number | undefined>(undefined);
	let yearMax = $state<number | undefined>(undefined);
	let audioPlayback = $state<'master' | 'players' | 'all'>('master');

	// Available genres (populated from songs)
	let availableGenres = $derived.by(() => {
		const genres = new Set<string>();
		songs.forEach(song => {
			if (song.genre) {
				genres.add(song.genre);
			}
		});
		return Array.from(genres).sort();
	});

	// Local state for tracking socket state (needed for proper reactivity)
	let connected = $state(false);
	let socketError = $state<string | null>(null);
	let socketRoom = $state<Room | null>(null);
	let socketPlayers = $state<Player[]>([]);

	// Game ended state
	let showFinalScores = $state(false);
	let finalScores = $state<FinalScore[]>([]);

	// Reactive access to socket state (prefer WebSocket data, fallback to HTTP)
	const room = $derived(socketRoom || initialRoom);
	const players = $derived(socketPlayers);

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
						console.log('[Player] Saved player was removed from room');
						currentPlayer = null;
						authToken = null;
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

				// Store player info and token in memory
				currentPlayer = response.data;
				authToken = (response.data as any).token;

				// Save to localStorage for reconnection
				const storageKey = `room_${roomId}_auth`;
				localStorage.setItem(storageKey, JSON.stringify({
					token: authToken,
					isMaster: false,
					playerId: response.data.id,
					playerName: response.data.name,
					timestamp: Date.now()
				}));

				playerName = '';
				console.log(`[Player] Joined as ${response.data.name} with token, saved to localStorage`);

				// Reconnect WebSocket with player token
				if (roomSocket) {
					roomSocket.disconnect();
				}
				roomSocket = createRoomSocket(roomId, {
					role: 'player',
					token: authToken || undefined,
					playerId: currentPlayer.id
				});
				roomSocket.connect();

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

	function leaveRoom() {
		if (!confirm('Leave this room? You can rejoin later.')) return;

		// Clear localStorage
		const storageKey = `room_${roomId}_auth`;
		localStorage.removeItem(storageKey);

		// Clear state
		currentPlayer = null;
		authToken = null;
		isMaster = false;

		// Disconnect socket
		if (roomSocket) {
			roomSocket.disconnect();
		}

		console.log('[Player] Left room, cleared session');

		// Reload page to show join form
		window.location.reload();
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

			// Priority 1: Use filters
			if (useFilters && (selectedGenres.length > 0 || yearMin !== undefined || yearMax !== undefined)) {
				body.songFilters = {
					...(selectedGenres.length > 0 && { genre: selectedGenres }),
					...(yearMin !== undefined && { yearMin }),
					...(yearMax !== undefined && { yearMax }),
					...(songCount && { songCount }),
				};
			}
			// Priority 2: Use selected songs
			else if (selectedSongIds.length > 0) {
				body.songIds = selectedSongIds;
			}
			// Priority 3: Random count
			else {
				body.songCount = songCount;
			}

			// Audio playback configuration
			if (audioPlayback !== 'master') {
				body.params = {
					audioPlayback,
				};
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

	function toggleGenre(genre: string) {
		if (selectedGenres.includes(genre)) {
			selectedGenres = selectedGenres.filter(g => g !== genre);
		} else {
			selectedGenres = [...selectedGenres, genre];
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

	function handleBackToLobby() {
		showFinalScores = false;
		finalScores = [];
		// Could also navigate to home page: window.location.href = '/';
	}

	function handlePlayAgain() {
		showFinalScores = false;
		finalScores = [];
		showConfig = true;
		loadSongs();
	}

	onMount(() => {
		if (!roomId) return;

		// Try to restore session from localStorage
		const storageKey = `room_${roomId}_auth`;
		const savedAuth = localStorage.getItem(storageKey);

		// Check if token provided in URL (master or player token)
		const urlParams = new URLSearchParams(window.location.search);
		const tokenFromUrl = urlParams.get('token');

		if (tokenFromUrl) {
			// New session from URL (room creation or join link)
			authToken = tokenFromUrl;
			isMaster = true; // Assume master if coming from URL

			// Save to localStorage for reconnection
			localStorage.setItem(storageKey, JSON.stringify({
				token: tokenFromUrl,
				isMaster: true,
				timestamp: Date.now()
			}));

			console.log(`[Auth] Token detected in URL - assuming master role, saved to localStorage`);

			// Clean URL (remove token from address bar for security)
			const cleanUrl = window.location.pathname;
			window.history.replaceState({}, '', cleanUrl);
		} else if (savedAuth) {
			// Restore session from localStorage
			try {
				const auth = JSON.parse(savedAuth);
				authToken = auth.token;
				isMaster = auth.isMaster || false;

				// If player session, restore player info
				if (!isMaster && auth.playerId && auth.playerName) {
					currentPlayer = {
						id: auth.playerId,
						name: auth.playerName,
						roomId: roomId,
						score: 0,
						isConnected: false,
						createdAt: new Date(auth.timestamp),
						updatedAt: new Date(auth.timestamp)
					} as Player;
					console.log(`[Auth] Restored player session: ${auth.playerName}`);
				}

				console.log(`[Auth] Restored session from localStorage - ${isMaster ? 'MASTER' : 'PLAYER'} role`);
			} catch (e) {
				console.error('[Auth] Failed to parse saved auth:', e);
				localStorage.removeItem(storageKey);
			}
		}

		console.log(`[Role] User is ${isMaster ? 'MASTER' : currentPlayer ? 'PLAYER (' + currentPlayer.name + ')' : 'VISITOR'} of room ${roomId}`);

		loadRoom();

		// Create WebSocket connection with auth token if available
		roomSocket = createRoomSocket(roomId, {
			role: isMaster ? 'master' : 'player',
			token: authToken || undefined,
			playerId: currentPlayer?.id
		});
		roomSocket.connect();

		// Sync socket state to local reactive state
		$effect(() => {
			if (roomSocket) {
				connected = roomSocket.connected;
				socketError = roomSocket.error;
				socketRoom = roomSocket.room;
				socketPlayers = roomSocket.players;
			}
		});

		// Listen for game:ended event
		$effect(() => {
			if (roomSocket?.events.gameEnded) {
				console.log('[Room] Game ended - showing final scores', roomSocket.events.gameEnded);
				finalScores = roomSocket.events.gameEnded.finalScores;
				showFinalScores = true;
			}
		});
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
		{:else if socketError}
			<span class="connection-status error">● {socketError}</span>
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
			<QRSection qrCode={room.qrCode} />
		{/if}

		{#if room.status === 'lobby' && !isMaster}
			<JoinSection
				{currentPlayer}
				bind:playerName
				{joining}
				onJoin={joinRoom}
				onLeave={leaveRoom}
			/>
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
				<GameConfig
					{songs}
					bind:selectedSongIds
					bind:songCount
					bind:useFilters
					bind:selectedGenres
					bind:yearMin
					bind:yearMax
					bind:audioPlayback
					{availableGenres}
					{starting}
					onToggleSong={toggleSongSelection}
					onToggleGenre={toggleGenre}
					onStartGame={startGame}
					onCancel={() => showConfig = false}
				/>
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

		{#if showFinalScores && finalScores.length > 0}
			<!-- Final Scores Screen (shown to all players and master) -->
			<section class="final-scores-section">
				<FinalScores
					{finalScores}
					onBackToLobby={isMaster ? handleBackToLobby : undefined}
					onPlayAgain={isMaster ? handlePlayAgain : undefined}
				/>
			</section>
		{:else if room.status === 'playing'}
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

	.connection-status.error {
		color: #ef4444;
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

	.final-scores-section {
		background: transparent;
		border: none;
		padding: 0;
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
</style>
