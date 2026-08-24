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
 */

import type { Link } from './model';
import type { PlacedBox } from './layout';

export interface RoutedLink {
	readonly id: string;
	readonly link: Link;
	readonly path: string;
	/** Where the diamond or arrowhead sits, and which way it points. */
	readonly from: { x: number; y: number };
	readonly to: { x: number; y: number };
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
		const end = border(to, centre(from));
		const path = elbow(start, end);

		const mark = marks[link.multiplicity];
		return [
			{
				id: link.id,
				link,
				path,
				from: start,
				to: end,
				angle: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
				...(mark && mark !== '1'
					? {
							label: {
								// On the target end, where UML puts multiplicity: it
								// says how many of *that* the owner has.
								x: end.x + (end.x > start.x ? -14 : 14),
								y: end.y + (end.y > start.y ? -8 : 14),
								text: mark,
							},
						}
					: {}),
			},
		];
	});
}

/**
 * An orthogonal path with one turn, biased to leave the way the boxes lie.
 *
 * One turn rather than a routed channel: with the boxes laid out in layers the
 * simple elbow lands cleanly almost always, and a real orthogonal router is a
 * lot of code to remove the "almost".
 */
function elbow(start: { x: number; y: number }, end: { x: number; y: number }): string {
	const dx = Math.abs(end.x - start.x);
	const dy = Math.abs(end.y - start.y);

	if (dx < 2 || dy < 2) return `M ${r(start.x)} ${r(start.y)} L ${r(end.x)} ${r(end.y)}`;

	// Turn on the long axis, so the line leaves its box perpendicular to the
	// side it left — which is what makes a diamond sit flat against the edge.
	const mid = dy >= dx ? { x: start.x, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: start.y };
	const second = dy >= dx ? { x: end.x, y: mid.y } : { x: mid.x, y: end.y };

	return `M ${r(start.x)} ${r(start.y)} L ${r(mid.x)} ${r(mid.y)} L ${r(second.x)} ${r(second.y)} L ${r(end.x)} ${r(end.y)}`;
}

function centre(box: PlacedBox): { x: number; y: number } {
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the line from the middle of `box` towards `towards` leaves it. */
function border(box: PlacedBox, towards: { x: number; y: number }): { x: number; y: number } {
	const middle = centre(box);
	const dx = towards.x - middle.x;
	const dy = towards.y - middle.y;
	if (dx === 0 && dy === 0) return middle;

	const scaleX = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
	const scaleY = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
	const scale = Math.min(scaleX, scaleY);

	return { x: middle.x + dx * scale, y: middle.y + dy * scale };
}

function r(value: number): number {
	return Math.round(value * 10) / 10;
}
