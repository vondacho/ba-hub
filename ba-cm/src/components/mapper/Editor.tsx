/**
 * The editor panel.
 *
 * A textarea with a line-number gutter, and deliberately not a code editor.
 * CodeMirror or Monaco would bring syntax highlighting, folding and an
 * autocomplete for nine pattern names — and about 300KB, a second island's
 * worth of complexity, and a text model that is no longer just a string. The
 * string is the point: every graph gesture is a splice into it.
 *
 * The gutter is a second element scrolled in lockstep rather than a
 * `background-image` of repeating lines, because the line height has to survive
 * a browser zoom and a repeating gradient does not.
 *
 * ## Highlighting a range inside a textarea
 *
 * A textarea has no styleable ranges — there is no way to give a slice of its
 * value a background. The way this is done is a *backdrop*: a second element
 * holding the same text, with the same font, padding and wrapping, sat exactly
 * underneath a transparent textarea and scrolled with it. The backdrop's text is
 * invisible and only the highlight's box paints; the characters you see and edit
 * are the textarea's, on top.
 *
 * Two things keep it honest, and both are load-bearing rather than cosmetic:
 * every metric that decides where a glyph lands is declared once and used twice,
 * and the backdrop is scrolled from the textarea's own scroll event. If the two
 * ever disagree the highlight lands on the wrong words, which is worse than no
 * highlight at all.
 */

import { useEffect, useRef } from 'react';
import type { Problem } from '../../lib/ddd/problems';

interface Props {
	value: string;
	onChange: (value: string) => void;
	problems: readonly Problem[];
	/** Set when a problem is clicked, to move the caret there. */
	revealLine: number | null;
	/**
	 * What the textarea is called.
	 *
	 * Both editors use this component, and both write into it from their own
	 * panels — `applyEdit` finds the box by this name so that a gesture lands on
	 * the textarea's undo stack. Two islands answering to "Map source" would be
	 * one of them writing into the other's document if they ever shared a page.
	 */
	label?: string;
	/**
	 * The byte range to emphasise, or null for none.
	 *
	 * Where the selected node is written. It comes straight from the parsed
	 * document's spans, which every declaration has carried since the format
	 * existed — the same spans a gesture splices.
	 */
	highlight?: { readonly start: number; readonly end: number } | null;
}

export default function Editor({
	value,
	onChange,
	problems,
	revealLine,
	label = 'Map source',
	highlight = null,
}: Props) {
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const backdrop = useRef<HTMLDivElement>(null);

	const lines = value.split('\n');
	const flagged = new Map<number, 'error' | 'warning'>();
	for (const problem of problems) {
		// An error on a line outranks a warning on the same one.
		if (problem.severity === 'error' || !flagged.has(problem.line)) {
			flagged.set(problem.line, problem.severity);
		}
	}

	useEffect(() => {
		if (revealLine === null || !area.current) return;
		const offset = lines.slice(0, revealLine - 1).reduce((total, line) => total + line.length + 1, 0);
		area.current.focus();
		area.current.setSelectionRange(offset, offset + (lines[revealLine - 1]?.length ?? 0));
		// Put the line near the top rather than wherever the browser lands it.
		const lineHeight = area.current.scrollHeight / Math.max(1, lines.length);
		area.current.scrollTop = Math.max(0, (revealLine - 3) * lineHeight);
	}, [revealLine]);

	/*
	 * Bring a newly selected node's text into view.
	 *
	 * Scrolled, not focused. Selecting a box on the canvas leaves the pointer and
	 * the keyboard there; stealing focus into the textarea would move the caret
	 * and take the arrow keys with it — and on this canvas the arrow keys nudge
	 * the selected box, which is exactly what somebody who just selected one is
	 * about to do.
	 */
	useEffect(() => {
		if (!highlight || !area.current) return;
		const line = value.slice(0, highlight.start).split('\n').length;
		const height = area.current.scrollHeight / Math.max(1, lines.length);
		const top = (line - 1) * height;
		const view = area.current.clientHeight;
		if (top < area.current.scrollTop || top > area.current.scrollTop + view - height) {
			area.current.scrollTop = Math.max(0, top - view / 3);
			if (backdrop.current) backdrop.current.scrollTop = area.current.scrollTop;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [highlight?.start, highlight?.end]);

	/*
	 * The metrics the backdrop and the textarea must agree on, to the pixel.
	 *
	 * Declared once and used twice: any of these differing puts the highlight on
	 * the wrong words, and the failure is silent.
	 */
	const metrics = 'px-3 py-3 whitespace-pre-wrap break-words';

	return (
		<div className="flex h-full min-h-0 font-mono text-[13px] leading-[1.55]">
			<div
				ref={gutter}
				aria-hidden="true"
				className="w-14 shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 py-3 text-right select-none dark:border-slate-800 dark:bg-slate-900"
			>
				{lines.map((_, index) => {
					const severity = flagged.get(index + 1);
					return (
						<div
							key={index}
							className={
								severity === 'error'
									? 'bg-rose-100 pr-2 font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
									: severity === 'warning'
										? 'bg-amber-100 pr-2 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
										: 'pr-2 text-slate-400 dark:text-slate-600'
							}
						>
							{index + 1}
						</div>
					);
				})}
			</div>

			<div className="relative min-h-0 flex-1 bg-white dark:bg-slate-950">
				{/* Invisible except for the mark: the real text is the textarea's. */}
				<div
					ref={backdrop}
					aria-hidden="true"
					className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${metrics}`}
				>
					{highlight && (
						<>
							{value.slice(0, highlight.start)}
							<mark className="rounded-[2px] bg-brand/25 text-transparent dark:bg-purple-400/30">
								{value.slice(highlight.start, highlight.end)}
							</mark>
							{value.slice(highlight.end)}
						</>
					)}
				</div>

			<textarea
				ref={area}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={(event) => {
					if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
					if (backdrop.current) {
						backdrop.current.scrollTop = event.currentTarget.scrollTop;
						backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
					}
				}}
				onKeyDown={(event) => {
					// Tab indents rather than leaving the panel. The trap is real and
					// the escape is Escape-then-Tab, which is the convention.
					if (event.key !== 'Tab' || event.shiftKey) return;
					event.preventDefault();
					const target = event.currentTarget;
					const { selectionStart, selectionEnd } = target;
					const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
					onChange(next);
					requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
				}}
				spellCheck={false}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				aria-label={label}
				className={`absolute inset-0 h-full w-full resize-none bg-transparent text-ink outline-none dark:text-slate-100 ${metrics}`}
			/>
			</div>
		</div>
	);
}
