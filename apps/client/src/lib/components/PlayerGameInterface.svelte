<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import type { Player, AnswerChoice } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';
	import BuzzAndChoiceUI from './game/BuzzAndChoiceUI.svelte';
	import FastBuzzUI from './game/FastBuzzUI.svelte';
	import VolumeControl from './VolumeControl.svelte';

	// Get players from socket store for leaderboard display (reactive subscription)
	let allPlayers = $state<Player[]>([]);
	$effect(() => {
		const unsubscribe = socket.players.subscribe((players) => {
			allPlayers = players;
		});
		return unsubscribe;
	});

	// Sorted leaderboard (all players, sorted by score)
	let leaderboard = $derived(
		allPlayers
			.filter((p) => p.role === 'player')
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
	);

	// ========================================================================
	// State Machine Type Definition
	// ========================================================================

	type WinnerInfo = {
		playerId: string;
		playerName: string;
		answersCorrect: ('title' | 'artist')[];
		pointsEarned: number;
		timeToAnswer: number;
	};

	type PlayerGameState =
		| { status: 'idle' }
		| { status: 'loading'; countdown: number; genre?: string }
		| { status: 'ready_to_buzz'; timeRemaining: number }
		| { status: 'buzzed_waiting_server' }
		| { status: 'answering_choices'; answerType: 'title' | 'artist'; choices: AnswerChoice[]; timeRemaining: number }
		| { status: 'fast_buzz_waiting'; timeRemaining: number }
		| { status: 'locked_out' }
		| { status: 'watching_other_player'; playerName: string }
		| { status: 'answer_reveal'; correctTitle: string; correctArtist: string; albumArt?: string; winners?: WinnerInfo[] };

	// Props
