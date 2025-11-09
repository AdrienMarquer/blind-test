<script lang="ts">
	import type { Player } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';

	// Props
	const { player, socket }: { player: Player; socket: RoomSocket } = $props();

	// Game state
	let canBuzz = $state(true);
	let hasBuzzed = $state(false);
	let showChoices = $state(false);
	let answerType: 'title' | 'artist' = $state('title');
	let timeRemaining = $state(15);
	let answerTimeRemaining = $state(5);
	let currentSongIndex = $state(0);
	let isLockedOut = $state(false);

	// Choices
	let titleChoices = $state<string[]>([]);
	let artistChoices = $state<string[]>([]);

	// Player score
	let score = $state(player.score);

	function handleBuzz() {
		if (!canBuzz || hasBuzzed || isLockedOut) return;

		hasBuzzed = true;
		canBuzz = false;

		// Send buzz to server
		socket.buzz(currentSongIndex);
	}

	function handleAnswer(value: string) {
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
			// Reset for new song
			hasBuzzed = false;
			canBuzz = true;
			showChoices = false;
			isLockedOut = false;
			currentSongIndex = event.songIndex;
			timeRemaining = event.duration;
		}
	});

	// Subscribe to player:buzzed event
	$effect(() => {
		const event = socket.events.playerBuzzed;
		if (event && event.playerId === player.id) {
			// We buzzed successfully - show title choices
			titleChoices = event.titleChoices || [];
			showChoices = true;
			answerType = 'title';
		}
	});

	// Subscribe to buzz:rejected event
	$effect(() => {
		const event = socket.events.buzzRejected;
		if (event && event.playerId === player.id) {
			// Our buzz was rejected - allow rebuzz
			hasBuzzed = false;
			canBuzz = true;
		}
	});

	// Subscribe to answer:result event
	$effect(() => {
		const event = socket.events.answerResult;
		if (event && event.playerId === player.id) {
			if (event.isCorrect) {
				score += event.pointsAwarded;
			}

			// Check if we should show artist choices or get locked out
			if (event.shouldShowArtistChoices) {
				// Will receive choices:artist event next
			} else if (event.lockOutPlayer) {
				isLockedOut = true;
				canBuzz = false;
				showChoices = false;
			}
		}
	});

	// Subscribe to choices:artist event
	$effect(() => {
		const event = socket.events.artistChoices;
		if (event && event.playerId === player.id) {
			artistChoices = event.artistChoices || [];
			showChoices = true;
			answerType = 'artist';
		}
	});

	// Subscribe to song:ended event
	$effect(() => {
		const event = socket.events.songEnded;
		if (event) {
			// Song finished - reset state
			showChoices = false;
			hasBuzzed = false;
			canBuzz = false;
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

	<!-- Game Status -->
	<div class="game-status">
		{#if !hasBuzzed && canBuzz}
			<p class="status-text">🎵 Listen and buzz when you know the answer!</p>
			<div class="timer-bar">
				<div class="timer-fill" style="width: {(timeRemaining / 15) * 100}%"></div>
			</div>
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
			<p class="status-text">🔒 Someone else is answering...</p>
		{/if}
	</div>

	<!-- Buzz Button -->
	{#if !hasBuzzed && canBuzz}
		<button class="buzz-button" onclick={handleBuzz} disabled={!canBuzz}>
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

	<!-- Locked Out State -->
	{#if !canBuzz && !hasBuzzed}
		<div class="locked-out">
			<p>🚫 You're locked out for this song</p>
		</div>
	{/if}
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
