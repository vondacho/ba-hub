/**
 * Moving the selection with the arrow keys.
 *
 * Shared by both canvases, for `IconButton`'s reason: a gesture that means the
 * same thing in two places should be the same code in two places, or it stops
 * meaning the same thing on the first change to either.
 *
 * It is not only a convenience. A drag needs a pointer, a steady hand and a
 * surface, and "nudge this box four pixels left so the label stops overlapping
 * the arrow" is exactly the edit a drag is worst at. It is also the only way to
 * move anything at all without a mouse.
 *
 * **The override is written against the layout's own coordinates**, never
 * against the box on screen. The model's `applyPositions` adds a member's shift
 * to its aggregate's, so a member inside a boundary that has been moved is
 * drawn somewhere its override never said — and nudging from *there* would fold
 * the parent's shift into the child on every keystroke, walking it out of the
 * boundary. Starting from the override that already exists, or from the raw
 * layout when there is none, is the only reading that composes.
 */

import { useEffect, useRef } from 'react';

interface Point {
	readonly x: number;
	readonly y: number;
}

type Positions = Readonly<Record<string, Point>>;

/**
 * How far one press moves something.
 *
 * Small enough to be a nudge — the gesture is "not quite there" rather than
 * "somewhere else entirely", which is what dragging is for — and multiplied by
 * shift for the times it is both.
 */
const STEP = 8;
const COARSE = 40;

const DELTAS: Readonly<Record<string, Point>> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

export function useNudge({
	selected,
	positions,
	onPositions,
	/** Where an override for `id` starts from: its place in the raw layout. */
	originOf,
}: {
	selected: string | null;
	positions: Positions;
	onPositions: (next: Positions) => void;
	originOf: (id: string) => Point | null;
}): void {
	/*
	 * The handler reads through a ref so the listener is bound once per
	 * selection rather than once per render. Without it every keystroke — which
	 * changes `positions`, which is a new object — would tear the listener down
	 * and build it again, and a caller passing an inline `originOf` would do the
	 * same on every unrelated render.
	 */
	const latest = useRef({ positions, onPositions, originOf });
	latest.current = { positions, onPositions, originOf };

	useEffect(() => {
		if (selected === null) return;

		const onKey = (event: KeyboardEvent) => {
			const delta = DELTAS[event.key];
			if (!delta) return;
			// Shift is the bigger step and is ours. The rest belong to the browser
			// and to the operating system, and taking ⌥← from somebody mid-word is
			// how a canvas earns a reputation.
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTyping(event.target)) return;

			const { positions: current, onPositions: write, originOf: origin } = latest.current;
			// An id that is not a box — a relationship, a link — has no position to
			// write and is left to whatever else wants the key.
			const from = current[selected] ?? origin(selected);
			if (!from) return;

			event.preventDefault();
			const step = event.shiftKey ? COARSE : STEP;
			write({
				...current,
				[selected]: { x: from.x + delta.x * step, y: from.y + delta.y * step },
			});
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [selected]);
}

/**
 * Whether the key belongs to something being typed into.
 *
 * The source pane is a textarea on the same page, and an arrow key there is a
 * caret move. Stealing it would make the editor unusable — which is the whole
 * left-hand half of the tool — so the guard is not a nicety.
 */
function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
