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
 */

import { useEffect, useRef } from 'react';
import type { Problem } from '../../lib/ddd/problems';

interface Props {
	value: string;
	onChange: (value: string) => void;
	problems: readonly Problem[];
	/** Set when a problem is clicked, to move the caret there. */
	revealLine: number | null;
}

export default function Editor({ value, onChange, problems, revealLine }: Props) {
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);

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

			<textarea
				ref={area}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={(event) => {
					if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
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
				aria-label="Map source"
				className="min-h-0 flex-1 resize-none bg-white px-3 py-3 text-ink outline-none dark:bg-slate-950 dark:text-slate-100"
			/>
		</div>
	);
}
