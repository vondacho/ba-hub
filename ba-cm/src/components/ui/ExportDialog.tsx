/**
 * Where this document goes — one panel, several destinations, one press.
 *
 * ## One panel, two catalogues
 *
 * The map page and the model page ask the same question about two different
 * documents, so the rows are a prop. What a `.ddd` can become and what a `.ddm`
 * can become are two lists — `mapper/export.ts` and `model/export.ts` — and
 * this draws whichever it is handed; `destinations.ts` holds the vocabulary
 * they share. The alternative was a second dialog, which would have been the
 * same panel with different strings until the day one of them grew a feature.
 *
 * ## Why the destinations moved behind one control
 *
 * They were in two places and neither said what it was. The archive lived on
 * the document toolbar and the picture lived on the canvas's own bar, which is
 * a true fact about where the *code* is — the picture is a copy of the live
 * tree rather than a second renderer — and a confusing one for anybody looking
 * for a file. Somebody who wanted both pressed two buttons in two rows and had
 * to know which row.
 *
 * A row in a list can carry a sentence saying what a file is for. A 28px square
 * on a canvas bar cannot, and "SVG" is not the question anybody has: the
 * question is "which of these do I put in the pull request".
 *
 * ## Checkboxes, and one Export
 *
 * Rather than a row per file that downloads on click. The wants genuinely
 * combine: the archive is the copy that survives a cleared browser, the picture
 * goes in the deck, the outline goes in the pull request where the `because`
 * lines can actually be read. Ticking three boxes and pressing once is one
 * decision; clicking three rows in a panel that stays open is three, and it
 * leaves you to work out whether it is finished.
 *
 * The ticks survive closing the panel, because this component stays mounted
 * while the mapper does — the same person exports the same set of things every
 * time, and rebuilding the selection on every export is the kind of small tax
 * that makes a feature go unused.
 *
 * ## Rows that cannot run say why
 *
 * With the panes set to source only there is no canvas to copy, so both picture
 * rows go quiet with the reason on them rather than disappearing. A control
 * that vanishes when a pane is closed is a control somebody concludes was never
 * there; one that says "the map pane is not showing" points at the fix.
 *
 * `unavailable` is keyed by destination rather than being a prop named after
 * the canvas, so the next destination that can be temporarily impossible adds a
 * line at the call site instead of a branch in here. `caveats` is its milder
 * sibling: the row runs, but it will not carry everything.
 *
 * ## The shell is StoreState's
 *
 * A positioned overlay inside the mapper rather than a native `<dialog>`,
 * because that is what the other panel in this component is and two modals that
 * sit differently read as two tools.
 */

import { useEffect, useState } from 'react';
import Icon from '../mapper/Icon';
import type { Destination, Section } from '../../lib/destinations';

interface Props<Id extends string> {
	/** What is being exported, for the panel's accessible name: "map", "model". */
	subject: string;
	/** The rows, in the order they are offered. */
	destinations: readonly Destination<Id>[];
	/**
	 * The headings, and the sentence under each.
	 *
	 * A destination whose group is not named here is not drawn at all, which
	 * makes the sections the running order rather than a decoration on one.
	 */
	sections: readonly Section[];
	/** Ticked when nothing else has been said. */
	initial: readonly Id[];
	/** A warning to print under one row: the file will be written, and will lack something. */
	caveats?: Partial<Record<Id, string>>;
	/** Destinations that cannot run right now, with the reason. The row goes quiet. */
	unavailable?: Partial<Record<Id, string>>;
	/** Runs the selection. Resolves when every file has been handed over. */
	onExport: (picks: readonly Id[]) => Promise<void>;
	onClose: () => void;
}

