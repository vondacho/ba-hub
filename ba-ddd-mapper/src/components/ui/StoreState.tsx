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
 * **It removes one document at a time, and nothing else.** There is no rename,
 * no edit, and emphatically no "clear all": a store that can be emptied from a
 * toolbar is a store that will be emptied from a toolbar, and the only copy of
 * a map somebody has not exported yet lives here. Removal exists for the case
 * that has no other cure — an entry that will not parse, a sidecar whose
 * document is gone, whatever a half-finished write left behind — so it asks
 * first, names both files it is about to take, and says that Export is the copy
 * that survives.
 *
 * The document open in this editor cannot be removed from it. Deleting it would
 * be theatre: the page still holds the text and would write it back inside a
 * second. Both editors list *all* documents, so the way to remove one is from
 * the other page — which is also the way to reach a document too broken to
 * open.
 *
 * **Every row is a way in.** A list of documents you cannot open is a list you
 * read once and never again; this is the only place either editor offers a
 * document it does not already have open, which makes it the tool's way of
 * moving between documents. The rows are real links — the address carries the
 * document's stem, which both pages accept — so the browser's own gestures for
 * "in a new tab" work without this panel implementing any of them.
 *
 * The current document is marked rather than filtered, because "is what I am
 * looking at the thing that is saved?" is the first question this panel is
 * opened to answer.
 */

import { useEffect, useState } from 'react';
import { inventory, removeDocument, type Inventory, type StoredDocument } from '../../lib/storage';
import { mapHref, modelHref } from '../../lib/links';

interface Props {
	/** The open document's own key, marked in the list. */
	current: string;
	/**
	 * Write the open document out. Called before leaving for another one.
	 *
	 * The list is a way to switch documents, and switching means this editor is
	 * about to stop existing — with up to a second of typing still sitting in a
	 * debounce. Each page knows how to write itself out; this only knows when.
	 */
	onLeaving: () => void;
	onClose: () => void;
}

export default function StoreState({ current, onLeaving, onClose }: Props) {
	// Read on open rather than held in state above: the other tab may have
	// written since, and a stale list is worse than no list.
	const [state, setState] = useState<Inventory | null>(null);
	useEffect(() => setState(inventory()), []);

	/** The row whose Remove has been clicked once. At most one at a time. */
	const [arming, setArming] = useState<string | null>(null);

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

	function remove(entry: StoredDocument): void {
		removeDocument(entry);
		setArming(null);
		// Re-read rather than splice the row out of the list: if the delete did
		// not take — a store that throws is the whole reason every call here is
		// wrapped — the row is still there, which is the truth.
		setState(inventory());
	}

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
					<Group
						title="Maps"
						extension=".ddd"
						documents={maps}
						current={current}
						onLeaving={onLeaving}
						arming={arming}
						onArm={setArming}
						onRemove={remove}
						empty="No map stored yet."
					/>
					<Group
						title="Domain models"
						extension=".ddm"
						documents={models}
						current={current}
						onLeaving={onLeaving}
						arming={arming}
						onArm={setArming}
						onRemove={remove}
						empty="No model stored yet."
					/>

					<p className="mt-5 text-[11px] text-ink-muted dark:text-slate-500">
						Nothing here is a backup. A browser clears its storage without asking; Export
						writes the document and its sidecar to disk, which is the copy that survives.
						The document open here can only be removed from the other editor — this page
						would write it back within a second.
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
	onLeaving,
	arming,
	onArm,
	onRemove,
	empty,
}: {
	title: string;
	extension: string;
	documents: readonly StoredDocument[];
	current: string;
	onLeaving: () => void;
	arming: string | null;
	onArm: (id: string | null) => void;
	onRemove: (entry: StoredDocument) => void;
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
						const id = `${document.kind}:${document.stem}`;
						const open = document.doc?.key === current;
						if (arming === id) {
							return (
								<Confirm
									key={id}
									document={document}
									extension={extension}
									onCancel={() => onArm(null)}
									onRemove={() => onRemove(document)}
								/>
							);
						}
						// A sidecar with no document has nothing to open: the arrangement
						// is all that is left, and a page loading it would show a blank
						// editor at a name it cannot account for.
						const target = document.doc
							? document.kind === 'map'
								? mapHref(document.stem)
								: modelHref(document.stem)
							: null;

						return (
							<Row
								key={id}
								href={open ? null : target}
								onLeaving={onLeaving}
								open={open}
								onArm={open ? null : () => onArm(id)}
							>
								{/*
								 * Both files, each on its own line and each named in full.
								 *
								 * The sidecar used to be a suffix on the document's line —
								 * "+ .dddview · 240 B" — which was compact and wrong: the
								 * pair is two entries in the store, either can be missing
								 * without the other, and the whole reason to open this panel
								 * is to see what is actually there. A file you cannot read
								 * the name of is a file you cannot ask about.
								 */}
								<span className="flex flex-wrap items-baseline gap-x-2">
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
									{open && (
										<span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
											open here
										</span>
									)}
								</span>

								<span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 pl-3 text-xs text-ink-muted dark:text-slate-400">
									<code>
										{document.stem}
										{extension}view
									</code>
									{document.view ? (
										kb(document.view.bytes)
									) : (
										/* Every document written since the sidecar stopped being
										   dropped when empty has one. A line without one is a
										   document last saved by an older build — or a save loop
										   that is not running. */
										<span className="text-amber-700 dark:text-amber-400">not stored</span>
									)}
								</span>
							</Row>
						);
					})}
				</ul>
			)}
		</section>
	);
}

