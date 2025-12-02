<script lang="ts">
	import type { Snippet } from 'svelte';

	type BadgeTone = 'primary' | 'success' | 'warning' | 'neutral';

	let {
		tone = 'primary',
		icon = null,
		children
	}: {
		tone?: BadgeTone;
		icon?: string | null;
		children?: Snippet;
	} = $props();
</script>

<span class={`aq-status ${tone}`}>
	{#if icon}
		<span class="icon" aria-hidden="true">{icon}</span>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</span>

<style>
	.aq-status {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.aq-status.primary {
		background: rgba(239, 76, 131, 0.15);
		color: var(--aq-color-primary);
	}

	.aq-status.success {
		background: rgba(56, 193, 114, 0.16);
		color: #0f9d58;
	}

	.aq-status.warning {
		background: rgba(248, 192, 39, 0.18);
		color: var(--aq-color-secondary);
	}

	.aq-status.neutral {
		background: rgba(18, 43, 59, 0.12);
		color: var(--aq-color-deep);
	}

	.icon {
		font-size: 1rem;
	}
</style>
