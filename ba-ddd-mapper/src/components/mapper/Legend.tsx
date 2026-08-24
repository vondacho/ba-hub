/**
 * The notation, shown with the map rather than above it.
 *
 * It sits under the title row, inside the mapper's own frame, so it travels
 * with the thing it explains — into fullscreen, and out of the page's reading
 * order where a block of reference text would push the first control down.
 * doc-sm's src/components/board/Legend.tsx puts its legend under the toolbar
 * for the same reason and this follows it, so the two read alike.
 *
 * Static, unlike doc-es's: a context map has one frame and three budgets and
 * always will.
 *
 * The one thing this does that doc-sm's does not is take the graph's theme.
 * The graph panel can be pinned light while the page stays dark — a map on a
 * projector in a lit room — and a legend that kept the page's theme would then
 * describe colours nobody can see. Each swatch carries `data-theme` rather
 * than the list, because global.css's rule is that a themed root must state
 * its own foreground and background: a swatch states both and has no text to
 * inherit anything, while the row around it stays with the header it belongs
 * to.
 */

import { LEGEND } from '../../lib/graph/style';
import type { GraphTheme } from '../../lib/storage';

export function Legend({ theme }: { theme: GraphTheme | null }) {
	return (
		<section
			aria-labelledby="legend"
			className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
		>
			<h2 id="legend" className="sr-only">
				What the colours mean
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
		</section>
	);
}
