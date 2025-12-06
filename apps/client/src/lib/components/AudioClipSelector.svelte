<script lang="ts">
	/**
	 * Audio Clip Selector Component
	 * Allows user to preview audio file and select a clip start time + duration
	 */
	import { onMount, onDestroy } from 'svelte';
	import { SONG_CONFIG } from '@blind-test/shared';

	interface Props {
		file?: File | null;
		audioSrc?: string | null;
		defaultClipStart?: number;
		defaultClipDuration?: number;
		maxDuration?: number;
		onSelect: (clipStart: number, clipDuration: number) => void;
		onCancel: () => void;
	}

	let {
		file = null,
		audioSrc = null,
		defaultClipStart = SONG_CONFIG.DEFAULT_CLIP_START,
		// Fix clipDuration to default, remove from direct control
		maxDuration = SONG_CONFIG.MAX_CLIP_DURATION,
		onSelect,
		onCancel
	}: Props = $props();

	let audioElement = $state<HTMLAudioElement>();
	let audioUrl = $state<string>('');
	let duration = $state(0);
	let currentTime = $state(0);
	let isPlaying = $state(false);
	let clipStart = $state(defaultClipStart);
	let fixedClipDuration = SONG_CONFIG.DEFAULT_CLIP_DURATION; // Fixed duration

	// Waveform state
	let audioContext: AudioContext | null = null;
	let audioBuffer: AudioBuffer | null = null;
	let waveformLoading = $state(false);
	let loadError = $state<string | null>(null);
	let waveformCanvas = $state<HTMLCanvasElement>();

	// Handle audio source changes
	$effect(() => {
		loadError = null;
		if (file) {
			const url = URL.createObjectURL(file);
			audioUrl = url;
			loadAudioFromFile(file);
			return () => URL.revokeObjectURL(url);
		} else if (audioSrc) {
			audioUrl = audioSrc;
			loadAudioFromUrl(audioSrc);
		}
	});

	// Cleanup
	onDestroy(() => {
		if (audioContext) {
			audioContext.close();
		}
	});

	async function loadAudioFromFile(file: File) {
		try {
			waveformLoading = true;
			const arrayBuffer = await file.arrayBuffer();
			await decodeAudio(arrayBuffer);
		} catch (err) {
			console.error('Error loading audio file:', err);
			loadError = 'Erreur de chargement du fichier';
		} finally {
			waveformLoading = false;
		}
	}

	async function loadAudioFromUrl(url: string) {
		try {
			waveformLoading = true;
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const arrayBuffer = await response.arrayBuffer();
			await decodeAudio(arrayBuffer);
		} catch (err) {
			console.error('Error loading audio url:', err);
			loadError = 'Erreur de chargement du flux audio';
		} finally {
			waveformLoading = false;
		}
	}

	async function decodeAudio(arrayBuffer: ArrayBuffer) {
		try {
			if (!audioContext) {
				audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			}
			audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			drawWaveform();
		} catch (err) {
			console.error('Error decoding audio:', err);
			loadError = 'Erreur de décodage audio';
		}
	}

	function handleLoadedMetadata() {
		if (!audioElement) return;
		duration = audioElement.duration;

		// Ensure clipStart doesn't exceed duration
		if (clipStart > duration - fixedClipDuration) {
			clipStart = Math.max(0, duration - fixedClipDuration);
		}

		drawWaveform();
	}

	function handleAudioError(e: Event) {
		console.error('Audio element error:', audioElement?.error);
		loadError = 'Impossible de lire le fichier audio';
	}

	function handleTimeUpdate() {
		if (!audioElement) return;
		currentTime = audioElement.currentTime;

		// Stop playback at clip end if previewing clip
		if (isPlaying && currentTime >= clipStart + fixedClipDuration) {
			audioElement.pause();
			audioElement.currentTime = clipStart;
			isPlaying = false;
		}
	}

	function togglePlayPause() {
		if (!audioElement) return;
		if (isPlaying) {
			audioElement.pause();
		} else {
			// Start from clip start
			audioElement.currentTime = clipStart;
			audioElement.play();
		}
		isPlaying = !isPlaying;
	}

	function handleSeek(event: MouseEvent) {
		if (!waveformCanvas || !audioElement) return;

		const rect = waveformCanvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percent = x / rect.width;
		const newTime = percent * duration;

		clipStart = Math.max(0, Math.min(newTime, duration - fixedClipDuration));
		audioElement.currentTime = clipStart;
	}

	function drawWaveform() {
		if (!waveformCanvas || duration === 0) return;

		const ctx = waveformCanvas.getContext('2d');
		if (!ctx) return;

		const width = waveformCanvas.width;
		const height = waveformCanvas.height;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Draw background
		ctx.fillStyle = '#1a1a1a';
		ctx.fillRect(0, 0, width, height);

		// Draw clip region
		const clipStartX = (clipStart / duration) * width;
		const clipWidth = (fixedClipDuration / duration) * width;
		ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
		ctx.fillRect(clipStartX, 0, clipWidth, height);

		// Draw clip borders
		ctx.strokeStyle = '#3b82f6';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(clipStartX, 0);
		ctx.lineTo(clipStartX, height);
		ctx.stroke();

		ctx.strokeStyle = '#3b82f6';
		ctx.beginPath();
		ctx.moveTo(clipStartX + clipWidth, 0);
		ctx.lineTo(clipStartX + clipWidth, height);
		ctx.stroke();

		// Draw Waveform
		ctx.strokeStyle = '#4ade80';
		ctx.lineWidth = 1;
		ctx.beginPath();

		if (audioBuffer) {
			// Real waveform
			const rawData = audioBuffer.getChannelData(0); // Use left channel
			const samples = width; // One sample per pixel
			const blockSize = Math.floor(rawData.length / samples); // Number of audio samples per canvas pixel
			const scale = 0.8; // Scale factor

			for (let i = 0; i < width; i++) {
				const startSample = i * blockSize;
				let min = 1.0;
				let max = -1.0;

				// Find min/max in this block (simple downsampling)
				for (let j = 0; j < blockSize; j++) {
					const datum = rawData[startSample + j];
					if (datum < min) min = datum;
					if (datum > max) max = datum;
				}

				// Fallback if block was empty
				if (max === -1.0 && min === 1.0) {
					max = 0;
					min = 0;
				}

				// Draw a vertical line for this pixel column
				// Centered vertically at height/2
				const yMax = ((1 + max * scale) * height) / 2;
				const yMin = ((1 + min * scale) * height) / 2;

				ctx.moveTo(i, yMin);
				ctx.lineTo(i, yMax);
			}
		} else {
			// Placeholder sine wave while loading or if error
			for (let i = 0; i < width; i++) {
				const percent = i / width;
				const amplitude = Math.sin(percent * Math.PI * 10) * 0.5 + 0.5;
				const y = height / 2 + (amplitude - 0.5) * height * 0.8;

				if (i === 0) {
					ctx.moveTo(i, y);
				} else {
					ctx.lineTo(i, y);
				}
			}
		}
		ctx.stroke();

		// Draw playhead
		const playheadX = (currentTime / duration) * width;
		ctx.strokeStyle = '#ef4444';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(playheadX, 0);
		ctx.lineTo(playheadX, height);
		ctx.stroke();
	}

	// Redraw waveform when parameters change
	$effect(() => {
		if (duration > 0) {
			drawWaveform();
		}
	});

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleConfirm() {
		onSelect(clipStart, fixedClipDuration);
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="clip-selector-title" tabindex="-1" onclick={onCancel} onkeydown={(e) => e.key === 'Escape' && onCancel()}>
	<div class="modal-content" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		<h2 id="clip-selector-title">Sélectionne un extrait audio</h2>
		<p class="filename">{file ? file.name : 'Extrait audio'}</p>

		{#if loadError}
			<div class="error-message">⚠️ {loadError}</div>
		{/if}

		<!-- Audio element (hidden) -->
		<audio
			bind:this={audioElement}
			src={audioUrl}
			onloadedmetadata={handleLoadedMetadata}
			ontimeupdate={handleTimeUpdate}
			onerror={handleAudioError}
		></audio>

		<!-- Waveform display -->
		<div class="waveform-container">
			{#if waveformLoading}
				<div class="waveform-loader">
					<div class="spinner"></div>
					<span>Génération de l'onde...</span>
				</div>
			{/if}
			<canvas
				bind:this={waveformCanvas}
				width={800}
				height={150}
				onclick={handleSeek}
				class:loading={waveformLoading}
			></canvas>
		</div>

		<!-- Playback controls -->
		<div class="controls">
			<button onclick={togglePlayPause} class="play-button">
				{isPlaying ? '⏸️ Pause' : '▶️ Lire l’extrait'}
			</button>
			<div class="time-display">
				{formatTime(currentTime)} / {formatTime(duration)}
			</div>
		</div>

		<!-- Clip configuration -->
		<div class="clip-config">
			<div class="config-row">
				<label>
					Début de l’extrait : <strong>{formatTime(clipStart)}</strong>
					<input
						type="range"
						min="0"
						max={Math.max(0, duration - fixedClipDuration)}
						step="1"
						bind:value={clipStart}
					/>
				</label>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="actions">
			<button onclick={onCancel} class="cancel-button">Annuler</button>
			<button onclick={handleConfirm} class="confirm-button">Valider l’extrait</button>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: #2a2a2a;
		border-radius: 12px;
		padding: 24px;
		max-width: 900px;
		width: 100%;
		color: white;
	}

	h2 {
		margin: 0 0 8px 0;
		font-size: 24px;
		color: white;
	}

	.filename {
		color: #9ca3af;
		margin: 0 0 24px 0;
		font-size: 14px;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #fca5a5;
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 16px;
		font-size: 14px;
	}

	.waveform-container {
		background: #1a1a1a;
		border-radius: 8px;
		padding: 8px;
		margin-bottom: 16px;
		cursor: pointer;
		position: relative;
	}

	.waveform-loader {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #9ca3af;
		font-size: 14px;
		z-index: 10;
		border-radius: 8px;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid #374151;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	canvas {
		width: 100%;
		height: auto;
		display: block;
		border-radius: 4px;
	}

	canvas.loading {
		opacity: 0.5;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 24px;
	}

	.play-button {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 16px;
		cursor: pointer;
		transition: background 0.2s;
	}

	.play-button:hover {
		background: #2563eb;
	}

	.time-display {
		font-family: monospace;
		font-size: 16px;
		color: #9ca3af;
	}

	.clip-config {
		background: #1a1a1a;
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.config-row {
		margin-bottom: 16px;
	}

	.config-row:last-child {
		margin-bottom: 0;
	}

	label {
		display: block;
		font-size: 14px;
		margin-bottom: 8px;
	}

	strong {
		color: #3b82f6;
		margin-left: 8px;
	}

	input[type='range'] {
		width: 100%;
		margin-top: 8px;
	}

	.actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	button {
		padding: 10px 20px;
		border-radius: 8px;
		border: none;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cancel-button {
		background: #374151;
		color: white;
	}

	.cancel-button:hover {
		background: #4b5563;
	}

	.confirm-button {
		background: #10b981;
		color: white;
	}

	.confirm-button:hover {
		background: #059669;
	}
</style>
