<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import Button from './ui/Button.svelte';
	import Card from './ui/Card.svelte';
	import Logo from './Logo.svelte';

	let {
		children
	}: {
		children: Snippet;
	} = $props();

	let isAuthenticated = $state(false);
	let isLoading = $state(true);
	let password = $state('');
	let error = $state<string | null>(null);
	let verifying = $state(false);

	const STORAGE_KEY = 'admin_auth';

	onMount(() => {
		// Check if already authenticated
		const storedPassword = localStorage.getItem(STORAGE_KEY);
		if (storedPassword) {
			// Verify stored password is still valid
			verifyPassword(storedPassword, true);
		} else {
			isLoading = false;
		}
	});

	async function verifyPassword(pwd: string, isStoredCheck = false) {
		try {
			verifying = true;
			error = null;

			const response = await api.api.auth.admin.post({ password: pwd });

			if (response.data?.valid) {
				isAuthenticated = true;
				// Store password for future sessions
				localStorage.setItem(STORAGE_KEY, pwd);
			} else {
				if (!isStoredCheck) {
					error = 'Mot de passe incorrect';
				} else {
					// Stored password is no longer valid
					localStorage.removeItem(STORAGE_KEY);
				}
			}
		} catch (err) {
			console.error('Auth error:', err);
			if (!isStoredCheck) {
				error = 'Erreur de connexion';
			}
			localStorage.removeItem(STORAGE_KEY);
		} finally {
			verifying = false;
			isLoading = false;
		}
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (password.trim()) {
			verifyPassword(password.trim());
		}
	}

	function handleLogout() {
		localStorage.removeItem(STORAGE_KEY);
		isAuthenticated = false;
		password = '';
	}
</script>

{#if isLoading}
	<div class="gate-loading">
		<div class="spinner"></div>
	</div>
{:else if isAuthenticated}
	<div class="admin-header">
		<button class="logout-btn" onclick={handleLogout} title="Se deconnecter">
			Deconnexion
		</button>
	</div>
	{@render children()}
{:else}
	<div class="gate-container">
		<div class="gate-content">
			<Logo size={120} />
			<Card title="Acces Admin" subtitle="Entrez le mot de passe pour acceder a cette page" icon="🔐">
				<form class="gate-form" onsubmit={handleSubmit}>
					<div class="input-field">
						<input
							type="password"
							bind:value={password}
							placeholder="Mot de passe"
							disabled={verifying}
							class:error={!!error}
						/>
					</div>
					{#if error}
						<p class="error-message">{error}</p>
					{/if}
					<Button type="submit" variant="primary" size="lg" fullWidth disabled={!password.trim()} loading={verifying}>
						{verifying ? 'Verification...' : 'Acceder'}
					</Button>
				</form>
			</Card>
		</div>
	</div>
{/if}

<style>
	.gate-loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(239, 76, 131, 0.2);
		border-top-color: var(--aq-color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.gate-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 70vh;
		padding: 2rem;
	}

	.gate-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		max-width: 400px;
		width: 100%;
	}

	.gate-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-field input {
		width: 100%;
		padding: 0.75rem 1rem;
		border-radius: var(--aq-radius-md);
		border: 2px solid rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.95);
		font-size: 1rem;
		transition: border-color 160ms ease, box-shadow 160ms ease;
	}

	.input-field input:focus {
		outline: none;
		border-color: var(--aq-color-primary);
		box-shadow: 0 0 0 4px rgba(239, 76, 131, 0.2);
	}

	.input-field input.error {
		border-color: var(--aq-color-primary);
		background: rgba(239, 76, 131, 0.08);
	}

	.error-message {
		margin: 0;
		font-size: 0.9rem;
		color: var(--aq-color-primary);
		text-align: center;
	}

	.admin-header {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 1rem;
	}

	.logout-btn {
		background: rgba(239, 76, 131, 0.1);
		border: none;
		border-radius: var(--aq-radius-md);
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		color: var(--aq-color-primary);
		cursor: pointer;
		transition: background 160ms ease;
	}

	.logout-btn:hover {
		background: rgba(239, 76, 131, 0.2);
	}
</style>
