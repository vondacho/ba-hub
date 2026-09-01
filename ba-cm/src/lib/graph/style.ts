/**
 * How the graph looks, in one place.
 *
 * Two rules the rest of the component depends on.
 *
 * **The classification is the strongest signal on the canvas.** It is a budget
 * rather than a label — core gets the deep model and the best people, generic
 * gets bought — so a reader has to be able to see it without reading. Core is
 * filled violet, supporting is outlined in a cooler hue, generic is dashed and
 * grey.
 *
 * Grey for generic is the point rather than a leftover: generic is the part of
 * the map nobody should be looking at, so it is the one class that stays
 * colourless while the other two carry saturation. A map whose every box was
 * vivid would be a map with no signal in it at all.
 *
 * **The two edge classes share no visual language.** Containment is a thin grey
 * orthogonal line running up to a parent. A relationship is a labelled arc
 * swinging below the row. If they looked alike the graph would read as a
 * hairball, and the relationships are the only part anybody is trying to see.
 *
 * Colours are Tailwind class strings rather than raw values so both themes come
 * for free through the `dark:` variant defined in global.css — which resolves
 * against `data-theme` on the panel, not against the OS, so the graph can be
 * pinned light while the page stays dark.
 */

import type { Classification, ModelStatus, Node } from '../ddd/model';

export interface NodeStyle {
	/** SVG `fill` and `stroke` classes. */
	readonly box: string;
	readonly label: string;
	readonly sub: string;
	/** Corner radius of the box. Ignored when `shape` is `ellipse`. */
	readonly radius: number;
	readonly dashed: boolean;
	/**
	 * A context is drawn as an ellipse and everything in the problem space as a
	 * box, so the two halves of the map are told apart by silhouette alone —
	 * before colour, before reading a word. Solutions are round.
	 */
	readonly shape: 'rect' | 'ellipse';
}

const CLASS_STYLE: Record<Classification, NodeStyle> = {
	core: {
		box: 'fill-violet-200 stroke-violet-600 dark:fill-violet-950 dark:stroke-violet-400',
		label: 'fill-violet-950 dark:fill-violet-100',
		sub: 'fill-violet-700 dark:fill-violet-300',
		radius: 12,
		dashed: false,
		shape: 'rect',
	},
	supporting: {
		box: 'fill-sky-100 stroke-sky-500 dark:fill-sky-950 dark:stroke-sky-500',
		label: 'fill-sky-950 dark:fill-sky-50',
		sub: 'fill-sky-700 dark:fill-sky-300',
		radius: 12,
		dashed: false,
		shape: 'rect',
	},
	generic: {
		box: 'fill-slate-100 stroke-slate-400 dark:fill-slate-950 dark:stroke-slate-600',
		label: 'fill-slate-500 dark:fill-slate-400',
		sub: 'fill-slate-400 dark:fill-slate-500',
		radius: 12,
		dashed: true,
		shape: 'rect',
	},
};

const DOMAIN_STYLE: NodeStyle = {
	/* The violet-tinted ink rather than a neutral black: a domain is the frame
	   the whole map hangs in, and in daylight a flat slate reads as a hole in
	   the page next to saturated children. */
	box: 'fill-ink stroke-ink dark:fill-slate-100 dark:stroke-slate-100',
	label: 'fill-white dark:fill-slate-900',
	sub: 'fill-violet-300 dark:fill-slate-600',
	radius: 14,
	dashed: false,
	shape: 'rect',
};

/**
 * A context inherits the look of the subdomain it serves, because the
 * classification is a property of the *problem* and a context's whole reason to
 * exist is the problem it solves. A context serving two subdomains of different
 * classifications — the straddle — takes the more demanding of the two, which
 * is the honest reading: if any part of what it does is core, it is not safe to
 * treat it as generic.
 */
export function styleFor(node: Node, classificationOf: (id: string) => Classification | null): NodeStyle {
	if (node.kind === 'domain') return DOMAIN_STYLE;
	if (node.kind === 'subdomain') return CLASS_STYLE[node.classification];

	const ranked: Classification[] = ['core', 'supporting', 'generic'];
	const found = node.serves
		.map(classificationOf)
		.filter((value): value is Classification => value !== null);
	const strongest = ranked.find((candidate) => found.includes(candidate));
	return { ...CLASS_STYLE[strongest ?? 'supporting'], shape: 'ellipse' };
}

/** Shown under the name on a context box. */
export const statusNote: Record<ModelStatus, string> = {
	modelled: '',
	drafted: 'drafted',
	unmodelled: 'not modelled',
};

export const classificationLabel: Record<Classification, string> = {
	core: 'Core',
	supporting: 'Supporting',
	generic: 'Generic',
};

/**
 * The legend, in reading order: the frame first, then the three budgets from
 * the one worth the most to the one worth the least.
 *
 * The swatch colours are written out again rather than derived from `box`
 * above, because a swatch is a `<span>` and needs `bg-`/`border-` where the
 * node needs `fill-`/`stroke-`. doc-sm's src/lib/board/kinds.ts keeps the same
 * pair for the same reason and documents the trap that forbids assembling
 * them: Tailwind scans the source for whole class names and cannot see one
 * built at runtime, so a swatch class stitched together from a hue would
 * compile, run, and render nothing.
 *
 * The note matters as much as the colour. Colour is never the only signal —
 * the same rule doc-sm's board follows — so the legend says in words what the
 * fills say in hue, and the two dashed greys stay legible to a reader who
 * cannot separate violet from blue.
 */
export interface LegendEntry {
	readonly label: string;
	readonly note: string;
	/** `bg-` and `border-` classes matching the node's `fill` and `stroke`. */
	readonly swatch: string;
}

export const LEGEND: readonly LegendEntry[] = [
	{
		label: 'Domain',
		note: 'the whole business the map covers',
		swatch: 'bg-ink border-ink dark:bg-slate-100 dark:border-slate-100',
	},
	{
		label: 'Core',
		note: 'where the business wins — the deep model and the best people',
		swatch: 'bg-violet-200 border-violet-600 dark:bg-violet-950 dark:border-violet-400',
	},
	{
		label: 'Supporting',
		note: 'specific to this business, but not what it competes on',
		swatch: 'bg-sky-100 border-sky-500 dark:bg-sky-950 dark:border-sky-500',
	},
	{
		label: 'Generic',
		note: 'everyone needs it — buy it',
		swatch: 'border-dashed bg-slate-100 border-slate-400 dark:bg-slate-950 dark:border-slate-600',
	},
];