const { player, socket }: { player: Player; socket: RoomSocket } = $props();

	// ========================================================================
	// Core State Machine
	// ========================================================================

	let gameState = $state<PlayerGameState>({ status: 'idle' });

	// ========================================================================
	// Other State (orthogonal to game state machine)
	// ========================================================================

	let currentSongIndex = $state(0);
	let totalSongsInRound = $state(0);
	let currentModeType = $state<'buzz_and_choice' | 'fast_buzz'>('buzz_and_choice');
	let maxSongDuration = $state(15); // Track max duration for timer bar calculation
	let countdownInterval: number | null = null;

	// Smooth timer animation
	let timerAnimationKey = $state(0); // Key to restart CSS animation
	let timerStartTimestamp = $state(0);
	let timerRafId: number | null = null;
	let smoothProgress = $state(100); // 0-100 percentage

	// Reactive timer values from socket
	const timeRemaining = $derived(socket.songTimeRemaining);
	const answerTimeRemaining = $derived(socket.answerTimeRemaining);

	function formatAnswerLabel(label: 'title' | 'artist', { withArticle = false } = {}) {
		if (withArticle) {
			return label === 'title' ? 'le titre' : "l'artiste";
		}
		return label === 'title' ? 'titre' : 'artiste';
	}

	// Smooth timer animation functions
	function startSmoothTimer(durationSeconds: number, elapsedSeconds = 0) {
		stopSmoothTimer();
		const normalizedDuration = Math.max(durationSeconds, 0.001);
		const clampedElapsed = Math.min(Math.max(elapsedSeconds, 0), normalizedDuration);
		timerStartTimestamp = performance.now() - clampedElapsed * 1000;
		const initialRemaining = Math.max(0, normalizedDuration - clampedElapsed);
		smoothProgress = (initialRemaining / normalizedDuration) * 100;
		timerAnimationKey++; // Trigger re-render

		function tick() {
			const elapsed = (performance.now() - timerStartTimestamp) / 1000;
			const remaining = Math.max(0, normalizedDuration - elapsed);
			smoothProgress = (remaining / normalizedDuration) * 100;

			if (remaining > 0 && gameState.status === 'ready_to_buzz') {
				timerRafId = requestAnimationFrame(tick);
			}
		}

		timerRafId = requestAnimationFrame(tick);
	}

	function resumeSmoothTimerFromRemaining(remainingSeconds: number) {
		const duration = maxSongDuration || remainingSeconds || 0;
		if (duration <= 0) return;
		const normalizedRemaining = Math.max(0, Math.min(remainingSeconds, duration));
		const elapsedSeconds = Math.max(0, duration - normalizedRemaining);
		startSmoothTimer(duration, elapsedSeconds);
	}

	function stopSmoothTimer() {
		if (timerRafId !== null) {
			cancelAnimationFrame(timerRafId);
			timerRafId = null;
		}
	}

	// Derive smooth time display from progress
	const smoothTimeRemaining = $derived(Math.ceil((smoothProgress / 100) * maxSongDuration));

	// Player score
	let score = $state(player.score);

	// Connection state for reconnection indicator
	let isReconnecting = $state(false);
	$effect(() => {
		const unsubscribe = socket.reconnecting.subscribe((val) => {
			isReconnecting = val;
		});
		return unsubscribe;
	});

	// Feedback messages
	let feedbackMessage = $state<{ type: 'success' | 'error' | 'info' | 'warning'; text: string; winnerText?: string } | null>(null);
	let feedbackTimeout: number | null = null; // NOT a $state - just a regular variable for timer ID

	// Audio player (for when audio plays on player devices)
	let audioElement: HTMLAudioElement | null = $state(null);

	// ========================================================================
	// User Actions (State Transitions)
	// ========================================================================

	function handleBuzz() {
		if (gameState.status !== 'ready_to_buzz') return;

		// Transition to waiting for server response
		gameState = { status: 'buzzed_waiting_server' };

		// Send buzz to server
		socket.buzz(currentSongIndex);
	}

	function handleAnswer(value: string) {
		// Only submit answers when in answering_choices state
		if (gameState.status !== 'answering_choices') return;

		const answerType = gameState.answerType;

		console.log('[Player] Submitting answer', {
			songIndex: currentSongIndex,
			answerType,
			value,
			playerId: player.id
		});

		// Send answer to server
		socket.submitAnswer(currentSongIndex, answerType, value);

		// Transition to waiting for result (stay in same state until server responds)
		// Server will send answer:result which will trigger next state transition
	}

	// ========================================================================
	// Reactive Event Subscriptions using $effect()
	// ========================================================================

	// Subscribe to round:started event
	$effect(() => {
		const event = socket.events.roundStarted;
		if (event) {
			console.log('[Player] 🎮 NEW ROUND STARTED - Updating mode', {
				roundIndex: event.roundIndex,
				modeType: event.modeType,
				songCount: event.songCount,
				playerId: player.id
			});

			// Update mode type and song count for the new round
			currentModeType = event.modeType as 'buzz_and_choice' | 'fast_buzz';
			totalSongsInRound = event.songCount;

			// Reset to idle state between rounds
			gameState = { status: 'idle' };
			feedbackMessage = null;

			console.log('[Player] ✅ Round started - Mode updated to:', currentModeType);
			socket.events.clear('roundStarted');
		}
	});

	// Subscribe to song:preparing event (loading screen)
	$effect(() => {
		const event = socket.events.songPreparing;
		if (event) {
			console.log('[Player] 🔄 SONG PREPARING - Showing loading screen', {
				songIndex: event.songIndex,
				genre: event.genre,
				year: event.year,
				countdown: event.countdown
			});

			// Transition to loading state
			gameState = {
				status: 'loading',
				countdown: event.countdown,
				genre: event.genre
			};

			// Clear any existing countdown interval
			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
			}

			// Start countdown timer (decrement every second) - purely visual
			let countdown = event.countdown;
			countdownInterval = window.setInterval(() => {
				countdown--;
				if (countdown <= 0) {
					// Countdown finished - clear interval
					if (countdownInterval !== null) {
						clearInterval(countdownInterval);
						countdownInterval = null;
					}
				} else {
					// Update countdown in state
					gameState = { status: 'loading', countdown, genre: event.genre };
				}
			}, 1000);

			socket.events.clear('songPreparing');
		}
	});

	// Subscribe to song:started event
	$effect(() => {
		const event = socket.events.songStarted;
		if (event) {
			console.log('[Player] 🆕 SONG STARTED - Server triggered playback', {
				songIndex: event.songIndex,
				playerId: player.id,
				playerName: player.name
			});

			// Clear loading screen immediately (server controls timing)
			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}

			// Transition to ready_to_buzz state
			gameState = {
				status: 'ready_to_buzz',
				timeRemaining: event.duration
			};

			// Clear feedback from previous song
			feedbackMessage = null;

			// Update song info
			currentSongIndex = event.songIndex;
			maxSongDuration = event.duration;

			// Start smooth timer animation
			startSmoothTimer(event.duration);

			console.log('[Player] ✅ State reset complete - Ready to buzz');

			// Play audio if configured for players
			if (audioElement && (event.audioPlayback === 'players' || event.audioPlayback === 'all')) {
				console.log(`[Player] Playing audio (mode: ${event.audioPlayback})`);
				audioElement.src = event.audioUrl;
				audioElement.load();

				// Wait for audio to be ready, then start at clipStart
				audioElement.onloadedmetadata = () => {
					if (audioElement) {
						audioElement.currentTime = event.clipStart;
						audioElement.play().catch(err => {
							console.error('[Player Audio] Failed to play:', err);
						});
						// Audio stop is now controlled by server via song:ended event
						// This ensures audio continues playing during answer phase (artist → title questions)
					}
				};
			} else {
				console.log(`[Player] Not playing audio (mode: ${event.audioPlayback})`);
			}

			socket.events.clear('songStarted');
		}
	});

	// Subscribe to player:buzzed event
	$effect(() => {
		const event = socket.events.playerBuzzed;
		if (event) {
			console.log('[Player] player:buzzed received', {
				playerId: event.playerId,
				isForMe: event.playerId === player.id,
				modeType: event.modeType,
				hasArtistQuestion: !!event.artistQuestion,
				artistChoicesCount: event.artistQuestion?.choices?.length
			});

			// Update current mode type
			currentModeType = event.modeType;

			if (event.playerId === player.id) {
				// We buzzed successfully - transition based on mode type
				if (event.modeType === 'buzz_and_choice') {
					// Show multiple choice questions (artist first, then title)
					const choices = event.artistQuestion?.choices || [];
					gameState = {
						status: 'answering_choices',
						answerType: 'artist',
						choices,
						timeRemaining: answerTimeRemaining
					};

					console.log('[Player] Showing artist choices (mode: ' + event.modeType + ')', {
						count: choices.length,
						choices: choices.map(c => c.displayText)
					});
				} else if (event.modeType === 'fast_buzz') {
					// Fast buzz mode - waiting for master validation
					gameState = {
						status: 'fast_buzz_waiting',
						timeRemaining: answerTimeRemaining
					};
					console.log('[Player] Fast buzz mode - waiting for master validation');
				}
			} else {
				// Someone else buzzed - transition to watching state
				const playerName = event.playerName || get(socket.players).find(p => p.id === event.playerId)?.name || 'un autre joueur';
				gameState = {
					status: 'watching_other_player',
					playerName
				};
			}
			socket.events.clear('playerBuzzed');
		}
	});

	// Subscribe to buzz:rejected event
	$effect(() => {
		const event = socket.events.buzzRejected;
		if (event && event.playerId === player.id) {
			// Our buzz was rejected - transition back to ready_to_buzz
			console.log('[Player] Buzz rejected - returning to ready_to_buzz state');
			gameState = {
				status: 'ready_to_buzz',
				timeRemaining: timeRemaining
			};
			socket.events.clear('buzzRejected');
		}
	});

	// Subscribe to answer:result event
	$effect(() => {
		const event = socket.events.answerResult;
		if (event) {
			console.log('[Player] answer:result received', {
				playerId: event.playerId,
				isForMe: event.playerId === player.id,
				isCorrect: event.isCorrect,
				answerType: event.answerType,
				shouldShowTitleChoices: event.shouldShowTitleChoices,
				lockOutPlayer: event.lockOutPlayer
			});

			// Clear any existing feedback timeout
			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}

			if (event.playerId === player.id) {
				// This is MY answer result
				console.log('[Player] 📝 MY ANSWER RESULT', {
					answerType: event.answerType,
					isCorrect: event.isCorrect,
					shouldShowTitleChoices: event.shouldShowTitleChoices,
					lockOutPlayer: event.lockOutPlayer,
					pointsAwarded: event.pointsAwarded
				});

				if (event.isCorrect) {
					score += event.pointsAwarded;
					feedbackMessage = {
						type: 'success',
						text: `+${event.pointsAwarded}`
					};
				} else {
					feedbackMessage = {
						type: 'error',
						text: event.lockOutPlayer ? '❌' : '❌'
					};
				}

				// Handle state transitions based on result
				if (event.shouldShowTitleChoices) {
					// Artist answered correctly - wait for title choices
					// The choices:title event will transition us to answering_choices state
					console.log('[Player] ⏳ Waiting for title choices...');
					// Stay in current state temporarily
				} else if (event.lockOutPlayer) {
					// Wrong answer - locked out
					console.log('[Player] 🚫 LOCKED OUT');
					gameState = { status: 'locked_out' };
				} else if (event.isCorrect) {
					// Correct final answer - song will end soon
					console.log('[Player] 🏆 SONG WON - Waiting for song:ended');
					// Transition to idle while waiting for song:ended
					gameState = { status: 'idle' };
				} else {
					// Wrong answer but not locked out (shouldn't happen in current modes)
					gameState = { status: 'ready_to_buzz', timeRemaining: timeRemaining };
				}
			} else {
				// Another player's answer result
				if (event.isCorrect) {
					const answerTypeText = formatAnswerLabel(event.answerType, { withArticle: true });
					feedbackMessage = {
						type: 'info',
						text: `🏆 ${event.playerName} a trouvé ${answerTypeText} !`
					};
				} else {
					// Another player answered wrong
					feedbackMessage = {
						type: 'warning',
						text: `❌ ${event.playerName} s'est trompé !`
					};
				}

				// If someone else answered wrong and was locked out, allow others to buzz again
			if (event.lockOutPlayer && gameState.status === 'watching_other_player') {
				const fallbackRemaining = Math.ceil((smoothProgress / 100) * maxSongDuration);
				const remaining = timeRemaining > 0 ? timeRemaining : Math.max(fallbackRemaining, 0);
				gameState = {
					status: 'ready_to_buzz',
					timeRemaining: remaining
				};
				resumeSmoothTimerFromRemaining(remaining);
			}
			}

			// Auto-clear feedback after 3 seconds
			feedbackTimeout = window.setTimeout(() => {
				feedbackMessage = null;
			}, 3000);
			socket.events.clear('answerResult');
		}
	});

	// Subscribe to choices:title event
	$effect(() => {
		const event = socket.events.titleChoices;
		if (event) {
			console.log('[Player] choices:title event received', {
				playerId: event.playerId,
				isForMe: event.playerId === player.id,
				choices: event.titleQuestion?.choices.map(c => c.displayText)
			});

			if (event.playerId === player.id) {
				console.log('[Player] Showing title choices to me (second question)');
				const choices = event.titleQuestion?.choices || [];
				gameState = {
					status: 'answering_choices',
					answerType: 'title',
					choices,
					timeRemaining: answerTimeRemaining
				};
			}
			socket.events.clear('titleChoices');
		}
	});

	// Subscribe to song:ended event
	$effect(() => {
		const event = socket.events.songEnded;
		if (event) {
			console.log('[Player] 🏁 SONG ENDED - Showing answer', {
				correctTitle: event.correctTitle,
				correctArtist: event.correctArtist,
				winners: event.winners,
				playerId: player.id,
				playerName: player.name
			});

			// Stop audio playback (server controls when song ends)
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
				console.log('[Player Audio] Stopped by server song:ended event');
			}

			console.log('[Player] 👀 Entering answer reveal phase (5 seconds)');

			// Transition to answer_reveal state
			gameState = {
				status: 'answer_reveal',
				correctTitle: event.correctTitle,
				correctArtist: event.correctArtist,
				albumArt: event.albumArt,
				winners: event.winners
			};

			// Show correct answer as info message with winner info
			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}

			// Show winner toast if someone won
			if (event.winners && event.winners.length > 0) {
				const winner = event.winners[0]; // Top winner
				const isMe = winner.playerId === player.id;
				const winnerName = isMe ? 'Toi' : winner.playerName;
				feedbackMessage = {
					type: 'success',
					text: `🏆 ${winnerName} +${winner.pointsEarned}`
				};
			} else {
				feedbackMessage = null;
			}

			// Clear after 4 seconds (song will start new one after 5s delay on server)
			feedbackTimeout = window.setTimeout(() => {
				feedbackMessage = null;
			}, 4000);

			// Stop audio if playing
			if (audioElement) {
				audioElement.pause();
				audioElement.currentTime = 0;
				audioElement.src = '';
			}
			socket.events.clear('songEnded');
		}
	});

	// Subscribe to game:paused event
	$effect(() => {
		const event = socket.events.gamePaused;
		if (event) {
			// Pause audio playback when game is paused
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
				console.log('[Player Audio] Paused due to game pause');
			}

			socket.events.clear('gamePaused');
		}
	});

	// Subscribe to game:resumed event
	$effect(() => {
		const event = socket.events.gameResumed;
		if (event) {
			// Resume audio playback when game is resumed
			if (audioElement && audioElement.paused && audioElement.src) {
				audioElement.play().catch(err => {
					console.error('[Player Audio] Failed to resume:', err);
				});
				console.log('[Player Audio] Resumed after game resume');
			}

			socket.events.clear('gameResumed');
		}
	});

	// Cleanup on component unmount
	onDestroy(() => {
		// Clear any pending feedback timeout
		if (feedbackTimeout) {
			clearTimeout(feedbackTimeout);
			feedbackTimeout = null;
		}

		// Stop smooth timer animation
		stopSmoothTimer();

		// Stop and clean up audio element
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			audioElement.src = '';
		}
	});
