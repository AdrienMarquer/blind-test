<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		ArcElement,
		BarElement,
		CategoryScale,
		LinearScale,
		Tooltip,
		Legend,
		DoughnutController,
		BarController
	} from 'chart.js';
	import { api } from '$lib/api';
	import Card from '$lib/components/ui/Card.svelte';

	// Register Chart.js components
	Chart.register(
		ArcElement,
		BarElement,
		CategoryScale,
		LinearScale,
		Tooltip,
		Legend,
		DoughnutController,
		BarController
	);

	// Types
	interface SongStats {
		total: number;
		totalDuration: number;
		byGenre: Array<{ genre: string; count: number }>;
		byDecade: Array<{ decade: string; count: number }>;
		byArtist: Array<{ artist: string; count: number }>;
		byLanguage: Array<{ language: string; count: number }>;
		bySource: Array<{ source: string; count: number }>;
	}

	// Props
	interface Props {
		autoExpand?: boolean;
	}

	const { autoExpand = false }: Props = $props();

	// State (Svelte 5 runes)
	let stats = $state<SongStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expanded = $state(autoExpand);
	let includeNiche = $state(false);
	let hasLoadedOnce = $state(false);

	// Canvas refs
	let genreCanvas: HTMLCanvasElement;
	let decadeCanvas: HTMLCanvasElement;

	// Chart instances
	let charts: Chart[] = [];

	// Theme colors matching AdriQuiz palette
	const colors = [
		'#ef4c83',
		'#f8c027',
		'#f47a20',
		'#009daa',
		'#122b3b',
		'#ff6b9d',
		'#ffd666',
		'#ff9f5a',
		'#00c4d4',
		'#2a5068',
		'#ff8fb1',
		'#ffe699',
		'#ffb88c',
		'#33d6e6',
		'#436a82'
	];

	// Fetch stats from API
	async function loadStats() {
		try {
			loading = true;
			error = null;
			const response = await (api.api.songs as any).stats.get({ query: { includeNiche: includeNiche.toString() } });
			if (response.error) throw new Error('Failed to fetch statistics');
			stats = response.data;
			hasLoadedOnce = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load statistics';
		} finally {
			loading = false;
		}
	}

	function destroyCharts() {
		charts.forEach((chart) => chart.destroy());
		charts = [];
	}

	function createCharts() {
		if (!stats || stats.total === 0) return;

		destroyCharts();

		// Genre Doughnut Chart
		if (genreCanvas && stats.byGenre.length > 0) {
			charts.push(
				new Chart(genreCanvas, {
					type: 'doughnut',
					data: {
						labels: stats.byGenre.map((g) => g.genre),
						datasets: [
							{
								data: stats.byGenre.map((g) => g.count),
								backgroundColor: colors.slice(0, stats.byGenre.length),
								borderWidth: 0
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: {
								position: 'right',
								labels: { color: '#122b3b' }
							}
						}
					}
				})
			);
		}

		// Decade Bar Chart
		if (decadeCanvas && stats.byDecade.length > 0) {
			charts.push(
				new Chart(decadeCanvas, {
					type: 'bar',
					data: {
						labels: stats.byDecade.map((d) => d.decade),
						datasets: [
							{
								label: 'Songs',
								data: stats.byDecade.map((d) => d.count),
								backgroundColor: '#ef4c83',
								borderRadius: 8
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: { legend: { display: false } },
						scales: {
							y: {
								beginAtZero: true,
								grid: { color: 'rgba(18, 43, 59, 0.1)' },
								ticks: { color: '#122b3b' }
							},
							x: {
								grid: { display: false },
								ticks: { color: '#122b3b' }
							}
						}
					}
				})
			);
		}

	}

	// Reactive effect to create charts when stats change
	$effect(() => {
		if (stats && expanded) {
			// Use setTimeout to ensure canvas elements are mounted
			setTimeout(createCharts, 50);
		}
	});

	// Handler for checkbox change
	function handleNicheToggle() {
		if (hasLoadedOnce && expanded) {
			loadStats();
		}
	}

	async function toggleExpanded() {
		expanded = !expanded;
		if (expanded && !stats) {
			await loadStats();
		}
	}

	onDestroy(() => {
		destroyCharts();
	});

	// Auto-load stats on mount if autoExpand is true
	onMount(() => {
		if (autoExpand && !stats) {
			loadStats();
		}
	});
</script>

{#snippet statsContent()}
	{#if loading}
		<div class="loading">Chargement des statistiques...</div>
	{:else if error}
		<div class="error">{error}</div>
	{:else if stats && stats.total > 0}
		<!-- Language ratio bar -->
		{#if stats.byLanguage.length > 0}
			{@const enCount = stats.byLanguage.find(l => l.language === 'en')?.count ?? 0}
			{@const frCount = stats.byLanguage.find(l => l.language === 'fr')?.count ?? 0}
			{@const otherCount = stats.total - enCount - frCount}
			{@const enPercent = Math.round((enCount / stats.total) * 100)}
			{@const frPercent = Math.round((frCount / stats.total) * 100)}
			{@const otherPercent = 100 - enPercent - frPercent}
			<div class="language-stats">
				<h4>Par langue</h4>
				<div class="language-bar">
					{#if enPercent > 0}
						<div class="lang-segment en" style="width: {enPercent}%" title="Anglais: {enCount} ({enPercent}%)">
							{#if enPercent >= 10}🇬🇧 {enPercent}%{/if}
						</div>
					{/if}
					{#if frPercent > 0}
						<div class="lang-segment fr" style="width: {frPercent}%" title="Français: {frCount} ({frPercent}%)">
							{#if frPercent >= 10}🇫🇷 {frPercent}%{/if}
						</div>
					{/if}
					{#if otherPercent > 0}
						<div class="lang-segment other" style="width: {otherPercent}%" title="Autre: {otherCount} ({otherPercent}%)">
							{#if otherPercent >= 10}🌍 {otherPercent}%{/if}
						</div>
					{/if}
				</div>
				<div class="language-legend">
					<span class="legend-item"><span class="dot en"></span> Anglais: {enCount}</span>
					<span class="legend-item"><span class="dot fr"></span> Français: {frCount}</span>
					{#if otherCount > 0}
						<span class="legend-item"><span class="dot other"></span> Autre: {otherCount}</span>
					{/if}
				</div>
			</div>
		{/if}

		<div class="stats-grid">
			<!-- Genre Distribution -->
			{#if stats.byGenre.length > 0}
				<div class="chart-container">
					<h4>Par genre</h4>
					<div class="chart">
						<canvas bind:this={genreCanvas}></canvas>
					</div>
				</div>
			{/if}

			<!-- Timeline by Decade -->
			{#if stats.byDecade.length > 0}
				<div class="chart-container">
					<h4>Par decennie</h4>
					<div class="chart">
						<canvas bind:this={decadeCanvas}></canvas>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="empty">Aucune musique dans la bibliotheque</div>
	{/if}
{/snippet}

{#if autoExpand}
	<!-- Direct content when used in modal (no Card wrapper) -->
	<div class="stats-content">
		<button
			class="niche-toggle-btn"
			onclick={() => { includeNiche = !includeNiche; handleNicheToggle(); }}
		>
			{includeNiche ? 'Masquer' : 'Afficher'} les titres niche
		</button>
		{@render statsContent()}
	</div>
{:else}
	<!-- Card wrapper for standalone usage -->
	<div class="stats-card" class:collapsed={!expanded}>
		<Card title="Statistiques" subtitle="Analyse de ta bibliotheque" icon="📊">
			{#snippet actions()}
				<button class="toggle-btn" onclick={toggleExpanded}>
					{expanded ? 'Masquer' : 'Afficher'}
				</button>
			{/snippet}

			{#if expanded}
				<button
					class="niche-toggle-btn"
					onclick={() => { includeNiche = !includeNiche; handleNicheToggle(); }}
				>
					{includeNiche ? 'Masquer' : 'Afficher'} les titres niche
				</button>
				{@render statsContent()}
			{/if}
		</Card>
	</div>
{/if}

<style>
	.stats-content {
		/* Direct content wrapper for modal usage */
	}

	.stats-card.collapsed :global(header) {
		margin-bottom: 0;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
		margin-top: 1rem;
	}

	.chart-container {
		background: rgba(255, 255, 255, 0.5);
		border-radius: 18px;
		padding: 1rem;
	}

	.chart-container h4 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		color: var(--aq-color-deep, #122b3b);
	}

	.chart {
		height: 220px;
		position: relative;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 2rem;
		color: var(--aq-color-muted, #6b7a8a);
	}

	.error {
		color: var(--aq-color-primary, #ef4c83);
	}

	.niche-toggle-btn {
		background: transparent;
		border: 1px solid #ef4c83;
		color: #ef4c83 !important;
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		font-size: 0.85rem;
		cursor: pointer;
		margin-bottom: 1rem;
		transition: background 0.2s, color 0.2s;
	}

	.niche-toggle-btn:hover {
		background: #ef4c83;
		color: white !important;
	}

	.toggle-btn {
		background: transparent;
		border: none;
		color: #ef4c83;
		padding: 0.4rem 0.8rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.toggle-btn:hover {
		text-decoration: underline;
	}

	/* Language stats */
	.language-stats {
		background: rgba(255, 255, 255, 0.5);
		border-radius: 18px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.language-stats h4 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		color: var(--aq-color-deep, #122b3b);
	}

	.language-bar {
		display: flex;
		height: 32px;
		border-radius: 16px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.1);
	}

	.lang-segment {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		transition: width 0.3s ease;
	}

	.lang-segment.en {
		background: linear-gradient(135deg, #009daa, #00c4d4);
	}

	.lang-segment.fr {
		background: linear-gradient(135deg, #ef4c83, #ff6b9d);
	}

	.lang-segment.other {
		background: linear-gradient(135deg, #f8c027, #ffd666);
		color: #122b3b;
	}

	.language-legend {
		display: flex;
		gap: 1.5rem;
		margin-top: 0.75rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--aq-color-deep, #122b3b);
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.dot.en {
		background: #009daa;
	}

	.dot.fr {
		background: #ef4c83;
	}

	.dot.other {
		background: #f8c027;
	}
</style>
