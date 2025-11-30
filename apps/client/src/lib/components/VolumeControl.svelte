<script lang="ts">
	import { onMount } from 'svelte';

	const STORAGE_KEY = 'blindtest-volume';
	const AUTO_COLLAPSE_MS = 3000;

	interface Props {
		audioElement: HTMLAudioElement | null;
	}

	const { audioElement }: Props = $props();

	let isExpanded = $state(false);
	let volume = $state(100);
	let autoCollapseTimer: number | null = null;
	let containerRef: HTMLDivElement | null = $state(null);

	// Load volume from localStorage on mount
	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved !== null) {
			const parsed = parseInt(saved, 10);
			if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
				volume = parsed;
			}
		}
		// Apply initial volume
		if (audioElement) {
			audioElement.volume = volume / 100;
		}

		// Click outside handler
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef && !containerRef.contains(e.target as Node)) {
				isExpanded = false;
				clearAutoCollapseTimer();
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	// Apply volume to audio element whenever it changes
	$effect(() => {
		if (audioElement) {
			audioElement.volume = volume / 100;
		}
	});

	function clearAutoCollapseTimer() {
		if (autoCollapseTimer !== null) {
			clearTimeout(autoCollapseTimer);
			autoCollapseTimer = null;
		}
	}

	function resetAutoCollapseTimer() {
		clearAutoCollapseTimer();
		autoCollapseTimer = window.setTimeout(() => {
			isExpanded = false;
		}, AUTO_COLLAPSE_MS);
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
		if (isExpanded) {
			resetAutoCollapseTimer();
		} else {
			clearAutoCollapseTimer();
		}
	}

	function handleVolumeChange(e: Event) {
		const target = e.target as HTMLInputElement;
		volume = parseInt(target.value, 10);
		localStorage.setItem(STORAGE_KEY, String(volume));
		resetAutoCollapseTimer();
	}

	function handleSliderInteraction() {
		resetAutoCollapseTimer();
	}

	// Volume icon based on level
	function getVolumeIcon(): string {
		if (volume === 0) return 'muted';
		if (volume < 33) return 'low';
		if (volume < 66) return 'medium';
		return 'high';
	}

	const volumeIcon = $derived(getVolumeIcon());
</script>

<div class="volume-control" class:expanded={isExpanded} bind:this={containerRef}>
	<button
		class="volume-icon-btn"
		onclick={toggleExpanded}
		aria-label={isExpanded ? 'Fermer le contrôle du volume' : 'Ouvrir le contrôle du volume'}
		type="button"
	>
		{#if volumeIcon === 'muted'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
				<line x1="23" y1="9" x2="17" y2="15"></line>
				<line x1="17" y1="9" x2="23" y2="15"></line>
			</svg>
		{:else if volumeIcon === 'low'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
				<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
			</svg>
		{:else if volumeIcon === 'medium'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
				<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
				<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
				<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
				<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
			</svg>
		{/if}
	</button>

	{#if isExpanded}
		<div class="volume-slider-container">
			<input
				type="range"
				min="0"
				max="100"
				value={volume}
				oninput={handleVolumeChange}
				onpointerdown={handleSliderInteraction}
				onpointermove={handleSliderInteraction}
				class="volume-slider"
				aria-label="Volume"
			/>
			<span class="volume-value">{volume}</span>
		</div>
	{/if}
</div>

<style>
	.volume-control {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 24px;
		padding: 0.5rem;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		transition: all 0.25s ease;
	}

	.volume-control.expanded {
		padding-right: 1rem;
	}

	.volume-icon-btn {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.volume-icon-btn:hover {
		transform: scale(1.05);
	}

	.volume-icon-btn:active {
		transform: scale(0.95);
	}

	.volume-icon-btn svg {
		width: 20px;
		height: 20px;
	}

	.volume-slider-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		animation: slideIn 0.2s ease;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			width: 0;
		}
		to {
			opacity: 1;
			width: auto;
		}
	}

	.volume-slider {
		width: 100px;
		height: 6px;
		border-radius: 3px;
		background: rgba(18, 43, 59, 0.15);
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--aq-color-primary);
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(239, 76, 131, 0.4);
		transition: transform 0.1s ease;
	}

	.volume-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.volume-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--aq-color-primary);
		cursor: pointer;
		border: none;
		box-shadow: 0 2px 6px rgba(239, 76, 131, 0.4);
	}

	.volume-value {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		min-width: 28px;
		text-align: right;
	}
</style>
