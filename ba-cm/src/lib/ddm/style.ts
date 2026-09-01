/**
 * How the domain model looks, in one place.
 *
 * The map has `graph/style.ts` and this is its counterpart, with the same two
 * halves for the same reason: the function the canvas paints with, and the
 * legend that says in words what the paint says in hue.
 *
 * **The palette says what a thing is**, and it is the map's palette one zoom
 * level down: violet for the part that carries the modelling weight, grey for
 * the part that should not. An aggregate root is the violet one here, for the
 * same reason a core subdomain is violet there.
 *
 * **The legend's swatches are written out again** rather than derived from the
 * fills below, because a swatch is a `<span>` and needs `bg-`/`border-` where a
 * node needs `fill-`/`stroke-`. `graph/style.ts` keeps the same pair and
 * documents the trap that forbids assembling them: Tailwind scans the source
 * for whole class names and cannot see one built at runtime, so a swatch class
 * stitched together from a hue would compile, run, and render nothing.
 *
 * The note matters as much as the colour. Colour is never the only signal, so
 * the legend says in words what the fills say in hue — and here it also has to
 * carry the three link marks, which are the part of this notation a reader is
 * most likely to be unsure about.
 */

import type { Member } from './model';

/**
 * A member box's fill and stroke.
 *
 * **The daylight steps are the map's, exactly.** A root is a core subdomain's
 * violet-200 on violet-600, an entity is a supporting subdomain's sky-100 on
 * sky-500, an enumeration is a generic one's slate-100 on slate-400 — the same
 * swatches, not neighbouring ones. They used to sit a step lighter each, which
 * looked deliberate on its own and looked like a mistake the moment somebody
 * put the two editors side by side: same hue, not quite the same colour, for
 * things the palette is claiming are the same kind of claim.
 *
 * A value object keeps white. It is the fourth thing in a palette built for
 * three, and it is the quietest of them — no identity, copied rather than
 * shared — so it takes the one step below the greys rather than borrowing a
 * hue that would say it carries weight.
 */
export function paint(member: Member): string {
	if (member.kind === 'entity' && member.root) {
		return 'fill-violet-200 stroke-violet-600 dark:fill-violet-950 dark:stroke-violet-400';
	}
	if (member.kind === 'entity') {
		return 'fill-sky-100 stroke-sky-500 dark:fill-sky-950 dark:stroke-sky-600';
	}
	if (member.kind === 'enum') {
		return 'fill-slate-100 stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-600';
	}
	return 'fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-600';
}

export interface LegendEntry {
	readonly label: string;
	readonly note: string;
	/** `bg-` and `border-` classes matching the box's `fill` and `stroke`. */
	readonly swatch: string;
}

/**
 * In reading order: the boundary first, then what lives inside it, from the one
 * that carries the most meaning to the one that carries the least.
 */
export const LEGEND: readonly LegendEntry[] = [
	{
		label: 'Aggregate',
		note: 'the consistency boundary — what stays true across a transaction',
		swatch: 'border-dashed bg-violet-50 border-violet-600 dark:bg-violet-950 dark:border-violet-700',
	},
	{
		label: 'Root',
		note: 'the way in — the only member the outside may name',
		swatch: 'bg-violet-200 border-violet-600 dark:bg-violet-950 dark:border-violet-400',
	},
	{
		label: 'Entity',
		note: 'has an identity, and a life inside the boundary',
		swatch: 'bg-sky-100 border-sky-500 dark:bg-sky-950 dark:border-sky-600',
	},
	{
		label: 'Value object',
		note: 'no identity — copied rather than shared',
		swatch: 'bg-white border-slate-400 dark:bg-slate-900 dark:border-slate-600',
	},
	{
		label: 'Enumeration',
		note: 'a closed set of named values',
		swatch: 'bg-slate-100 border-slate-400 dark:bg-slate-900 dark:border-slate-600',
	},
];

/** What the three link marks mean, in the order `route.ts` explains them. */
export const LINK_LEGEND: readonly { label: string; note: string; kind: 'contains' | 'embeds' | 'references' }[] = [
	{ kind: 'contains', label: 'contains', note: 'composition — the part dies with the whole' },
	{ kind: 'embeds', label: 'embeds', note: 'a value object, copied in' },
	{ kind: 'references', label: 'references', note: 'across a boundary, by identity' },
];
