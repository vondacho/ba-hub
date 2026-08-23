/**
 * Layout.
 *
 * Two passes, and the split is the design rather than an optimisation.
 *
 * **Pass one places the nodes** with ELK's `layered` algorithm, run over the
 * *containment edges alone*. Containment is a clean three-level DAG — domain,
 * subdomains, contexts — so layering it produces exactly the three tiers a
 * reader needs to tell a problem from a solution at a glance.
 *
 * Feeding the relationship edges into the same pass does not work, and the
 * reason is instructive rather than a tooling limitation. Layering derives rank
 * from *all* edges, so a relationship between two contexts pushes one of them a
 * rank below the other; after eleven of them the graph is an eight-deep cascade
 * with subdomains and contexts interleaved. That is a faithful drawing of the
 * dependency order and a useless drawing of a context map. Pinning the contexts
 * to the last layer instead makes ELK refuse outright — a `LAST`-constrained
 * node may not have outgoing edges — which is the algorithm saying the same
 * thing.
 *
 * **Pass two routes the relationships** as arcs below the context row. Same-row
 * edges cannot be drawn straight without crossing the boxes between them, and
 * an arc diagram is the standard answer. It also happens to enforce the rule
 * the README sets out: the two edge classes must not share a visual language,
 * and a quiet orthogonal line up to a parent looks nothing like a labelled arc
 * swinging below the row.
 *
 * ## Placement and routing are separate
 *
 * `layout()` places nodes. `routeEdges()` draws edges *from whatever positions
 * it is handed*, which is what lets a dragged node take its edges with it —
 * ELK runs once per document, and dragging re-routes at 60fps without going
 * near it.
 *
 * ## Coordinates still never reach the file
 *
 * A node can be moved, and the move is a **view** operation: it lands in
 * `localStorage` next to the theme and the split, and never in the `.ddd`
 * source. doc-es stores `@column` because there a column means a moment in
 * time; on a context map position means nothing, so writing it into the
 * document would add a second source of truth the text cannot review and fill
 * every diff with churn that hides the one line where a pattern changed.
 *
 * Nudging a box for readability and changing what the map says are different
 * acts, and only one of them belongs in a pull request.
 */

import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import type { DddDocument, Node } from '../ddd/model';
import { orderContexts } from './order';
import { spreadContexts } from './spread';

