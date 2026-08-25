/**
 * Drawing the three link kinds so they cannot be confused for one another.
 *
 * The map's rule was that its two edge classes share no visual language, and it
 * held because a reader only ever had to tell containment from a relationship.
 * Here there are three, and UML already decided what they look like — a filled
 * diamond for composition, an open one for aggregation, a plain arrow for an
 * association. Following that is worth more than any prettier scheme, because
 * the audience for a class diagram already reads it.
 *
 *   contains    filled diamond at the owner. The part dies with the whole.
 *   embeds      open diamond. No identity, so it is copied rather than owned.
 *   references  plain open arrow, dashed. It crosses a boundary, and what
 *               actually travels is an identity rather than a pointer — the
 *               dash is there to say that the thing at the other end is loaded
 *               separately, which is the entire point of the boundary.
 *
 * Routed as orthogonal polylines rather than the map's bows. A class diagram is
 * read as a structure, and a structure drawn with swooping arcs reads as a
 * network; right angles are what make it look like the thing it is.
 *
 * ## The side is the whole routing decision
 *
 * Everything here follows from *which side of the box a line leaves through*.
 * The exit point is on that side, the first segment runs along that side's
 * outward normal, and the diamond is rotated to the same normal — so it sits
 * flat against the edge with the line running straight out of its tip.
 *
 * Deriving those three from one another is the fix for a bug that read as
 * "the diamonds are slightly rotated". The angle used to be taken from the
 * straight line between the two box centres, while the path drawn was an
 * elbow that left vertically or horizontally. The two agreed only when the
 * boxes happened to be aligned, and everywhere else the marker pointed a few
 * degrees off the line it was supposed to cap.
 */

import type { Link } from './model';
import type { PlacedBox } from './layout';

/** Which side of a box a line leaves or arrives through. */
type Side = 'top' | 'right' | 'bottom' | 'left';

interface Point {
	readonly x: number;
	readonly y: number;
}

interface Exit extends Point {
	readonly side: Side;
}

/** Degrees, clockwise from east — SVG's convention, and `rotate()`'s. */
const NORMAL: Record<Side, number> = { right: 0, bottom: 90, left: 180, top: -90 };

/** Unit outward vectors, the same four facts in the form the router needs. */
const OUTWARD: Record<Side, Point> = {
	right: { x: 1, y: 0 },
	bottom: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	top: { x: 0, y: -1 },
};

/**
 * How far a line runs straight out of a box before it may turn.
 *
 * The diamond's own length, so the line starts at the back of the marker
 * rather than underneath it — and, more importantly, so the first segment is
 * *always* the side's normal. Without it the first segment is only usually the
 * normal, and "usually" is what a rotated diamond looks like: on overlapping
 * boxes the turn can fall behind the exit, and the line then leaves in the
 * opposite direction to the marker capping it.
 */
const STUB = 14;

export interface RoutedLink {
	readonly id: string;
	readonly link: Link;
	readonly path: string;
	/** Where the diamond or arrowhead sits, and which way it points. */
	readonly from: Point;
	readonly to: Point;
	readonly angle: number;
	readonly label?: { x: number; y: number; text: string };
}

export function routeLinks(
	links: readonly Link[],
	boxes: readonly PlacedBox[],
	marks: Record<string, string>,
): readonly RoutedLink[] {
	const byId = new Map(boxes.map((box) => [box.id, box]));

	return links.flatMap((link) => {
		const from = byId.get(link.from);
		const to = byId.get(link.to);
		if (!from || !to) return [];

		const start = border(from, centre(to));
		// Faced at the line's actual origin rather than at the other box's centre.
		// The two agree everywhere the boxes are apart, and where they overlap —
		// a member dragged clear of its aggregate, whose boundary then reflows
		// around a neighbour — only this one still names a side the line can
		// plausibly arrive through.
		const end = border(to, start);
		const path = elbow(start, end);

		const mark = marks[link.multiplicity];
		return [
			{
				id: link.id,
				link,
				path,
				from: start,
				to: end,
				// The side's outward normal, not the direction of the far box. The
				// first segment of the path runs along exactly this, so the diamond
				// caps the line rather than crossing it at an angle.
				angle: NORMAL[start.side],
				...(mark && mark !== '1'
					? {
							// On the target end, where UML puts multiplicity: it says
							// how many of *that* the owner has. Placed off the side the
							// line arrives through, so it never lands on the box.
							label: { ...labelAt(end), text: mark },
						}
					: {}),
			},
		];
	});
}

/**
 * An orthogonal path leaving and arriving perpendicular to the sides it uses.
 *
 * Three shapes, chosen by the two sides rather than by the geometry:
 *
 *   both horizontal   a Z. Out sideways, across at the midpoint, in sideways.
 *   both vertical     the same, turned a quarter.
 *   one of each       an L. One turn, and it arrives square either way.
 *
 * Deciding from the sides rather than from `dx` and `dy` is what keeps the
 * first segment collinear with the marker at its tip — the sides were already
 * chosen to face each other, so the path that follows them is also the short
 * one.
 */
function elbow(start: Exit, end: Exit): string {
	const from = horizontal(start.side);
	const to = horizontal(end.side);

	const turns: Point[] =
		from && to
			? [{ x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }]
			: !from && !to
				? [{ x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }]
				: from
					? [{ x: end.x, y: start.y }]
					: [{ x: start.x, y: end.y }];

	// A turn on top of an end is not a turn: it happens whenever the boxes line
	// up, and drawing it costs a zero-length segment that some renderers cap
	// with a stray marker.
	// The stub comes before any turn, which is what makes the marker's angle a
	// fact about the path rather than a guess about it. Where the turn is ahead
	// of the stub — every ordinary arrangement — the two are collinear and it
	// costs nothing but a vertex.
	const stub: Point = {
		x: start.x + OUTWARD[start.side].x * STUB,
		y: start.y + OUTWARD[start.side].y * STUB,
	};

	const points = [start, stub, ...turns, end].filter(
		(point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1]!.x, point.y - all[index - 1]!.y) > 1,
	);

	return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${r(point.x)} ${r(point.y)}`).join(' ');
}

function horizontal(side: Side): boolean {
	return side === 'left' || side === 'right';
}

/** Just outside the box, on the side the line arrives through. */
function labelAt(end: Exit): Point {
	if (end.side === 'left') return { x: end.x - 14, y: end.y - 7 };
	if (end.side === 'right') return { x: end.x + 14, y: end.y - 7 };
	if (end.side === 'top') return { x: end.x + 14, y: end.y - 7 };
	return { x: end.x + 14, y: end.y + 15 };
}

function centre(box: PlacedBox): Point {
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where the line from the middle of `box` towards `towards` leaves it, and
 * through which side.
 *
 * Radial rather than "the middle of the nearest side", so several links out of
 * one box fan across its edge instead of stacking their diamonds on one point.
 * The side falls out of the same arithmetic: whichever half-extent the ray ran
 * out of first is the side it crossed.
 */
function border(box: PlacedBox, towards: Point): Exit {
	const middle = centre(box);
	const dx = towards.x - middle.x;
	const dy = towards.y - middle.y;
	if (dx === 0 && dy === 0) return { ...middle, side: 'right' };

	const scaleX = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
	const scaleY = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
	const scale = Math.min(scaleX, scaleY);
	const side: Side = scaleX <= scaleY ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';

	return { x: middle.x + dx * scale, y: middle.y + dy * scale, side };
}

function r(value: number): number {
	return Math.round(value * 10) / 10;
}
