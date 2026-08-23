/**
 * How the graph looks, in one place.
 *
 * Two rules the rest of the component depends on.
 *
 * **The classification is the strongest signal on the canvas.** It is a budget
 * rather than a label — core gets the deep model and the best people, generic
 * gets bought — so a reader has to be able to see it without reading. Core is
 * filled and saturated, supporting is outlined, generic is dashed and grey.
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
	readonly radius: number;
	readonly dashed: boolean;
}

const CLASS_STYLE: Record<Classification, NodeStyle> = {
	core: {
		box: 'fill-violet-100 stroke-violet-500 dark:fill-violet-950 dark:stroke-violet-400',
		label: 'fill-violet-950 dark:fill-violet-100',
		sub: 'fill-violet-700 dark:fill-violet-300',
		radius: 12,
		dashed: false,
	},
	supporting: {
		box: 'fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500',
		label: 'fill-slate-900 dark:fill-slate-100',
		sub: 'fill-slate-500 dark:fill-slate-400',
		radius: 12,
		dashed: false,
	},
	generic: {
		box: 'fill-slate-50 stroke-slate-300 dark:fill-slate-950 dark:stroke-slate-600',
		label: 'fill-slate-500 dark:fill-slate-400',
		sub: 'fill-slate-400 dark:fill-slate-500',
		radius: 12,
		dashed: true,
	},
};

const DOMAIN_STYLE: NodeStyle = {
	box: 'fill-slate-900 stroke-slate-900 dark:fill-slate-100 dark:stroke-slate-100',
	label: 'fill-white dark:fill-slate-900',
	sub: 'fill-slate-300 dark:fill-slate-600',
	radius: 14,
	dashed: false,
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
	return CLASS_STYLE[strongest ?? 'supporting'];
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
