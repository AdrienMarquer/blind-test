<script lang="ts">
	let { size = 260 }: { size?: number } = $props();
	const dimension = Math.round(size);
</script>

<img
	src="/logo.webp"
	alt="Logo AdriQuiz"
	width={dimension}
	height={dimension}
	loading="lazy"
	decoding="async"
	style="width: {dimension}px; height: auto; max-width: 100%; display: block;"
/>
