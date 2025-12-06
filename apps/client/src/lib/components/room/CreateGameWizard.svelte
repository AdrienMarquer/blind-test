<script lang="ts">
	/**
	 * CreateGameWizard Component
	 * Multi-step wizard for game creation
	 */

	import type { Room, Player, RoundConfig } from '@blind-test/shared';
	import { validatePlayerName, PLAYER_CONFIG } from '@blind-test/shared';
	import RoundBuilder from './RoundBuilder.svelte';
	import ConfigSummary from './ConfigSummary.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import InputField from '$lib/components/ui/InputField.svelte';
	import { getDefaultRounds } from '$lib/presets';
	import { gamePresets, masterPlayingPreset, cloneRounds } from '$lib/gamePresets';

	interface Props {
		room: Room;
		songs: any[];
		players: Player[];
		availableGenres: string[];
		starting: boolean;
		onStartGame: (config: { rounds: RoundConfig[]; audioPlayback: 'master' | 'players' | 'all'; masterPlayerName?: string }) => void;
		onRemovePlayer: (playerId: string) => void;
	}

	let {
		room,
		songs,
		players,
		availableGenres,
		starting,
		onStartGame,
		onRemovePlayer
	}: Props = $props();

	// Initialize master playing state from room data (for game restart)
	const initialMasterPlayer = room.masterPlayerId
		? players.find(p => p.id === room.masterPlayerId)
		: null;

	// Wizard state
	let currentStep = $state(1);
	let masterPlaying = $state(!!initialMasterPlayer);
	let masterPlayerName = $state(initialMasterPlayer?.name ?? '');
	let masterNameError = $state<string | null>(null);
	let rounds = $state<RoundConfig[]>([]);
	let audioPlayback = $state<'master' | 'players' | 'all'>('master');
	let penaltyEnabled = $state(false);
	let penaltyAmount = $state(1);

	// Step 2 sub-views (no presets selection, just summary or editing)
	type Step2View = 'summary' | 'editing';
	let step2View = $state<Step2View>('summary');

	// Clipboard state
	let codeCopied = $state(false);
	let inviteCopied = $state(false);
	let codeCopyTimeout: number | null = null;
	let inviteCopyTimeout: number | null = null;

	// Step definitions
	const steps = [
		{ number: 1, label: 'Mode', title: 'Choisis ton rôle' },
		{ number: 2, label: 'Config', title: 'Configure ta partie' },
		{ number: 3, label: 'Joueurs', title: 'Invite tes joueurs' }
	];

	// Track previous masterPlaying value to detect changes
	let prevMasterPlaying = $state<boolean | null>(null);

	// Load appropriate preset based on masterPlaying mode
	function loadPreset(forMasterPlaying: boolean) {
		if (forMasterPlaying) {
			rounds = cloneRounds(masterPlayingPreset.rounds);
			audioPlayback = masterPlayingPreset.audioPlayback;
		} else {
			const classicPreset = gamePresets.find(p => p.id === 'classic');
			if (classicPreset) {
				rounds = cloneRounds(classicPreset.rounds);
				audioPlayback = classicPreset.audioPlayback;
			} else {
				rounds = getDefaultRounds();
			}
		}
	}

	// Initialize with preset on mount and reload when masterPlaying changes
	$effect(() => {
		const currentMasterPlaying = masterPlaying;
		// Only load preset if masterPlaying actually changed or on initial load
		if (prevMasterPlaying !== currentMasterPlaying) {
			loadPreset(currentMasterPlaying);
			prevMasterPlaying = currentMasterPlaying;
		}
	});

	// Validation
	function validateMasterName(name: string): string | null {
		const trimmed = name.trim();
		if (!trimmed) return null;
		if (trimmed.length > PLAYER_CONFIG.NAME_MAX_LENGTH) {
			return `Max ${PLAYER_CONFIG.NAME_MAX_LENGTH} caractères`;
		}
		if (!validatePlayerName(trimmed)) {
			return 'Les caractères < et > ne sont pas autorisés';
		}
		return null;
	}

	$effect(() => {
		masterNameError = validateMasterName(masterPlayerName);
	});

	// Can proceed to next step?
	let canProceedStep1 = $derived(!masterPlaying || (masterPlayerName.trim().length > 0 && !masterNameError));
	let canProceedStep2 = $derived(rounds.length > 0);
	let canStart = $derived(rounds.length > 0 && (!masterPlaying || masterPlayerName.trim().length > 0));

	// Navigation
	function nextStep() {
		if (currentStep < 3) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function goToStep(step: number) {
		if (step >= 1 && step <= 3) {
			// Can only go back or to completed steps
			if (step < currentStep) {
				currentStep = step;
			}
		}
	}

	// Start game
	function handleStartGame() {
		onStartGame({
			rounds,
			audioPlayback,
			masterPlayerName: masterPlaying ? masterPlayerName.trim() : undefined
		});
	}

	// Step 2 handlers
	function handleEditRounds() {
		step2View = 'editing';
	}

	function handleBackFromEditing() {
		step2View = 'summary';
	}

	function handleChangeAudio(value: 'master' | 'players' | 'all') {
		audioPlayback = value;
	}

	function handleChangePenalty(enabled: boolean) {
		penaltyEnabled = enabled;
		// Update all rounds with the new penalty setting
		rounds = rounds.map(round => ({
			...round,
			params: {
				...round.params,
				penaltyEnabled: enabled,
				penaltyAmount: penaltyAmount
			}
		}));
	}

	function handleChangePenaltyAmount(amount: number) {
		penaltyAmount = amount;
		// Update all rounds with the new penalty amount
		rounds = rounds.map(round => ({
			...round,
			params: {
				...round.params,
				penaltyAmount: amount
			}
		}));
	}

	// Clipboard functions
	async function copyCode() {
		try {
			await navigator.clipboard?.writeText(room.code);
			codeCopied = true;
			if (codeCopyTimeout) clearTimeout(codeCopyTimeout);
			codeCopyTimeout = window.setTimeout(() => (codeCopied = false), 2000);
		} catch (err) {
			console.warn('Clipboard unavailable', err);
		}
	}

	async function copyInviteLink() {
		try {
			const origin = typeof window !== 'undefined' ? window.location.origin : '';
			const shareUrl = `${origin}/room/${room.id}`;
			await navigator.clipboard?.writeText(shareUrl);
			inviteCopied = true;
			if (inviteCopyTimeout) clearTimeout(inviteCopyTimeout);
			inviteCopyTimeout = window.setTimeout(() => (inviteCopied = false), 2000);
		} catch (err) {
			console.warn('Clipboard unavailable', err);
		}
	}

	// Players with master preview
	const playersWithMasterPreview = $derived.by(() => {
		// Filter out existing master player to avoid duplicates when showing preview
		const list = room.masterPlayerId
			? players.filter(p => p.id !== room.masterPlayerId)
			: [...players];
		if (masterPlaying && masterPlayerName.trim()) {
			list.push({
				id: 'master-preview',
				name: masterPlayerName.trim(),
				roomId: room.id,
				role: 'player',
				connected: true,
				joinedAt: new Date(),
				score: 0,
				roundScore: 0,
				isActive: false,
				isLockedOut: false,
				isMasterPreview: true,
				stats: {
					totalAnswers: 0,
					correctAnswers: 0,
					wrongAnswers: 0,
					buzzCount: 0,
					averageAnswerTime: 0
				}
			} as Player & { isMasterPreview?: boolean });
		}
		return list;
	});

	const sortedPlayers = $derived(
		playersWithMasterPreview.slice().sort((a, b) => {
			if (a.connected === b.connected) {
				return a.name.localeCompare(b.name);
			}
			return Number(b.connected) - Number(a.connected);
		})
	);
</script>

<section class="wizard">
	<!-- Stepper -->
	<div class="stepper">
		{#each steps as step, i}
			{@const isCompleted = currentStep > step.number}
			{@const isActive = currentStep === step.number}
			{@const isClickable = step.number < currentStep}

			{#if i > 0}
				<div class="step-connector" class:completed={isCompleted}></div>
			{/if}

			<button
				type="button"
				class="step"
				class:completed={isCompleted}
				class:active={isActive}
				class:clickable={isClickable}
				onclick={() => goToStep(step.number)}
				disabled={!isClickable}
			>
				<div class="step-circle">
					{#if isCompleted}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
							<path d="M5 12l5 5L20 7" />
						</svg>
					{:else}
						{step.number}
					{/if}
				</div>
				<span class="step-label">{step.label}</span>
			</button>
		{/each}
	</div>

	<!-- Step Header -->
	<div class="step-header">
		<h2>{steps[currentStep - 1].title}</h2>
	</div>

	<!-- Step Content -->
	<div class="step-content">
		{#if currentStep === 1}
			<!-- Step 1: Master Mode Choice -->
			<div class="mode-choice">
				<button
					type="button"
					class="mode-card"
					class:selected={!masterPlaying}
					onclick={() => masterPlaying = false}
				>
					<div class="mode-title">
						<span class="mode-icon">👑</span>
						<h3>Maître du jeu</h3>
					</div>
					<p>Tu contrôles la partie et valides les réponses</p>
					<ul class="mode-features">
						<li class="available"><span class="check">✓</span> Mode Buzz éclair</li>
						<li class="available"><span class="check">✓</span> Mode QCM</li>
					</ul>
				</button>

				<button
					type="button"
					class="mode-card"
					class:selected={masterPlaying}
					onclick={() => masterPlaying = true}
				>
					<div class="mode-title">
						<span class="mode-icon">🎮</span>
						<h3>Je joue aussi</h3>
					</div>
					<p>Tu participes comme les autres joueurs</p>
					<ul class="mode-features">
						<li class="available"><span class="check">✓</span> Mode QCM</li>
						<li class="warning"><span class="warn">⚠</span> Buzz éclair indisponible</li>
					</ul>
					<p class="mode-hint">Le Buzz éclair nécessite un maître pour valider</p>
				</button>
			</div>

			{#if masterPlaying}
				<div class="master-name-section">
					<InputField
						label="Ton pseudo de joueur"
						placeholder="Ex: DJ Master"
						bind:value={masterPlayerName}
						error={masterNameError}
						required
					/>
				</div>
			{/if}

		{:else if currentStep === 2}
			<!-- Step 2: Configuration -->
			<div class="config-step">
				{#if step2View === 'summary'}
					<ConfigSummary
						{rounds}
						{audioPlayback}
						{penaltyEnabled}
						{penaltyAmount}
						{masterPlaying}
						presetName={masterPlaying ? 'Mode joueur' : 'Soirée classique'}
						onEditRounds={handleEditRounds}
						onChangeAudio={handleChangeAudio}
						onChangePenalty={handleChangePenalty}
						onChangePenaltyAmount={handleChangePenaltyAmount}
						onUpdateRounds={(newRounds: RoundConfig[]) => (rounds = newRounds)}
					/>
				{:else}
					<div class="editing-header">
						<button type="button" class="back-link" onclick={handleBackFromEditing}>
							← Retour
						</button>
						<h3>Personnaliser les manches</h3>
					</div>
					<RoundBuilder
						bind:rounds
						{songs}
						{availableGenres}
						{masterPlaying}
						compact
						onUpdateRounds={(newRounds) => (rounds = newRounds)}
					/>
				{/if}
			</div>

		{:else if currentStep === 3}
			<!-- Step 3: Players & Start -->
			<div class="players-step">
				<div class="invite-section">
					<div class="code-display">
						<div class="code-info">
							<span class="code-label">Code de la salle</span>
							<span class="code-value">{room.code}</span>
						</div>
						<div class="code-actions">
							<Button variant="secondary" size="sm" onclick={copyCode}>
								{codeCopied ? '✓' : 'Code'}
							</Button>
							<Button variant="secondary" size="sm" onclick={copyInviteLink}>
								{inviteCopied ? '✓' : 'Lien'}
							</Button>
						</div>
					</div>

					{#if room.qrCode}
						<div class="qr-section">
							<img src={room.qrCode} alt="QR Code pour rejoindre" class="qr-image" />
							<p class="qr-hint">Scanne pour rejoindre</p>
						</div>
					{/if}
				</div>

				<div class="players-section">
					<h3>Joueurs connectés ({sortedPlayers.length})</h3>
					{#if sortedPlayers.length === 0}
						<p class="no-players">Aucun joueur pour l'instant. Partage le code !</p>
					{:else}
						<div class="player-grid">
							{#each sortedPlayers as player (player.id)}
								{@const isMasterPreview = (player as any).isMasterPreview}
								<div class="player-chip" class:offline={!player.connected} class:master-preview={isMasterPreview}>
									<div class="chip-avatar">{player.name.slice(0, 2).toUpperCase()}</div>
									<div class="chip-info">
										<strong>{player.name}</strong>
										<span>{isMasterPreview ? '🎮 Toi (hôte)' : player.connected ? 'Connecté' : 'Hors ligne'}</span>
									</div>
									{#if !isMasterPreview}
										<button
											type="button"
											class="chip-remove"
											onclick={() => onRemovePlayer(player.id)}
											title="Retirer le joueur"
										>
											✕
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="config-summary">
					<div class="summary-info">
						<span class="summary-icon">📋</span>
						<span>{rounds.length} manche{rounds.length > 1 ? 's' : ''} configurée{rounds.length > 1 ? 's' : ''}</span>
					</div>
					<button type="button" class="edit-link" onclick={() => currentStep = 2}>
						Modifier
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Step Footer -->
	<div class="step-footer">
		{#if currentStep === 1}
			<div></div>
			<Button variant="primary" onclick={nextStep} disabled={!canProceedStep1}>
				Continuer →
			</Button>
		{:else if currentStep === 2}
			<Button variant="outline" onclick={prevStep}>
				← Retour
			</Button>
			<Button variant="primary" onclick={nextStep} disabled={!canProceedStep2}>
				Continuer →
			</Button>
		{:else}
			<Button variant="outline" onclick={prevStep}>
				← Retour
			</Button>
			<Button variant="primary" onclick={handleStartGame} disabled={!canStart} loading={starting}>
				{starting ? 'Lancement...' : `🚀 Lancer la partie`}
			</Button>
		{/if}
	</div>
</section>

<style>
	.wizard {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 24px;
		padding: 2rem;
		box-shadow: var(--aq-shadow-soft);
		border: 1px solid rgba(18, 43, 59, 0.08);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Stepper */
	.stepper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		padding: 0 1rem;
	}

	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		cursor: default;
		padding: 0.5rem;
	}

	.step.clickable {
		cursor: pointer;
	}

	.step.clickable:hover .step-circle {
		transform: scale(1.05);
	}

	.step-circle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1rem;
		transition: all 0.2s ease;
		background: rgba(18, 43, 59, 0.1);
		color: rgba(18, 43, 59, 0.5);
	}

	.step.active .step-circle {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
		box-shadow: 0 4px 12px rgba(239, 76, 131, 0.3);
		animation: pulse-step 2s ease-in-out infinite;
	}

	.step.completed .step-circle {
		background: var(--aq-color-primary);
		color: white;
	}

	@keyframes pulse-step {
		0%, 100% { box-shadow: 0 4px 12px rgba(239, 76, 131, 0.3); }
		50% { box-shadow: 0 4px 20px rgba(239, 76, 131, 0.5); }
	}

	.step-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(18, 43, 59, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.step.active .step-label,
	.step.completed .step-label {
		color: var(--aq-color-deep);
	}

	.step-connector {
		flex: 1;
		height: 3px;
		background: rgba(18, 43, 59, 0.1);
		max-width: 80px;
		border-radius: 2px;
		margin-bottom: 1.5rem;
	}

	.step-connector.completed {
		background: var(--aq-color-primary);
	}

	/* Step Header */
	.step-header {
		text-align: center;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(18, 43, 59, 0.08);
	}

	.step-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: var(--aq-color-deep);
	}

	/* Step Content */
	.step-content {
		min-height: 300px;
	}

	/* Step 1: Mode Choice */
	.mode-choice {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.mode-card {
		background: white;
		border: 2px solid rgba(18, 43, 59, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mode-card:hover {
		border-color: rgba(239, 76, 131, 0.3);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.mode-card.selected {
		border-color: var(--aq-color-primary);
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.05), rgba(248, 192, 39, 0.05));
		box-shadow: 0 4px 16px rgba(239, 76, 131, 0.15);
	}

	.mode-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mode-icon {
		font-size: 1.5rem;
	}

	.mode-card h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--aq-color-deep);
	}

	.mode-card > p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--aq-color-muted);
	}

	.mode-features {
		list-style: none;
		margin: 0.5rem 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.mode-features li {
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mode-features li.available {
		color: #22c55e;
	}

	.mode-features li.warning {
		color: #f59e0b;
	}

	.mode-features .check,
	.mode-features .warn {
		font-size: 0.85rem;
	}

	.mode-hint {
		margin: 0.5rem 0 0 0;
		padding: 0.75rem;
		background: rgba(245, 158, 11, 0.1);
		border-radius: 8px;
		font-size: 0.8rem;
		color: #b45309;
	}

	.master-name-section {
		max-width: 400px;
		margin: 0 auto;
		padding: 1.5rem;
		background: rgba(239, 76, 131, 0.05);
		border-radius: 12px;
		border: 1px solid rgba(239, 76, 131, 0.1);
	}

	/* Step 2: Configuration */
	.config-step {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.editing-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.editing-header h3 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--aq-color-deep);
	}

	.back-link {
		background: none;
		border: none;
		color: var(--aq-color-primary);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0.35rem 0.5rem;
		border-radius: 6px;
		transition: background 0.15s ease;
	}

	.back-link:hover {
		background: rgba(239, 76, 131, 0.1);
	}

	/* Step 3: Players */
	.players-step {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Tablet+ layout: QR left, players right */
	@media (min-width: 768px) {
		.players-step {
			display: grid;
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1fr auto;
			gap: 1.5rem;
		}

		.invite-section {
			grid-row: 1;
			grid-column: 1;
		}

		.players-section {
			grid-row: 1;
			grid-column: 2;
		}

		.config-summary {
			grid-row: 2;
			grid-column: 1 / -1;
		}
	}

	.invite-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.08), rgba(248, 192, 39, 0.08));
		border-radius: 16px;
		border: 1px solid rgba(239, 76, 131, 0.15);
		align-items: center;
	}

	.code-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: white;
		border-radius: 12px;
		width: 100%;
		max-width: 300px;
	}

	.code-info {
		display: flex;
		flex-direction: column;
	}

	.code-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--aq-color-muted);
	}

	.code-value {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--aq-color-primary);
		letter-spacing: 0.1em;
	}

	.code-actions {
		display: flex;
		gap: 0.5rem;
	}

	.qr-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.qr-image {
		width: 180px;
		height: 180px;
		border-radius: 12px;
		border: 4px solid white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.qr-hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--aq-color-muted);
	}

	.players-section {
		padding: 1rem;
		background: rgba(18, 43, 59, 0.02);
		border-radius: 12px;
	}

	.players-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: var(--aq-color-deep);
	}

	.no-players {
		text-align: center;
		padding: 1.5rem;
		color: var(--aq-color-muted);
		font-style: italic;
	}

	.player-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.player-chip {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.75rem;
		border-radius: 12px;
		background: white;
		border: 1px solid rgba(18, 43, 59, 0.08);
	}

	.player-chip.offline {
		opacity: 0.6;
	}

	.player-chip.master-preview {
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.1), rgba(248, 192, 39, 0.1));
		border: 2px solid rgba(239, 76, 131, 0.3);
	}

	.chip-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(239, 76, 131, 0.2), rgba(244, 122, 32, 0.2));
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--aq-color-deep);
	}

	.player-chip.master-preview .chip-avatar {
		background: linear-gradient(135deg, var(--aq-color-primary), var(--aq-color-accent));
		color: white;
	}

	.chip-info {
		display: flex;
		flex-direction: column;
	}

	.chip-info strong {
		font-size: 0.95rem;
	}

	.chip-info span {
		font-size: 0.8rem;
		color: var(--aq-color-muted);
	}

	.chip-remove {
		border: none;
		background: rgba(239, 76, 131, 0.15);
		color: var(--aq-color-primary);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 700;
		transition: all 0.2s ease;
	}

	.chip-remove:hover {
		background: rgba(239, 76, 131, 0.25);
		transform: scale(1.1);
	}

	.config-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: rgba(18, 43, 59, 0.04);
		border-radius: 12px;
	}

	.summary-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		color: var(--aq-color-deep);
	}

	.summary-icon {
		font-size: 1.1rem;
	}

	.edit-link {
		background: none;
		border: none;
		color: var(--aq-color-primary);
		font-weight: 600;
		cursor: pointer;
		font-size: 0.9rem;
		text-decoration: underline;
	}

	.edit-link:hover {
		color: var(--aq-color-accent);
	}

	/* Step Footer */
	.step-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid rgba(18, 43, 59, 0.08);
		gap: 1rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.step-footer {
			padding-top: 0;
		}
		.wizard {
			padding: 1.25rem;
		}

		.stepper {
			padding: 0;
		}

		.step-circle {
			width: 36px;
			height: 36px;
			font-size: 0.9rem;
		}

		.step-label {
			font-size: 0.7rem;
		}

		.step-connector {
			max-width: 40px;
		}

		.mode-choice {
			grid-template-columns: 1fr;
		}

		.step-footer {
			flex-direction: column;
		}

		.step-footer > * {
			width: 100%;
		}
	}
</style>
