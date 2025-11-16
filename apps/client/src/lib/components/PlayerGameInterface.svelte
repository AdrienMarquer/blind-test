<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import type { Player, AnswerChoice } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';
	import BuzzAndChoiceUI from './game/BuzzAndChoiceUI.svelte';
	import FastBuzzUI from './game/FastBuzzUI.svelte';
	import TextInputUI from './game/TextInputUI.svelte';

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
	let currentModeType = $state<'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer'>('buzz_and_choice');
	let isSongPlaying = $state(false); // True when a song is actively playing

	// Reactive timer values from socket
	const timeRemaining = $derived(socket.songTimeRemaining);
	const answerTimeRemaining = $derived(socket.answerTimeRemaining);

	function formatAnswerLabel(label: 'title' | 'artist', { withArticle = false } = {}) {
		if (withArticle) {
			return label === 'title' ? 'le titre' : "l'artiste";
		}
		return label === 'title' ? 'titre' : 'artiste';
	}

	// Choices - now using AnswerChoice objects
	let currentChoices = $state<AnswerChoice[]>([]);

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

			// Update mode type for the new round
			currentModeType = event.modeType as 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer';

			// Clear any residual state from previous round
			hasBuzzed = false;
			canBuzz = false; // Will be enabled when song starts
			showChoices = false;
			isLockedOut = false;
			someoneElseAnswering = false;
			activePlayerAnswering = '';
			currentChoices = [];
			feedbackMessage = null;

			console.log('[Player] ✅ Round started - Mode updated to:', currentModeType);
			socket.events.clear('roundStarted');
		}
	});

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
			isSongPlaying = true; // Song is now playing

			// Clear all old choices and state
			currentChoices = [];
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
			console.log('[Player] player:buzzed received', {
				playerId: event.playerId,
				isForMe: event.playerId === player.id,
				modeType: event.modeType,
				hasTitleQuestion: !!event.titleQuestion,
				titleChoicesCount: event.titleQuestion?.choices?.length
			});

			// Update current mode type
			currentModeType = event.modeType;

			if (event.playerId === player.id) {
				// We buzzed successfully - handle based on mode type
				someoneElseAnswering = false;

				if (event.modeType === 'buzz_and_choice' || event.modeType === 'timed_answer') {
					// Show multiple choice questions
					currentChoices = event.titleQuestion?.choices || [];
					showChoices = true;
					answerType = 'title';

					console.log('[Player] Showing title choices (mode: ' + event.modeType + ')', {
						count: currentChoices.length,
						choices: currentChoices.map(c => c.displayText)
					});
				} else if (event.modeType === 'fast_buzz') {
					// Fast buzz mode - no choices, waiting for master validation
					showChoices = false;
					console.log('[Player] Fast buzz mode - waiting for master validation');
				} else if (event.modeType === 'text_input') {
					// Text input mode - would show text input field (future implementation)
					showChoices = false;
					console.log('[Player] Text input mode - would show text input');
				}
			} else {
				// Someone else buzzed - disable our buzzing and show who is answering
				const playerName = event.playerName || get(socket.players).find(p => p.id === event.playerId)?.name || 'un autre joueur';
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
					const answerTypeText = formatAnswerLabel(event.answerType);
					feedbackMessage = {
						type: 'success',
						text: `✅ Bonne réponse (${answerTypeText}) ! +${event.pointsAwarded} point${event.pointsAwarded !== 1 ? 's' : ''}`
					};
				} else {
					const answerTypeText = formatAnswerLabel(event.answerType);
					feedbackMessage = {
						type: 'error',
						text: `❌ Mauvaise réponse (${answerTypeText}). ${event.lockOutPlayer ? 'Tu es bloqué.' : ''}`
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
					const answerTypeText = formatAnswerLabel(event.answerType, { withArticle: true });
					feedbackMessage = {
						type: 'info',
						text: `🏆 ${event.playerName} a trouvé ${answerTypeText} !`
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
				choices: event.artistQuestion?.choices.map(c => c.displayText),
				currentState: { showChoices, hasBuzzed, answerType }
			});

			if (event.playerId === player.id) {
				console.log('[Player] Showing artist choices to me');
				currentChoices = event.artistQuestion?.choices || [];
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
			isSongPlaying = false; // Song is no longer playing

			console.log('[Player] 👀 Entering answer reveal phase (5 seconds)');

			// Show correct answer as info message
			if (feedbackTimeout) {
				clearTimeout(feedbackTimeout);
			}
			feedbackMessage = {
				type: 'info',
				text: `✅ Réponse : « ${event.correctTitle} » par ${event.correctArtist}`
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
			<span class="score-label">Ton score</span>
			<span class="score-value">{score}</span>
		</div>
	</div>

	<!-- Feedback Message -->
	{#if feedbackMessage}
		<div class="feedback-message {feedbackMessage.type}">
			{feedbackMessage.text}
		</div>
	{/if}

	<!-- Game Status -->
	{#if isSongPlaying}
		<div class="game-status">
			{#if isLockedOut}
				<!-- Show nothing for locked out players -->
			{:else if someoneElseAnswering}
				<p class="status-text">⏸️ {activePlayerAnswering} répond...</p>
			{:else if canBuzz}
				<p class="status-text">🎵 Écoute et buzze dès que tu as la réponse !</p>
				<div class="timer-bar">
					<div class="timer-fill" style="width: {(timeRemaining / maxSongDuration) * 100}%"></div>
				</div>
				<div class="timer-text">{timeRemaining}s</div>
			{/if}
		</div>
	{/if}

	<!-- Buzz Button (for modes that support buzzing) -->
	{#if currentModeType !== 'text_input' && !hasBuzzed && canBuzz && !someoneElseAnswering && !isLockedOut}
		<button class="buzz-button" onclick={handleBuzz} disabled={!canBuzz || someoneElseAnswering || isLockedOut}>
			<span class="buzz-text">BUZZ&nbsp;!</span>
		</button>
	{/if}

	<!-- Mode-Specific UI Components -->
	{#if showChoices && (currentModeType === 'buzz_and_choice' || currentModeType === 'timed_answer')}
		<BuzzAndChoiceUI
			{currentChoices}
			{answerType}
			answerTimeRemaining={answerTimeRemaining}
			onAnswer={handleAnswer}
		/>
	{:else if hasBuzzed && currentModeType === 'fast_buzz'}
		<FastBuzzUI
			{hasBuzzed}
			answerTimeRemaining={answerTimeRemaining}
		/>
	{:else if currentModeType === 'text_input'}
		<TextInputUI
			onSubmit={(title, artist) => {
				if (title) handleAnswer(title);
				if (artist) handleAnswer(artist);
			}}
			answerTimeRemaining={answerTimeRemaining}
		/>
	{/if}

	<!-- Audio player (hidden, for player-side audio playback) -->
	<audio bind:this={audioElement} style="display: none;"></audio>
</div>

<style>
	.player-interface {
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

	.score-card {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		border-radius: 24px;
		color: #fff;
		padding: 1.5rem;
		text-align: center;
	}

	.feedback-message {
		padding: 0.85rem 1rem;
		border-radius: 16px;
		font-weight: 600;
		text-align: center;
	}

	.feedback-message.success { background: rgba(248,192,39,0.2); color: var(--aq-color-secondary); }
	.feedback-message.error { background: rgba(239,76,131,0.15); color: var(--aq-color-primary); }
	.feedback-message.info { background: rgba(18,43,59,0.08); color: var(--aq-color-deep); }

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

</style>
