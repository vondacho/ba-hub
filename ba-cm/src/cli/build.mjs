/**
 * Bundles src/cli/render.ts into dist/cli/render.mjs, next to the server it
 * starts for the pictures.
 *
 * esbuild rather than a second Astro/Vite config: the CLI is one entry with no
 * pages and no client, and esbuild is already in the tree underneath Vite.
 *
 * playwright-core stays external. It is resolved from the image's production
 * node_modules at run time, and it is only loaded at all when a picture is
 * asked for.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));

await build({
	entryPoints: [resolve(here, 'render.ts')],
	outfile: resolve(here, '../../dist/cli/render.mjs'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: ['playwright-core'],
	logLevel: 'warning',
});