export interface PlacedNode {
	readonly id: string;
	readonly node: Node;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PlacedEdge {
	readonly id: string;
	readonly kind: 'containment' | 'relationship';
	/** SVG path data. Always a curve. */
	readonly path: string;
	readonly label?: { x: number; y: number; text: string };
	/** Where the drag handle sits — the curve's own midpoint. Relationships only. */
	readonly handle?: { x: number; y: number };
	/** False for a mutual relationship, which gets a head at both ends. */
	readonly directed: boolean;
}

/** Where a node sits. Keyed by node id; missing means "wherever ELK put it". */
export type Positions = Readonly<Record<string, { x: number; y: number }>>;

/**
 * How far an edge's midpoint has been dragged from where the default bow puts
 * it. Keyed by edge id; missing means the computed curve.
 *
 * View state, exactly like `Positions` — an edge's shape says nothing the
 * pattern and the direction do not already say, so it has no business in the
 * document. What it is for is legibility: two relationships between the same
 * pair of contexts, or an arc passing behind a box, are fixed by pulling the
 * curve aside, and that fix belongs to whoever is looking rather than to the
 * file.
 */
export type Curves = Readonly<Record<string, { dx: number; dy: number }>>;

export interface Layout {
	readonly nodes: readonly PlacedNode[];
	readonly width: number;
	readonly height: number;
}

const elk = new ELK();

/**
 * Node sizes are fixed per kind rather than measured from the rendered text.
 *
 * Measuring would mean laying out twice — once for the DOM, once to place it —
 * and a graph whose boxes changed size as somebody typed a longer name would
 * reflow entirely on every keystroke. Names are clamped in the SVG instead,
 * which is the trade doc-es makes on its cards and for the same reason.
 */
export const SIZE: Record<Node['kind'], { width: number; height: number }> = {
	domain: { width: 300, height: 76 },
	subdomain: { width: 210, height: 80 },
	context: { width: 200, height: 92 },
};

/** Room below the context row for the relationship arcs to swing through. */
const ARC_GUTTER = 190;

/**
 * Place the nodes.
 *
 * Runs ELK over the **containment edges alone**. Containment is a clean
 * three-level DAG — domain, subdomains, contexts — so layering it produces
 * exactly the three tiers a reader needs to tell a problem from a solution at
 * a glance.
 *
 * Feeding the relationships into the same pass does not work, and the reason is
 * instructive rather than a tooling limitation. Layering derives rank from
 * *all* edges, so a relationship between two contexts pushes one of them a rank
 * below the other; after eleven of them the graph is an eight-deep cascade with
 * subdomains and contexts interleaved. Pinning the contexts to the last layer
 * instead makes ELK refuse outright — a `LAST`-constrained node may not have
 * outgoing edges — which is the algorithm saying the same thing.
 */
export async function layout(document: DddDocument): Promise<Layout> {
	if (document.nodes.length === 0) {
		return { nodes: [], width: 0, height: 0 };
	}

	const containment = document.edges.filter((edge) => edge.kind === 'containment');

	const children: ElkNode[] = document.nodes.map((node) => ({
		id: node.id,
		...SIZE[node.kind],
		...(node.kind === 'domain'
			? { layoutOptions: { 'elk.layered.layering.layerConstraint': 'FIRST' } }
			: {}),
	}));

	const graph: ElkNode = {
		id: 'root',
		layoutOptions: {
			'elk.algorithm': 'layered',
			'elk.direction': 'DOWN',
			'elk.layered.spacing.nodeNodeBetweenLayers': '110',
			'elk.spacing.nodeNode': '44',
			'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
			'elk.edgeRouting': 'POLYLINE',
			'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
			'elk.padding': '[top=40,left=40,bottom=40,right=40]',
		},
		children,
		// Containment points child → parent, which is *up* the layering. Reversed
		// here so the layered algorithm sees a DAG flowing downward and puts the
		// domain on top.
		edges: containment.map<ElkExtendedEdge>((edge) => ({
			id: edge.id,
			sources: [edge.to],
			targets: [edge.from],
		})),
	};

	const result = await elk.layout(graph);

	const placedById = new Map<string, ElkNode>();
	for (const child of result.children ?? []) placedById.set(child.id, child);

	const nodes: PlacedNode[] = document.nodes.flatMap((node) => {
		const placed = placedById.get(node.id);
		if (!placed) return [];
		return [
			{
				id: node.id,
				node,
				x: placed.x ?? 0,
				y: placed.y ?? 0,
				width: placed.width ?? SIZE[node.kind].width,
				height: placed.height ?? SIZE[node.kind].height,
			},
		];
	});

	// ELK ordered the row for tidy containment, which leaves the relationships
	// to fall where they may. This pass permutes the row to untangle them — see
	// order.ts for the trade it makes against containment.
	const ordered = orderContexts(document, nodes);

	// And if the row still cannot be drawn cleanly — a relationship graph that
	// is not outerplanar cannot be, at any ordering — push contexts down until
	// it can. Does nothing when the row is already clean, which on the seed map
	// it is.
	const spread = spreadContexts(document, ordered);

	const floor = spread.reduce((lowest, node) => Math.max(lowest, node.y + node.height), 0);

	return {
		nodes: spread,
		width: (result.width ?? 0) + 40,
		height: floor + ARC_GUTTER,
	};
}

/** Apply the view's position overrides to a placement. */
export function applyPositions(
	nodes: readonly PlacedNode[],
	positions: Positions,
): readonly PlacedNode[] {
	return nodes.map((node) => {
		const override = positions[node.id];
		return override ? { ...node, x: override.x, y: override.y } : node;
	});
}

/**
 * Draw the edges from wherever the nodes currently are.
 *
 * Everything here is a curve, and the two classes curve differently on purpose.
 * The README's rule is that they must not share a visual language: a reader
 * needs to separate *structure* — which context serves which part of the
 * business — from *relationships*, which are the only part anybody argues
 * about. So containment is a gentle vertical S between a child and its parent,
 * and a relationship is a bowed arc between two boxes.
 *
 * Both are computed from box geometry rather than routed, because a routed edge
 * cannot follow a node being dragged at 60fps and a curve can.
 */
export function routeEdges(
	document: DddDocument,
	nodes: readonly PlacedNode[],
	curves: Curves = {},
): readonly PlacedEdge[] {
	const byId = new Map(nodes.map((placed) => [placed.id, placed]));
	const edges: PlacedEdge[] = [];

	for (const edge of document.edges) {
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (!from || !to) continue;

		if (edge.kind === 'containment') {
			edges.push({
				id: edge.id,
				kind: 'containment',
				path: verticalS(from, to),
				directed: true,
			});
			continue;
		}

		const bow = bowedArc(from, to, curves[edge.id]);
		edges.push({
			id: edge.id,
			kind: 'relationship',
			path: bow.path,
			label: { ...bow.mid, text: edge.pattern.map(shortPattern).join(' / ') },
			handle: bow.mid,
			directed: edge.directed,
		});
	}

	return edges;
}

/**
 * Containment: a cubic from the child's top edge to the parent's bottom edge,
 * with the control points pulled vertically so it leaves and arrives square.
 *
 * Falls back to a bowed arc when a drag has put the child *above* its parent —
 * a vertical S between inverted boxes would loop back on itself and read as a
 * mistake rather than as a moved node.
 */
function verticalS(child: PlacedNode, parent: PlacedNode): string {
	const startX = child.x + child.width / 2;
	const startY = child.y;
	const endX = parent.x + parent.width / 2;
	const endY = parent.y + parent.height;

	if (endY > startY - 12) return bowedArc(child, parent).path;

	const pull = Math.max(24, Math.min(80, (startY - endY) * 0.45));
	return `M ${r(startX)} ${r(startY)} C ${r(startX)} ${r(startY - pull)} ${r(endX)} ${r(endY + pull)} ${r(endX)} ${r(endY)}`;
}

/**
 * A relationship: a cubic bowed perpendicular to the line between two boxes,
 * anchored where that line crosses each box's border.
 *
 * The bow is flipped so it is always the downward-ish side. That keeps a row of
 * contexts reading as an arc diagram — the shape the default placement produces
 * — while still drawing something sensible once boxes have been dragged into
 * any arrangement at all.
 *
 * `nudge` moves the curve's midpoint by a vector the visitor dragged. Both
 * control points shift by the same amount, scaled by 4/3: a cubic evaluated at
 * t = 0.5 is `(P0 + 3C1 + 3C2 + P3) / 8`, so shifting both controls by `v`
 * moves the midpoint by `0.75v`. Dividing through means the handle lands exactly
 * under the pointer instead of lagging it by a quarter, and the curve keeps the
 * tangents the default shape had.
 */
function bowedArc(
	from: PlacedNode,
	to: PlacedNode,
	nudge?: { dx: number; dy: number },
): { path: string; mid: { x: number; y: number } } {
	const a = centre(from);
	const b = centre(to);

	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = Math.hypot(dx, dy) || 1;

	// Perpendicular, normalised, flipped to the downward side so horizontal
	// chords bow below the row rather than above it.
	let px = -dy / length;
	let py = dx / length;
	if (py < 0 || (Math.abs(py) < 0.001 && px < 0)) {
		px = -px;
		py = -py;
	}

	/*
	 * The bow fades as the chord stops being horizontal.
	 *
	 * Bowing every arc to the same side is what makes a *row* of contexts read
	 * as an arc diagram, and it is actively wrong once boxes sit at different
	 * heights: every arc ends up in the same band below the row, so moving a box
	 * down separates nothing and the edges to it loop away and back instead of
	 * going where the eye expects.
	 *
	 * Scaling by how horizontal the chord is gets both. Side by side, the full
	 * arc; stacked, nearly a straight line. The floor keeps a little curvature
	 * so two edges between the same pair never lie exactly on top of each other.
	 */
	const horizontality = Math.abs(dx) / length;
	const bow = Math.min(140, 34 + length * 0.16) * Math.max(0.14, horizontality ** 1.6);

	/*
	 * Anchor on the side the arc is about to bow towards, not where the chord
	 * happens to cross the border.
	 *
	 * A chord between two boxes in the same row leaves at mid-height and travels
	 * horizontally before the curve pulls it down — straight through whatever
	 * box sits between them. Four of the seed map's eleven arcs did exactly
	 * that, and an arc that disappears behind a box is worse than one that
	 * crosses another: a crossing is visible, an occlusion just looks like the
	 * line stopped.
	 *
	 * Leaving from the bottom edge instead means the arc is already clear of the
	 * row before it starts travelling sideways. The anchor slides along that
	 * edge towards the target so short hops still leave at a sensible angle.
	 */
	const start = anchor(from, b, px, py);
	const end = anchor(to, a, px, py);

	const shiftX = nudge ? nudge.dx / 0.75 : 0;
	const shiftY = nudge ? nudge.dy / 0.75 : 0;

	const c1 = {
		x: start.x + dx * 0.25 + px * bow + shiftX,
		y: start.y + dy * 0.25 + py * bow + shiftY,
	};
	const c2 = {
		x: end.x - dx * 0.25 + px * bow + shiftX,
		y: end.y - dy * 0.25 + py * bow + shiftY,
	};

	// Cubic at t = 0.5.
	const mid = {
		x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
		y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
	};

	return {
		path: `M ${r(start.x)} ${r(start.y)} C ${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(end.x)} ${r(end.y)}`,
		mid: { x: r(mid.x), y: r(mid.y) },
	};
}

/**
 * A point on the box's border, on the side the bow is heading for, slid towards
 * the other end so a short hop still leaves at a sensible angle.
 *
 * Falls back to the plain chord crossing when the two boxes are not side by
 * side — once a node has been dragged well above or below its partner, the
 * bow's side is no longer the interesting one and the chord is.
 */
function anchor(
	node: PlacedNode,
	towards: { x: number; y: number },
	px: number,
	py: number,
): { x: number; y: number } {
	const middle = centre(node);

	// Mostly-vertical perpendicular means a mostly-horizontal chord: the boxes
	// are side by side and the arc will swing under them.
	if (Math.abs(py) > 0.55) {
		const edgeY = py > 0 ? node.y + node.height : node.y;
		const reach = node.width * 0.32;
		const slide = Math.max(-reach, Math.min(reach, towards.x - middle.x));
		return { x: middle.x + slide, y: edgeY };
	}

	if (Math.abs(px) > 0.55) {
		const edgeX = px > 0 ? node.x + node.width : node.x;
		const reach = node.height * 0.32;
		const slide = Math.max(-reach, Math.min(reach, towards.y - middle.y));
		return { x: edgeX, y: middle.y + slide };
	}

	return borderPoint(node, middle, towards);
}

/** Where the segment from `inside` towards `towards` leaves the node's box. */
function borderPoint(
	node: PlacedNode,
	inside: { x: number; y: number },
	towards: { x: number; y: number },
): { x: number; y: number } {
	const dx = towards.x - inside.x;
	const dy = towards.y - inside.y;
	if (dx === 0 && dy === 0) return inside;

	const halfWidth = node.width / 2;
	const halfHeight = node.height / 2;

	// Scale the direction until it hits whichever side comes first.
	const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
	const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
	const scale = Math.min(scaleX, scaleY);

	return { x: inside.x + dx * scale, y: inside.y + dy * scale };
}

/** The bounding box of a placement, for fitting and for the minimap. */
export function extentOf(nodes: readonly PlacedNode[]): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	if (nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

	const left = Math.min(...nodes.map((node) => node.x));
	const top = Math.min(...nodes.map((node) => node.y));
	const right = Math.max(...nodes.map((node) => node.x + node.width));
	const bottom = Math.max(...nodes.map((node) => node.y + node.height));

	// Padded, because relationship arcs bow outside the boxes they join and a
	// fit that clipped them would cut the labels off.
	const pad = 120;
	return {
		x: left - pad,
		y: top - pad,
		width: right - left + pad * 2,
		height: bottom - top + pad * 2,
	};
}

function centre(node: PlacedNode): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function r(value: number): number {
	return Math.round(value * 10) / 10;
}

/**
 * Edge labels are abbreviated. The full names are long enough that two adjacent
 * arcs would overlap and neither would be readable; the legend and the
 * inspector carry the full name. This is a reminder, not a definition.
 */
const SHORT: Record<string, string> = {
	partnership: 'PS',
	'shared-kernel': 'SK',
	'customer-supplier': 'C/S',
	conformist: 'CF',
	'anticorruption-layer': 'ACL',
	'open-host-service': 'OHS',
	'published-language': 'PL',
	'separate-ways': 'SW',
	'big-ball-of-mud': 'MUD',
};

export function shortPattern(pattern: string): string {
	return SHORT[pattern] ?? pattern;
}
