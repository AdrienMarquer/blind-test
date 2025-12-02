<script lang="ts">
	/**
	 * Duplicate Warning Modal
	 * Shows potential duplicate songs and allows user to cancel or force import
	 */
	interface DuplicateMatch {
		song: {
			id: string;
			title: string;
			artist: string;
			album?: string;
			year?: number;
			duration: number;
			source: string;
			spotifyId?: string;
			youtubeId?: string;
		};
		confidence: number;
		reasons: string[];
	}

	interface Props {
		candidateSong: {
			title: string;
			artist: string;
			album?: string;
			year?: number;
			duration?: number;
		};
		duplicates: DuplicateMatch[];
		onProceed: () => void;
		onCancel: () => void;
	}

	let { candidateSong, duplicates, onProceed, onCancel }: Props = $props();

	const highestConfidence = $derived(Math.max(...duplicates.map(d => d.confidence)));

	function getConfidenceColor(confidence: number): string {
		if (confidence >= 95) return '#d32f2f'; // Red - definite duplicate
		if (confidence >= 80) return '#f57c00'; // Orange - probable duplicate
		return '#fbc02d'; // Yellow - possible duplicate
	}

	function getConfidenceLabel(confidence: number): string {
		if (confidence >= 95) return 'Definite Duplicate';
		if (confidence >= 80) return 'Probable Duplicate';
		return 'Possible Duplicate';
	}

	function formatDuration(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}

	function getSourceLabel(source: string): string {
		switch (source) {
			case 'spotify-youtube':
				return 'Spotify';
			case 'youtube':
				return 'YouTube';
			case 'upload':
				return 'Upload';
			default:
				return source;
		}
	}
</script>

