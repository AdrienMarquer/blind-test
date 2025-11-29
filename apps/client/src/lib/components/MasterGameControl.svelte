<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import type { Room } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';
	import { api } from '$lib/api';

	// Props
	const { room, socket }: { room: Room; socket: RoomSocket } = $props();
	const gameApi = api.api.game as Record<string, any>;

	// Game state
	let currentSong = $state(0);
	let totalSongs = $state(0);
	let isPaused = $state(false);
	let isPlaying = $state(false);
	let activePlayerName = $state<string>('');
	let currentTitle = $state('Chargement...');
	let currentArtist = $state('');
	let statusMessage = $state<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);
	let statusTimeout: number | null = null; // NOT a $state - just a regular variable for timer ID

	// Manual validation state
	let pendingValidation = $state<{ playerId: string; playerName: string; songIndex: number } | null>(null);

	// Loading screen state
	let showLoadingScreen = $state(false);
	let loadingCountdown = $state(6);
	let loadingGenre = $state<string | undefined>(undefined);
	let countdownInterval: number | null = null;

	// Reactive timer values from socket
	const timeRemaining = $derived(socket.songTimeRemaining);

	// Audio player
	let audioElement: HTMLAudioElement | null = $state(null);
	let audioContext: AudioContext | null = $state(null);

	function handlePause() {
		isPaused = !isPaused;

		if (audioElement) {
			if (isPaused) {
				audioElement.pause();
			} else {
				audioElement.play();
			}
		}

		if (isPaused) {
			socket.pauseGame();
		} else {
			socket.resumeGame();
		}
	}

	function formatAnswerLabel(label: 'title' | 'artist', { withArticle = false } = {}) {
		if (withArticle) {
			return label === 'title' ? 'le titre' : 'l\'artiste';
		}
		return label === 'title' ? 'titre' : 'artiste';
	}

	async function handleEndGame() {
		if (!confirm('Terminer la partie et calculer les scores finaux ?')) {
			return;
		}

		try {
			console.log('[Master] Ending game...', { roomId: room.id });

			const response = await gameApi[room.id].end.post();

			if (response.data) {
				console.log('[Master] Game ended successfully', response.data);
			} else if (response.error) {
				console.error('[Master] Failed to end game:', response.error);
				alert(`Impossible de terminer la partie : ${response.error.value}`);
			}
		} catch (err) {
			console.error('[Master] Error ending game:', err);
			alert('Impossible de terminer la partie. Réessaie.');
		}
	}

	/**
	 * Handle manual validation - master approves or rejects answer
	 */
	function handleValidateAnswer(isCorrect: boolean) {
		if (!pendingValidation) {
			console.error('[Master] No pending validation');
			return;
		}

		console.log('[Master] Validating answer', {
			playerId: pendingValidation.playerId,
			playerName: pendingValidation.playerName,
			songIndex: pendingValidation.songIndex,
			isCorrect
		});

		// Submit answer with 'correct' or 'wrong' value
		socket.submitAnswer(
			pendingValidation.songIndex,
			'title', // FastBuzzMode only uses title type
			isCorrect ? 'correct' : 'wrong'
		);

		// Clear pending validation
		pendingValidation = null;
	}

	// ========================================================================
	// Reactive Event Subscriptions using $effect()
	// ========================================================================

	// Subscribe to round:started event
	$effect(() => {
		const event = socket.events.roundStarted;
		if (event) {
			console.log('[Master] Round started, updating song count', {
				roundIndex: event.roundIndex,
				songCount: event.songCount,
				modeType: event.modeType
			});
			totalSongs = event.songCount;
			isPlaying = true;
			socket.events.clear('roundStarted');
		}
	});

	// Subscribe to song:preparing event (loading screen)
	$effect(() => {
		const event = socket.events.songPreparing;
		if (event) {
			console.log('[Master] 🔄 SONG PREPARING - Showing loading screen', {
				songIndex: event.songIndex,
				genre: event.genre,
				year: event.year,
				countdown: event.countdown
			});

			// Show loading screen
			showLoadingScreen = true;
			loadingCountdown = event.countdown;
			loadingGenre = event.genre;

			// Clear any existing countdown interval
			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
			}

			// Start countdown timer (decrement every second) - purely visual
			countdownInterval = window.setInterval(() => {
				loadingCountdown--;
				if (loadingCountdown <= 0) {
					// Countdown finished - hide loading screen
					if (countdownInterval !== null) {
						clearInterval(countdownInterval);
						countdownInterval = null;
					}
					showLoadingScreen = false;
				}
			}, 1000);

			socket.events.clear('songPreparing');
		}
	});

	// Subscribe to song:started event
	$effect(() => {
		const event = socket.events.songStarted;
		if (event) {
			console.log('[Master] 🆕 SONG STARTED - Server triggered playback', {
				songIndex: event.songIndex,
				songTitle: event.songTitle,
				songArtist: event.songArtist,
				duration: event.duration
			});

			// Clear loading screen immediately (server controls timing)
			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
			showLoadingScreen = false;

			// Update song info
			currentSong = event.songIndex;
			activePlayerName = '';
			currentTitle = event.songTitle || `Morceau ${event.songIndex + 1}`;
			currentArtist = event.songArtist || '';

			// Clear any old status messages
			statusMessage = null;

			// Play audio if configured for master
			if (audioElement && (event.audioPlayback === 'master' || event.audioPlayback === 'all')) {
				console.log(`[Master] Playing audio (mode: ${event.audioPlayback})`);
				audioElement.src = event.audioUrl;
				audioElement.load();

				// Wait for audio to be ready, then start at clipStart
				audioElement.onloadedmetadata = () => {
					if (audioElement) {
						audioElement.currentTime = event.clipStart;
						audioElement.play().catch(err => {
							console.error('[Master Audio] Failed to play:', err);
						});

						// Stop after duration seconds
						setTimeout(() => {
							if (audioElement) {
								audioElement.pause();
								console.log(`[Master Audio] Stopped after ${event.duration}s`);
							}
						}, event.duration * 1000);
					}
				};
			} else {
				console.log(`[Master] Not playing audio (mode: ${event.audioPlayback})`);
			}

			socket.events.clear('songStarted');
		}
	});

	// Subscribe to player:buzzed event
	$effect(() => {
		const event = socket.events.playerBuzzed;
		if (event) {
			// Find player name from socket.players
			const player = get(socket.players).find((p) => p.id === event.playerId);
			activePlayerName = player?.name || event.playerName || 'Joueur inconnu';

			console.log('[Master] Player buzzed!', {
				playerId: event.playerId,
				playerName: activePlayerName,
				songIndex: event.songIndex,
				manualValidation: event.manualValidation
			});

			// Check if this is manual validation mode
			if (event.manualValidation) {
				console.log('[Master] Manual validation required', {
					playerId: event.playerId,
					playerName: activePlayerName,
					songIndex: event.songIndex
				});

				// Set pending validation
				pendingValidation = {
					playerId: event.playerId,
					playerName: activePlayerName,
					songIndex: event.songIndex
				};
			} else {
				// Clear pending validation for automatic modes
				pendingValidation = null;

				// Show buzz notification for automatic modes
				if (statusTimeout) {
					clearTimeout(statusTimeout);
				}
				statusMessage = {
					type: 'info',
					text: `🎯 ${activePlayerName} a buzzé !`
				};
				// Auto-clear after 2 seconds
				statusTimeout = window.setTimeout(() => {
					statusMessage = null;
				}, 2000);
			}

			socket.events.clear('playerBuzzed');
		}
	});

	// Subscribe to answer:result event (show winner notifications)
	$effect(() => {
		const event = socket.events.answerResult;
		if (event) {
			// Clear pending validation since answer was processed
			pendingValidation = null;

			if (event.isCorrect) {
				// Clear any existing timeout
				if (statusTimeout) {
					clearTimeout(statusTimeout);
				}

				const answerTypeText = formatAnswerLabel(event.answerType, { withArticle: true });
				statusMessage = {
					type: 'success',
					text: `🎉 ${event.playerName} a trouvé ${answerTypeText} ! +${event.pointsAwarded} point${event.pointsAwarded !== 1 ? 's' : ''}`
				};

				// Auto-clear after 4 seconds
				statusTimeout = window.setTimeout(() => {
					statusMessage = null;
				}, 4000);
			}
			socket.events.clear('answerResult');
		}
	});

	// Subscribe to song:ended event
	$effect(() => {
		const event = socket.events.songEnded;
		if (event) {
			console.log('[Master] 🏁 SONG ENDED - Revealing answer', {
				correctTitle: event.correctTitle,
				correctArtist: event.correctArtist,
				winners: event.winners
			});

			// Clear any pending validation
			pendingValidation = null;

			currentTitle = event.correctTitle;
			currentArtist = event.correctArtist;
			activePlayerName = 'Morceau terminé';

			console.log('[Master] 👀 Answer reveal phase (5 seconds)');

			// Show correct answer banner with winner info
			if (statusTimeout) {
				clearTimeout(statusTimeout);
			}

			let statusText = `✅ Réponse correcte : « ${event.correctTitle} » par ${event.correctArtist}`;

			// Add winner information if available
			if (event.winners && event.winners.length > 0) {
				const winner = event.winners[0]; // Top winner
				const answerText = winner.answersCorrect.map((type: 'title' | 'artist') =>
					type === 'title' ? 'titre' : 'artiste'
				).join(' + ');
				statusText += `\n🏆 ${winner.playerName} (+${winner.pointsEarned} pt${winner.pointsEarned !== 1 ? 's' : ''}, ${answerText})`;
			}

			statusMessage = {
				type: 'info',
				text: statusText
			};

			// Clear after 5 seconds when next song starts
			statusTimeout = window.setTimeout(() => {
				statusMessage = null;
			}, 5000);
			socket.events.clear('songEnded');
		}
	});

	// Subscribe to game:paused event
	$effect(() => {
		const event = socket.events.gamePaused;
		if (event) {
			isPaused = true;

			// Pause audio playback when game is paused
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
				console.log('[Master Audio] Paused due to game pause');
			}

			socket.events.clear('gamePaused');
		}
	});

	// Subscribe to game:resumed event
	$effect(() => {
		const event = socket.events.gameResumed;
		if (event) {
			isPaused = false;

			// Resume audio playback when game is resumed
			if (audioElement && audioElement.paused && audioElement.src) {
				audioElement.play().catch(err => {
					console.error('[Master Audio] Failed to resume:', err);
				});
				console.log('[Master Audio] Resumed after game resume');
			}

			socket.events.clear('gameResumed');
		}
	});

	// Subscribe to round:ended event
	$effect(() => {
		const event = socket.events.roundEnded;
		if (event) {
			isPlaying = false;
			socket.events.clear('roundEnded');
		}
	});

	// Cleanup on component unmount
	onDestroy(() => {
		// Clear any pending status timeout
		if (statusTimeout) {
			clearTimeout(statusTimeout);
			statusTimeout = null;
		}

		// Stop and clean up audio element
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			audioElement.src = '';
		}
	});
