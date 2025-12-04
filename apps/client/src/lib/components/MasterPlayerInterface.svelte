<script lang="ts">
	/**
	 * MasterPlayerInterface - Hybrid component for when master is also playing
	 * Combines player game features with master controls
	 * Key: NO song info shown until reveal (fair play)
	 */
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import type { Player, AnswerChoice, Room } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';
	import { gameApi } from '$lib/api-helpers';
	import BuzzAndChoiceUI from './game/BuzzAndChoiceUI.svelte';
	import VolumeControl from './VolumeControl.svelte';

	// Props
	const { room, player, socket }: { room: Room; player: Player; socket: RoomSocket } = $props();

	// Get players from socket store for leaderboard display
	let allPlayers = $state<Player[]>([]);
	$effect(() => {
		const unsubscribe = socket.players.subscribe((players) => {
			allPlayers = players;
		});
		return unsubscribe;
	});

	// Sorted leaderboard
	let leaderboard = $derived(
		allPlayers
			.filter((p) => p.role === 'player')
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
	);

	// ========================================================================
	// State Machine (same as PlayerGameInterface)
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
		| { status: 'locked_out' }
		| { status: 'watching_other_player'; playerName: string }
		| { status: 'answer_reveal'; correctTitle: string; correctArtist: string; albumArt?: string; winners?: WinnerInfo[] };

	let gameState = $state<PlayerGameState>({ status: 'idle' });

	// ========================================================================
	// Game State
	// ========================================================================

	let currentSongIndex = $state(0);
	let totalSongsInRound = $state(0);
	let maxSongDuration = $state(15);
	let countdownInterval: number | null = null;
	let isPaused = $state(false);

	// Smooth timer animation
	let timerAnimationKey = $state(0);
	let timerStartTimestamp = $state(0);
	let timerRafId: number | null = null;
	let smoothProgress = $state(100);

	// Reactive timer values from socket
	const timeRemaining = $derived(socket.songTimeRemaining);
	const answerTimeRemaining = $derived(socket.answerTimeRemaining);

	// Player score
	let score = $state(player.score);

	// Feedback messages
	let feedbackMessage = $state<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);
	let feedbackTimeout: number | null = null;

	// Audio player
	let audioElement: HTMLAudioElement | null = $state(null);

	// ========================================================================
	// Helper Functions
	// ========================================================================

	function formatAnswerLabel(label: 'title' | 'artist', { withArticle = false } = {}) {
		if (withArticle) {
			return label === 'title' ? 'le titre' : "l'artiste";
		}
		return label === 'title' ? 'titre' : 'artiste';
	}

	function startSmoothTimer(durationSeconds: number, elapsedSeconds = 0) {
		stopSmoothTimer();
		const normalizedDuration = Math.max(durationSeconds, 0.001);
		const clampedElapsed = Math.min(Math.max(elapsedSeconds, 0), normalizedDuration);
		timerStartTimestamp = performance.now() - clampedElapsed * 1000;
		const initialRemaining = Math.max(0, normalizedDuration - clampedElapsed);
		smoothProgress = (initialRemaining / normalizedDuration) * 100;
		timerAnimationKey++;

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

	const smoothTimeRemaining = $derived(Math.ceil((smoothProgress / 100) * maxSongDuration));

	// ========================================================================
	// Master Controls
	// ========================================================================

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

	async function handleEndGame() {
		if (!confirm('Terminer la partie et calculer les scores finaux ?')) {
			return;
		}

		try {
			const response = await gameApi.end(room.id);
			if (response.error) {
				alert(`Impossible de terminer la partie : ${(response.error as any).value}`);
			}
		} catch (err) {
			alert('Impossible de terminer la partie. Réessaie.');
		}
	}

	// ========================================================================
	// Player Actions
	// ========================================================================

	function handleBuzz() {
		if (gameState.status !== 'ready_to_buzz') return;
		gameState = { status: 'buzzed_waiting_server' };
		socket.buzz(currentSongIndex);
	}

	function handleAnswer(value: string) {
		if (gameState.status !== 'answering_choices') return;
		const answerType = gameState.answerType;
		socket.submitAnswer(currentSongIndex, answerType, value);
	}

	// ========================================================================
	// Event Subscriptions
	// ========================================================================

	$effect(() => {
		const event = socket.events.roundStarted;
		if (event) {
			totalSongsInRound = event.songCount;
			gameState = { status: 'idle' };
			feedbackMessage = null;
			socket.events.clear('roundStarted');
		}
	});

	$effect(() => {
		const event = socket.events.songPreparing;
		if (event) {
			gameState = {
				status: 'loading',
				countdown: event.countdown,
				genre: event.genre
			};

			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
			}

			let countdown = event.countdown;
			countdownInterval = window.setInterval(() => {
				countdown--;
				if (countdown <= 0) {
					if (countdownInterval !== null) {
						clearInterval(countdownInterval);
						countdownInterval = null;
					}
				} else {
					gameState = { status: 'loading', countdown, genre: event.genre };
				}
			}, 1000);

			socket.events.clear('songPreparing');
		}
	});

	$effect(() => {
		const event = socket.events.songStarted;
		console.log('[MasterPlayerInterface] songStarted effect running, event:', event);
		if (event) {
			console.log('[MasterPlayerInterface] Processing songStarted - setting to ready_to_buzz');
			if (countdownInterval !== null) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}

			gameState = {
				status: 'ready_to_buzz',
				timeRemaining: event.duration
			};
			console.log('[MasterPlayerInterface] gameState after update:', gameState.status);

			feedbackMessage = null;
			currentSongIndex = event.songIndex;
			maxSongDuration = event.duration;
			startSmoothTimer(event.duration);

			// Play audio (master always plays audio when playing)
			if (audioElement) {
				audioElement.src = event.audioUrl;
				audioElement.load();
				audioElement.onloadedmetadata = () => {
					if (audioElement) {
						audioElement.currentTime = event.clipStart;
						audioElement.play().catch(err => {
							console.error('[MasterPlayer Audio] Failed to play:', err);
						});
					}
				};
			}

			socket.events.clear('songStarted');
		}
	});

	$effect(() => {
		const event = socket.events.playerBuzzed;
		if (event) {
			if (event.playerId === player.id) {
				// We buzzed successfully - only buzz_and_choice mode available when master plays
				const choices = event.artistQuestion?.choices || [];
				gameState = {
					status: 'answering_choices',
					answerType: 'artist',
					choices,
					timeRemaining: answerTimeRemaining
				};
			} else {
				// Someone else buzzed
				const playerName = event.playerName || get(socket.players).find(p => p.id === event.playerId)?.name || 'un autre joueur';
				gameState = {
					status: 'watching_other_player',
					playerName
				};
			}
			socket.events.clear('playerBuzzed');
		}
	});

	$effect(() => {
		const event = socket.events.buzzRejected;
		if (event && event.playerId === player.id) {
			gameState = {
				status: 'ready_to_buzz',
				timeRemaining: timeRemaining
			};
			socket.events.clear('buzzRejected');
		}
	});

	$effect(() => {
		const event = socket.events.answerResult;
		if (event) {
			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}

			if (event.playerId === player.id) {
				if (event.isCorrect) {
					score += event.pointsAwarded;
					feedbackMessage = {
						type: 'success',
						text: `+${event.pointsAwarded}`
					};
				} else {
					feedbackMessage = {
						type: 'error',
						text: '❌'
					};
				}

				if (event.shouldShowTitleChoices) {
					// Wait for title choices
				} else if (event.lockOutPlayer) {
					gameState = { status: 'locked_out' };
				} else if (event.isCorrect) {
					gameState = { status: 'idle' };
				} else {
					gameState = { status: 'ready_to_buzz', timeRemaining: timeRemaining };
				}
			} else {
				if (event.isCorrect) {
					const answerTypeText = formatAnswerLabel(event.answerType, { withArticle: true });
					feedbackMessage = {
						type: 'info',
						text: `🏆 ${event.playerName} a trouvé ${answerTypeText} !`
					};
				} else {
					feedbackMessage = {
						type: 'warning',
						text: `❌ ${event.playerName} s'est trompé !`
					};
				}

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

			feedbackTimeout = window.setTimeout(() => {
				feedbackMessage = null;
			}, 3000);
			socket.events.clear('answerResult');
		}
	});

	$effect(() => {
		const event = socket.events.titleChoices;
		if (event && event.playerId === player.id) {
			const choices = event.titleQuestion?.choices || [];
			gameState = {
				status: 'answering_choices',
				answerType: 'title',
				choices,
				timeRemaining: answerTimeRemaining
			};
			socket.events.clear('titleChoices');
		}
	});

	$effect(() => {
		const event = socket.events.songEnded;
		if (event) {
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
			}

			// NOW we can see the song info (fair play!)
			gameState = {
				status: 'answer_reveal',
				correctTitle: event.correctTitle,
				correctArtist: event.correctArtist,
				albumArt: event.albumArt,
				winners: event.winners
			};

			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}

			if (event.winners && event.winners.length > 0) {
				const winner = event.winners[0];
				const isMe = winner.playerId === player.id;
				const winnerName = isMe ? 'Toi' : winner.playerName;
				feedbackMessage = {
					type: 'success',
					text: `🏆 ${winnerName} +${winner.pointsEarned}`
				};
			} else {
				feedbackMessage = null;
			}

			feedbackTimeout = window.setTimeout(() => {
				feedbackMessage = null;
			}, 4000);

			if (audioElement) {
				audioElement.pause();
				audioElement.currentTime = 0;
				audioElement.src = '';
			}
			socket.events.clear('songEnded');
		}
	});

	$effect(() => {
		const event = socket.events.gamePaused;
		if (event) {
			isPaused = true;
			if (audioElement && !audioElement.paused) {
				audioElement.pause();
			}
			socket.events.clear('gamePaused');
		}
	});

	$effect(() => {
		const event = socket.events.gameResumed;
		if (event) {
			isPaused = false;
			if (audioElement && audioElement.paused && audioElement.src) {
				audioElement.play().catch(err => {
					console.error('[MasterPlayer Audio] Failed to resume:', err);
				});
			}
			socket.events.clear('gameResumed');
		}
	});

	onDestroy(() => {
		if (feedbackTimeout) {
			clearTimeout(feedbackTimeout);
		}
		stopSmoothTimer();
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			audioElement.src = '';
		}
	});
