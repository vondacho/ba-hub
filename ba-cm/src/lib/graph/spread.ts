/**
 * Pushing contexts down until the relationships stop crossing.
 *
 * This is somebody's hand technique, written down: *move each bounded context
 * down until no edges cross, counting only the edges between bounded contexts.*
 * It is a good technique, and the reason it works is worth stating — a single
 * row can only draw a relationship graph without crossings if that graph is
 * outerplanar. Plenty are not. When the row runs out, the way out is the second
 * dimension, and down is the direction with nothing in it.
 *
 * ## It runs only when it has to
 *
 * `orderContexts` permutes the row first, and on a graph the row can handle
 * that is the whole job: the seed map comes out with no crossings and nothing
 * hidden behind a box, in half the height a spread arrangement needs. A compact
 * map is easier to read than a tall one, so nothing moves vertically until
 * something is actually wrong.
 *
 * ## Only relationships count
 *
 * Containment edges are ignored entirely, and deliberately. They are drawn
 * light and are read once — a reader follows one to learn where a context sits
 * and never looks at it again. Letting them vote here would buy tidy grey lines
 * with tangled purple ones, which is backwards.
 */

import type { DddDocument } from '../ddd/model';
import { routeEdges, type PlacedNode } from './layout';

/** How far down a context may be pushed, as multiples of its own height. */
const MAX_DROP = 7;

/** Step size. Small enough to find a clearance, big enough to finish. */
const STEP = 55;

/** How many of the most-tangled contexts the pair search considers. */
const PAIR_CONTEXTS = 5;

/** Drops tried per context in the pair search. */
const PAIR_STEPS = 10;

/**
 * A hard ceiling on pair evaluations.
 *
 * The pass runs on the layout path, so it has to finish in a time a person will
 * not notice. Better a map with one crossing left than an editor that stalls.
 */
const PAIR_BUDGET = 4_000;

export function spreadContexts(
	document: DddDocument,
	nodes: readonly PlacedNode[],
): readonly PlacedNode[] {
	const relationships = document.edges.filter((edge) => edge.kind === 'relationship');
	if (relationships.length < 2) return nodes;

	let current: readonly PlacedNode[] = [...nodes];
	if (crossings(document, current) === 0) return nodes;

	const contexts = current.filter((node) => node.node.kind === 'context');
	const baseline = new Map(contexts.map((node) => [node.id, node.y]));

	// Pass one: single drops.
	for (let sweep = 0; sweep < 3; sweep += 1) {
		const before = crossings(document, current);
		if (before === 0) break;

		// Most-tangled first. Moving the context involved in the most crossings
		// resolves the most per move and leaves the rest a tidier problem.
		for (const id of byBlame(document, current)) {
			const start = baseline.get(id);
			if (start === undefined) continue;
			current = bestDrop(document, current, id, start);
		}

		if (crossings(document, current) >= before) break;
	}

	/*
	 * Pass two: pairs, when singles have stalled.
	 *
	 * Single drops plateau, and not rarely — on a four-context map where every
	 * pair is related, no single drop removes the one crossing, while dropping
	 * two contexts by different amounts removes it completely. A greedy that
	 * only ever moves one box at a time cannot see that.
	 *
	 * Restricted to the most-blamed handful and given a hard evaluation budget,
	 * because this is quadratic in both contexts and steps and it runs while
	 * somebody is waiting for a graph. It is also the uncommon path: a row that
	 * `orderContexts` could untangle never gets here at all.
	 */
	if (crossings(document, current) > 0) {
		const candidates = byBlame(document, current).slice(0, PAIR_CONTEXTS);
		let budget = PAIR_BUDGET;

		outer: for (const first of candidates) {
			for (const second of candidates) {
				if (first === second) continue;

				const firstStart = baseline.get(first);
				const secondStart = baseline.get(second);
				if (firstStart === undefined || secondStart === undefined) continue;

				let best = current;
				let bestScore = score(document, current);

				for (let a = 1; a <= PAIR_STEPS; a += 1) {
					for (let b = 1; b <= PAIR_STEPS; b += 1) {
						if (budget-- <= 0) break outer;

						const moved = current.map((node) =>
							node.id === first
								? { ...node, y: firstStart + a * STEP }
								: node.id === second
									? { ...node, y: secondStart + b * STEP }
									: node,
						);
						const candidate = score(document, moved);
						if (candidate < bestScore) {
							bestScore = candidate;
							best = moved;
						}
					}
				}

				current = best;
				if (crossings(document, current) === 0) break outer;
			}
		}
	}

	return current;
}

/**
 * Crossings, then occlusion, then height.
 *
 * **Occlusion** is an arc passing behind a box that is not one of its
 * endpoints. It belongs above height because it is arguably worse than a
 * crossing: a crossing is visible and the eye follows through it, whereas an
 * arc that disappears behind a box simply looks like it stopped.
 *
 * **Height** is last and is not decoration. Without it the search happily drops
 * a context the full seven heights to resolve a crossing a single step would
 * have cleared, and the map grows a ravine. A compact map is easier to read
 * than a tall one, so among equally clean arrangements the short one wins.
 */