</script>

<div class="master-control">
	<!-- Loading Screen -->
	{#if showLoadingScreen}
		<div class="loading-screen">
			<div class="loading-content">
				<div class="countdown-circle">
					<span class="countdown-number">{loadingCountdown}</span>
				</div>
				<h2 class="loading-title">Prochaine musique</h2>
				{#if loadingGenre}
					<div class="loading-info">
						<span class="info-badge genre">{loadingGenre}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="control-header">
		<h2>🎮 Contrôles maître</h2>
		<div class="song-progress">
			{#if totalSongs > 0}
				Morceau {currentSong + 1} / {totalSongs}
			{:else}
				En attente...
			{/if}
		</div>
	</div>

	<!-- Status Message -->
	{#if statusMessage}
		<div class="status-banner {statusMessage.type}">
			{statusMessage.text}
		</div>
	{/if}

	<!-- Manual Validation UI -->
	{#if pendingValidation}
		<div class="validation-panel">
			<div class="validation-header">
				<span class="validation-icon">⏸️</span>
				<div class="validation-text">
					<strong>{pendingValidation.playerName}</strong> a buzzé !
					<p class="validation-subtitle">Valide sa réponse :</p>
				</div>
			</div>
			<div class="validation-buttons">
				<button class="validate-btn correct" onclick={() => handleValidateAnswer(true)}>
					✅ Correct
				</button>
				<button class="validate-btn wrong" onclick={() => handleValidateAnswer(false)}>
					❌ Faux
				</button>
			</div>
		</div>
	{/if}

	<div class="song-info">
		<div class="timer">
			<div class="timer-circle">
				<span class="time">{timeRemaining}s</span>
			</div>
		</div>
		<div class="song-details">
			<p class="label">Lecture en cours</p>
			<h3 class="song-title">{currentTitle}</h3>
			<p class="song-artist">{currentArtist || '...'}</p>
		</div>
	</div>

	<div class="controls">
		<button class="control-btn pause-btn" onclick={handlePause}>
			{isPaused ? '▶️ Reprendre' : '⏸️ Pause'}
		</button>
		<button class="control-btn end-btn" onclick={handleEndGame}>
			🛑 Terminer la partie
		</button>
	</div>

	<div class="status-indicators">
		<div class="indicator">
			<span class="indicator-label">Statut :</span>
			<span class="indicator-value">{isPaused ? 'En pause' : 'En lecture'}</span>
		</div>
		<div class="indicator">
			<span class="indicator-label">Joueur actif :</span>
			<span class="indicator-value">{activePlayerName}</span>
		</div>
	</div>

	<!-- Audio player (hidden) -->
	<audio bind:this={audioElement} style="display: none;"></audio>
</div>

<style>
	.master-control {
		position: relative;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		border-radius: 32px;
		padding: 1.75rem;
		color: #fff;
		box-shadow: var(--aq-shadow-card);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.control-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.song-progress {
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
	}

	.status-banner {
		padding: 0.85rem 1.25rem;
		border-radius: 18px;
		font-weight: 600;
		background: rgba(255, 255, 255, 0.15);
	}

	.status-banner.success { background: rgba(248,192,39,0.2); }
	.status-banner.info { background: rgba(255,255,255,0.2); }

	.song-info {
		display: flex;
		gap: 1.25rem;
		align-items: center;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 20px;
		padding: 1rem 1.25rem;
	}

	.timer-circle {
		width: 90px;
		height: 90px;
		border-radius: 50%;
		border: 4px solid rgba(255, 255, 255, 0.35);
		display: grid;
		place-items: center;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	.control-btn {
		border: none;
		padding: 0.85rem 1rem;
		border-radius: 16px;
		font-weight: 600;
		cursor: pointer;
	}

	.pause-btn { background: rgba(255,255,255,0.2); color:#fff; }
	.end-btn { background: rgba(18,43,59,0.2); }

	.status-indicators {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.75rem;
	}

	.indicator {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 14px;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.indicator-label {
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.indicator-value {
		font-weight: 600;
		font-size: 1.05rem;
	}

	/* Manual Validation Panel */
	.validation-panel {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 20px;
		padding: 1.5rem;
		color: var(--aq-color-deep);
		box-shadow: 0 8px 24px rgba(239, 76, 131, 0.25);
		animation: slideIn 0.3s ease;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.validation-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.validation-icon {
		font-size: 2rem;
	}

	.validation-text strong {
		font-size: 1.25rem;
		color: var(--aq-color-primary);
	}

	.validation-subtitle {
		margin: 0.25rem 0 0 0;
		font-size: 0.95rem;
		color: var(--aq-color-deep);
		opacity: 0.8;
	}

	.validation-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.validate-btn {
		border: none;
		border-radius: 14px;
		padding: 1rem 1.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 150ms ease, box-shadow 150ms ease;
	}

	.validate-btn:hover {
		transform: translateY(-2px);
	}

	.validate-btn.correct {
		background: linear-gradient(135deg, #4ade80, #22c55e);
		color: #fff;
		box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);
	}

	.validate-btn.correct:hover {
		box-shadow: 0 6px 20px rgba(74, 222, 128, 0.4);
	}

	.validate-btn.wrong {
		background: linear-gradient(135deg, #f87171, #ef4444);
		color: #fff;
		box-shadow: 0 4px 12px rgba(248, 113, 113, 0.3);
	}

	.validate-btn.wrong:hover {
		box-shadow: 0 6px 20px rgba(248, 113, 113, 0.4);
	}

	/* Loading Screen */
	.loading-screen {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #ef4c83, #f8c027);
		border-radius: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fadeIn 0.3s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.loading-content {
		text-align: center;
		color: #fff;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.countdown-circle {
		width: 160px;
		height: 160px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.25);
		border: 5px solid rgba(255, 255, 255, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: pulse 1s ease-in-out infinite;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(255, 255, 255, 0.4);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3), 0 0 0 20px rgba(255, 255, 255, 0);
		}
	}

	.countdown-number {
		font-size: 5rem;
		font-weight: 700;
		color: #fff;
		text-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}

	.loading-title {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		color: #fff;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.loading-info {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.info-badge {
		padding: 0.65rem 1.5rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.25);
		color: #fff;
		font-weight: 600;
		font-size: 1.05rem;
		backdrop-filter: blur(10px);
		border: 2px solid rgba(255, 255, 255, 0.4);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.info-badge.genre {
		background: rgba(255, 255, 255, 0.3);
	}

	.info-badge.year {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
