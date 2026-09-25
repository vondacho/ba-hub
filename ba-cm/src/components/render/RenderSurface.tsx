/**
 * The canvases, with nobody at them: what `render` drives from a headless
 * browser.
 *
 * The picture of a map *is* the canvas — `svg-file.ts` copies the live `<svg>`
 * with its computed styles rather than drawing a second one — so a picture made
 * outside the editor has to come out of the same components too. This mounts
 * `Graph` or `Diagram` exactly as `DddMapper` and `ModelEditor` do, hands them
 * a document laid out by the same `layout`, and asks for the picture through
 * the same `serialize` handle the Export dialog uses. The PNG is the same
 * `svgToPng`. Nothing here draws.
 *
 * What it leaves out is everything that belongs to a session: the source pane,
 * the store, the inspector, the agent. Every handler is a no-op, because
 * nothing here is ever clicked, and nothing is read from or written to
 * localStorage, because a render is a function of the file and the sidecar it
 * was given — and the headless profile has nobody's work in it anyway.
 *
 * The panel is pinned to daylight with `data-theme="light"`, the same pin the
 * theme button sets. A picture made in a pipeline has no visitor whose OS
 * preference it could be following.
 *
 * It is reached as `window.baCmRender`, from src/cli/render.ts, on the
 * `/render` page that only the render image serves.
 */

import { useEffect, useRef, useState } from 'react';
import Graph from '../mapper/Graph';
import Diagram from '../model/Diagram';
import type { CanvasControls } from '../ui/ViewControls';
import { parse as parseMap } from '../../lib/ddd/parser';
import { parse as parseModel } from '../../lib/ddm/parser';
import type { DddDocument } from '../../lib/ddd/model';
import type { DomainModel } from '../../lib/ddm/model';
import type { Problem } from '../../lib/ddd/problems';
import { layout as layoutMap, type Curves, type Layout, type Positions } from '../../lib/graph/layout';
import { layout as layoutModel, type Placement, type Positions as ModelPositions } from '../../lib/ddm/layout';
import { parseModelView, parseView } from '../../lib/view-file';
import { sizeOf, svgToPng } from '../../lib/graph/raster';

export interface RenderRequest {
	readonly kind: 'ddd' | 'ddm';
	readonly source: string;
	/** The `.dddview` / `.ddmview` text, or null for the layout ELK chooses. */
	readonly view: string | null;
	/** Whether to raster too. The SVG alone skips the canvas work. */
	readonly png: boolean;
	readonly scale: number;
}

export type RenderResult =
	| { readonly ok: true; readonly svg: string; readonly png: string | null; readonly warnings: readonly string[] }
	| { readonly ok: false; readonly problems: readonly Problem[]; readonly error: string | null };

declare global {
	interface Window {
		baCmRender?: (request: RenderRequest) => Promise<RenderResult>;
	}
}

type Job =
	| { kind: 'ddd'; document: DddDocument; layout: Layout; positions: Positions; curves: Curves }
	| { kind: 'ddm'; document: DomainModel; placement: Placement; positions: ModelPositions };

const nothing = () => {};

export default function RenderSurface() {
	const [job, setJob] = useState<Job | null>(null);
	const canvas = useRef<CanvasControls | null>(null);
	/** Resolved once the canvas for the job just set has committed. */
	const mounted = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (job === null) return;
		mounted.current?.();
		mounted.current = null;
	}, [job]);

	useEffect(() => {
		window.baCmRender = async (request) => {
			const next = await prepare(request);
			if (!('ready' in next)) return next;

			// Mount the canvas with this job, and wait for the commit: the
			// `serialize` handle is only there once the component is.
			await new Promise<void>((resolve) => {
				mounted.current = resolve;
				setJob(next.job);
			});

			const svg = (await canvas.current?.serialize()) ?? null;
			if (svg === null) return { ok: false, problems: [], error: 'The canvas produced no picture.' };

			let png: string | null = null;
			if (request.png) {
				const size = sizeOf(svg);
				if (size === null) return { ok: false, problems: [], error: 'The picture has no size to raster at.' };
				png = await base64(await svgToPng({ svg, ...size }, request.scale));
			}
			return { ok: true, svg, png, warnings: next.warnings };
		};
		return () => {
			delete window.baCmRender;
		};
	}, []);

	return (
		<section
			aria-label="Render surface"
			data-theme="light"
			className="relative h-[900px] w-[1400px] bg-white text-ink dark:bg-night dark:text-slate-100"
		>
			{job?.kind === 'ddd' && (
				<Graph
					document={job.document}
					layout={job.layout}
					stale={false}
					selected={null}
					also={[]}
					onSelect={nothing}
					positions={job.positions}
					onPositions={nothing}
					curves={job.curves}
					onCurves={nothing}
					controls={canvas}
					onScale={nothing}
					fullscreen={false}
					onAdd={nothing}
					adds={[]}
					onConnect={nothing}
					onOpenNode={nothing}
				/>
			)}
			{job?.kind === 'ddm' && (
				<Diagram
					document={job.document}
					placement={job.placement}
					stale={false}
					selected={null}
					also={[]}
					onSelect={nothing}
					positions={job.positions}
					onPositions={nothing}
					controls={canvas}
					onScale={nothing}
					adds={[]}
					onAdd={nothing}
					onConnect={nothing}
				/>
			)}
		</section>
	);
}

/**
 * Parse, lay out and apply the sidecar — the editors' own sequence, once.
 *
 * A source that does not parse is refused rather than drawn. The editor keeps
 * showing the last good document while the text is broken; a render has no
 * last good document, and a picture of half a file is not one anybody asked for.
 */
async function prepare(
	request: RenderRequest,
): Promise<{ ready: true; job: Job; warnings: string[] } | Extract<RenderResult, { ok: false }>> {
	const warnings: string[] = [];

	if (request.kind === 'ddd') {
		const parsed = parseMap(request.source);
		if (!parsed.ok) return { ok: false, problems: parsed.problems, error: null };
		let positions: Positions = {};
		let curves: Curves = {};
		if (request.view !== null) {
			const view = parseView(request.view, parsed.document.title);
			if (!view.ok) return { ok: false, problems: [], error: view.error };
			if (view.warning) warnings.push(view.warning);
			positions = view.view.positions;
			curves = view.view.curves;
		}
		const layout = await layoutMap(parsed.document);
		return { ready: true, job: { kind: 'ddd', document: parsed.document, layout, positions, curves }, warnings };
	}

	const parsed = parseModel(request.source);
	if (!parsed.ok) return { ok: false, problems: parsed.problems, error: null };
	let positions: ModelPositions = {};
	if (request.view !== null) {
		const view = parseModelView(request.view, parsed.document.context);
		if (!view.ok) return { ok: false, problems: [], error: view.error };
		if (view.warning) warnings.push(view.warning);
		positions = view.view.positions;
	}
	const placement = await layoutModel(parsed.document);
	return { ready: true, job: { kind: 'ddm', document: parsed.document, placement, positions }, warnings };
}

/** A blob as base64, for the trip back out through `page.evaluate`. */
async function base64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (let at = 0; at < bytes.length; at += 8192) {
		binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
	}
	return btoa(binary);
}
