/**
 * Ordering the context row.
 *
 * ELK places the contexts to make the *containment* edges tidy, because
 * containment is the only edge class it is given. That is the right input — see
 * layout.ts on why feeding it the relationships produces an eight-deep cascade
 * — and it leaves one thing undone: the order within the bottom row is
 * arbitrary as far as the relationships are concerned.
 *
 * On the seed map that costs nine arc crossings, and a zero-crossing ordering
 * exists. Nine crossings on eleven arcs is the difference between a map you can
 * read and one you trace with a finger.
 *
 * So this pass permutes the row. It moves nothing else: the domain and the
 * subdomains stay exactly where ELK put them, which is also what a person
 * rearranging one of these by hand does.
 *
 * ## The trade it makes
 *
 * A relationship-optimal order splits a subdomain's contexts apart — on the
 * seed map the best ordering scatters "Pricing and rating" and leaves a good
 * number of containment edges crossing.
 *
 * That is deliberate, and the weighting in `cost` says so out loud. Containment
 * is structure, drawn light, and read once. Relationships are the part anybody
 * argues about and are read over and over. When the two compete, the
 * relationships win — and they win on arc *length* too, not only on crossings.
 */

import type { DddDocument } from '../ddd/model';
import type { PlacedNode } from './layout';

/*
 * Three terms, strictly ranked.
 *
 *   1. Arc crossings — the whole point of the pass.
 *   2. Total arc span — shorter relationship arcs read better.
 *   3. Containment crossings — a last tie-break, and nothing more.
 *
 * The order of the last two was wrong at first and the correction came from
 * watching somebody arrange one of these by hand: **containment edges are drawn
 * light and are not read.** A reader follows one once to learn where a context
 * sits and never looks at it again. Ranking them above span meant buying tidier
 * grey lines with longer purple ones, which is backwards — it took the seed
 * map's arcs from a total span of 18 to 28 to remove containment crossings
 * nobody was going to notice.
 *
 * They stay in the function at weight 1, because among orderings that are
 * genuinely equal on both real metrics there is no reason to prefer the tangled
 * one.
 *
 * The weights just have to separate the terms. Span tops out around n²/2, so a
 * decade of headroom each is plenty.
 */
const ARC_CROSSING = 1_000_000;
const SPAN = 1_000;

/**
 * Reorder each row of contexts to minimise relationship arc crossings.
 *
 * Contexts are grouped into rows by their y, and each row is permuted
 * independently. Normally there is one row; a context that serves a domain
 * directly rather than a subdomain sits higher, and reordering it against a row
 * it is not in would be meaningless.
 *
 * Only the x coordinates are touched, and only by dealing the existing slots
 * out in a new order — every context box is the same width, so the slots are
 * interchangeable and the row keeps exactly the spacing ELK chose.
 */
export function orderContexts(
	document: DddDocument,
	nodes: readonly PlacedNode[],
): readonly PlacedNode[] {
	const relationships = document.edges
		.filter((edge) => edge.kind === 'relationship')
		.map((edge) => [edge.from, edge.to] as const);

	if (relationships.length < 2) return nodes;

	const contexts = nodes.filter((node) => node.node.kind === 'context');
	if (contexts.length < 3) return nodes;

	const rows = new Map<number, PlacedNode[]>();
	for (const context of contexts) {
		const key = Math.round(context.y / 20);
		rows.set(key, [...(rows.get(key) ?? []), context]);
	}

	const moved = new Map<string, number>();

	for (const row of rows.values()) {
		if (row.length < 3) continue;

		const slots = row.map((node) => node.x).sort((a, b) => a - b);
		const current = [...row].sort((a, b) => a.x - b.x).map((node) => node.id);

		// Only the arcs with both ends in this row can be untangled by permuting
		// it. An arc leaving the row has a fixed endpoint and contributes a
		// constant, so including it would only add noise to the search.
		const inRow = new Set(current);
		const arcs = relationships.filter(([a, b]) => inRow.has(a) && inRow.has(b));
		if (arcs.length < 2) continue;

		// Each context's parent, as a rank among the subdomains left-to-right.
		// The subdomains do not move, so this is fixed for the whole search and
		// is what lets containment tangling be scored at all.
		const subdomains = nodes
			.filter((node) => node.node.kind === 'subdomain')
			.sort((a, b) => a.x - b.x);
		const rankOf = new Map(subdomains.map((node, index) => [node.id, index]));

		const parent = new Map<string, number>();
		for (const id of current) {
			const edge = document.edges.find(
				(candidate) => candidate.kind === 'containment' && candidate.from === id,
			);
			const rank = edge ? rankOf.get(edge.to) : undefined;
			if (rank !== undefined) parent.set(id, rank);
		}

		const best = search(current, arcs, parent);
		best.forEach((id, index) => moved.set(id, slots[index]!));
	}

	if (moved.size === 0) return nodes;
	return nodes.map((node) => {
		const x = moved.get(node.id);
		return x === undefined ? node : { ...node, x };
	});
}

