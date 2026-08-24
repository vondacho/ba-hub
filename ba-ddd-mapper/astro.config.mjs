// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	// Server-rendered, matching ba-portal and the doc-hub boards — but see the
	// `prerender` exports in src/pages/dsl.astro and src/pages/404.astro: a page
	// that asks the server for nothing says so structurally rather than in a
	// comment.
	//
	// The mapper page is not among them. Its footer resolves the addresses of
	// the neighbouring components from the environment, and those are
	// configuration that has to be read per request rather than baked in.
	output: 'server',
	adapter: node({ mode: 'standalone' }),

	// React is here for exactly one component, <DddMapper client:only>.
	//
	// The argument is doc-es's and it transfers intact: a graph is direct
	// manipulation, and there is no URL, no form and no round trip that
	// expresses "this relationship is really a conformist one". Every other page
	// here is server-rendered HTML with no script attached.
	integrations: [react()],

	// Tailwind 4 is a Vite plugin, not an Astro integration.
	vite: { plugins: [tailwindcss()] },
});
