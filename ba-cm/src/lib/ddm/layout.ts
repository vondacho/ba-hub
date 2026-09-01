/**
 * Placing a domain model.
 *
 * The map is three flat tiers with containment drawn as edges, and that was the
 * right call there: a context can straddle two subdomains, and a tree cannot
 * draw a straddle. **Here the opposite is true.** A member belongs to exactly
 * one aggregate — the parser refuses anything else, because that is what a
 * consistency boundary means — so the boundary can be drawn as a box with its
 * members inside it, which is both the UML convention and the honest picture.
 *
 * So this runs ELK *hierarchically*: aggregates are parent nodes, their members
 * are children, and `INCLUDE_CHILDREN` lets a `references` edge run from an
 * entity inside one box to another box entirely.
 *
 * Two consequences worth knowing before reading the code.
 *
 * **Boxes are measured, not fixed.** The map fixes its node sizes per kind and
 * clamps the names, because measuring would mean laying out twice and a graph
 * that reflowed on every keystroke is unusable. A class box cannot do that: it
 * is a title over a list of attributes, and hiding half of them would remove
 * the reason to draw it. So the size is *estimated* from the text rather than
 * measured in the DOM — the map's per-character trick, but at one rate per font
 * size — which keeps the arithmetic pure, synchronous and testable.
 *
 * **ELK gives children coordinates relative to their parent**, and everything
 * downstream — dragging, routing, the minimap, the exporter — works in one flat
 * space. They are absolutised on the way out, once, here.
 *
 * **It lays out rightwards.** The map runs downwards and comes out wide anyway,
 * because its shape is broad rather than deep: one domain over a handful of
 * subdomains over their contexts, three tiers and done. A model's shape is the
 * other way round — an aggregate over its members, referencing an aggregate
 * over its members — so laying it downwards spends the height on a chain and
 * leaves the board's width empty. Turning the layering on its side spends the
 * width on the chain instead, which is the dimension a screen has to spare.
 */

import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { AggregateNode, DomainModel, Member, ModelNode } from './model';

export interface PlacedBox {
	readonly id: string;
	readonly node: ModelNode;
	/** Absolute, whatever ELK said. */
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** The aggregate this sits inside, for dragging a box with its parent. */
	readonly parent: string | null;
}

export interface Placement {
	readonly boxes: readonly PlacedBox[];
	readonly width: number;
	readonly height: number;
}

/** Where a box has been dragged to. View state, exactly as on the map. */
export type Positions = Readonly<Record<string, { x: number; y: number }>>;

const elk = new ELK();

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/**
 * How wide a character is, per thing that gets drawn.
 *
 * The map estimates every label at one rate because every label is the same
 * size. A class box has three sizes in it — a small stereotype, a bold name and
 * a list of attributes — and measuring all of them at the name's rate makes the
 * box too wide for its attributes, while measuring at the attributes' rate cuts
 * the name off. Which is what a single rate did: a long class name ran past its
 * own border.
 *
 * The numbers are the usual ~0.58em average for this stack, taken per size:
 * 13.5px semibold, 10px, 12px.
 */
const NAME_PER_CHARACTER = 7.9;
const STEREOTYPE_PER_CHARACTER = 5.7;
const ROW_PER_CHARACTER = 6.7;

/**
 * The box's own geometry, exported because the renderer draws to it.
 *
 * It used to be two sets of numbers — these, and the ones written into the SVG
 * by hand — which is a bug waiting for the day one set changes. The header is
 * the height of the stereotype and the name together, with room under the
 * name's baseline for its descenders: at 30 the rule sat 4px under it and cut
 * through every `g` and `p` in the model.
 */
export const BOX = {
	/** Stereotype and name, down to the rule. */
	title: 44,
	stereotypeBaseline: 16,
	nameBaseline: 33,
	/** From the rule to the first attribute's baseline. */
	firstRow: 15,
	row: 19,
	padX: 16,
	padBottom: 12,
} as const;

const MIN_WIDTH = 150;

/** The rows a member shows under its title. */
export function rowsOf(member: Member): readonly string[] {
	if (member.kind === 'enum') return member.literals;
	const rows = member.attributes.map((attribute) => `${attribute.name}: ${attribute.type}`);
	return member.kind === 'entity' && member.identity !== undefined
		? [`id: ${member.identity}`, ...rows]
		: rows;
}

/**
 * How big a member's box has to be.
 *
 * The stereotype line counts towards the width even though it is smaller than
 * the name, because `<<aggregate root>>` is longer than most class names and a
 * box sized without it would have its own label hanging over the edge.
 */