/**
 * One document, as a row.
 *
 * A link when there is somewhere to go, a plain list item otherwise — rather
 * than a link that is disabled, which looks like something that ought to work.
 * The row that is already open is the second case: the way to look at it is to
 * close this panel.
 */
function Row({
	href,
	open,
	onLeaving,
	onArm,
	children,
}: {
	href: string | null;
	open: boolean;
	onLeaving: () => void;
	/** Null for the row open here, which cannot be removed from this page. */
	onArm: (() => void) | null;
	children: React.ReactNode;
}) {
	const shell = `block rounded-md px-2 py-1 ${open ? 'bg-violet-50 dark:bg-violet-950' : ''}`;

	return (
		<li className="group/row flex items-baseline gap-1">
			{href ? (
				<a
					href={href}
					onClick={onLeaving}
					className={`${shell} min-w-0 flex-1 hover:bg-slate-100 dark:hover:bg-slate-800`}
				>
					{children}
				</a>
			) : (
				<span className={`${shell} min-w-0 flex-1`}>{children}</span>
			)}
			{onArm && (
				/*
				 * Quiet until the row is under the pointer, and always reachable by
				 * keyboard. A delete control at full contrast on every row invites
				 * the accident it takes two clicks to prevent.
				 */
				<button
					type="button"
					onClick={onArm}
					className="shrink-0 rounded px-1.5 py-0.5 text-xs text-ink-muted opacity-0 group-hover/row:opacity-100 hover:bg-rose-50 hover:text-rose-700 focus:opacity-100 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-300"
				>
					Remove
				</button>
			)}
		</li>
	);
}

/**
 * The armed row: what is about to go, in full, before it goes.
 *
 * Both filenames named rather than "this document", because the sidecar is the
 * half people forget they have — and because after this there is no undo. The
 * store is not a filesystem: nothing goes to a trash.
 */
function Confirm({
	document,
	extension,
	onCancel,
	onRemove,
}: {
	document: StoredDocument;
	extension: string;
	onCancel: () => void;
	onRemove: () => void;
}) {
	const files = [
		document.doc ? `${document.stem}${extension}` : null,
		document.view ? `${document.stem}${extension}view` : null,
	].filter((name): name is string => name !== null);

	return (
		<li className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 dark:border-rose-800 dark:bg-rose-950">
			<p className="text-xs">
				Remove <strong>{files.join(' and ')}</strong> from this browser? There is no undo, and
				no copy anywhere else unless you have exported it.
			</p>
			<div className="mt-1.5 flex gap-2">
				<button
					type="button"
					onClick={onRemove}
					className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
				>
					Remove
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
			</div>
		</li>
	);
}

function kb(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} kB`;
}