function score(document: DddDocument, nodes: readonly PlacedNode[]): number {
	const curves = sampleAll(document, nodes);
	const height = Math.max(...nodes.map((node) => node.y + node.height));

	return countCrossings(document, curves) * 100_000 + occlusions(document, nodes, curves) * 1_000 + height;
}

/** Arcs passing behind a box that is not one of their endpoints. */
function occlusions(
	document: DddDocument,
	nodes: readonly PlacedNode[],
	curves: readonly [number, number][][],
): number {
	const relationships = document.edges.filter((edge) => edge.kind === 'relationship');

	let hidden = 0;
	for (let i = 0; i < curves.length; i += 1) {
		const edge = relationships[i]!;
		for (const node of nodes) {
			if (node.id === edge.from || node.id === edge.to) continue;
			const inside = curves[i]!.some(
				([x, y]) =>
					x > node.x && x < node.x + node.width && y > node.y && y < node.y + node.height,
			);
			if (inside) {
				hidden += 1;
				break;
			}
		}
	}
	return hidden;
}

/** Try every drop for one context; keep the best. */
function bestDrop(
	document: DddDocument,
	nodes: readonly PlacedNode[],
	id: string,
	start: number,
): readonly PlacedNode[] {
	let best = nodes;
	let bestScore = score(document, nodes);

	for (let step = 1; step <= MAX_DROP * 2; step += 1) {
		const moved = nodes.map((node) => (node.id === id ? { ...node, y: start + step * STEP } : node));
		const candidate = score(document, moved);
		if (candidate < bestScore) {
			bestScore = candidate;
			best = moved;
		}
	}

	return best;
}

/** Context ids, most crossings-involved first. */
function byBlame(document: DddDocument, nodes: readonly PlacedNode[]): string[] {
	return [...nodes]
		.filter((node) => node.node.kind === 'context')
		.map((node) => ({ id: node.id, blame: blameFor(document, nodes, node.id) }))
		.sort((a, b) => b.blame - a.blame || (a.id < b.id ? -1 : 1))
		.map((entry) => entry.id);
}

function blameFor(document: DddDocument, nodes: readonly PlacedNode[], id: string): number {
	const relationships = document.edges.filter((edge) => edge.kind === 'relationship');
	const curves = sampleAll(document, nodes);

	let blame = 0;
	for (let i = 0; i < curves.length; i += 1) {
		for (let j = i + 1; j < curves.length; j += 1) {
			const a = relationships[i]!;
			const b = relationships[j]!;
			if (!touches(a, id) && !touches(b, id)) continue;
			if (share(a, b)) continue;
			if (intersects(curves[i]!, curves[j]!)) blame += 1;
		}
	}
	return blame;
}

function crossings(document: DddDocument, nodes: readonly PlacedNode[]): number {
	return countCrossings(document, sampleAll(document, nodes));
}

function countCrossings(
	document: DddDocument,
	curves: readonly [number, number][][],
): number {
	const relationships = document.edges.filter((edge) => edge.kind === 'relationship');

	let total = 0;
	for (let i = 0; i < curves.length; i += 1) {
		for (let j = i + 1; j < curves.length; j += 1) {
			if (share(relationships[i]!, relationships[j]!)) continue;
			if (intersects(curves[i]!, curves[j]!)) total += 1;
		}
	}
	return total;
}

/**
 * Twelve points per curve.
 *
 * Enough to catch a crossing on curves this shallow, and cheap enough that a
 * sweep evaluates a few hundred candidate positions without the editor
 * noticing. The rendered path is the same cubic; only the sampling is coarse.
 */
const SAMPLES = 12;

function sampleAll(document: DddDocument, nodes: readonly PlacedNode[]): [number, number][][] {
	return routeEdges(document, nodes)
		.filter((edge) => edge.kind === 'relationship')
		.map((edge) => samplePath(edge.path));
}

function samplePath(path: string): [number, number][] {
	const n = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
	if (n.length < 8) return [];

	const [x0, y0, x1, y1, x2, y2, x3, y3] = n as [
		number, number, number, number, number, number, number, number,
	];
	const points: [number, number][] = [];
	for (let i = 0; i <= SAMPLES; i += 1) {
		const t = i / SAMPLES;
		const u = 1 - t;
		points.push([
			u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
			u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
		]);
	}
	return points;
}

/** Edges sharing an endpoint meet by definition; that is not a crossing. */
function share(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
	return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
}

function touches(edge: { from: string; to: string }, id: string): boolean {
	return edge.from === id || edge.to === id;
}

function intersects(a: [number, number][], b: [number, number][]): boolean {
	for (let i = 0; i + 1 < a.length; i += 1) {
		for (let j = 0; j + 1 < b.length; j += 1) {
			if (properCross(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
		}
	}
	return false;
}

function properCross(
	p: [number, number],
	q: [number, number],
	r: [number, number],
	s: [number, number],
): boolean {
	const side = (a: [number, number], b: [number, number], c: [number, number]) =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

	const d1 = side(p, q, r);
	const d2 = side(p, q, s);
	const d3 = side(r, s, p);
	const d4 = side(r, s, q);

	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
