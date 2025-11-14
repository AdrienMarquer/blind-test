<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'success' | 'ghost';
	type ButtonSize = 'sm' | 'md' | 'lg';

	let {
		type = 'button',
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		fullWidth = false,
		onclick = undefined,
		children
	}: {
		type?: 'button' | 'submit' | 'reset';
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		disabled?: boolean;
		fullWidth?: boolean;
		onclick?: ((e: MouseEvent) => void) | undefined;
		children?: Snippet;
	} = $props();
</script>

<button
	type={type}
	class={`aq-btn ${variant} ${size} ${fullWidth ? 'full' : ''}`}
	disabled={disabled || loading}
	aria-busy={loading}
	{onclick}
>
	<span class="content">
		{#if children}
			{@render children()}
		{/if}
	</span>
</button>

<style>
	.aq-btn {
		border: none;
		border-radius: var(--aq-radius-md);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
		color: #fff;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		box-shadow: 0 8px 16px rgba(18, 43, 59, 0.2);
	}

	.aq-btn.full {
		width: 100%;
	}

	.aq-btn.sm {
		padding: 0.4rem 1rem;
		font-size: 0.9rem;
	}

	.aq-btn.md {
		padding: 0.65rem 1.5rem;
	}

	.aq-btn.lg {
		padding: 0.85rem 2rem;
		font-size: 1.1rem;
	}

	.aq-btn.primary {
		background: linear-gradient(135deg, #ef4c83, #f47a20);
	}

	.aq-btn.secondary {
		background: var(--aq-color-secondary);
		color: var(--aq-color-deep);
	}

	.aq-btn.success {
		background: #0ec58f;
	}

	.aq-btn.outline {
		background: transparent;
		color: var(--aq-color-deep);
		border: 2px solid rgba(255, 255, 255, 0.7);
		box-shadow: none;
	}

	.aq-btn.ghost {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
		box-shadow: none;
	}

	.aq-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 16px 28px rgba(18, 43, 59, 0.28);
	}

	.aq-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.content {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
</style>
