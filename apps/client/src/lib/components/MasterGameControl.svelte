<script lang="ts">
	import { onMount } from 'svelte';
	import type { Room } from '@blind-test/shared';
	import type { RoomSocket } from '$lib/stores/socket.svelte';

	// Props
	const { room, socket }: { room: Room; socket: RoomSocket } = $props();

	// Game state
	let currentSong = $state(0);
	let totalSongs = $state(10);
	let timeRemaining = $state(15);
	let isPaused = $state(false);
	let isPlaying = $state(false);
	let activePlayerName = $state<string>('Waiting for buzz...');
	let currentTitle = $state('Loading...');
	let currentArtist = $state('');

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

	function handleSkip() {
		// Stop current song
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
		}

		socket.skipSong();
	}

	function handleEndGame() {
		if (confirm('Are you sure you want to end the game?')) {
			// TODO: Implement end game logic
			console.log('Ending game...');
		}
	}

	// Listen for socket events
	onMount(() => {
		const originalOnMessage = socket.socket?.onmessage;

		if (socket.socket) {
			socket.socket.onmessage = (event) => {
				// Call original handler first
				originalOnMessage?.call(socket.socket, event);

				// Handle game events
				try {
					const message = JSON.parse(event.data);

					switch (message.type) {
						case 'round:started':
							totalSongs = message.data.songCount;
							isPlaying = true;
							break;

						case 'song:started':
							currentSong = message.data.songIndex;
							timeRemaining = message.data.duration;
							activePlayerName = 'Waiting for buzz...';
							currentTitle = `Song ${message.data.songIndex + 1}`;
							currentArtist = '';
							// TODO: Start playing audio
							break;

						case 'player:buzzed':
							// Find player name
							const player = socket.players.find((p) => p.id === message.data.playerId);
							activePlayerName = player?.name || 'Unknown Player';
							break;

						case 'song:ended':
							currentTitle = message.data.correctTitle;
							currentArtist = message.data.correctArtist;
							activePlayerName = 'Song ended';
							break;

						case 'game:paused':
							isPaused = true;
							break;

						case 'game:resumed':
							isPaused = false;
							break;

						case 'round:ended':
							isPlaying = false;
							break;
					}
				} catch (error) {
					console.error('Error handling game event:', error);
				}
			};
		}
	});
</script>

<div class="master-control">
	<div class="control-header">
		<h2>🎮 Master Controls</h2>
		<div class="song-progress">
			Song {currentSong + 1} / {totalSongs}
		</div>
	</div>

	<div class="song-info">
		<div class="timer">
			<div class="timer-circle">
				<span class="time">{timeRemaining}s</span>
			</div>
		</div>
		<div class="song-details">
			<p class="label">Now Playing</p>
			<h3 class="song-title">{currentTitle}</h3>
			<p class="song-artist">{currentArtist || '...'}</p>
		</div>
	</div>

	<div class="controls">
		<button class="control-btn pause-btn" onclick={handlePause}>
			{isPaused ? '▶️ Resume' : '⏸️ Pause'}
		</button>
		<button class="control-btn skip-btn" onclick={handleSkip}>
			⏭️ Skip Song
		</button>
		<button class="control-btn end-btn" onclick={handleEndGame}>
			🛑 End Game
		</button>
	</div>

	<div class="status-indicators">
		<div class="indicator">
			<span class="indicator-label">Status:</span>
			<span class="indicator-value">{isPaused ? 'Paused' : 'Playing'}</span>
		</div>
		<div class="indicator">
			<span class="indicator-label">Active Player:</span>
			<span class="indicator-value">{activePlayerName}</span>
		</div>
	</div>

	<!-- Audio player (hidden) -->
	<audio bind:this={audioElement} style="display: none;"></audio>
</div>

<style>
	.master-control {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 1rem;
		padding: 2rem;
		color: white;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	}

	.control-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.control-header h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.song-progress {
		background: rgba(255, 255, 255, 0.2);
		padding: 0.5rem 1rem;
		border-radius: 2rem;
		font-weight: 600;
	}

	.song-info {
		display: flex;
		gap: 2rem;
		align-items: center;
		margin-bottom: 2rem;
		background: rgba(255, 255, 255, 0.1);
		padding: 1.5rem;
		border-radius: 0.75rem;
	}

	.timer {
		flex-shrink: 0;
	}

	.timer-circle {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 4px solid rgba(255, 255, 255, 0.4);
	}

	.time {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.song-details {
		flex: 1;
	}

	.label {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		opacity: 0.8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.song-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
	}

	.song-artist {
		margin: 0;
		opacity: 0.9;
	}

	.controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.control-btn {
		flex: 1;
		padding: 1rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.pause-btn {
		background: #fbbf24;
		color: #78350f;
	}

	.pause-btn:hover {
		background: #f59e0b;
		transform: translateY(-2px);
	}

	.skip-btn {
		background: #3b82f6;
		color: white;
	}

	.skip-btn:hover {
		background: #2563eb;
		transform: translateY(-2px);
	}

	.end-btn {
		background: #ef4444;
		color: white;
	}

	.end-btn:hover {
		background: #dc2626;
		transform: translateY(-2px);
	}

	.status-indicators {
		display: flex;
		gap: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.indicator {
		display: flex;
		gap: 0.5rem;
	}

	.indicator-label {
		opacity: 0.8;
	}

	.indicator-value {
		font-weight: 600;
	}
</style>