/**
 * Exhaustive below nine contexts, local search above it.
 *
 * 8! is 40,320 orderings and finishes in single-digit milliseconds; 9! is nine
 * times that and 12! is half a billion. The cliff is steep enough that the
 * cutoff may as well be conservative — a heuristic that lands on the optimum
 * nearly always is worth more than an exact answer that stalls the editor on a
 * map somebody grew.
 */
function search(
	order: readonly string[],
	arcs: readonly (readonly [string, string])[],
	parent: ReadonlyMap<string, number>,
): string[] {
	return order.length <= 8 ? exhaustive(order, arcs, parent) : localSearch(order, arcs, parent);
}

function exhaustive(
	order: readonly string[],
	arcs: readonly (readonly [string, string])[],
	parent: ReadonlyMap<string, number>,
): string[] {
	let best = [...order];
	let bestCost = cost(best, arcs, parent);

	const permute = (rest: string[], acc: string[]) => {
		if (rest.length === 0) {
			const candidate = cost(acc, arcs, parent);
			if (candidate < bestCost) {
				best = [...acc];
				bestCost = candidate;
			}
			return;
		}
		for (let index = 0; index < rest.length; index += 1) {
			permute([...rest.slice(0, index), ...rest.slice(index + 1)], [...acc, rest[index]!]);
		}
	};

	permute([...order], []);
	return best;
}

/**
 * Steepest-descent over pairwise swaps, restarted from shuffles.
 *
 * Deterministic: the shuffle runs off a fixed-seed generator, because a layout
 * that came out differently on each render would move under the reader for no
 * reason they could see.
 */
function localSearch(
	order: readonly string[],
	arcs: readonly (readonly [string, string])[],
	parent: ReadonlyMap<string, number>,
): string[] {
	const random = seeded(order.length * 7919 + arcs.length);

	let best = descend([...order], arcs, parent);
	let bestCost = cost(best, arcs, parent);

	for (let restart = 0; restart < 80; restart += 1) {
		const shuffled = [...order];
		for (let i = shuffled.length - 1; i > 0; i -= 1) {
			const j = Math.floor(random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
		}
		const candidate = descend(shuffled, arcs, parent);
		const candidateCost = cost(candidate, arcs, parent);
		if (candidateCost < bestCost) {
			best = candidate;
			bestCost = candidateCost;
		}
	}

	return best;
}

function descend(
	start: string[],
	arcs: readonly (readonly [string, string])[],
	parent: ReadonlyMap<string, number>,
): string[] {
	const order = [...start];
	let current = cost(order, arcs, parent);

	let improved = true;
	while (improved) {
		improved = false;
		for (let i = 0; i < order.length - 1; i += 1) {
			for (let j = i + 1; j < order.length; j += 1) {
				[order[i], order[j]] = [order[j]!, order[i]!];
				const candidate = cost(order, arcs, parent);
				if (candidate < current) {
					current = candidate;
					improved = true;
				} else {
					[order[i], order[j]] = [order[j]!, order[i]!];
				}
			}
		}
	}

	return order;
}

/**
 * Arc crossings, then total span, then containment crossings.
 *
 * Two arcs drawn on the same side of a line cross exactly when their endpoint
 * intervals interleave — one endpoint of the second strictly inside the first
 * and the other strictly outside.
 *
 * Two containment edges cross when the order of their contexts and the order of
 * their subdomains disagree; since the subdomains do not move, that reduces to
 * counting inversions between the row order and the parents' ranks.
 */
function cost(
	order: readonly string[],
	arcs: readonly (readonly [string, string])[],
	parent: ReadonlyMap<string, number>,
): number {
	const at = new Map(order.map((id, index) => [id, index]));

	const spans: [number, number][] = [];
	let span = 0;
	for (const [from, to] of arcs) {
		const a = at.get(from)!;
		const b = at.get(to)!;
		spans.push(a < b ? [a, b] : [b, a]);
		span += Math.abs(a - b);
	}

	let arcCrossings = 0;
	for (let i = 0; i < spans.length; i += 1) {
		for (let j = i + 1; j < spans.length; j += 1) {
			const [a, b] = spans[i]!;
			const [c, d] = spans[j]!;
			if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) arcCrossings += 1;
		}
	}

	let tangles = 0;
	for (let i = 0; i < order.length - 1; i += 1) {
		const left = parent.get(order[i]!);
		if (left === undefined) continue;
		for (let j = i + 1; j < order.length; j += 1) {
			const right = parent.get(order[j]!);
			if (right !== undefined && left > right) tangles += 1;
		}
	}

	return arcCrossings * ARC_CROSSING + span * SPAN + tangles;
}

/** A small deterministic generator — mulberry32. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
