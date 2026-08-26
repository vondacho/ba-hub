/**
 * What an archive is about to write, said before it writes any of it.
 *
 * `StoreState`'s manners, and its reason: the destructive gesture names what it
 * is about to take *first*. An import replaces documents whose only copy may be
 * in this browser, and a list somebody can read beats a confirmation dialog
 * they will learn to dismiss without reading.
 *
 * Replacements are marked rather than filtered, and counted in the button, so
 * "this will overwrite the map I have open" is answerable before pressing it
 * and not after.
 */

import type { Incoming, IncomingFile } from '../../lib/bundle';

export default function ImportBundle({
	name,
	incoming,
	onImport,
	onClose,
}: {
	/** The archive's filename, so the panel says which one this is. */
	name: string;
	incoming: Incoming;
	onImport: () => void;
	onClose: () => void;
}) {
	const replacing = incoming.files.filter((file) => file.replaces).length;
	const maps = incoming.files.filter((file) => file.kind === 'map');
	const models = incoming.files.filter((file) => file.kind === 'model');

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-slate-900/40 p-6">
			<div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
				<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
					<div className="min-w-0">
						<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
							import
						</p>
						<h2 className="truncate text-base font-semibold">{name}</h2>
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
					{incoming.files.length === 0 ? (
						<p className="text-ink-muted dark:text-slate-400">
							Nothing in this archive is a <code>.ddd</code>, <code>.dddview</code>,{' '}
							<code>.ddm</code> or <code>.ddmview</code>.
						</p>
					) : (
						<>
							<Group title="Map" files={maps} />
							<Group title="Models" files={models} />

							{replacing > 0 && (
								<p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
									{replacing === 1 ? 'One document' : `${replacing} documents`} already in this
									browser will be replaced. Export is the copy that survives — there is no undo
									for this one.
								</p>
							)}

							{incoming.ignored.length > 0 && (
								<p className="mt-3 text-xs text-ink-muted dark:text-slate-500">
									{incoming.ignored.length} other{' '}
									{incoming.ignored.length === 1 ? 'file' : 'files'} in the archive
									{incoming.ignored.length === 1 ? ' is' : ' are'} not this tool's and will be
									left alone.
								</p>
							)}
						</>
					)}
				</div>

				<div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onImport}
						disabled={incoming.files.length === 0}
						className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
					>
						{replacing > 0
							? `Import, replacing ${replacing}`
							: `Import ${incoming.files.length}`}
					</button>
				</div>
			</div>
		</div>
	);
}

function Group({ title, files }: { title: string; files: readonly IncomingFile[] }) {
	if (files.length === 0) return null;

	return (
		<section className="mt-3 first:mt-0">
			<h3 className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
				{title}
			</h3>
			<ul className="mt-1 space-y-0.5">
				{files.map((file) => (
					<li key={file.key} className="flex items-baseline justify-between gap-2 text-xs">
						<code className="truncate">{file.key}</code>
						<span
							className={`shrink-0 ${
								file.replaces
									? 'text-amber-700 dark:text-amber-400'
									: 'text-ink-muted dark:text-slate-500'
							}`}
						>
							{file.replaces ? 'replaces' : 'new'}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