</script>

<div class="master-player-interface" class:loading-active={gameState.status === 'loading'}>
	<!-- Master Controls Bar (always visible except during loading) -->
	{#if gameState.status !== 'loading'}
		<div class="master-controls-bar">
			<div class="master-info">
				<span class="master-badge">Tu joues</span>
				{#if totalSongsInRound > 0}
					<span class="song-progress">{currentSongIndex + 1} / {totalSongsInRound}</span>
				{/if}
			</div>
			<div class="master-actions">
				<button class="control-btn pause-btn" onclick={handlePause}>
					{isPaused ? '▶️' : '⏸️'}
				</button>
				<button class="control-btn end-btn" onclick={handleEndGame}>
					🛑
				</button>
			</div>
		</div>
	{/if}

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

	<!-- Feedback Toast -->
	{#if feedbackMessage}
		<div class="feedback-toast {feedbackMessage.type}">
			<div class="answer-text">{feedbackMessage.text}</div>
		</div>
	{/if}

	<!-- Ready to Buzz State -->
	{#if gameState.status === 'ready_to_buzz'}
		<div class="game-status">
			<p class="status-text">🎵 Buzze dès que tu as la réponse !</p>
			<div class="timer-bar">
				<div class="timer-fill" style="width: {smoothProgress}%"></div>
			</div>
			<div class="timer-text">{smoothTimeRemaining}s</div>
		</div>
		<button class="buzz-button" onclick={handleBuzz}>
			<span class="buzz-text">BUZZ&nbsp;!</span>
		</button>
	{/if}

	<!-- Buzzed Waiting -->
	{#if gameState.status === 'buzzed_waiting_server'}
		<div class="game-status">
			<p class="status-text">⏳ Buzz envoyé...</p>
		</div>
	{/if}

	<!-- Answering Choices -->
	{#if gameState.status === 'answering_choices'}
		<BuzzAndChoiceUI
			currentChoices={gameState.choices}
			answerType={gameState.answerType}
			answerTimeRemaining={answerTimeRemaining}
			onAnswer={handleAnswer}
		/>
	{/if}

	<!-- Locked Out -->
	{#if gameState.status === 'locked_out'}
		<div class="game-status">
			<p class="status-text error">🚫 Bloqué pour cette musique</p>
		</div>
	{/if}

	<!-- Watching Other Player -->
	{#if gameState.status === 'watching_other_player'}
		<div class="game-status">
			<p class="status-text">⏸️ {gameState.playerName} répond...</p>
		</div>
	{/if}

	<!-- Answer Reveal (NOW we can see song info!) -->
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

	<!-- Idle State -->
	{#if gameState.status === 'idle'}
		<div class="game-status">
			<p class="status-text">⏳ En attente...</p>
		</div>
	{/if}

	<!-- Audio player (hidden) -->
	<audio bind:this={audioElement} style="display: none;"></audio>

	<!-- Volume control -->
	{#if gameState.status !== 'loading'}
		<VolumeControl {audioElement} />
	{/if}
</div>

<style>
	.master-player-interface {
		position: relative;
		width: 100%;
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

	.master-player-interface.loading-active {
		background: transparent;
		box-shadow: none;
	}

	/* Master Controls Bar */
	.master-controls-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		border-radius: 16px;
		color: #fff;
	}

	.master-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.master-badge {
		padding: 0.3rem 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.song-progress {
		font-size: 0.9rem;
		opacity: 0.9;
	}

	.master-actions {
		display: flex;
		gap: 0.5rem;
	}

	.control-btn {
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.2);
		cursor: pointer;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 150ms ease;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Feedback Toast */
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

	.game-status {
		text-align: center;
	}

	.status-text {
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--aq-color-deep);
	}

	.status-text.error {
		color: var(--aq-color-primary);
	}

	.timer-bar {
		width: 100%;
		height: 10px;
		border-radius: 999px;
		background: rgba(18,43,59,0.1);
		overflow: hidden;
		margin: 0.75rem 0 0.5rem;
	}

	.timer-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--aq-color-primary), var(--aq-color-secondary));
	}

	.timer-text {
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.buzz-button {
		width: 200px;
		height: 200px;
		border-radius: 50%;
		border: none;
		background: radial-gradient(circle, var(--aq-color-primary), var(--aq-color-accent));
		color: #fff;
		font-size: 1.8rem;
		font-weight: 700;
		margin: 0 auto;
		box-shadow: 0 20px 40px rgba(239, 76, 131, 0.35);
		cursor: pointer;
		transition: transform 100ms ease, box-shadow 100ms ease;
	}

	.buzz-button:active {
		transform: scale(0.95);
		box-shadow: 0 10px 20px rgba(239, 76, 131, 0.3);
	}

	/* Loading Screen */
	.loading-screen {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #ef4c83, #f8c027);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		z-index: 100;
		animation: fadeIn 0.3s ease-in-out;
		padding: 1rem;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
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
		0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
		50% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255, 255, 255, 0); }
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
	}

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
	}

	.loading-leaderboard {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		padding: 1rem;
		width: 100%;
		max-width: 320px;
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
	}

	.leaderboard-name {
		flex: 1;
		font-size: 0.95rem;
		font-weight: 500;
		color: #fff;
	}

	.leaderboard-score {
		font-size: 0.95rem;
		font-weight: 700;
		color: #fff;
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
