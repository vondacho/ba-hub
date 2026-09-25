/**
 * A map or a model, rendered without anybody at the editor.
 *
 *   render [<input.ddd|input.ddm>|-] [-o <output>|-] [--format svg|png|puml|mmd|md]
 *          [--kind ddd|ddm] [--view <file>|--no-view] [--scale N]
 *
 * Reads a `.ddd` context map or a `.ddm` domain model (stdin when there is no
 * input, or `-`, and then `--kind` says which) and writes one of the Export
 * dialog's destinations for it: the picture as SVG or PNG, the diagram as
 * PlantUML or Mermaid, or the outline as Markdown. The format is read off the
 * output's extension, or given with `--format` when writing to stdout.
 *
 * ## Two routes, by what the format is made of
 *
 * The text formats are functions of the document — `plantuml`, `mermaid`,
 * `outline` — and run here, in Node, with nothing else started.
 *
 * The pictures are not. The picture of a map is the canvas itself, copied with
 * the styles the browser computed for it (see src/lib/graph/svg-file.ts), and
 * there is deliberately no second renderer to call instead. So for those this
 * starts the app's own server on loopback, opens its `/render` page in headless
 * Chromium, and asks the real `Graph` or `Diagram` for the picture — see
 * src/components/render/RenderSurface.tsx. That is why the pictures need the
 * render image, which carries a browser, and the text formats do not.
 *
 * ## The arrangement
 *
 * A `.dddview` / `.ddmview` beside the input, with the same stem, is picked up
 * as the arrangement, as it would be if both were imported together. `--view`
 * names another one, and `--no-view` asks for the layout ELK chooses. It only
 * matters to the pictures: the PlantUML and Mermaid layouts belong to whoever
 * renders them, and the outline has none.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseMap } from '../lib/ddd/parser';
import { parse as parseModel } from '../lib/ddm/parser';
import { plantuml as mapPuml } from '../lib/ddd/puml';
import { plantuml as modelPuml } from '../lib/ddm/puml';
import { mermaid as mapMermaid } from '../lib/ddd/mermaid';
import { mermaid as modelMermaid } from '../lib/ddm/mermaid';
import { outline as mapOutline } from '../lib/ddd/outline';
import { outline as modelOutline } from '../lib/ddm/outline';
import type { Problem } from '../lib/ddd/problems';
import type { RenderRequest, RenderResult } from '../components/render/RenderSurface';

type Kind = 'ddd' | 'ddm';
type Format = 'svg' | 'png' | 'puml' | 'mmd' | 'md';

const FORMATS: readonly Format[] = ['svg', 'png', 'puml', 'mmd', 'md'];

const USAGE =
	'usage: render [<input.ddd|input.ddm>|-] [-o <output>|-] [--format svg|png|puml|mmd|md]\n' +
	'              [--kind ddd|ddm] [--view <file>|--no-view] [--scale N]';

class UsageError extends Error {}

/** The source did not parse, or its sidecar is not one. Already reported. */
class Refused extends Error {}

async function main(argv: readonly string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			output: { type: 'string', short: 'o' },
			format: { type: 'string', short: 'f' },
			kind: { type: 'string', short: 'k' },
			view: { type: 'string' },
			'no-view': { type: 'boolean' },
			scale: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (values.help) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}
	if (positionals.length > 1) throw new UsageError('One input file at a time.');

	const input = positionals[0] ?? '-';
	const output = values.output ?? '-';

	const kind = values.kind ?? (input === '-' ? undefined : extname(input).slice(1).toLowerCase());
	if (kind === undefined) throw new UsageError('Reading from stdin needs --kind.');
	if (kind !== 'ddd' && kind !== 'ddm') throw new UsageError(`Cannot read .${kind}; expected a .ddd or a .ddm.`);

	// `mermaid` too, because it is what the format is called and `.mmd` is only
	// what its files are called.
	const requested = values.format ?? (output === '-' ? undefined : extname(output).slice(1).toLowerCase());
	if (requested === undefined) throw new UsageError('Writing to stdout needs --format.');
	const format = requested === 'mermaid' ? 'mmd' : requested;
	if (!isFormat(format)) throw new UsageError(`Cannot write .${requested}; expected one of ${FORMATS.join(', ')}.`);

	const scale = values.scale === undefined ? 2 : Number(values.scale);
	if (!(scale > 0)) throw new UsageError(`--scale must be a positive number, not ${values.scale}.`);
	if (values.view !== undefined && values['no-view']) throw new UsageError('--view and --no-view contradict each other.');

	const source = readFileSync(input === '-' ? 0 : input, 'utf8');

	const bytes =
		format === 'svg' || format === 'png'
			? await picture(kind, source, viewFor(kind, input, values.view, values['no-view'] ?? false), format, scale)
			: Buffer.from(text(kind, source, format), 'utf8');

	if (output === '-') process.stdout.write(bytes);
	else writeFileSync(output, bytes);
}

