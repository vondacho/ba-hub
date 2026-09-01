/**
 * Smaller, the current size, bigger.
 *
 * doc-es's control, copied exactly — the estate copies rather than imports, and
 * the reason to copy this one to the character is that somebody who has found
 * it in the Event Stormer should not have to learn it again here. Two steppers
 * with the value between them, shaped like the board's zoom because it is the
 * same kind of control, and the value is the reset. The two A's are drawn at
 * the ends of the scale rather than labelled "smaller" and "bigger": the glyph
 * is the demonstration, and the accessible name says the words for anybody who
 * is not looking at it.
 *
 * The ends disable rather than wrap. A stepper that jumps from the largest back
 * to the smallest is one press away from losing the setting somebody needed.
 *
 * ## Why it is in the editor's footer
 *
 * That strip is the source pane's only furniture, and the type size is a
 * property of the pane rather than of the document. It is deliberately not in
 * the toolbar beside the canvas's zoom: those controls are grouped under "how
 * the picture is being looked at", and a second percentage next to the first
 * would be two magnifications with nothing on screen saying which is which.
 * Here it sits on the thing it changes.
 *
 * Both editors render one, and both write the same key — see `loadTextSize`.
 */

import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from '../../lib/storage';

interface Props {
	size: number;
	onSize: (px: number) => void;
}

export default function TextSize({ size, onSize }: Props) {
	const index = TEXT_SIZES.indexOf(size as (typeof TEXT_SIZES)[number]);
	// A size restored from an older scale is still a size: step from where it
	// sits rather than refusing to move until it is reset.
	const smaller = [...TEXT_SIZES].reverse().find((px) => px < size);
	const bigger = TEXT_SIZES.find((px) => px > size);

	const step =
		'rounded-full px-1.5 py-1 leading-none text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:hover:text-ink-muted motion-reduce:transition-none dark:text-slate-400 dark:hover:text-purple-300 dark:disabled:hover:text-slate-400';

	return (
		<div className="flex shrink-0 items-center gap-0.5 pr-2 pl-1">
			<button
				type="button"
				onClick={() => smaller !== undefined && onSize(smaller)}
				disabled={smaller === undefined}
				aria-label="Smaller source text"
				className={`${step} text-[11px] font-semibold`}
			>
				A
			</button>
			<button
				type="button"
				onClick={() => onSize(DEFAULT_TEXT_SIZE)}
				aria-label={`The source is ${size} pixels${
					index === -1 ? '' : `, size ${index + 1} of ${TEXT_SIZES.length}`
				}. Reset to ${DEFAULT_TEXT_SIZE} pixels.`}
				className={`${step} w-10 text-center text-xs font-semibold tabular-nums`}
			>
				{size}px
			</button>
			<button
				type="button"
				onClick={() => bigger !== undefined && onSize(bigger)}
				disabled={bigger === undefined}
				aria-label="Bigger source text"
				className={`${step} text-[17px] font-semibold`}
			>
				A
			</button>
		</div>
	);
}