export default function ExportDialog<Id extends string>({
	subject,
	destinations,
	sections,
	initial,
	caveats = {},
	unavailable = {},
	onExport,
	onClose,
}: Props<Id>) {
	const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set(initial));
	const [running, setRunning] = useState(false);
	const [failed, setFailed] = useState<string | null>(null);

	// Escape closes it, as it would a native dialog. The shell is a positioned
	// div — see the note at the top — so the one thing the native element would
	// have given for nothing has to be asked for.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const toggle = (id: Id) =>
		setPicked((was) => {
			const next = new Set(was);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	/*
	 * A ticked row that has since become unavailable is not chosen.
	 *
	 * The selection survives the panel closing — that is deliberate — so a
	 * picture ticked while the canvas was showing is still ticked after somebody
	 * switches to the source pane. Filtering here rather than clearing the tick
	 * means the choice comes back when the canvas does, which is what the person
	 * meant.
	 */
	const chosen = destinations.filter(
		(entry) => picked.has(entry.id) && unavailable[entry.id] === undefined,
	);

	/*
	 * Files, not ticked rows.
	 *
	 * One row is two files — a document and the sidecar beside it — so
	 * counting rows would under-report, and it would put the line
	 * about the browser asking before it saves several under a selection that
	 * triggers exactly that prompt.
	 */
	const files = chosen.reduce((total, entry) => total + entry.writes, 0);

	const run = async () => {
		setRunning(true);
		setFailed(null);
		try {
			await onExport(chosen.map((entry) => entry.id));
			onClose();
		} catch (error) {
			// Named, and left on screen. An export that quietly produced nothing
			// is the failure this panel most has to avoid: the visitor believes
			// the work is on disk, and it is not.
			setFailed(error instanceof Error ? error.message : 'The export did not finish.');
			setRunning(false);
		}
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Export this ${subject}`}
			className="absolute inset-0 z-30 flex items-start justify-center bg-slate-900/30 p-6 backdrop-blur-[1px]"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
				<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
					<div>
						<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
							export
						</p>
						<h2 className="text-base font-semibold">What should leave this tab?</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="shrink-0 rounded p-1 text-ink-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
					>
						✕
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
					{sections.map(({ group, title, blurb }) => (
						<section key={group} className="mb-1 last:mb-0">
							<h3 className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
								{title}
							</h3>
							{blurb !== null && (
								<p className="px-3 pb-2 text-sm text-ink-muted dark:text-slate-400">{blurb}</p>
							)}
							<ul className="flex flex-col gap-1">
								{destinations.filter((entry) => entry.group === group).map((entry) => {
									const blocked = unavailable[entry.id];
									return (
										<li key={entry.id}>
											{/* The whole row is the control. A checkbox with a
											    three-word label beside a sentence that is not part
											    of it is a target the size of a fingernail, and the
											    sentence is the half somebody is reading when they
											    decide to tick it. */}
											<label
												className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
													blocked !== undefined
														? 'cursor-not-allowed border-transparent opacity-60'
														: picked.has(entry.id)
															? 'cursor-pointer border-brand/40 bg-brand/5'
															: 'cursor-pointer border-transparent hover:border-slate-200 dark:hover:border-slate-700'
												}`}
											>
												<input
													type="checkbox"
													checked={picked.has(entry.id) && blocked === undefined}
													// Frozen while the run is in flight. The selection
													// is read once, at the press; a tick changed after
													// that would put the list on screen out of step
													// with the files arriving in the downloads folder.
													disabled={running || blocked !== undefined}
													onChange={() => toggle(entry.id)}
													className="mt-1 h-4 w-4 shrink-0 accent-brand"
												/>
												<Icon
													name={entry.icon}
													className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted dark:text-slate-400"
												/>
												<span className="min-w-0 flex-1">
													<span className="flex flex-wrap items-baseline gap-x-2">
														<span className="font-semibold">{entry.label}</span>
														<code className="font-mono text-xs text-ink-muted dark:text-slate-400">
															{entry.extension}
														</code>
													</span>
													<span className="mt-0.5 block text-sm text-ink-muted dark:text-slate-400">
														{entry.what}
													</span>
													{/* The reason it cannot run outranks the warning
													    about what it would lose: one is about now, the
													    other about a file that is not going to exist. */}
													{blocked !== undefined ? (
														<span className="mt-1 block text-sm font-semibold text-ink-muted dark:text-slate-400">
															{blocked}
														</span>
													) : (
														caveats[entry.id] !== undefined && (
															<span className="mt-1 block text-sm font-semibold text-warning">
																{caveats[entry.id]}
															</span>
														)
													)}
												</span>
											</label>
										</li>
									);
								})}
							</ul>
						</section>
					))}

					{failed !== null && (
						<p
							role="alert"
							className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-critical dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
						>
							{failed}
						</p>
					)}
				</div>

				<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
					<p className="text-xs text-ink-muted dark:text-slate-400" aria-live="polite">
						{/* The permission prompt is only mentioned when it can actually
						    appear. A warning about saving "several" files above a
						    selection of one teaches people to stop reading this line. */}
						{files === 0
							? 'Nothing selected.'
							: `${files} ${files === 1 ? 'file' : 'files'}.${
									files > 1 ? ' Your browser may ask once before saving several.' : ''
								}`}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => void run()}
							disabled={chosen.length === 0 || running}
							className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
						>
							{running ? 'Exporting…' : 'Export'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
