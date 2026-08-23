/**
 * The view file: `.dddview`.
 *
 * Positions and edge curvature, as a file you can keep.
 *
 * This exists because "never in the document" and "never anywhere" are
 * different rules, and only the first one was ever the point. Coordinates must
 * stay out of the `.ddd` file — otherwise every diff fills with position churn
 * that hides the one line where a pattern changed. But an arrangement somebody
 * worked out, in which the relationships finally read clearly, is worth
 * keeping and worth handing to a colleague.
 *
 * So it is a **sidecar**. Two files, two lifetimes:
 *
 *   `insurance.ddd`      the model. Reviewed, diffed, argued about.
 *   `insurance.dddview`  how one person likes to look at it. Optional.
 *
 * Losing the sidecar costs nothing — the map redraws from the computed layout.
 * That asymmetry is what makes it safe to have at all.
 *
 * The map title is carried so that loading a view built for a different map can
 * say so rather than scattering one map's boxes across coordinates computed for
 * another.
 */

export interface ViewFile {
	positions: Record<string, { x: number; y: number }>;
	curves: Record<string, { dx: number; dy: number }>;
	/** The title of the map this arrangement was made for. */
	map: string;
}

const FORMAT = 'ba-ddd-view';
const VERSION = 1;

export function serializeView(view: ViewFile): string {
	return `${JSON.stringify(
		{ format: FORMAT, version: VERSION, map: view.map, positions: view.positions, curves: view.curves },
		null,
		2,
	)}\n`;
}

export type ViewParse =
	| { ok: true; view: ViewFile; warning?: string }
	| { ok: false; error: string };

/**
 * Parse a view file.
 *
 * Every number is checked rather than trusted. This is a file a person can hand
 * to another person and can edit by hand, and a single `NaN` reaching an SVG
 * transform blanks the entire graph with no error anywhere — a failure mode
 * far more confusing than a rejected file.
 */
export function parseView(text: string, currentMap: string): ViewParse {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: 'Not valid JSON — a .dddview file is JSON, not a .ddd map.' };
	}

	if (!raw || typeof raw !== 'object') {
		return { ok: false, error: 'Not a view file.' };
	}

	const record = raw as Record<string, unknown>;
	if (record.format !== FORMAT) {
		return {
			ok: false,
			error: 'Not a view file — it has no `"format": "ba-ddd-view"`. A .ddd map goes in Open, not here.',
		};
	}
	if (typeof record.version !== 'number' || record.version > VERSION) {
		return { ok: false, error: `View format version ${String(record.version)} is newer than this build understands.` };
	}

	const positions: Record<string, { x: number; y: number }> = {};
	for (const [id, value] of Object.entries(asObject(record.positions))) {
		const point = value as { x?: unknown; y?: unknown };
		if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
			positions[id] = { x: Number(point.x), y: Number(point.y) };
		}
	}

	const curves: Record<string, { dx: number; dy: number }> = {};
	for (const [id, value] of Object.entries(asObject(record.curves))) {
		const point = value as { dx?: unknown; dy?: unknown };
		if (Number.isFinite(point?.dx) && Number.isFinite(point?.dy)) {
			curves[id] = { dx: Number(point.dx), dy: Number(point.dy) };
		}
	}

	const map = typeof record.map === 'string' ? record.map : '';

	// A mismatch is a warning rather than a refusal. Node ids are derived from
	// names, so a view from a renamed or forked map still lands correctly on
	// everything the two have in common — which is usually most of it.
	const warning =
		map && map !== currentMap
			? `This view was made for “${map}”, and the open map is “${currentMap}”. Boxes whose names match have moved; the rest are where they were.`
			: undefined;

	return { ok: true, view: { positions, curves, map }, ...(warning ? { warning } : {}) };
}

function asObject(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
