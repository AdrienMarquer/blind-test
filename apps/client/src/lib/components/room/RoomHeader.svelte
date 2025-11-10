<script lang="ts">
	import type { Room } from '@blind-test/shared';

	interface Props {
		room: Room | null;
		error: string | null;
	}

	let { room, error }: Props = $props();
</script>

{#if room}
	<div class="room-header">
		<div>
			<h1>{room.name}</h1>
			<div class="header-info">
				<p>Room Code: <strong>{room.code}</strong></p>
				<p>Status: <span class="status-badge status-{room.status}">{room.status}</span></p>
				<p>Players: {room.players.length} / {room.maxPlayers}</p>
			</div>
		</div>

		{#if error}
			<div class="error">{error}</div>
		{/if}
	</div>
{/if}

<style>
	.room-header {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 2rem;
		border-radius: 12px;
		margin-bottom: 2rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	}

	h1 {
		margin: 0 0 1rem 0;
		font-size: 2.5rem;
		font-weight: 700;
	}

	.header-info {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.header-info p {
		margin: 0;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-info strong {
		font-weight: 700;
		font-size: 1.3rem;
		letter-spacing: 2px;
	}

	.status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: capitalize;
		background: rgba(255, 255, 255, 0.2);
	}

	.status-lobby {
		background: rgba(76, 175, 80, 0.3);
	}

	.status-playing {
		background: rgba(255, 152, 0, 0.3);
	}

	.status-finished {
		background: rgba(244, 67, 54, 0.3);
	}

	.error {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(244, 67, 54, 0.2);
		border-left: 4px solid #f44336;
		border-radius: 4px;
	}
</style>