export function sizeOf(member: Member): { width: number; height: number } {
	const rows = rowsOf(member);
	const widest = Math.max(
		member.name.length * NAME_PER_CHARACTER,
		stereotypeOf(member).length * STEREOTYPE_PER_CHARACTER,
		...rows.map((row) => row.length * ROW_PER_CHARACTER),
	);

	return {
		width: Math.max(MIN_WIDTH, Math.ceil(widest) + BOX.padX * 2),
		height:
			BOX.title + (rows.length === 0 ? 0 : (rows.length - 1) * BOX.row + BOX.firstRow + BOX.padBottom),
	};
}

export function stereotypeOf(member: Member): string {
	if (member.kind === 'value') return '«value object»';
	if (member.kind === 'enum') return '«enumeration»';
	return member.root ? '«aggregate root»' : '«entity»';
}

// ---------------------------------------------------------------------------
// Placing
// ---------------------------------------------------------------------------

/**
 * Room at the top of an aggregate box for its own name and invariant count.
 *
 * Grown with the class boxes: an aggregate whose title is smaller than the
 * titles of the classes inside it reads as one of them.
 *
 * The arithmetic, top to bottom, and `Diagram.tsx` draws to these numbers:
 *
 *   20  above the name, so the title is not sitting on the border
 *   15  the name itself, baseline at 35
 *    6  gap
 *   11  the subtitle, baseline at 52
 *   13  gap, then the rule at 65
 *   15  below the rule, before the first member
 *
 * The last two are the point of the height. A header that clears the text and
 * nothing more makes the first class look like the aggregate's own first
 * attribute, which is precisely the reading the box exists to prevent: the
 * boundary is a container, and a container has to look like one.
 */
export const AGGREGATE_HEADER = 80;

/** Where the rule under an aggregate's name sits, measured from its top. */
export const AGGREGATE_RULE = AGGREGATE_HEADER - 15;

/** The gap between a member and its aggregate's border, on the other three sides. */
export const AGGREGATE_PAD = 18;

/** The line under an aggregate's name. Shared so the box can be sized for it. */
export function subtitleOf(aggregate: AggregateNode): string {
	if (aggregate.invariants.length === 0) return 'aggregate · no invariant';
	const count = aggregate.invariants.length;
	return `aggregate · ${count} invariant${count === 1 ? '' : 's'}`;
}

/** How wide an aggregate must be for its own header, whatever it contains. */
function titleWidth(aggregate: AggregateNode): number {
	return (
		Math.ceil(Math.max(aggregate.name.length * 8.4, subtitleOf(aggregate).length * 6.2)) +
		AGGREGATE_PAD * 2
	);
}

export async function layout(document: DomainModel): Promise<Placement> {
	if (document.aggregates.length === 0 && document.members.length === 0) {
		return { boxes: [], width: 0, height: 0 };
	}

	const inside = new Map<string, Member[]>();
	const shared: Member[] = [];
	for (const member of document.members) {
		if (member.aggregate === null) shared.push(member);
		else {
			const kept = inside.get(member.aggregate) ?? [];
			kept.push(member);
			inside.set(member.aggregate, kept);
		}
	}

	const children: ElkNode[] = [
		...document.aggregates.map<ElkNode>((aggregate) => ({
			id: aggregate.id,
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': 'RIGHT',
				'elk.padding': `[top=${AGGREGATE_HEADER},left=${AGGREGATE_PAD},bottom=${AGGREGATE_PAD},right=${AGGREGATE_PAD}]`,
				// Room for what runs between them. A diamond is 14 long before the
				// line even starts, and the multiplicity sits beside the far end, so
				// a gap sized to keep boxes apart leaves the notation stacked on top
				// of the boxes it describes. This is sized for the notation.
				'elk.spacing.nodeNode': '32',
				'elk.layered.spacing.nodeNodeBetweenLayers': '68',
			},
			children: (inside.get(aggregate.id) ?? []).map<ElkNode>((member) => ({
				id: member.id,
				...sizeOf(member),
				// The root leads its own aggregate, always. It is the way in, and a
				// box you enter through drawn after the things it owns reads as one
				// of them. Laying out rightwards, leading means leftmost — the same
				// constraint, read in the direction the eye is already going.
				...(member.kind === 'entity' && member.root
					? { layoutOptions: { 'elk.layered.layering.layerConstraint': 'FIRST' } }
					: {}),
			})),
		})),
		...shared.map<ElkNode>((member) => ({ id: member.id, ...sizeOf(member) })),
	];

	const graph: ElkNode = {
		id: 'root',
		layoutOptions: {
			'elk.algorithm': 'layered',
			// Rightwards: see the note at the top of this file. The chain is the
			// long dimension of a model, and width is what a board has spare.
			'elk.direction': 'RIGHT',
			// Without this a `references` from an entity to another aggregate is
			// an edge between two different levels of the tree, which the layered
			// algorithm will not route — the boxes end up placed as though the
			// relationship were not there.
			'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
			'elk.spacing.nodeNode': '70',
			'elk.layered.spacing.nodeNodeBetweenLayers': '96',
			'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
			'elk.edgeRouting': 'POLYLINE',
			'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
			'elk.padding': '[top=40,left=40,bottom=40,right=40]',
		},
		children,
		edges: document.links.map<ElkExtendedEdge>((link) => ({
			id: link.id,
			sources: [link.from],
			targets: [link.to],
		})),
	};

	const result = await elk.layout(graph);

	const boxes: PlacedBox[] = [];
	const byId = new Map<string, ModelNode>();
	for (const aggregate of document.aggregates) byId.set(aggregate.id, aggregate);
	for (const member of document.members) byId.set(member.id, member);

	const walk = (elkNode: ElkNode, offsetX: number, offsetY: number, parent: string | null) => {
		for (const child of elkNode.children ?? []) {
			const node = byId.get(child.id);
			if (!node) continue;

			const x = offsetX + (child.x ?? 0);
			const y = offsetY + (child.y ?? 0);
			boxes.push({
				id: child.id,
				node,
				x,
				y,
				width: child.width ?? MIN_WIDTH,
				height: child.height ?? BOX.title,
				parent,
			});
			walk(child, x, y, child.id);
		}
	};
	walk(result, 0, 0, null);

	return {
		boxes,
		width: result.width ?? 0,
		height: result.height ?? 0,
	};
}

