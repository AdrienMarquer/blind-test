<script lang="ts">
	type InputType = 'text' | 'number' | 'email' | 'password';

	let {
		label = null,
		id = crypto.randomUUID(),
		value = $bindable(''),
		placeholder = '',
		type = 'text' as InputType,
		disabled = false,
		error = null,
		description = null,
		required = false,
		multiline = false,
		rows = 3
	}: {
		label?: string | null;
		id?: string;
		value?: string;
		placeholder?: string;
		type?: InputType;
		disabled?: boolean;
		error?: string | null;
		description?: string | null;
		required?: boolean;
		multiline?: boolean;
		rows?: number;
	} = $props();
</script>

<div class="input-field">
	{#if label}
		<label for={id}>
			{label}
			{#if required}
				<span aria-hidden="true">*</span>
			{/if}
		</label>
	{/if}

	{#if multiline}
		<textarea
			id={id}
			bind:value
			placeholder={placeholder}
			rows={rows}
			disabled={disabled}
			class:error={!!error}
		></textarea>
	{:else}
		<input
			id={id}
			type={type}
			bind:value
			placeholder={placeholder}
			disabled={disabled}
			required={required}
			class:error={!!error}
		/>
	{/if}

	{#if description && !error}
		<p class="description">{description}</p>
	{/if}

	{#if error}
		<p class="error">{error}</p>
	{/if}
</div>

<style>
	.input-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		width: 100%;
	}

	label {
		font-weight: 600;
		color: var(--aq-color-deep);
		font-size: 0.95rem;
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	label span {
		color: var(--aq-color-primary);
	}

	input,
	textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		border-radius: var(--aq-radius-md);
		border: 2px solid rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.95);
		font-size: 1rem;
		transition: border-color 160ms ease, box-shadow 160ms ease;
	}

	textarea {
		resize: vertical;
	}

	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 4px rgba(239, 76, 131, 0.2);
	}

	input:disabled,
	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	input.error,
	textarea.error {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.08);
	}

	.description {
		margin: 0;
		font-size: 0.85rem;
		color: rgba(18, 43, 59, 0.8);
	}

	.error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--aq-color-primary);
	}
</style>
