<script lang="ts">
	let {
		title = null,
		subtitle = null,
		icon = null,
		padded = true,
		elevation = 'soft'
	}: {
		title?: string | null;
		subtitle?: string | null;
		icon?: string | null;
		padded?: boolean;
		elevation?: 'soft' | 'bold';
	} = $props();
</script>

<div class={`aq-card ${elevation} ${padded ? 'padded' : ''}`}>
	{#if title || icon}
		<header>
			<div class="title">
				{#if icon}
					<span class="icon" aria-hidden="true">{icon}</span>
				{/if}
				<div>
					{#if title}
						<h3>{title}</h3>
					{/if}
					{#if subtitle}
						<p>{subtitle}</p>
					{/if}
				</div>
			</div>
			<slot name="actions" />
		</header>
	{/if}
	<div class="content">
		<slot />
	</div>
</div>

<style>
	.aq-card {
		background: var(--aq-color-surface);
		border-radius: 24px;
		border: 1px solid var(--aq-color-border);
		box-shadow: var(--aq-shadow-soft);
		width: 100%;
	}

	.aq-card.bold {
		box-shadow: var(--aq-shadow-card);
	}

	.aq-card.padded {
		padding: 1.5rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.title {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.icon {
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: rgba(239, 76, 131, 0.12);
		display: grid;
		place-items: center;
		font-size: 1.3rem;
	}

	h3 {
		font-size: 1.25rem;
		margin: 0;
	}

	p {
		margin: 0;
		color: var(--aq-color-muted);
		font-size: 0.95rem;
	}
</style>
