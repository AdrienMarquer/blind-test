<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { roomApi, playerApi, gameApi, songApi } from '$lib/api-helpers';
	import { createRoomSocket } from '$lib/stores/socket.svelte';
	import type { Room, Player } from '@blind-test/shared';
	import { validatePlayerName, PLAYER_CONFIG } from '@blind-test/shared';
	import MasterGameControl from '$lib/components/MasterGameControl.svelte';
	import MasterPlayerInterface from '$lib/components/MasterPlayerInterface.svelte';
	import PlayerGameInterface from '$lib/components/PlayerGameInterface.svelte';
	import GameConfig from '$lib/components/room/GameConfig.svelte';
	import FinalScores from '$lib/components/room/FinalScores.svelte';
	import BetweenRounds from '$lib/components/game/BetweenRounds.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { FinalScore, RoundConfig } from '@blind-test/shared';
	import { readable, type Readable } from 'svelte/store';

	const isApiErrorResponse = (data: unknown): data is { error: string } =>
		!!data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string';

	const getResponseError = (responseError: any, fallback: string) => {
		if (!responseError) return fallback;
		const value = responseError.value as any;
		if (value && typeof value === 'object') {
			if (typeof value.error === 'string') return value.error;
			if (typeof value.message === 'string') return value.message;
		}
		return fallback;
	};

	const READY_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
		<circle cx="9" cy="9" r="8" fill="#22c55e" fill-opacity="0.1" stroke="#22c55e" stroke-width="1.5" />
		<path d="M5.25 9.25L7.5 11.5L12.5 6.5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
	</svg>`;

	const roomId = $derived($page.params.id);

	let roomSocket = $state<ReturnType<typeof createRoomSocket> | null>(null);
	let playerName = $state('');
	let playerNameError = $state<string | null>(null);
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
	let rounds = $state<RoundConfig[]>([]);
	let audioPlayback = $state<'master' | 'players' | 'all'>('master');
	let showConfig = $state(true);

	// Master playing as participant
	let masterPlaying = $state(false);
	let masterPlayerName = $state('');
	let masterPlayingInitialized = $state(false); // Track if master has explicitly set their playing status

	// Remote master playing status (received from other clients via WebSocket)
	let remoteMasterPlaying = $state<{ playing: boolean; playerName: string | null } | null>(null);

	// Available genres (populated from songs)
	let availableGenres = $derived.by(() => {
		const uniqueGenres: string[] = [];
		songs.forEach((song) => {
			const genre = song.genre?.trim();
			if (genre && !uniqueGenres.includes(genre)) {
				uniqueGenres.push(genre);
			}
		});
		return uniqueGenres.sort();
	});

	// Game ended state
	let showFinalScores = $state(false);
	let finalScores = $state<FinalScore[]>([]);

	// Between rounds state
	let betweenRoundsData = $state<{
		room: Room;
		completedRoundIndex: number;
		nextRoundIndex: number;
		nextRoundMode: string;
		nextRoundMedia: string;
		scores: Array<{ playerId: string; playerName: string; score: number; rank: number }>;
	} | null>(null);

	// Reactive state for WebSocket connection
	let connected = $state(false);
	let socketError = $state<string | null>(null);
	let wsRoom = $state<Room | null>(null);
	let players = $state<Player[]>([]);
	let reconnecting = $state(false);

	// Derived room state (prefer WebSocket room if available, otherwise use initialRoom)
	const room = $derived(wsRoom ?? initialRoom);

	// Page title for SEO
	const pageTitle = $derived(
		room ? `${room.name} - Music Quiz` : 'Salle - Music Quiz'
	);

	// Subscribe to store changes and update reactive state
	$effect(() => {
		if (!roomSocket) {
			connected = false;
			socketError = null;
			wsRoom = null;
			players = [];
			reconnecting = false;
			return;
		}

		// Subscribe to stores and update $state
		const unsubConnected = roomSocket.connected.subscribe(val => { connected = val; });
		const unsubError = roomSocket.error.subscribe(val => { socketError = val; });
		const unsubRoom = roomSocket.room.subscribe(val => { wsRoom = val; });
		const unsubPlayers = roomSocket.players.subscribe(val => { players = val; });
		const unsubReconnecting = roomSocket.reconnecting.subscribe(val => { reconnecting = val; });

		return () => {
			unsubConnected();
			unsubError();
			unsubRoom();
			unsubPlayers();
			unsubReconnecting();
		};
	});

	// Auto-scroll master to game controls when game starts
	$effect(() => {
		if (isMaster && room?.status === 'playing') {
			// Hide config modal when game is in progress
			showConfig = false;
			// Small delay to ensure DOM has rendered
			setTimeout(() => {
				const gameStage = document.querySelector('.game-stage');
				if (gameStage) {
					gameStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 100);
		}
	});

	// Sync remote master playing status from WebSocket events
	$effect(() => {
		if (roomSocket?.events.masterPlaying) {
			console.log('[Room] Received master playing status:', roomSocket.events.masterPlaying);
			remoteMasterPlaying = roomSocket.events.masterPlaying;

			// For master tabs: if server has a playing status set, sync local state
			// but DON'T set initialized flag (prevents immediate re-broadcast)
			if (isMaster && !masterPlayingInitialized) {
				const serverState = roomSocket.events.masterPlaying;
				if (serverState.playing && serverState.playerName) {
					masterPlaying = serverState.playing;
					masterPlayerName = serverState.playerName;
					console.log('[Room] Synced local master playing state from server:', serverState);
				}
			}
		}
	});

	// Broadcast master playing status to server when master changes it (debounced)
	// Only broadcasts after master has explicitly interacted with the control
	let masterPlayingTimeout: number | null = null;
	$effect(() => {
		// Only broadcast if we're the master, in lobby, and have explicitly set the status
		if (!isMaster || room?.status !== 'lobby' || !masterPlayingInitialized) return;

		// Capture current values for the async operation
		const playing = masterPlaying;
		const playerName = masterPlayerName.trim();

		// Debounce to avoid rapid API calls
		if (masterPlayingTimeout) clearTimeout(masterPlayingTimeout);
		masterPlayingTimeout = window.setTimeout(async () => {
			try {
				console.log('[Room] Broadcasting master playing status:', { playing, playerName });
				await roomApi.setMasterPlaying(roomId, playing, playerName);
			} catch (err) {
				console.error('[Room] Failed to broadcast master playing status:', err);
			}
		}, 300);
	});


	type StatusTone = 'primary' | 'success' | 'warning' | 'neutral';
	const statusMeta: Record<Room['status'], { label: string; tone: StatusTone; icon: string; blurb: string }> = {
		lobby: { label: 'Lobby ouvert', tone: 'primary', icon: '🕹️', blurb: 'Invite tes joueurs et prépare ta playlist.' },
		playing: { label: 'Partie en cours', tone: 'success', icon: '🎶', blurb: 'Buzz, bonne humeur et sons mythiques.' },
		between_rounds: { label: 'Transition', tone: 'warning', icon: '⏱️', blurb: 'Une respiration avant la prochaine manche.' },
		finished: { label: 'Partie terminée', tone: 'neutral', icon: '🏁', blurb: 'Consulte les scores et relance un défi.' }
	};

	// Add master preview player when master is playing but game hasn't started yet
	const playersWithMasterPreview = $derived.by(() => {
		const list = [...players];

		// Only show master preview in lobby
		if (room?.status !== 'lobby') return list;

		// Only show preview if master player isn't already in the list
		const masterAlreadyInList = list.some(p => p.id === room?.masterPlayerId);
		if (masterAlreadyInList) return list;

		// For master: use local state
		// For players: use remote state received via WebSocket
		const effectivePlaying = isMaster ? masterPlaying : remoteMasterPlaying?.playing;
		const effectiveName = isMaster ? masterPlayerName.trim() : remoteMasterPlaying?.playerName;

		if (effectivePlaying && effectiveName) {
			list.push({
				id: 'master-preview',
				name: effectiveName,
				roomId: room.id,
				role: 'player',
				connected: true,
				joinedAt: new Date(),
				score: 0,
				roundScore: 0,
				isActive: false,
				isLockedOut: false,
				isMasterPreview: true, // Custom flag for styling
				stats: {
					totalAnswers: 0,
					correctAnswers: 0,
					wrongAnswers: 0,
					buzzCount: 0,
					averageAnswerTime: 0
				}
			} as Player & { isMasterPreview?: boolean });
		}
		return list;
	});

	const sortedPlayers = $derived(
		playersWithMasterPreview
			.slice()
			.sort((a, b) => {
				if (a.connected === b.connected) {
					if (a.score === b.score) {
						return a.name.localeCompare(b.name);
					}
					return b.score - a.score;
				}
				return Number(b.connected) - Number(a.connected);
			})
	);

	// Master's player object when playing as participant
	const masterPlayer = $derived(
		room?.masterPlayerId ? players.find(p => p.id === room.masterPlayerId) ?? null : null
	);

	let codeCopied = $state(false);
	let inviteCopied = $state(false);
	let codeCopyTimeout: number | null = null;
	let inviteCopyTimeout: number | null = null;

	async function copyCode() {
		if (!room) return;
		try {
			await navigator.clipboard?.writeText(room.code);
			codeCopied = true;
			if (codeCopyTimeout) clearTimeout(codeCopyTimeout);
			codeCopyTimeout = window.setTimeout(() => (codeCopied = false), 2000);
		} catch (err) {
			console.warn('Clipboard unavailable', err);
		}
	}

	async function copyInviteLink() {
		if (!room) return;
		try {
			const origin = typeof window !== 'undefined' ? window.location.origin : '';
			const shareUrl = `${origin}/room/${room.id}`;
			await navigator.clipboard?.writeText(shareUrl);
			inviteCopied = true;
			if (inviteCopyTimeout) clearTimeout(inviteCopyTimeout);
			inviteCopyTimeout = window.setTimeout(() => (inviteCopied = false), 2000);
		} catch (err) {
			console.warn('Clipboard unavailable', err);
		}
	}

	async function loadRoom() {
		if (!roomId) {
			error = 'Identifiant de salle invalide';
			loading = false;
			return;
		}

		try {
			error = null;
			const response = await roomApi.get(roomId);
			const data = response.data;

			if (data && !isApiErrorResponse(data)) {
				initialRoom = data;
				console.log('Loaded room:', data);

				// Validate saved player still exists in the room
				if (currentPlayer && !isMaster) {
					const savedPlayer = currentPlayer;
					const playerStillExists = data.players.some(
						(p: Player) => p.id === savedPlayer.id
					);
					if (!playerStillExists) {
						console.log('[Player] Saved player was removed from room');
						currentPlayer = null;
						authToken = null;
					}
				}

				// WebSocket will update this with real-time changes
			} else if (response.error || (data && isApiErrorResponse(data))) {
				error = data && isApiErrorResponse(data)
					? data.error
					: getResponseError(response.error, 'Salle introuvable');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de charger la salle';
			console.error('Error loading room:', err);
		} finally {
			loading = false;
		}
	}

	function validatePlayerNameInput(name: string): string | null {
		const trimmed = name.trim();
		if (!trimmed) return null; // No error for empty (just disable button)
		if (trimmed.length > PLAYER_CONFIG.NAME_MAX_LENGTH) {
			return `Max ${PLAYER_CONFIG.NAME_MAX_LENGTH} caractères`;
		}
		if (!validatePlayerName(trimmed)) {
			return 'Les caractères < et > ne sont pas autorisés';
		}
		return null;
	}

	// Validate player name on change
	$effect(() => {
		playerNameError = validatePlayerNameInput(playerName);
	});

	async function joinRoom() {
		const trimmedName = playerName.trim();
		if (!trimmedName || !room || !roomId) return;

		// Final validation before submit
		const validationError = validatePlayerNameInput(trimmedName);
		if (validationError) {
			playerNameError = validationError;
			return;
		}

		try {
			joining = true;
			error = null;
			playerNameError = null;

			const response = await playerApi.add(roomId, playerName.trim());
			const data = response.data;

			if (data && !isApiErrorResponse(data)) {
				console.log('Joined room as:', data);

				// Store player info and token in memory
				currentPlayer = data;
				authToken = data.token ?? null;

				// Save to localStorage for reconnection
				const storageKey = `room_${roomId}_auth`;
				localStorage.setItem(storageKey, JSON.stringify({
					token: authToken,
					isMaster: false,
					playerId: data.id,
					playerName: data.name,
					timestamp: Date.now()
				}));

				playerName = '';
				console.log(`[Player] Joined as ${data.name} with token, saved to localStorage`);

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
				error = data && isApiErrorResponse(data) ? data.error : 'Impossible de rejoindre la salle';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de rejoindre la salle';
			console.error('Error joining room:', err);
		} finally {
			joining = false;
		}
	}

	async function removePlayer(playerId: string) {
		if (!room || !confirm('Retirer ce joueur ?')) return;

		try {
			error = null;
			await playerApi.remove(room.id, playerId);
			console.log('Player removed successfully');
			// Player removal will be broadcast via WebSocket
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de retirer le joueur';
			console.error('Error removing player:', err);
		}
	}

	function leaveRoom() {
		if (!confirm('Quitter cette salle ? Tu pourras revenir plus tard.')) return;

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
			const response = await songApi.list();
			if (response.data) {
				songs = response.data.songs || [];
			}
		} catch (err) {
			console.error('Error loading songs:', err);
		}
	}

	async function startGame() {
		if (!room) return;

		try {
			starting = true;
			error = null;

			// Build request body with rounds
			const configuredRounds = rounds.map((r, i) => ({
				...r,
				params: {
					...r.params,
					...(audioPlayback !== 'master' && { audioPlayback })
				}
			}));

			console.log('🎮 Starting game with configuration:', {
				totalRounds: configuredRounds.length,
				masterPlaying,
				masterPlayerName: masterPlaying ? masterPlayerName : undefined,
				rounds: configuredRounds.map((r: any, i: number) => ({
					roundIndex: i + 1,
					mode: r.modeType,
					media: r.mediaType,
					songCount: r.songFilters?.songCount || 'default',
					duration: r.params?.songDuration || 'default'
				}))
			});

			// Pass masterPlayerName if master is playing
			const response = await gameApi.start(
				room.id,
				configuredRounds,
				masterPlaying ? masterPlayerName.trim() : undefined
			);

			if (response.data) {
				console.log('Game started:', response.data);
				showConfig = false;
				// Game start will be broadcast via WebSocket
			} else {
				error = 'Impossible de lancer la partie';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de lancer la partie';
			console.error('Error starting game:', err);
		} finally {
			starting = false;
		}
	}

	async function startNextRound() {
		if (!room) {
			console.error('[startNextRound] No room available');
			return;
		}

		console.log('[startNextRound] Starting next round...', {
			roomId: room.id,
			currentStatus: room.status,
			betweenRoundsData
		});

		try {
			error = null;
			const response = await gameApi.nextRound(room.id);

			console.log('[startNextRound] Response received:', {
				hasData: !!response.data,
				hasError: !!response.error,
				data: response.data,
				error: response.error
			});

			if (response.data) {
				console.log('[startNextRound] Next round started successfully:', response.data);
				betweenRoundsData = null;
				// Round start will be broadcast via WebSocket
			} else if (response.error) {
				const errorMsg = typeof response.error === 'object' && 'value' in response.error
					? JSON.stringify(response.error.value)
					: String(response.error);
				error = `Erreur: ${errorMsg}`;
				console.error('[startNextRound] API error:', response.error);
			} else {
				error = 'Impossible de lancer la manche suivante';
				console.error('[startNextRound] Unknown error - no data and no error');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossible de lancer la manche suivante';
			console.error('[startNextRound] Exception caught:', err);
		}
	}

	function handleBackToLobby() {
		// Send restart request to server - this will reset everyone to lobby
		if (roomSocket) {
			roomSocket.restartGame();
		}
	}

	function handlePlayAgain() {
		// Same as back to lobby - server will reset everyone
		if (roomSocket) {
			roomSocket.restartGame();
		}
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
						roomId,
						role: 'player',
						connected: false,
						joinedAt: new Date(auth.timestamp),
						score: 0,
						roundScore: 0,
						isActive: false,
						isLockedOut: false,
						stats: {
							totalAnswers: 0,
							correctAnswers: 0,
							wrongAnswers: 0,
							buzzCount: 0,
							averageAnswerTime: 0
						}
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

		// Listen for game:ended event
		$effect(() => {
			if (roomSocket?.events.gameEnded) {
				console.log('[Room] Game ended - showing final scores', roomSocket.events.gameEnded);
				finalScores = roomSocket.events.gameEnded.finalScores;
				showFinalScores = true;
				// Auto-scroll to final scores section
				setTimeout(() => {
					const finalWrapper = document.querySelector('.final-wrapper');
					if (finalWrapper) {
						finalWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				}, 100);
			}
		});

		// Listen for round:between event
		$effect(() => {
			if (roomSocket?.events.roundBetween) {
				console.log('[Room] Between rounds - showing transition', roomSocket.events.roundBetween);
				betweenRoundsData = roomSocket.events.roundBetween;
				roomSocket.events.clear('roundBetween');
			}
		});

		// Listen for round:started event - clear between rounds data
		$effect(() => {
			if (roomSocket?.events.roundStarted) {
				console.log('[Room] New round started - clearing between rounds data', {
					roundIndex: roomSocket.events.roundStarted.roundIndex,
					modeType: roomSocket.events.roundStarted.modeType
				});
				betweenRoundsData = null;
				roomSocket.events.clear('roundStarted');
			}
		});

		// Listen for game:restarted event - return to lobby
		$effect(() => {
			if (roomSocket?.events.gameRestarted) {
				console.log('[Room] Game restarted - returning to lobby', roomSocket.events.gameRestarted);
				// Clear game-related state
				showFinalScores = false;
				finalScores = [];
				betweenRoundsData = null;
				// Show config for master to start new game
				if (isMaster) {
					showConfig = true;
					loadSongs();
				}
				roomSocket.events.clear('gameRestarted');
			}
		});
	});

	onDestroy(() => {
		// Cleanup WebSocket connection
		roomSocket?.destroy();
		if (codeCopyTimeout) clearTimeout(codeCopyTimeout);
		if (inviteCopyTimeout) clearTimeout(inviteCopyTimeout);
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content="Rejoins la partie et devine les chansons en temps réel. Buzze le premier pour marquer des points !" />
</svelte:head>

<main class="room-page">
	<!-- Hide navigation when in game mode, between rounds, or showing final scores -->
	{#if !showFinalScores && !((room?.status === 'playing' || room?.status === 'between_rounds') && currentPlayer && !isMaster)}
		<div class="room-nav">
			<button type="button" class="nav-link" onclick={() => (window.location.href = '/')}>&larr; Toutes les salles</button>
			{#if connected}
				<span class="connection-status ok">● Connecté</span>
			{:else if reconnecting}
				<span class="connection-status reconnecting">● Reconnexion...</span>
			{:else if socketError}
				<span class="connection-status error">● {socketError}</span>
			{:else}
				<span class="connection-status pending">● Connexion...</span>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="loading-card">Chargement de la salle...</div>
	{:else if (error || socketError) && !room}
		<div class="error-card">{error || socketError}</div>
		<Button variant="primary" onclick={() => (window.location.href = '/')}>&larr; Retour à l'accueil</Button>
	{:else if room}
		<!-- Hide header and panels when player is in game mode, between rounds, or showing final scores -->
		{#if !showFinalScores && !((room.status === 'playing' || room.status === 'between_rounds') && currentPlayer && !isMaster)}
			<section class="room-header">
				<div class="header-top">
					<div>
						<h1>{room.name}</h1>
						<p class="room-code">Code: <strong>{room.code}</strong></p>
					</div>
					<StatusBadge tone={statusMeta[room.status].tone} icon={statusMeta[room.status].icon}>
						{statusMeta[room.status].label}
					</StatusBadge>
				</div>
				<div class="header-meta">
					<span>👥 {players.length}/{room.maxPlayers} joueurs</span>
					<span class="player-badge {isMaster ? 'master' : 'player'}">
						🎭 {isMaster ? 'Maître du jeu' : currentPlayer ? `Joueur: ${currentPlayer.name}` : 'Spectateur'}
					</span>
				</div>
			</section>

			{#if error || socketError}
				<div class="aq-feedback error">{error || socketError}</div>
			{/if}
		{/if}

		<!-- Hide room panels when player is in game mode, between rounds, or showing final scores -->
		{#if !showFinalScores && !((room.status === 'playing' || room.status === 'between_rounds') && currentPlayer && !isMaster)}
			<div class="room-panels">
			<Card title={`Joueurs (${sortedPlayers.length}/${room.maxPlayers})`} subtitle={room.status === 'lobby' ? 'Invite encore plus de monde !' : 'Scores mis à jour en direct'} icon="👥">
				{#if sortedPlayers.length === 0}
					<p class="empty">Aucun joueur pour l'instant. Partage le code !</p>
				{:else}
					<div class="player-grid">
						{#each sortedPlayers as player (player.id)}
							{@const isMasterPreview = (player as any).isMasterPreview}
							<div class="player-chip" class:offline={!player.connected} class:master-preview={isMasterPreview}>
								<div class="chip-avatar">{player.name.slice(0, 2).toUpperCase()}</div>
								<div class="chip-info">
									<strong>{player.name}</strong>
									<span>{isMasterPreview ? '🎮 Hôte' : player.connected ? 'Connecté' : 'Hors ligne'}</span>
								</div>
								<span class="chip-score">{player.score} pts</span>
								{#if room.status === 'lobby' && isMaster && !isMasterPreview}
									<button type="button" class="chip-remove" onclick={() => removePlayer(player.id)} title="Retirer le joueur">✕</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</Card>

			<div class="side-stack">
				{#if room.status === 'lobby' && isMaster}
					<Card title="Inviter les joueurs" subtitle="Partage le code ou scanne le QR" icon="📣">
						<div class="share-card">
							<div class="code-banner">
								<div>
									<span>Code</span>
									<strong>{room.code}</strong>
								</div>
							<Button variant="secondary" size="sm" onclick={copyCode}>
									{codeCopied ? 'Copié' : 'Copier'}
								</Button>
							</div>
							{#if room.qrCode}
								<img src={room.qrCode} alt={`QR pour ${room.name}`} />
							{/if}
							<Button variant="outline" size="sm" onclick={copyInviteLink}>
								{inviteCopied ? 'Lien copié' : "Copier le lien d'invitation"}
							</Button>
						</div>
					</Card>

					<!-- Master Playing Toggle Card -->
					<Card title="Je participe aussi" subtitle="Joue en tant que joueur" icon="🎮">
						<div class="master-playing-card">
							<label class="master-toggle">
								<input type="checkbox" bind:checked={masterPlaying} onchange={() => masterPlayingInitialized = true} />
								<span class="toggle-text">Activer le mode joueur</span>
							</label>
							{#if masterPlaying}
								<div class="master-name-field">
									<input
										type="text"
										bind:value={masterPlayerName}
										placeholder="Ton pseudo"
										maxlength="20"
										class="master-name-input"
										oninput={() => masterPlayingInitialized = true}
									/>
									<p class="master-hint">Seul le mode "Buzz + Choix" sera disponible</p>
								</div>
							{/if}
						</div>
					</Card>

					{#if !showConfig}
						<Card title="Préparer ta partie" subtitle="Rounds, playlists, timer" icon="⚙️">
							<p class="card-text">Configure les manches et personnalise ton blind test avant de lancer la partie.</p>
							<Button variant="primary" fullWidth onclick={() => {
								showConfig = true;
								loadSongs();
							}}>
								⚡ Configurer & démarrer
							</Button>
						</Card>
					{/if}
				{:else if room.status === 'lobby' && !isMaster}
					{#if currentPlayer}
						<Card title="Tu es prêt !" subtitle="Le maître démarre quand tout le monde est là" icon={READY_ICON}>
							<p class="card-text">Tu joues en tant que <strong>{currentPlayer.name}</strong>. Reste connecté !</p>
							<Button variant="outline" fullWidth onclick={leaveRoom}>Quitter la salle</Button>
						</Card>
					{:else}
						<Card title="Rejoins la salle" subtitle="Choisis un pseudo fun" icon="🙋">
							<form class="join-form" onsubmit={(e) => { e.preventDefault(); joinRoom(); }}>
								<InputField
									label="Pseudo"
									placeholder="DJ Poppins 🎵"
									bind:value={playerName}
									error={playerNameError}
									required
								/>
								<Button type="submit" variant="primary" fullWidth disabled={!playerName.trim() || !!playerNameError} loading={joining}>
									{joining ? 'Connexion...' : 'Rejoindre la partie'}
								</Button>
							</form>
						</Card>
					{/if}
				{:else}
					<Card title="Infos match" subtitle="Tout le monde suit la même musique" icon="🎧">
						<ul class="info-list">
							<li>Scores synchronisés en direct</li>
							<li>Buzz dès que tu reconnais l’extrait</li>
							<li>Pause fun entre chaque manche</li>
						</ul>
					</Card>
				{/if}
			</div>
		</div>
		{/if}

		{#if showConfig && isMaster}
			<div class="config-wrapper">
				<GameConfig
					{songs}
					bind:rounds
					bind:audioPlayback
					{availableGenres}
					{starting}
					bind:masterPlaying
					bind:masterPlayerName
					onUpdateRounds={(newRounds) => (rounds = newRounds)}
					onStartGame={startGame}
					onCancel={() => (showConfig = false)}
				/>
			</div>
		{/if}

		{#if room.status === 'between_rounds' && betweenRoundsData}
			<section class="game-stage fullscreen-between">
				<BetweenRounds
					completedRoundIndex={betweenRoundsData.completedRoundIndex}
					nextRoundIndex={betweenRoundsData.nextRoundIndex}
					nextRoundMode={betweenRoundsData.nextRoundMode}
					nextRoundMedia={betweenRoundsData.nextRoundMedia}
					scores={betweenRoundsData.scores}
					{isMaster}
					onStartNextRound={startNextRound}
				/>
			</section>
		{/if}

		{#if showFinalScores && finalScores.length > 0}
			<div class="final-wrapper">
				<FinalScores
					{finalScores}
					onPlayAgain={isMaster ? handlePlayAgain : undefined}
				/>
			</div>
		{:else if room.status === 'playing'}
			<!-- Player Name Badge (Fixed Top Right for Players and Master-as-Player) -->
			{#if currentPlayer && !isMaster}
				<div class="player-name-badge">
					<span class="badge-icon">👤</span>
					<span class="badge-name">{currentPlayer.name}</span>
				</div>
			{:else if isMaster && masterPlayer}
				<div class="player-name-badge master-playing">
					<span class="badge-icon">🎮</span>
					<span class="badge-name">{masterPlayer.name}</span>
				</div>
			{/if}

			<section class="game-stage" class:fullscreen={currentPlayer && !isMaster} class:master-fullscreen={isMaster && masterPlayer}>
				{#if roomSocket}
					{#if isMaster && masterPlayer}
						<!-- Master is playing - show hybrid interface -->
						<MasterPlayerInterface {room} player={masterPlayer} socket={roomSocket} />
					{:else if isMaster}
						<!-- Master not playing - show control interface -->
						<MasterGameControl {room} socket={roomSocket} />
					{:else if currentPlayer}
						<!-- Regular player -->
						<PlayerGameInterface player={currentPlayer} socket={roomSocket} />
					{:else}
						<div class="spectator-note">Rejoins depuis ton mobile pour buzzer en live.</div>
					{/if}
				{:else}
					<div class="spectator-note">Connexion au serveur de jeu...</div>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<style>
	.room-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.room-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.nav-link {
		background: transparent;
		border: none;
		color: white;
		font-weight: 600;
		cursor: pointer;
		font-size: 0.95rem;
		padding: 0.35rem 0.75rem;
		border-radius: var(--aq-radius-md);
		background: rgba(255, 255, 255, 0.15);
	}

	.connection-status {
		font-weight: 600;
	}

	.connection-status.ok {
		color: #3dd598;
	}

	.connection-status.pending {
		color: #f8c027;
	}

	.connection-status.error {
		color: #ef4c83;
	}

	.connection-status.reconnecting {
		color: #f8c027;
		animation: pulse-reconnect 1.5s ease-in-out infinite;
	}

	@keyframes pulse-reconnect {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.loading-card,
	.error-card {
		padding: 1.25rem;
		border-radius: var(--aq-radius-lg);
		background: rgba(255, 255, 255, 0.9);
		box-shadow: var(--aq-shadow-soft);
	}

	.error-card {
		border-left: 4px solid var(--aq-color-primary);
		color: var(--aq-color-primary);
	}

	.room-header {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 16px;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1.5rem;
		box-shadow: var(--aq-shadow-soft);
		border: 1px solid var(--aq-color-border);
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.room-header h1 {
		font-size: clamp(1.5rem, 3vw, 2rem);
		margin: 0 0 0.25rem 0;
		color: var(--aq-color-deep);
	}

	.room-code {
		margin: 0;
		font-size: 0.95rem;
		color: var(--aq-color-muted);
	}

	.room-code strong {
		color: var(--aq-color-primary);
		font-weight: 700;
	}

	.header-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.player-badge {
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		font-weight: 600;
	}

	.player-badge.player {
		background: linear-gradient(135deg, var(--aq-color-secondary), var(--aq-color-accent));
		color: var(--aq-color-deep);
	}

	.player-badge.master {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
	}

	.room-panels {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
	}

	@media (max-width: 1000px) {
		.room-panels {
			grid-template-columns: 1fr;
		}
	}

	.player-grid {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.player-chip {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.85rem;
		border-radius: var(--aq-radius-lg);
		background: rgba(18, 43, 59, 0.05);
		border: 1px solid rgba(18, 43, 59, 0.08);
		position: relative;
	}

	.player-chip.offline {
		opacity: 0.6;
	}

	.player-chip.master-preview {
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.1), rgba(248, 192, 39, 0.1));
		border: 2px solid rgba(239, 76, 131, 0.3);
	}

	.player-chip.master-preview .chip-avatar {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
	}

	.chip-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.2), rgba(244, 122, 32, 0.2));
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--aq-color-deep);
	}

	.chip-info span {
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	.chip-score {
		font-weight: 700;
		color: var(--aq-color-deep);
	}

	.chip-remove {
		border: none;
		background: rgba(239, 76, 131, 0.15);
		color: var(--aq-color-primary);
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 700;
		transition: all 0.2s ease;
	}

	.chip-remove:hover {
		background: rgba(239, 76, 131, 0.25);
		transform: scale(1.1);
	}

	.chip-remove:active {
		transform: scale(0.95);
	}

	.side-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.share-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: center;
	}

	.share-card img {
		max-width: 220px;
		margin: 0 auto;
		border-radius: var(--aq-radius-md);
		border: 4px solid rgba(18, 43, 59, 0.08);
	}

	.code-banner {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		padding: 0.75rem 1rem;
		border-radius: var(--aq-radius-md);
		background: rgba(18, 43, 59, 0.05);
	}

	.code-banner span {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--aq-color-muted);
	}

	.card-text {
		margin: 0 0 1rem 0;
		color: var(--aq-color-muted);
	}

	.join-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Master Playing Card */
	.master-playing-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.master-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		font-weight: 600;
		color: var(--aq-color-deep);
	}

	.master-toggle input[type="checkbox"] {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--aq-color-primary);
		cursor: pointer;
	}

	.toggle-text {
		font-size: 0.95rem;
	}

	.master-name-field {
		padding-top: 0.75rem;
		border-top: 1px solid rgba(18, 43, 59, 0.1);
	}

	.master-name-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 2px solid rgba(18, 43, 59, 0.15);
		border-radius: 12px;
		font-size: 1rem;
		transition: border-color 160ms ease;
		background: white;
	}

	.master-name-input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
	}

	.master-name-input::placeholder {
		color: rgba(18, 43, 59, 0.4);
	}

	.master-hint {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: var(--aq-color-muted);
		line-height: 1.4;
	}

	.info-list {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--aq-color-muted);
	}

	.empty {
		text-align: center;
		padding: 1rem;
		color: var(--aq-color-muted);
	}

	.config-wrapper {
		margin-top: 2rem;
	}

	.final-wrapper,
	.game-stage {
		margin-top: 1.5rem;
	}

	.game-stage {
		background: rgba(255, 255, 255, 0.9);
		border-radius: 32px;
		padding: 1.5rem;
		box-shadow: var(--aq-shadow-soft);
	}

	/* Full-screen mode for players during gameplay */
	.game-stage.fullscreen,
	.game-stage.fullscreen-between {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		margin: 0;
		border-radius: 0;
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		background: linear-gradient(135deg, #ef4c83 0%, #f8c027 100%);
		padding: 1rem;
	}

	.game-stage :global(.master-control),
	.game-stage :global(.player-interface),
	.game-stage :global(.master-player-interface) {
		width: 100%;
	}

	/* Player Name Badge - Fixed top right of screen */
	.player-name-badge {
		position: fixed;
		top: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: linear-gradient(135deg, var(--aq-color-secondary), var(--aq-color-accent));
		backdrop-filter: blur(10px);
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 999px;
		padding: 0.6rem 1.25rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		box-shadow: 0 8px 24px rgba(248, 192, 39, 0.4);
		z-index: 600;
		font-size: 1rem;
	}

	.player-name-badge .badge-icon {
		font-size: 1.2rem;
		line-height: 1;
	}

	.player-name-badge .badge-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 150px;
	}

	.player-name-badge.master-playing {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		box-shadow: 0 8px 24px rgba(239, 76, 131, 0.4);
	}

	/* Full-screen mode for master when playing */
	.game-stage.master-fullscreen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		margin: 0;
		border-radius: 0;
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		background: linear-gradient(135deg, #ef4c83 0%, #f8c027 100%);
		padding: 1rem;
	}

	.spectator-note {
		text-align: center;
		padding: 2rem;
		border-radius: var(--aq-radius-lg);
		background: rgba(255, 255, 255, 0.8);
		border: 2px dashed rgba(18, 43, 59, 0.2);
		font-weight: 600;
	}
</style>
