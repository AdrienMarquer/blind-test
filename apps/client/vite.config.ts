import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:3007',
				changeOrigin: true
			},
			'/ws': {
				target: 'ws://localhost:3007',
				ws: true
			},
			'/uploads': {
				target: 'http://localhost:3007',
				changeOrigin: true
			}
		}
	}
});
