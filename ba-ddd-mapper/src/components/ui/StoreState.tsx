/**
 * What this browser is holding, in one panel.
 *
 * Autosave is silent by design — it has to be, or it would interrupt every four
 * hundred milliseconds — and the price of that silence is a visitor who cannot
 * say what is in their own browser. Everything the tool keeps is a document
 * with a filename, so the answer is a list of filenames: `.ddd` beside its
 * `.dddview`, `.ddm` beside its `.ddmview`, the map's documents above the
 * model's.
 *
 * Documents and nothing else. The theme, the split and the two pointers are in
 * the store too and are not what anybody opens this to see; listing them would
 * make the panel a dump of the store rather than an account of the work in it.
 *
 * **It reads and does not write.** No renaming, no deleting, no "clear all". A
 * store that can be emptied from a toolbar is a store that will be emptied from
 * a toolbar, and the only copy of a map somebody has not exported yet lives
 * here. The panel's job is to say what exists so the visitor can decide what to
 * export — Export writes the pair to disk, and that is the intended way out.
 *
 * The current document is marked rather than filtered, because "is what I am
 * looking at the thing that is saved?" is the first question this panel is
 * opened to answer.
 */

import { useEffect, useState } from 'react';
import { inventory, type Inventory, type StoredDocument } from '../../lib/storage';

interface Props {
	/** The open document's own key, marked in the list. */
	current: string;
	onClose: () => void;
}

export default function StoreState({ current, onClose }: Props) {
	// Read on open rather than held in state above: the other tab may have
	// written since, and a stale list is worse than no list.
	const [state, setState] = useState<Inventory | null>(null);
	useEffect(() => setState(inventory()), []);

	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', escape);
		return () => window.removeEventListener('keydown', escape);
	}, [onClose]);

	if (!state) return null;

	const maps = state.documents.filter((document) => document.kind === 'map');
	const models = state.documents.filter((document) => document.kind === 'model');

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="What this browser is holding"
			className="absolute inset-0 z-30 flex items-start justify-center bg-slate-900/30 p-6 backdrop-blur-[1px]"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
				<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
					<div>
						<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
							this browser
						</p>
						<h2 className="text-base font-semibold">
							{state.documents.length} {state.documents.length === 1 ? 'document' : 'documents'} ·{' '}
							{kb(state.bytes)}
						</h2>
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

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
					<Group title="Maps" extension=".ddd" documents={maps} current={current} empty="No map stored yet." />
					<Group
						title="Domain models"
						extension=".ddm"
						documents={models}
						current={current}
						empty="No model stored yet."
					/>

					<p className="mt-5 text-[11px] text-ink-muted dark:text-slate-500">
						Nothing here is a backup. A browser clears its storage without asking; Export
						writes the document and its sidecar to disk, which is the copy that survives.
					</p>
				</div>
			</div>
		</div>
	);
}

function Group({
	title,
	extension,
	documents,
	current,
	empty,
}: {
	title: string;
	extension: string;
	documents: readonly StoredDocument[];
	current: string;
	empty: string;
}) {
	return (
		<section className="mb-4">
			<h3 className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
				{title}
			</h3>
			{documents.length === 0 ? (
				<p className="mt-1 text-xs text-ink-muted dark:text-slate-400">{empty}</p>
			) : (
				<ul className="mt-1 space-y-1">
					{documents.map((document) => {
						const open = document.doc?.key === current;
						return (
							<li
								key={`${document.kind}:${document.stem}`}
								className={`flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 ${
									open ? 'bg-violet-50 dark:bg-violet-950' : ''
								}`}
							>
								<code className="font-semibold">
									{document.stem}
									{extension}
								</code>
								{document.doc ? (
									<span className="text-xs text-ink-muted dark:text-slate-400">
										{kb(document.doc.bytes)}
									</span>
								) : (
									/* A sidecar whose document has gone. Worth naming rather
									   than hiding: it is the one shape a half-finished rename
									   leaves behind. */
									<span className="text-xs text-amber-700 dark:text-amber-400">
										missing — only its layout is stored
									</span>
								)}
								<span className="text-xs text-ink-muted dark:text-slate-400">
									{document.view ? (
										`+ ${extension}view · ${kb(document.view.bytes)}`
									) : (
										/* Every document written since the sidecar stopped being
										   dropped when empty has one. A row without one is a
										   document last saved by an older build. */
										<span className="text-amber-700 dark:text-amber-400">
											no {extension}view
										</span>
									)}
								</span>
								{open && (
									<span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
										open here
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function kb(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} kB`;
}
