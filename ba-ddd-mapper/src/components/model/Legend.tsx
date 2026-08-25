/**
 * The notation, shown with the diagram rather than above it.
 *
 * The map's legend exactly — under the title row, inside the editor's own
 * frame, so it travels with the thing it explains into fullscreen and stays out
 * of the page's reading order. It takes the diagram's theme for the same reason
 * too: the panel can be pinned light while the page stays dark, and a legend
 * keeping the page's theme would then describe colours nobody can see.
 *
 * What it adds to the map's is a second row for the **link marks**. On a
 * context map the arrows carry their pattern as a written label, so the line
 * explains itself; here the difference between a filled diamond, an open one
 * and a dashed arrow *is* the meaning — composition, a copied value, an
 * identity held across a boundary — and it is written nowhere on the canvas.
 * A reader who knows UML does not need the row and loses nothing to it; a
 * reader who does not is otherwise stuck.
 */

import { LEGEND, LINK_LEGEND } from '../../lib/ddm/style';
import type { GraphTheme } from '../../lib/storage';

export function Legend({ theme }: { theme: GraphTheme | null }) {
	return (
		<section
			aria-labelledby="model-legend"
			className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
		>
			<h2 id="model-legend" className="sr-only">
				What the shapes and lines mean
			</h2>

			{LEGEND.map((entry) => (
				<span key={entry.label} className="flex items-center gap-1.5">
					<span
						data-theme={theme ?? undefined}
						aria-hidden="true"
						className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${entry.swatch}`}
					/>
					<span className="font-semibold">{entry.label}</span>
					<span className="text-ink-muted dark:text-slate-400">{entry.note}</span>
				</span>
			))}

			{LINK_LEGEND.map((entry) => (
				<span key={entry.kind} className="flex items-center gap-1.5">
					<Mark kind={entry.kind} theme={theme} />
					<span className="font-semibold">{entry.label}</span>
					<span className="text-ink-muted dark:text-slate-400">{entry.note}</span>
				</span>
			))}
		</section>
	);
}

/**
 * A link mark at legend size.
 *
 * Drawn here rather than shared with the canvas: the canvas draws its diamond
 * at a routed point and rotates it, and threading that through a component that
 * wants a 26-pixel horizontal sample would complicate the drawing to simplify
 * the label. What must not drift is the *shape* — a filled diamond, an open
 * one, a dash — and those are three lines of SVG either way.
 */
function Mark({ kind, theme }: { kind: 'contains' | 'embeds' | 'references'; theme: GraphTheme | null }) {
	return (
		<svg
			data-theme={theme ?? undefined}
			width={26}
			height={10}
			viewBox="0 0 26 10"
			aria-hidden="true"
			className="shrink-0"
		>
			<line
				x1={kind === 'references' ? 1 : 14}
				y1={5}
				x2={kind === 'references' ? 21 : 26}
				y2={5}
				strokeWidth={1.4}
				strokeDasharray={kind === 'references' ? '4 3' : undefined}
				className="stroke-slate-500 dark:stroke-slate-400"
			/>
			{kind === 'references' ? (
				<path
					d="M18 2 L24 5 L18 8"
					fill="none"
					strokeWidth={1.4}
					className="stroke-slate-500 dark:stroke-slate-400"
				/>
			) : (
				<polygon
					points="0,5 7,1 14,5 7,9"
					strokeWidth={1.4}
					className={
						kind === 'contains'
							? 'fill-slate-500 stroke-slate-500 dark:fill-slate-400 dark:stroke-slate-400'
							: 'fill-white stroke-slate-500 dark:fill-slate-900 dark:stroke-slate-400'
					}
				/>
			)}
		</svg>
	);
}