// ---------------------------------------------------------------------------
// After the fact
// ---------------------------------------------------------------------------

/**
 * Apply the view's position overrides.
 *
 * Dragging an aggregate takes its members with it. Dragging a member moves the
 * member and then the boundary is redrawn around it — see `reflow` below, which
 * is what keeps the two from ever coming apart.
 */
export function applyPositions(
	boxes: readonly PlacedBox[],
	positions: Positions,
): readonly PlacedBox[] {
	const shifts = new Map<string, { dx: number; dy: number }>();
	for (const box of boxes) {
		const override = positions[box.id];
		if (override) shifts.set(box.id, { dx: override.x - box.x, dy: override.y - box.y });
	}

	const moved = boxes.map((box) => {
		const own = shifts.get(box.id);
		const fromParent = box.parent ? shifts.get(box.parent) : undefined;
		// A member that has been nudged still travels with its aggregate: the two
		// shifts add rather than one replacing the other. Otherwise moving a
		// boundary would leave behind exactly the members somebody had bothered
		// to arrange by hand.
		const dx = (own?.dx ?? 0) + (fromParent?.dx ?? 0);
		const dy = (own?.dy ?? 0) + (fromParent?.dy ?? 0);
		return dx === 0 && dy === 0 ? box : { ...box, x: box.x + dx, y: box.y + dy };
	});

	return reflow(moved);
}

/**
 * Resize every aggregate to the members it holds.
 *
 * The boundary is not a box that happens to have things in it — it *is* the
 * claim that these are loaded, saved and kept consistent together. A member
 * dragged outside its own boundary is not a picture of anything, so the
 * boundary follows: it grows to keep a nudged entity inside, and closes back up
 * when the entity comes home.
 *
 * Derived rather than dragged, which is why an aggregate's stored position is
 * still only a delta applied to its members. On an untouched placement this
 * reproduces the box ELK computed, because ELK sized the parent to its children
 * plus exactly this padding — so nothing jumps the first time anything moves.
 *
 * The one thing not derived from the members is the *minimum* width, which
 * comes from the header: ELK was never told how wide the aggregate's own name
 * is, so an aggregate called something long around two small entities was
 * already drawing its title past its own border.
 */
function reflow(boxes: readonly PlacedBox[]): readonly PlacedBox[] {
	const held = new Map<string, PlacedBox[]>();
	for (const box of boxes) {
		if (box.parent === null) continue;
		held.set(box.parent, [...(held.get(box.parent) ?? []), box]);
	}

	return boxes.map((box) => {
		const members = held.get(box.id);
		if (!members || members.length === 0) return box;

		const left = Math.min(...members.map((member) => member.x)) - AGGREGATE_PAD;
		const top = Math.min(...members.map((member) => member.y)) - AGGREGATE_HEADER;
		const right = Math.max(...members.map((member) => member.x + member.width)) + AGGREGATE_PAD;
		const bottom = Math.max(...members.map((member) => member.y + member.height)) + AGGREGATE_PAD;

		const width = Math.max(right - left, titleWidth(box.node as AggregateNode));
		return { ...box, x: left, y: top, width, height: bottom - top };
	});
}

export interface Extent {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function extentOf(boxes: readonly PlacedBox[]): Extent {
	if (boxes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.width));
	const bottom = Math.max(...boxes.map((box) => box.y + box.height));

	const pad = 60;
	return {
		x: left - pad,
		y: top - pad,
		width: right - left + pad * 2,
		height: bottom - top + pad * 2,
	};
}
