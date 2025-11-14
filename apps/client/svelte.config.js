import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// Output directory for static files
			pages: 'build',
			assets: 'build',
			// SPA fallback for client-side routing
			fallback: 'index.html',
			// Prerender all pages by default
			precompress: false,
			strict: true
		}),
		prerender: {
			handleMissingId: 'ignore',
			handleHttpError: 'ignore',
			handleUnseenRoutes: 'ignore'
		}
	}
};

export default config;