function isFormat(value: string): value is Format {
	return (FORMATS as readonly string[]).includes(value);
}

/** The sidecar's text, or null for ELK's layout. */
function viewFor(kind: Kind, input: string, named: string | undefined, none: boolean): string | null {
	if (none) return null;
	if (named !== undefined) return readFileSync(named, 'utf8');
	if (input === '-') return null;
	const sibling = `${input.slice(0, -extname(input).length)}.${kind}view`;
	return existsSync(sibling) ? readFileSync(sibling, 'utf8') : null;
}

/* ---- the text formats ---------------------------------------------------- */

function text(kind: Kind, source: string, format: 'puml' | 'mmd' | 'md'): string {
	if (kind === 'ddd') {
		const parsed = parseMap(source);
		report(parsed.problems);
		if (!parsed.ok) throw new Refused();
		return { puml: mapPuml, mmd: mapMermaid, md: mapOutline }[format](parsed.document);
	}
	const parsed = parseModel(source);
	report(parsed.problems);
	if (!parsed.ok) throw new Refused();
	return { puml: modelPuml, mmd: modelMermaid, md: modelOutline }[format](parsed.document);
}

/**
 * Every problem, errors and warnings both, as `line:column severity: message`.
 *
 * Warnings too, because the editor shows them and a file that renders is not
 * necessarily a file anybody meant — and stderr is where a pipeline can see
 * them without them landing in the output.
 */
function report(problems: readonly Problem[]): void {
	for (const problem of problems) {
		process.stderr.write(`${problem.line}:${problem.column} ${problem.severity}: ${problem.message}\n`);
	}
}

/* ---- the pictures ---------------------------------------------------------- */

async function picture(kind: Kind, source: string, view: string | null, format: 'svg' | 'png', scale: number) {
	// Imported here rather than at the top: the text formats run in the plain
	// image too, where there is no browser for it to drive.
	const { chromium } = await import('playwright-core');

	const port = await freePort();
	const server = startServer(port);
	let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
	try {
		await ready(`http://127.0.0.1:${port}/healthz`, server);

		const executablePath = process.env.CHROMIUM_PATH;
		browser = await chromium.launch({
			...(executablePath ? { executablePath } : { channel: 'chrome' }),
			// Unprivileged in a container, with a small /dev/shm: the two flags
			// every headless Chromium in Docker ends up needing.
			args: ['--no-sandbox', '--disable-dev-shm-usage'],
		});
		const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' });
		page.on('pageerror', (error) => process.stderr.write(`page: ${error.message}\n`));

		await page.goto(`http://127.0.0.1:${port}/render`);
		await page.waitForFunction(() => window.baCmRender !== undefined);

		const request: RenderRequest = { kind, source, view, png: format === 'png', scale };
		const result: RenderResult = await page.evaluate((request) => window.baCmRender!(request), request);

		if (!result.ok) {
			report(result.problems);
			if (result.error !== null) process.stderr.write(`${result.error}\n`);
			throw new Refused();
		}
		for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);

		return format === 'png' ? Buffer.from(result.png!, 'base64') : Buffer.from(result.svg, 'utf8');
	} finally {
		await browser?.close();
		server.kill();
	}
}

/** The app's own server, beside this file in dist/, on loopback only. */
function startServer(port: number): ChildProcess {
	const entry = fileURLToPath(new URL('../server/entry.mjs', import.meta.url));
	return spawn(process.execPath, [entry], {
		env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), BA_CM_RENDER: '1' },
		stdio: ['ignore', 'ignore', 'inherit'],
	});
}

/** Any port the kernel will give us. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() => (typeof address === 'object' && address !== null ? resolve(address.port) : reject(new Error('No port.'))));
		});
	});
}

/** Poll the health check until it answers, the server dies, or 20 s pass. */
async function ready(url: string, server: ChildProcess): Promise<void> {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`The server exited with ${server.exitCode} before it was ready.`);
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('The server did not come up within 20 seconds.');
}

main(process.argv.slice(2)).catch((error: unknown) => {
	if (error instanceof Refused) {
		process.exitCode = 1;
	} else if (
		error instanceof UsageError ||
		(error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'))
	) {
		process.stderr.write(`${error.message}\n${USAGE}\n`);
		process.exitCode = 2;
	} else {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
});
