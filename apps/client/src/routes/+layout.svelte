<script lang="ts">
	import '$lib/styles/theme.css';
</script>

<svelte:head>
	<title>Music Quiz - Blind Test Musical</title>
	<meta name="description" content="Organise des blind tests musicaux avec tes amis. Crée une salle, invite les joueurs via QR code et devinez les chansons en temps réel." />
	<meta name="theme-color" content="#ef4c83" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Music Quiz - Blind Test Musical" />
	<meta property="og:description" content="Organise des blind tests musicaux avec tes amis. Buzze, devine l'artiste et le titre pour marquer des points !" />
	<meta property="og:site_name" content="Music Quiz" />
</svelte:head>

<div class="aq-shell">
	<slot />
</div>