</script>

<div class="player-interface" class:loading-active={gameState.status === 'loading'}>
	<!-- Reconnection Overlay -->
	{#if isReconnecting}
		<div class="reconnection-overlay">
			<div class="reconnection-content">
				<div class="reconnection-spinner"></div>
				<p>Reconnexion en cours...</p>
			</div>
		</div>
	{/if}

	<!-- ========================================================================
	     State-Based Rendering: Each state renders its own UI
	     ======================================================================== -->

	<!-- Loading State -->
	{#if gameState.status === 'loading'}
		<div class="loading-screen">
			{#if totalSongsInRound > 0}
				<div class="song-progress-indicator">
					{currentSongIndex + 2} / {totalSongsInRound}
				</div>
			{/if}
			<div class="loading-content">
				<div class="countdown-circle">
					<span class="countdown-number">{gameState.countdown}</span>
				</div>
				<h2 class="loading-title">Prochaine musique</h2>
				{#if gameState.genre}
					<div class="loading-info">
						<span class="info-badge genre">{gameState.genre}</span>
					</div>
				{/if}
			</div>

			<!-- Mini leaderboard during loading -->
			{#if leaderboard.length > 0}
				<div class="loading-leaderboard">
					<div class="loading-leaderboard-list">
						{#each leaderboard as p, index}
							<div class="loading-leaderboard-item" class:is-me={p.id === player.id}>
								<span class="leaderboard-rank">{index + 1}</span>
								<span class="leaderboard-name">{p.name}</span>
								<span class="leaderboard-score">{p.score ?? 0}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Feedback Message Toast (fixed position - no layout shift) -->
	{#if feedbackMessage}
		<div class="feedback-toast {feedbackMessage.type}">
			<div class="answer-text">{feedbackMessage.text}</div>
			{#if feedbackMessage.winnerText}
				<div class="winner-text">{feedbackMessage.winnerText}</div>
			{/if}
		</div>
	{/if}

	<!-- Ready to Buzz State -->
	{#if gameState.status === 'ready_to_buzz'}
		<div class="game-status">
			<p class="status-text">🎵 Écoute et buzze dès que tu as la réponse !</p>
			<div class="timer-bar">
				<div class="timer-fill" style="width: {smoothProgress}%"></div>
			</div>
			<div class="timer-text">{smoothTimeRemaining}s</div>
		</div>
		<button class="buzz-button" onclick={handleBuzz}>
			<span class="buzz-text">BUZZ&nbsp;!</span>
		</button>
	{/if}

	<!-- Buzzed Waiting for Server State -->
	{#if gameState.status === 'buzzed_waiting_server'}
		<div class="game-status">
			<p class="status-text">⏳ Buzz envoyé, en attente du serveur...</p>
		</div>
	{/if}

	<!-- Answering Choices State -->
	{#if gameState.status === 'answering_choices'}
		<BuzzAndChoiceUI
			currentChoices={gameState.choices}
			answerType={gameState.answerType}
			answerTimeRemaining={answerTimeRemaining}
			onAnswer={handleAnswer}
		/>
	{/if}

	<!-- Fast Buzz Waiting State -->
	{#if gameState.status === 'fast_buzz_waiting'}
		<FastBuzzUI
			hasBuzzed={true}
			answerTimeRemaining={answerTimeRemaining}
		/>
	{/if}

	<!-- Locked Out State -->
	{#if gameState.status === 'locked_out'}
		<div class="game-status">
			<p class="status-text error">🚫 Tu es bloqué pour cette musique</p>
		</div>
	{/if}

	<!-- Watching Other Player State -->
	{#if gameState.status === 'watching_other_player'}
		<div class="game-status">
			<p class="status-text">⏸️ {gameState.playerName} répond...</p>
		</div>
	{/if}

	<!-- Answer Reveal State -->
	{#if gameState.status === 'answer_reveal'}
		<div class="answer-reveal">
			{#if gameState.albumArt}
				<img src={gameState.albumArt} alt="Album cover" class="album-art" />
			{/if}
			<div class="answer-info">
				<p class="answer-title">{gameState.correctTitle}</p>
				<p class="answer-artist">{gameState.correctArtist}</p>
			</div>
		</div>
	{/if}

	<!-- Idle State (between rounds or waiting) -->
	{#if gameState.status === 'idle'}
		<div class="game-status">
			<p class="status-text">⏳ En attente...</p>
		</div>
	{/if}

	<!-- Audio player (hidden, for player-side audio playback) -->
	<audio bind:this={audioElement} style="display: none;"></audio>

	<!-- Volume control (floating) -->
	{#if gameState.status !== 'loading'}
		<VolumeControl {audioElement} />
	{/if}
</div>

<style>
	.player-interface {
		position: relative;
		max-width: 640px;
		margin: 0 auto;
		padding: 1.5rem;
		border-radius: 32px;
		background: rgba(255, 255, 255, 0.95);
		box-shadow: var(--aq-shadow-soft);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.player-interface.loading-active {
		background: transparent;
		box-shadow: none;
	}

	/* Toast notification (fixed position - no layout shift) */
	.feedback-toast {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1100;
		max-width: 90%;
		min-width: 280px;
		padding: 0.85rem 1.25rem;
		border-radius: 16px;
		font-weight: 600;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
		animation: toast-slide-in 0.3s ease-out;
	}

	@keyframes toast-slide-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.feedback-toast.success { background: rgba(248, 192, 39, 0.95); color: var(--aq-color-deep); }
	.feedback-toast.error { background: rgba(239, 76, 131, 0.95); color: #fff; }
	.feedback-toast.info { background: rgba(255, 255, 255, 0.98); color: var(--aq-color-deep); }
	.feedback-toast.warning { background: rgba(255, 140, 0, 0.95); color: #fff; }

	.answer-text {
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.winner-text {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		margin-top: 0.25rem;
	}

	.game-status {
		text-align: center;
	}

	.timer-bar {
		width: 100%;
		height: 10px;
		border-radius: 999px;
		background: rgba(18,43,59,0.1);
		overflow: hidden;
	}

	.timer-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--aq-color-primary), var(--aq-color-secondary));
	}

	.buzz-button {
		width: 220px;
		height: 220px;
		border-radius: 50%;
		border: none;
		background: radial-gradient(circle, var(--aq-color-primary), var(--aq-color-accent));
		color: #fff;
		font-size: 2rem;
		font-weight: 700;
		margin: 0 auto;
		box-shadow: 0 20px 40px rgba(239, 76, 131, 0.35);
		cursor: pointer;
	}

	/* Loading Screen */
	.loading-screen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #ef4c83, #f8c027);
		border-radius: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		z-index: 100;
		animation: fadeIn 0.3s ease-in-out;
		padding: 1rem;
		overflow-y: auto;
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
		width: 140px;
		height: 140px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		border: 4px solid rgba(255, 255, 255, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 0 0 20px rgba(255, 255, 255, 0);
		}
	}

	.countdown-number {
		font-size: 4rem;
		font-weight: 700;
		color: #fff;
	}

	.loading-title {
		font-size: 1.8rem;
		font-weight: 700;
		margin: 0;
		color: #fff;
	}

	.loading-info {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.info-badge {
		padding: 0.5rem 1.25rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.25);
		color: #fff;
		font-weight: 600;
		font-size: 0.95rem;
		border: 2px solid rgba(255, 255, 255, 0.4);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.info-badge.genre {
		border: 2px solid rgba(255, 255, 255, 0.3);
	}

	.info-badge.year {
		border: 2px solid rgba(255, 255, 255, 0.3);
	}

	/* Song progress indicator (top-left in loading screen) */
	.song-progress-indicator {
		position: absolute;
		top: 1rem;
		left: 1rem;
		background: rgba(255, 255, 255, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-radius: 12px;
		padding: 0.5rem 1rem;
		font-size: 1rem;
		font-weight: 700;
		color: #fff;
		backdrop-filter: blur(4px);
	}

	/* Loading Leaderboard */
	.loading-leaderboard {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		padding: 1rem;
		width: 100%;
		max-width: 320px;
		backdrop-filter: blur(8px);
	}

	.loading-leaderboard-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.loading-leaderboard-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
	}

	.loading-leaderboard-item.is-me {
		background: rgba(255, 255, 255, 0.25);
		border: 1px solid rgba(255, 255, 255, 0.4);
	}

	.loading-leaderboard-item.is-me .leaderboard-name {
		font-weight: 700;
	}

	.leaderboard-rank {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: #fff;
		flex-shrink: 0;
	}

	.leaderboard-name {
		flex: 1;
		font-size: 0.95rem;
		font-weight: 500;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.leaderboard-score {
		font-size: 0.95rem;
		font-weight: 700;
		color: #fff;
	}

	/* Reconnection Overlay */
	.reconnection-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(18, 43, 59, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease;
	}

	.reconnection-content {
		text-align: center;
		color: #fff;
	}

	.reconnection-content p {
		margin-top: 1rem;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.reconnection-spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--aq-color-primary);
		border-radius: 50%;
		margin: 0 auto;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Answer Reveal */
	.answer-reveal {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
		padding: 1rem;
	}

	.album-art {
		width: 180px;
		height: 180px;
		border-radius: 16px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		object-fit: cover;
	}

	.answer-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.answer-title {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--aq-color-deep);
		margin: 0;
	}

	.answer-artist {
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--aq-color-muted);
		margin: 0;
	}

</style>
