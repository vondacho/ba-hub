/**
 * A map and the models of the contexts it names, as one archive.
 *
 * The two documents have different lifetimes and are deliberately separate
 * files — a `.ddd` covers many contexts, a `.ddm` is the inside of exactly one
 * — but they are one *body of work*, and a body of work is what you hand to a
 * colleague, put in a pull request, or carry to another machine. Exporting them
 * one at a time is six gestures and a chance to forget the seventh.
 *
 * The shape says the relationship out loud:
 *
 *     insurance/
 *       insurance.ddd
 *       insurance.dddview
 *       risk-appetite/
 *         risk-appetite.ddm
 *         risk-appetite.ddmview
 *       claims/
 *         claims.ddm
 *
 * A folder per context, inside the map's folder, because that is what the model
 * *is*: one level inside one context of that map. Somebody who unzips this and
 * never opens the tool can still see which model belongs to what.
 *
 * **Filenames are the storage keys**, here as everywhere — `mapKeys` and
 * `modelKeys` derive both from the same slug. So an import needs no manifest
 * and no directory walking: the basename of every file *is* where it goes.
 * That is also why an import tolerates a rearranged archive. Somebody who
 * renames the folders has renamed folders, not documents.
 */

import { slug } from './files';
import { loadText, mapKeys, modelKeys, saveText, type DocumentKeys } from './storage';
import type { ZipEntry } from './zip';

/** The four kinds of file that belong in one of these. */
const EXTENSIONS = ['.ddd', '.dddview', '.ddm', '.ddmview'] as const;

// ---------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------

export interface Outgoing {
	/** The archive's root folder, and the name it is downloaded under. */
	readonly root: string;
	readonly entries: readonly ZipEntry[];
	/** Contexts the map names that have no model in this browser yet. */
	readonly missing: readonly string[];
}

/**
 * Everything this browser holds for one map and the contexts it names.
 *
 * A context with no model is **not** written as an empty folder or a stub. The
 * map already says it exists and the model page seeds one on demand; an empty
 * directory in an archive is a claim that something is there. They come back in
 * `missing` instead, so the panel can say how many are unmodelled — which is a
 * useful thing to be told at the moment you are packing up.
 *
 * The live source is passed in rather than read from the store, because the
 * store is four hundred milliseconds behind the textarea and an export that
 * quietly omitted the last sentence somebody typed would be the worst kind of
 * bug: invisible until it matters.
 */
export function outgoing(title: string, source: string, contexts: readonly string[]): Outgoing {
	const root = slug(title, 'map');
	const keys = mapKeys(title);
	const entries: ZipEntry[] = [{ path: `${root}/${keys.doc}`, text: source }];

	const view = loadText(keys.view);
	if (view !== null) entries.push({ path: `${root}/${keys.view}`, text: view });

	const missing: string[] = [];
	// Deduplicated by stem: two contexts whose names slug to one filename are
	// already one document in this store, and writing it twice would put two
	// entries at one path.
	const seen = new Set<string>();

	for (const context of contexts) {
		const model = modelKeys(context);
		const stem = slug(context, 'model');
		if (seen.has(stem)) continue;
		seen.add(stem);

		const doc = loadText(model.doc);
		if (doc === null) {
			missing.push(context);
			continue;
		}

		entries.push({ path: `${root}/${stem}/${model.doc}`, text: doc });
		const positions = loadText(model.view);
		if (positions !== null) entries.push({ path: `${root}/${stem}/${model.view}`, text: positions });
	}

	return { root, entries, missing };
}

// ---------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------

export interface IncomingFile {
	/** Where it will land, which is also what it is called. */
	readonly key: string;
	readonly stem: string;
	readonly kind: 'map' | 'model';
	readonly part: 'doc' | 'view';
	readonly text: string;
	/** True when this browser already holds something under that key. */
	readonly replaces: boolean;
}

export interface Incoming {
	readonly files: readonly IncomingFile[];
	/** Paths in the archive that are none of this tool's business. */
	readonly ignored: readonly string[];
}

/**
 * What an archive would write, without writing any of it.
 *
 * Separate from the writing on purpose: an import replaces documents somebody
 * may not have exported, and `StoreState`'s rule applies — the destructive
 * thing names what it is about to take *first*. `replaces` is that sentence's
 * evidence.
 *
 * Depth is not checked. The basename decides everything, so an archive whose
 * folders have been renamed, flattened, or nested one deeper still imports —
 * and one whose *files* were renamed imports under the new names, which is what
 * renaming a document means here.
 */
export function incoming(entries: readonly ZipEntry[]): Incoming {
	const files: IncomingFile[] = [];
	const ignored: string[] = [];
	// Last wins, which matters only for a malformed archive holding one name
	// twice — and "the last one" is what unzipping to a folder would leave.
	const byKey = new Map<string, IncomingFile>();

	for (const entry of entries) {
		const key = entry.path.split('/').pop() ?? '';
		const extension = EXTENSIONS.find((candidate) => key.endsWith(candidate));

		// A key must be more than an extension: `.ddm` alone is not a document.
		if (!extension || key.length === extension.length) {
			ignored.push(entry.path);
			continue;
		}

		byKey.set(key, {
			key,
			stem: key.slice(0, -extension.length),
			kind: extension.startsWith('.ddd') ? 'map' : 'model',
			part: extension.endsWith('view') ? 'view' : 'doc',
			text: entry.text,
			replaces: loadText(key) !== null,
		});
	}

	// Maps first, then models, each alphabetically: the order the panel lists
	// them in and the order they read in — the whole, then its insides.
	files.push(
		...[...byKey.values()].sort(
			(a, b) => Number(a.kind === 'model') - Number(b.kind === 'model') || a.stem.localeCompare(b.stem) || a.part.localeCompare(b.part),
		),
	);

	return { files, ignored };
}

/**
 * Write them, and say what failed.
 *
 * A full quota is the one failure worth reporting: `saveText` returns false
 * rather than throwing, and half an import is worse than none only if nobody
 * says which half.
 */
export function receive(files: readonly IncomingFile[]): { written: number; failed: readonly string[] } {
	const failed: string[] = [];
	let written = 0;

	for (const file of files) {
		if (saveText(file.key, file.text)) written += 1;
		else failed.push(file.key);
	}

	return { written, failed };
}

/** The map in an archive, if it holds exactly one. What to open afterwards. */
export function mapIn(files: readonly IncomingFile[]): DocumentKeys | null {
	const maps = files.filter((file) => file.kind === 'map' && file.part === 'doc');
	return maps.length === 1 ? { doc: maps[0]!.key, view: `${maps[0]!.stem}.dddview` } : null;
}
