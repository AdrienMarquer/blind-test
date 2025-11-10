<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Player } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';

	// Props
	const { player, socket }: { player: Player; socket: RoomSocket } = $props();

	// Game state
	let canBuzz = $state(true);
	let hasBuzzed = $state(false);
	let showChoices = $state(false);
	let answerType: 'title' | 'artist' = $state('title');
	let currentSongIndex = $state(0);
	let isLockedOut = $state(false);
	let maxSongDuration = $state(15); // Track max duration for timer bar calculation
	let someoneElseAnswering = $state(false);
	let activePlayerAnswering = $state<string>(''); // Name of player currently answering

	// Reactive timer values from socket
	const timeRemaining = $derived(socket.songTimeRemaining);
	const answerTimeRemaining = $derived(socket.answerTimeRemaining);

	// Choices
	let titleChoices = $state<string[]>([]);
	let artistChoices = $state<string[]>([]);

	// Player score
	let score = $state(player.score);

	// Feedback messages
	let feedbackMessage = $state<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
	let feedbackTimeout: number | null = null; // NOT a $state - just a regular variable for timer ID

	// Audio player (for when audio plays on player devices)
	let audioElement: HTMLAudioElement | null = $state(null);

	function handleBuzz() {
		if (!canBuzz || hasBuzzed || isLockedOut) return;

		hasBuzzed = true;
		canBuzz = false;

		// Send buzz to server
		socket.buzz(currentSongIndex);
	}

	function handleAnswer(value: string) {
		console.log('[Player] Submitting answer', {
			songIndex: currentSongIndex,
			answerType,
			value,
			playerId: player.id
		});

		// Send answer to server
		socket.submitAnswer(currentSongIndex, answerType, value);

		// Hide choices and wait for result
		showChoices = false;
	}

	// ========================================================================
	// Reactive Event Subscriptions using $effect()
	// ========================================================================

	// Subscribe to song:started event
	$effect(() => {
		const event = socket.events.songStarted;
		if (event) {
			console.log('[Player] 🆕 NEW SONG STARTED - Resetting ALL state', {
				songIndex: event.songIndex,
				playerId: player.id,
				playerName: player.name
			});

			// COMPLETE state reset for new song
			hasBuzzed = false;
			canBuzz = true;
			showChoices = false;
			isLockedOut = false;
			someoneElseAnswering = false;
			activePlayerAnswering = '';

			// Clear all old choices and state
			titleChoices = [];
			artistChoices = [];
			answerType = 'title';
			feedbackMessage = null;

			// Update song info
			currentSongIndex = event.songIndex;
			maxSongDuration = event.duration;

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

						// Stop after duration seconds
						setTimeout(() => {
							if (audioElement) {
								audioElement.pause();
								console.log(`[Player Audio] Stopped after ${event.duration}s`);
							}
						}, event.duration * 1000);
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
			if (event.playerId === player.id) {
				// We buzzed successfully - show title choices
				titleChoices = event.titleChoices || [];
				showChoices = true;
				answerType = 'title';
				someoneElseAnswering = false;
			} else {
				// Someone else buzzed - disable our buzzing and show who is answering
				const playerName = event.playerName || socket.players.find(p => p.id === event.playerId)?.name || 'Another player';
				activePlayerAnswering = playerName;
				someoneElseAnswering = true;
				canBuzz = false;
			}
			socket.events.clear('playerBuzzed');
		}
	});

	// Subscribe to buzz:rejected event
	$effect(() => {
		const event = socket.events.buzzRejected;
		if (event && event.playerId === player.id) {
			// Our buzz was rejected - allow rebuzz
			hasBuzzed = false;
			canBuzz = true;
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
				shouldShowArtistChoices: event.shouldShowArtistChoices,
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
					shouldShowArtistChoices: event.shouldShowArtistChoices,
					lockOutPlayer: event.lockOutPlayer,
					pointsAwarded: event.pointsAwarded
				});

				if (event.isCorrect) {
					score += event.pointsAwarded;
					const answerTypeText = event.answerType === 'title' ? 'title' : 'artist';
					feedbackMessage = {
						type: 'success',
						text: `✅ Correct ${answerTypeText}! +${event.pointsAwarded} point${event.pointsAwarded !== 1 ? 's' : ''}`
					};
				} else {
					const answerTypeText = event.answerType === 'title' ? 'title' : 'artist';
					feedbackMessage = {
						type: 'error',
						text: `❌ Wrong ${answerTypeText}. ${event.lockOutPlayer ? 'You are locked out.' : ''}`
					};
				}

				// Handle next state based on result
				if (event.shouldShowArtistChoices) {
					// Correct title - wait for artist choices
					console.log('[Player] ⏳ Waiting for artist choices...');
					// Keep current state, choices:artist event will show the choices
				} else if (event.lockOutPlayer) {
					// Wrong answer - locked out
					console.log('[Player] 🚫 LOCKED OUT');
					isLockedOut = true;
					canBuzz = false;
					showChoices = false;
					hasBuzzed = false;
				} else {
					// Correct final answer (artist) - song will end
					console.log('[Player] 🏆 SONG WON - Waiting for song:ended');
					showChoices = false;
					hasBuzzed = false;
					canBuzz = false; // Will be reset by song:started
				}
			} else {
				// Another player's answer result
				if (event.isCorrect) {
					const answerTypeText = event.answerType === 'title' ? 'title' : 'artist';
					feedbackMessage = {
						type: 'info',
						text: `🏆 ${event.playerName} got the ${answerTypeText} correct!`
					};
				}

				// If someone else answered wrong and was locked out, allow others to buzz again
				if (event.lockOutPlayer && !isLockedOut) {
					someoneElseAnswering = false;
					canBuzz = true;
				}
			}

			// Auto-clear feedback after 3 seconds
			feedbackTimeout = window.setTimeout(() => {
				feedbackMessage = null;
			}, 3000);
			socket.events.clear('answerResult');
		}
	});

	// Subscribe to choices:artist event
	$effect(() => {
		const event = socket.events.artistChoices;
		if (event) {
			console.log('[Player] choices:artist event received', {
				playerId: event.playerId,
				isForMe: event.playerId === player.id,
				choices: event.artistChoices,
				currentState: { showChoices, hasBuzzed, answerType }
			});

			if (event.playerId === player.id) {
				console.log('[Player] Showing artist choices to me');
				artistChoices = event.artistChoices || [];
				showChoices = true;
				answerType = 'artist';
			}
			socket.events.clear('artistChoices');
		}
	});

	// Subscribe to song:ended event
	$effect(() => {
		const event = socket.events.songEnded;
		if (event) {
			console.log('[Player] 🏁 SONG ENDED - Showing answer', {
				correctTitle: event.correctTitle,
				correctArtist: event.correctArtist,
				playerId: player.id,
				playerName: player.name
			});

			// Song finished - disable interaction during answer reveal
			showChoices = false;
			hasBuzzed = false;
			canBuzz = false;

			console.log('[Player] 👀 Entering answer reveal phase (5 seconds)');

			// Show correct answer as info message
			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}
			feedbackMessage = {
				type: 'info',
				text: `✅ Answer: "${event.correctTitle}" by ${event.correctArtist}`
			};

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

	// Cleanup on component unmount
	onDestroy(() => {
		// Clear any pending feedback timeout
		if (feedbackTimeout) {
			clearTimeout(feedbackTimeout);
			feedbackTimeout = null;
		}

		// Stop and clean up audio element
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			audioElement.src = '';
		}
	});
</script>

<div class="player-interface">
	<!-- Score Display -->
	<div class="score-display">
		<div class="score-card">
			<span class="score-label">Your Score</span>
			<span class="score-value">{score}</span>
		</div>
		<div class="player-name">{player.name}</div>
	</div>

	<!-- Feedback Message -->
	{#if feedbackMessage}
		<div class="feedback-message {feedbackMessage.type}">
			{feedbackMessage.text}
		</div>
	{/if}

	<!-- Game Status -->
	<div class="game-status">
		{#if isLockedOut}
			<p class="status-text">🚫 You're locked out for this song</p>
		{:else if someoneElseAnswering}
			<p class="status-text">⏸️ {activePlayerAnswering} is answering...</p>
		{:else if !hasBuzzed && canBuzz}
			<p class="status-text">🎵 Listen and buzz when you know the answer!</p>
			<div class="timer-bar">
				<div class="timer-fill" style="width: {(timeRemaining / maxSongDuration) * 100}%"></div>
			</div>
			<div class="timer-text">{timeRemaining}s</div>
		{:else if hasBuzzed && !showChoices}
			<p class="status-text">⏳ Waiting for choices...</p>
		{:else if showChoices}
			<p class="status-text">
				{answerType === 'title' ? '🎵 Select the title' : '🎤 Select the artist'}
			</p>
			<div class="answer-timer">
				<span>{answerTimeRemaining}s</span>
			</div>
		{:else}
			<p class="status-text">⏸️ Waiting...</p>
		{/if}
	</div>

	<!-- Buzz Button -->
	{#if !hasBuzzed && canBuzz && !someoneElseAnswering && !isLockedOut}
		<button class="buzz-button" onclick={handleBuzz} disabled={!canBuzz || someoneElseAnswering || isLockedOut}>
			<span class="buzz-text">BUZZ!</span>
		</button>
	{/if}

	<!-- Multiple Choice -->
	{#if showChoices}
		<div class="choices">
			{#if answerType === 'title'}
				{#each titleChoices as choice}
					<button class="choice-button" onclick={() => handleAnswer(choice)}>
						{choice}
					</button>
				{/each}
			{:else}
				{#each artistChoices as choice}
					<button class="choice-button" onclick={() => handleAnswer(choice)}>
						{choice}
					</button>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- Locked Out State (moved to status message above, remove this duplicate) -->

	<!-- Audio player (hidden, for player-side audio playback) -->
	<audio bind:this={audioElement} style="display: none;"></audio>
</div>

<style>
	.player-interface {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
	}

	.score-display {
		text-align: center;
		margin-bottom: 2rem;
	}

	.score-card {
		display: inline-flex;
		flex-direction: column;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 1.5rem 3rem;
		border-radius: 1rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
		margin-bottom: 1rem;
	}

	.score-label {
		font-size: 0.875rem;
		opacity: 0.9;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.score-value {
		font-size: 3rem;
		font-weight: 700;
		margin-top: 0.5rem;
	}

	.player-name {
		font-weight: 600;
		color: #4b5563;
	}

	.feedback-message {
		padding: 1rem 1.5rem;
		border-radius: 0.75rem;
		font-weight: 600;
		text-align: center;
		margin-bottom: 1.5rem;
		animation: slideIn 0.3s ease-out;
	}

	.feedback-message.success {
		background: #d1fae5;
		color: #065f46;
		border: 2px solid #10b981;
	}

	.feedback-message.error {
		background: #fee2e2;
		color: #991b1b;
		border: 2px solid #ef4444;
	}

	.feedback-message.info {
		background: #dbeafe;
		color: #1e40af;
		border: 2px solid #3b82f6;
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

	.game-status {
		text-align: center;
		margin-bottom: 2rem;
	}

	.status-text {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 1rem;
	}

	.timer-bar {
		width: 100%;
		height: 8px;
		background: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
	}

	.timer-fill {
		height: 100%;
		background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%);
		transition: width 1s linear;
	}

	.timer-text {
		margin-top: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: #1f2937;
		text-align: center;
	}

	.answer-timer {
		display: inline-block;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: #fbbf24;
		color: #78350f;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.buzz-button {
		width: 100%;
		height: 200px;
		border: none;
		border-radius: 50%;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		color: white;
		font-size: 3rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 20px 50px rgba(239, 68, 68, 0.4);
		transition: all 0.2s;
		margin: 0 auto;
		display: block;
		aspect-ratio: 1;
		max-width: 300px;
	}

	.buzz-button:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 25px 60px rgba(239, 68, 68, 0.5);
	}

	.buzz-button:active:not(:disabled) {
		transform: scale(0.95);
	}

	.buzz-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.buzz-text {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 2rem;
	}

	.choice-button {
		padding: 1.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.75rem;
		background: white;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		color: #1f2937;
	}

	.choice-button:hover {
		border-color: #3b82f6;
		background: #eff6ff;
		transform: translateY(-2px);
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
	}

	.locked-out {
		text-align: center;
		padding: 2rem;
		background: #fee2e2;
		border-radius: 0.75rem;
		color: #991b1b;
		font-weight: 600;
	}

	.locked-out p {
		margin: 0;
	}
</style>
