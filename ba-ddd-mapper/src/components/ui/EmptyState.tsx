/**
 * What a canvas says when there is nothing on it.
 *
 * Both editors, one component, because both have the same three ways of being
 * empty: nothing open at all, a document that declares nothing, and — on the
 * model page — the stub the map writes when you open a context nobody has
 * modelled yet. All three are a blank canvas, and a blank canvas with no
 * explanation is indistinguishable from a broken one. That was the report this
 * came from.
 *
 * Two ways forward, and the order is deliberate. **Load the example** is first
 * because reading a document that already means something is the fastest way to
 * learn a notation — it is what the sample was for when it opened by itself,
 * except now it arrives because somebody asked for it. **Start a fresh …**
 * gives the smallest thing that is already a map or a model: one box, named
 * badly on purpose, waiting to be renamed.
 *
 * Both open the text and the picture together. Neither half of this tool
 * explains itself alone — the notation is what the text is for and the shape is
 * what the picture is for — and somebody who has just asked for a document to
 * exist is the last person who should have to go and find the other pane.
 */

interface Props {
	/** The heading: what kind of empty this is. */
	heading: string;
	/** One line on what the thing they are about to make is. */
	blurb: string;
	/** The label for the fresh-document button — "Start a fresh map", say. */
	startLabel: string;
	onLoadExample: () => void;
	onStart: () => void;
}

export default function EmptyState({ heading, blurb, startLabel, onLoadExample, onStart }: Props) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
			<div className="pointer-events-auto max-w-md rounded-xl border border-slate-300 bg-white/95 p-5 text-center shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
				<h2 className="text-base font-semibold">{heading}</h2>
				<p className="mt-1.5 text-sm text-ink-muted dark:text-slate-400">{blurb}</p>

				<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onClick={onLoadExample}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
					>
						Load the example
					</button>
					<button
						type="button"
						onClick={onStart}
						className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong"
					>
						{startLabel}
					</button>
				</div>

				<p className="mt-3 text-[11px] text-ink-muted dark:text-slate-500">
					Either replaces what is in the editor. Nothing else in this browser is touched.
				</p>
			</div>
		</div>
	);
}