<div class="modal-overlay" onclick={onCancel} onkeydown={(e) => e.key === 'Escape' && onCancel()} role="button" tabindex="0">
	<div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
		<div class="modal-header">
			<div>
				<h2>⚠️ Potential Duplicate Detected</h2>
				<p class="subtitle">
					{duplicates.length} potential {duplicates.length === 1 ? 'match' : 'matches'} found
				</p>
			</div>
			<button class="close-btn" onclick={onCancel} aria-label="Close">×</button>
		</div>

		<div class="modal-body">
			<!-- Candidate Song Info -->
			<div class="section">
				<h3>Song to Import</h3>
				<div class="song-card candidate">
					<div class="song-info">
						<div class="song-title">{candidateSong.title}</div>
						<div class="song-artist">{candidateSong.artist}</div>
						{#if candidateSong.album || candidateSong.year}
							<div class="song-meta">
								{#if candidateSong.album}<span>{candidateSong.album}</span>{/if}
								{#if candidateSong.year}<span>{candidateSong.year}</span>{/if}
								{#if candidateSong.duration}
									<span>{formatDuration(candidateSong.duration)}</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Duplicates List -->
			<div class="section">
				<h3>Potential Duplicates in Library</h3>
				<div class="duplicates-list">
					{#each duplicates as match (match.song.id)}
						<div class="duplicate-card">
							<div
								class="confidence-badge"
								style="background: {getConfidenceColor(match.confidence)}20; color: {getConfidenceColor(match.confidence)}"
							>
								<div class="confidence-score">{match.confidence}%</div>
								<div class="confidence-label">{getConfidenceLabel(match.confidence)}</div>
							</div>

							<div class="song-info">
								<div class="song-title">{match.song.title}</div>
								<div class="song-artist">{match.song.artist}</div>
								<div class="song-meta">
									{#if match.song.album}<span>{match.song.album}</span>{/if}
									{#if match.song.year}<span>{match.song.year}</span>{/if}
									<span>{formatDuration(match.song.duration)}</span>
									<span class="source-badge">{getSourceLabel(match.song.source)}</span>
								</div>
							</div>

							<div class="reasons">
								<div class="reasons-label">Match reasons:</div>
								<ul>
									{#each match.reasons as reason}
										<li>{reason}</li>
									{/each}
								</ul>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Warning Message -->
			<div class="warning-box" style="border-color: {getConfidenceColor(highestConfidence)}">
				<div class="warning-icon">⚠️</div>
				<div class="warning-text">
					{#if highestConfidence >= 95}
						<strong>This appears to be an exact duplicate.</strong> Importing it will create a duplicate
						entry in your library.
					{:else if highestConfidence >= 80}
						<strong>This song is very similar to existing songs.</strong> Review the matches carefully
						before proceeding.
					{:else}
						<strong>This song might be a duplicate.</strong> Check if this is actually a different version
						or recording.
					{/if}
				</div>
			</div>
		</div>

		<div class="modal-actions">
			<button class="btn btn-outline" onclick={onCancel}> Cancel Import </button>
			<button class="btn btn-primary" onclick={onProceed}> Import Anyway </button>
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
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1002;
		padding: 1rem;
	}

	.modal-content {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(240, 248, 255, 0.98));
		border-radius: 32px;
		max-width: 800px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #d32f2f;
	}

	.subtitle {
		margin: 0.25rem 0 0 0;
		color: var(--aq-color-muted);
		font-size: 0.9rem;
	}

	.close-btn {
		border: none;
		background: rgba(239, 76, 131, 0.12);
		border-radius: 12px;
		font-size: 1.5rem;
		width: 40px;
		height: 40px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 160ms ease;
	}

	.close-btn:hover {
		background: rgba(239, 76, 131, 0.2);
		transform: scale(1.1);
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.section {
		margin-bottom: 2rem;
	}

	.section h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		color: var(--aq-color-deep);
	}

	.song-card {
		padding: 1rem 1.5rem;
		background: rgba(255, 255, 255, 0.6);
		border-radius: 18px;
		border: 2px solid rgba(0, 0, 0, 0.05);
	}

	.song-card.candidate {
		background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08));
		border-color: rgba(99, 102, 241, 0.2);
	}

	.song-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--aq-color-deep);
		margin-bottom: 0.25rem;
	}

	.song-artist {
		font-size: 1rem;
		color: var(--aq-color-muted);
		margin-bottom: 0.5rem;
	}

	.song-meta {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	.song-meta span {
		padding: 0.2rem 0.6rem;
		background: rgba(0, 0, 0, 0.05);
		border-radius: 999px;
	}

	.source-badge {
		background: rgba(99, 102, 241, 0.12) !important;
		color: #6366f1 !important;
		font-weight: 600;
	}

	.duplicates-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-height: 400px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.duplicate-card {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 1.5rem;
		align-items: start;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.7);
		border-radius: 20px;
		border: 2px solid rgba(0, 0, 0, 0.05);
		transition: all 160ms ease;
	}

	.duplicate-card:hover {
		background: rgba(255, 255, 255, 0.9);
		transform: translateX(4px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.confidence-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1rem;
		border-radius: 12px;
		min-width: 90px;
	}

	.confidence-score {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1;
	}

	.confidence-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-top: 0.25rem;
		text-align: center;
	}

	.reasons {
		grid-column: 2 / -1;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(0, 0, 0, 0.05);
	}

	.reasons-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--aq-color-muted);
		margin-bottom: 0.5rem;
	}

	.reasons ul {
		margin: 0;
		padding: 0 0 0 1.25rem;
		list-style-type: disc;
	}

	.reasons li {
		font-size: 0.85rem;
		color: var(--aq-color-muted);
		margin-bottom: 0.25rem;
	}

	.warning-box {
		display: flex;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		background: rgba(255, 152, 0, 0.05);
		border-left: 4px solid #f57c00;
		border-radius: 12px;
		margin-top: 1.5rem;
	}

	.warning-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.warning-text {
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--aq-color-deep);
	}

	.warning-text strong {
		display: block;
		margin-bottom: 0.25rem;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding: 1.5rem 2rem;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 16px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 160ms ease;
		border: none;
	}

	.btn-outline {
		background: rgba(255, 255, 255, 0.8);
		color: var(--aq-color-deep);
		border: 2px solid rgba(0, 0, 0, 0.1);
	}

	.btn-outline:hover {
		background: rgba(255, 255, 255, 1);
		border-color: rgba(0, 0, 0, 0.2);
		transform: translateY(-1px);
	}

	.btn-primary {
		background: linear-gradient(135deg, #ef4c83, #e91e63);
		color: white;
		box-shadow: 0 4px 12px rgba(239, 76, 131, 0.3);
	}

	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(239, 76, 131, 0.4);
	}

	@media (max-width: 768px) {
		.modal-content {
			border-radius: 24px;
		}

		.duplicate-card {
			grid-template-columns: 1fr;
		}

		.reasons {
			grid-column: 1 / -1;
		}

		.modal-actions {
			flex-direction: column;
		}

		.btn {
			width: 100%;
		}
	}
</style>
