/**
 * Lining boxes up, and spacing them out.
 *
 * **View** operations, exactly like a drag: they write `positions`, which lives
 * in `localStorage` beside the theme and the split, and never touch the `.ddd`
 * source. See `layout.ts` for why no coordinate reaches the file. Reset on the
 * canvas bar puts it all back, which is what makes pressing these safe.
 *
 * ## Why buttons rather than gestures
 *
 * Everything else the canvas does to positions, it does by hand: drag, nudge.
 * These two are the arrangements the hand is bad at. Three contexts that are
 * *nearly* on a line read as a mistake rather than as a group, and getting them
 * onto one by eye means the same four-pixel correction three times over —
 * repeated at every zoom, because at 60% the error is invisible and at 140% it
 * is all you can see. Even spacing is worse: it is arithmetic over every box in
 * the row at once, and moving one of them by hand invalidates the answer.
 *
 * ## One instruction each
 *
 * Aligning moves boxes onto one line. Spreading evens out what is between them.
 * They are separate functions and separate buttons because they are separate
 * decisions — a single "tidy this up" that did both would leave nobody able to
 * ask for one without the other, and the row of contexts that wants even gaps
 * usually does not want its `y` touched at all.
 *
 * Both leave the other axis exactly as it was, for the same reason.
 */

import type { PlacedNode, Positions } from './layout';

/**
 * Which line the boxes go onto, named for the part of the box that lands on it.
 *
 * Three that make a column — one vertical line, boxes stacked down it — and
 * three that make a row. `centre` is horizontal centring and `middle` vertical,
 * which is the pairing CSS already uses (`text-align: center`,
 * `vertical-align: middle`) and therefore the one people have already learnt.
 */
export type AlignTo = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** Which way the even spacing runs. */
export type SpreadAxis = 'across' | 'down';

/**
 * Put every named box on one line, and leave everything else alone.
 *
 * **Where the line goes** depends on which kind of align it is, and the two
 * rules are different on purpose.
 *
 * An *edge* align uses an edge that already exists — the leftmost left edge,
 * the lowest bottom — so at least one box does not move and the visitor can see
 * which line the rest came to. That is the whole reason edge aligns are worth
 * having next to the centring ones: `left` is a promise about a line you can
 * already point at, and a room full of people can agree it was kept.
 *
 * A *centre* align has no such edge to borrow, so the line goes halfway between
 * the two outermost centres: the group stays where it already is and the two
 * boxes that define the spread travel the same distance. Aligning to a box
 * somebody chose would be the other rule, and it needs the visitor to be able
 * to *see* which box that is — on this canvas every picked box wears the same
 * ring, and a rule that depends on a distinction the picture does not draw is a
 * rule people learn by being surprised. The mean of all the centres is the same
 * thing for two boxes and worse for six: a cluster of five drags the line
 * towards itself, so the outlier — the box most likely being looked at — moves
 * furthest.
 *
 * Centres rather than corners for the centring pair, because boxes on this
 * canvas come in three sizes: an ellipse for a context, wider rectangles above
 * it. Lining up the tops of those would leave a row that still looks crooked.
 *
 * Returns `positions` itself when there is nothing to do — fewer than two boxes
 * named, or all of them already on the line. That identity is load bearing: the
 * caller hands the result straight to `setPositions`, React declines to
 * re-render on the same value, and a press that changes nothing does not stamp
 * a "moved here in your browser" dot on six boxes.
 */
export function alignBoxes(
	placed: readonly PlacedNode[],
	ids: ReadonlySet<string>,
	to: AlignTo,
	positions: Positions,
): Positions {
	const boxes = placed.filter((box) => ids.has(box.id));
	if (boxes.length < 2) return positions;

	const down = to === 'top' || to === 'middle' || to === 'bottom';
	const spans = boxes.map((box) => spanOf(box, down));

	const line =
		to === 'left' || to === 'top'
			? Math.min(...spans.map((span) => span.start))
			: to === 'right' || to === 'bottom'
				? Math.max(...spans.map((span) => span.start + span.size))
				: middleOf(spans);

	return write(
		boxes,
		down,
		spans.map((span) =>
			to === 'left' || to === 'top'
				? line
				: to === 'right' || to === 'bottom'
					? line - span.size
					: line - span.size / 2,
		),
		positions,
	);
}

/**
 * Even out the gaps between the named boxes, along one axis.
 *
 * **The gaps are equal, not the centres.** For boxes of one size those are the
 * same arrangement; here they are not, and equal centre spacing between a wide
 * domain and a narrow context leaves gaps of visibly different sizes — which is
 * the thing the eye actually reads. Design tools offer both and this one offers
 * the one that looks right.
 *
 * **The two outermost boxes do not move.** They define the span, so the gesture
 * is "tidy up what is between these", which is a thing somebody can ask for
 * without first working out where the group as a whole will end up. It also
 * means the arithmetic never has to be exact about them: they are copied
 * through untouched rather than recomputed onto the same spot, so no box
 * acquires a moved-here dot for a rounding error.
 *
 * Order is taken from where the boxes are now, not from the document: the
 * gesture tidies the arrangement in front of the visitor rather than imposing
 * one from the text. Fewer than three boxes and there is nothing between
 * anything, so `positions` comes back untouched.
 *
 * A group packed tighter than its own span gives a negative gap and the boxes
 * overlap evenly, which is the honest answer: the request was even spacing, and
 * refusing it because the result is ugly would leave the visitor guessing which
 * rule they broke.
 */
export function spreadBoxes(
	placed: readonly PlacedNode[],
	ids: ReadonlySet<string>,
	axis: SpreadAxis,
	positions: Positions,
): Positions {
	const down = axis === 'down';
	const boxes = placed
		.filter((box) => ids.has(box.id))
		.map((box) => ({ box, span: spanOf(box, down) }))
		.sort((a, b) => a.span.start + a.span.size / 2 - (b.span.start + b.span.size / 2));
	if (boxes.length < 3) return positions;

	const first = boxes[0]!.span;
	const last = boxes[boxes.length - 1]!.span;
	const filled = boxes.reduce((total, { span }) => total + span.size, 0);
	const gap = (last.start + last.size - first.start - filled) / (boxes.length - 1);

	let cursor = first.start;
	const starts = boxes.map(({ span }, index) => {
		const start = index === 0 ? first.start : index === boxes.length - 1 ? last.start : cursor;
		cursor = start + span.size + gap;
		return start;
	});

	return write(
		boxes.map(({ box }) => box),
		down,
		starts,
		positions,
	);
}

/** One box's extent along the axis being worked on. */
function spanOf(box: PlacedNode, down: boolean): { readonly start: number; readonly size: number } {
	return down ? { start: box.y, size: box.height } : { start: box.x, size: box.width };
}

/** Halfway between the outermost centres. */
function middleOf(spans: readonly { start: number; size: number }[]): number {
	const centres = spans.map((span) => span.start + span.size / 2);
	return (Math.min(...centres) + Math.max(...centres)) / 2;
}

/**
 * Move each box to its new start along one axis, and hand back the same
 * `positions` if none of them actually moved — see `alignBoxes` for why that
 * identity matters.
 */
function write(
	boxes: readonly PlacedNode[],
	down: boolean,
	starts: readonly number[],
	positions: Positions,
): Positions {
	const next: Record<string, { x: number; y: number }> = { ...positions };
	let moved = false;
	boxes.forEach((box, index) => {
		const start = starts[index]!;
		if (start === (down ? box.y : box.x)) return;
		next[box.id] = down ? { x: box.x, y: start } : { x: start, y: box.y };
		moved = true;
	});
	return moved ? next : positions;
}
