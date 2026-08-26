/**
 * `localStorage`, in doc-es's shape.
 *
 * The position is the boards': this is **insurance, not an artefact**. The file
 * you export is the map, and it is meant to end up in a repository rather than
 * a downloads folder — which is the one difference from doc-es, and the reason
 * the export filename is a slug rather than a title.
 *
 * Every function is defensive. Private browsing, a full quota and a disabled
 * store all present as a throw from `localStorage`, and none of them should
 * cost the visitor their work — they cost the autosave, which is what the
 * failure banner says.
 *
 * ## Keys are filenames
 *
 * A document's entries are keyed by what it would be called on disk:
 *
 *   `insurance.ddd`       the map's source
 *   `insurance.dddview`   its arrangement, byte-identical to the sidecar the
 *                         Save layout button downloads
 *   `risk-appetite.ddm`   one context's model
 *   `risk-appetite.ddmview`   its arrangement
 *
 * So the store holds documents rather than one slot per page, and a second map
 * no longer evicts the first. What it costs is a way back in: a reload knows
 * the visitor's last title only because `LAST_MAP` and `LAST_MODEL` remember
 * it. Those two are the only keys here that are not a filename, and they carry
 * the title rather than the key so that both of a document's entries can be
 * derived from one string.
 *
 * The desk keys — theme, split, panes, legend, inspector — stay global and
 * stay outside this scheme. They are properties of the person, not of any
 * document.
 */

import { slug } from './files';
import { parseModelView, parseView, serializeModelView, serializeView } from './view-file';

const THEME = 'ba-ddd-mapper-mapper:graph-theme';
const SPLIT = 'ba-ddd-mapper-mapper:split';
const PANES = 'ba-ddd-mapper-mapper:panes';
const LEGEND = 'ba-ddd-mapper-mapper:legend';
const INSPECTOR = 'ba-ddd-mapper-mapper:inspector';
const LAST_MAP = 'ba-ddd-mapper:last-map';
const LAST_MODEL = 'ba-ddd-mapper:last-model';

/** The keys the entries before per-document naming lived under. */
const LEGACY_SOURCE = 'ba-ddd-mapper-mapper:source';
const LEGACY_POSITIONS = 'ba-ddd-mapper-mapper:positions';
const LEGACY_CURVES = 'ba-ddd-mapper-mapper:curves';
const LEGACY_MODEL_SOURCE = 'ba-ddd-mapper-model:source';
const LEGACY_MODEL_POSITIONS = 'ba-ddd-mapper-model:positions';

export type GraphTheme = 'light' | 'dark';

/** Which panels are on screen: both, the text alone, or the map alone. */
export type Panes = 'both' | 'source' | 'graph';

/** A document's two keys, derived from its name exactly as its filenames are. */
export interface DocumentKeys {
	readonly doc: string;
	readonly view: string;
}

export function mapKeys(title: string): DocumentKeys {
	const stem = slug(title, 'map');
	return { doc: `${stem}.ddd`, view: `${stem}.dddview` };
}

export function modelKeys(context: string): DocumentKeys {
	const stem = slug(context, 'model');
	return { doc: `${stem}.ddm`, view: `${stem}.ddmview` };
}

function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function saveText(key: string, text: string): boolean {
	try {
		store()?.setItem(key, text);
		return true;
	} catch {
		return false;
	}
}

export function loadText(key: string): string | null {
	try {
		return store()?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

/**
 * Drop a document's entries.
 *
 * Called on a rename, which is the one gesture that changes a document's keys
 * without changing the document: the next autosave writes the new pair, and
 * without this the old pair would sit there for ever as a copy of the map under
 * a name nobody uses.
 */
export function forget(keys: DocumentKeys): void {
	try {
		store()?.removeItem(keys.doc);
		store()?.removeItem(keys.view);
	} catch {
		// Nothing to do about it, and nothing lost that the visitor can see.
	}
}

/**
 * Which document to reopen.
 *
 * The title rather than the key, because the keys are derived from it and a
 * pointer that holds the derived form would have to hold both.
 */
export function rememberMap(title: string): void {
	try {
		store()?.setItem(LAST_MAP, title);
	} catch {
		// Then the next visit opens the sample. Survivable.
	}
}

export function lastMap(): string | null {
	return loadText(LAST_MAP);
}

export function rememberModel(context: string): void {
	try {
		store()?.setItem(LAST_MODEL, context);
	} catch {
		// Same.
	}
}

export function lastModel(): string | null {
	return loadText(LAST_MODEL);
}

/**
 * The graph panel's theme override, in its own key.
 *
 * It belongs to the browser rather than to any one map — a projector in a lit
 * room is a property of the room — so it survives opening a different file.
 */
export function loadTheme(): GraphTheme | null {
	try {
		const value = store()?.getItem(THEME);
		return value === 'light' || value === 'dark' ? value : null;
	} catch {
		return null;
	}
}

export function saveTheme(theme: GraphTheme | null): void {
	try {
		if (theme === null) store()?.removeItem(THEME);
		else store()?.setItem(THEME, theme);
	} catch {
		// A theme that does not persist is a much smaller problem than a crash.
	}
}

/**
 * Which panels are showing, in its own key and next to the split rather than
 * inside it.
 *
 * Same reasoning as the theme: this is a property of the desk, not of the map.
 * Somebody who reads maps on a laptop wants the graph alone every time they
 * open the mapper, and somebody writing one wants both — and neither of them
 * wants the file they opened to have an opinion about it. The split percentage
 * survives untouched while a single pane is showing, so going back to two
 * restores the proportions rather than a default.
 */
export function loadPanes(): Panes | null {
	try {
		const value = store()?.getItem(PANES);
		return value === 'both' || value === 'source' || value === 'graph' ? value : null;
	} catch {
		return null;
	}
}

export function savePanes(panes: Panes): void {
	try {
		store()?.setItem(PANES, panes);
	} catch {
		// As with the theme: a preference that does not persist is survivable.
	}
}

/**
 * Whether the legend is showing, in its own key alongside the panes.
 *
 * A property of the reader rather than of the document, like everything else on
 * this shelf: somebody meeting the notation wants the row and somebody who has
 * been writing these all week wants the two centimetres of canvas back. It is
 * remembered rather than defaulted for that reason — the second group would
 * otherwise dismiss it once per visit.
 *
 * Null is "never said", which the editors read as showing it. A legend that
 * hid itself until asked for would be a legend nobody meeting the notation ever
 * discovers, which is the one audience it exists for.
 */
export function loadLegend(): boolean | null {
	try {
		const value = store()?.getItem(LEGEND);
		return value === 'on' ? true : value === 'off' ? false : null;
	} catch {
		return null;
	}
}

export function saveLegend(show: boolean): void {
	try {
		store()?.setItem(LEGEND, show ? 'on' : 'off');
	} catch {
		// As with the theme: a preference that does not persist is survivable.
	}
}

/**
 * Whether the inspector opens on a selection, in its own key beside the legend.
 *
 * The legend's reasoning exactly, and the same answer: it is a property of the
 * reader. Somebody editing wants the panel on every click; somebody reading a
 * map on a projector wants the whole canvas and none of it, and closing it once
 * per selection is not a preference, it is a chore.
 *
 * Null is "never said", which the editors read as showing it — for the legend's
 * reason too. The inspector is where a pattern is chosen, a rationale typed and
 * an invariant written, so a tool that hid it until asked would hide most of
 * what it does.
 */
export function loadInspector(): boolean | null {
	try {
		const value = store()?.getItem(INSPECTOR);
		return value === 'on' ? true : value === 'off' ? false : null;
	} catch {
		return null;
	}
}

export function saveInspector(show: boolean): void {
	try {
		store()?.setItem(INSPECTOR, show ? 'on' : 'off');
	} catch {
		// As with the theme: a preference that does not persist is survivable.
	}
}

export function loadSplit(): number | null {
	try {
		const value = Number(store()?.getItem(SPLIT));
		return Number.isFinite(value) && value > 15 && value < 85 ? value : null;
	} catch {
		return null;
	}
}

export function saveSplit(percent: number): void {
	try {
		store()?.setItem(SPLIT, String(Math.round(percent)));
	} catch {
		// Same.
	}
}

export interface MapView {
	positions: Record<string, { x: number; y: number }>;
	curves: Record<string, { dx: number; dy: number }>;
}

/**
 * The map's arrangement: node positions the visitor has nudged, and how far
 * each edge's midpoint has been dragged.
 *
 * View state, deliberately — the same category as the theme and the split, and
 * emphatically **not** part of the document. A `.ddd` file carries no
 * coordinates, so opening one somewhere else shows the computed arrangement;
 * these are one browser's local preference about how to look at it.
 *
 * Stored as the sidecar file itself rather than as a private shape, which is
 * what makes `insurance.dddview` in the store and `insurance.dddview` in the
 * downloads folder the same thing: one format, one parser, one place where a
 * hand-edited coordinate is checked before it can reach an SVG transform.
 *
 * Keyed by node id, which is derived from the node's name. Renaming a context
 * therefore drops its override and the box returns to where ELK puts it. That
 * is a small surprise and the alternative — a second identifier that survives a
 * rename — is the thing the format refuses to have.
 */
export function saveMapView(key: string, title: string, view: MapView): void {
	try {
		// Written whether or not anything has been dragged.
		//
		// It used to drop the key when the arrangement was empty, on the theory
		// that an empty file says nothing. It says one thing, and it is the thing
		// this pair is for: **the document has a sidecar**. Without it the store
		// held a `.ddd` and no `.dddview` until the first drag, which made the
		// two halves of a document look like one document and an accident — and
		// left Export writing a pair the store had never held.
		store()?.setItem(key, serializeView({ ...view, map: title }));
	} catch {
		// A layout that does not persist is a much smaller problem than a crash.
	}
}

export function loadMapView(key: string): MapView {
	const raw = loadText(key);
	if (raw === null) return { positions: {}, curves: {} };
	// The title is passed as its own, so the mismatch warning cannot fire: this
	// entry was written under a key derived from that title.
	const result = parseView(raw, '');
	return result.ok ? { positions: result.view.positions, curves: result.view.curves } : { positions: {}, curves: {} };
}

/**
 * The domain model's arrangement, `saveMapView`'s twin: the sidecar itself, so
 * that `risk-appetite.ddmview` in the store and `risk-appetite.ddmview` in the
 * downloads folder are the same file.
 */
export function saveModelView(
	key: string,
	context: string,
	positions: Record<string, { x: number; y: number }>,
): void {
	try {
		// Always, for `saveMapView`'s reason: the pair is the document.
		store()?.setItem(key, serializeModelView({ positions, model: context }));
	} catch {
		// As everywhere here: a nudge that does not persist beats a crash.
	}
}

export function loadModelView(key: string): Record<string, { x: number; y: number }> {
	const raw = loadText(key);
	if (raw === null) return {};
	// The context is passed as its own: this entry was written under a key
	// derived from that name, so the mismatch warning cannot fire.
	const result = parseModelView(raw, '');
	return result.ok ? result.view.positions : {};
}

/**
 * Coordinates from the store, validated rather than trusted: this came from a
 * store a user can edit, and one NaN in a transform blanks the whole canvas.
 */
function readPoints(raw: string | null): Record<string, { x: number; y: number }> {
	try {
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const clean: Record<string, { x: number; y: number }> = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			const point = value as { x?: unknown; y?: unknown };
			if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
				clean[id] = { x: Number(point.x), y: Number(point.y) };
			}
		}
		return clean;
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// What is in there
// ---------------------------------------------------------------------------

/** One document's entries, as the store actually holds them. */
export interface StoredDocument {
	/** The shared filename stem: `insurance`, `risk-appetite`. */
	readonly stem: string;
	readonly kind: 'map' | 'model';
	/** Null when only a sidecar is present — an arrangement with nothing to arrange. */
	readonly doc: { readonly key: string; readonly bytes: number } | null;
	readonly view: { readonly key: string; readonly bytes: number } | null;
}

export interface Inventory {
	readonly documents: readonly StoredDocument[];
	/** What the documents cost, in UTF-16 units — the unit the quota counts in. */
	readonly bytes: number;
}

const EXTENSIONS: Record<string, { kind: 'map' | 'model'; part: 'doc' | 'view' }> = {
	'.ddd': { kind: 'map', part: 'doc' },
	'.dddview': { kind: 'map', part: 'view' },
	'.ddm': { kind: 'model', part: 'doc' },
	'.ddmview': { kind: 'model', part: 'view' },
};

/**
 * The documents this origin holds, and only those.
 *
 * The one place that enumerates the store rather than addressing it by name.
 * Autosave is silent by design — it has to be, or it would be a dialog every
 * four hundred milliseconds — and the cost of silence is that a visitor has no
 * idea what has accumulated under their browser. This is the answer to that,
 * and it is deliberately a *reading*: nothing here writes, and nothing here
 * deletes.
 *
 * Documents only. The theme, the split, which panes are showing and the two
 * pointers are all in the store as well, and none of them is a thing anybody
 * opens a panel to look at — they are settings, and a list that mixed them in
 * with the visitor's work would be a dump of the store rather than an account
 * of it.
 *
 * A `.dddview` whose `.ddd` has gone is listed rather than hidden. It is the
 * one anomaly this store can produce — a rename that half-succeeded on a full
 * quota — and a list that quietly omitted it would be a list you could not use
 * to explain what happened.
 */
export function inventory(): Inventory {
	const from = store();
	if (!from) return { documents: [], bytes: 0 };

	const documents = new Map<string, { kind: 'map' | 'model'; doc: { key: string; bytes: number } | null; view: { key: string; bytes: number } | null }>();
	let bytes = 0;

	try {
		for (let index = 0; index < from.length; index += 1) {
			const key = from.key(index);
			if (key === null) continue;

			const extension = Object.keys(EXTENSIONS).find((candidate) => key.endsWith(candidate));
			// Settings, pointers, and anything another tool put on this origin.
			if (!extension) continue;

			// UTF-16 code units, which is what the quota is counted in.
			const size = key.length + (from.getItem(key) ?? '').length;
			bytes += size;

			const { kind, part } = EXTENSIONS[extension]!;
			const stem = key.slice(0, -extension.length);
			const found = documents.get(`${kind}:${stem}`) ?? { kind, doc: null, view: null };
			found[part] = { key, bytes: size };
			documents.set(`${kind}:${stem}`, found);
		}
	} catch {
		// A store that throws mid-scan reports what it managed to say.
	}

	return {
		documents: [...documents.entries()]
			.map(([id, found]) => ({ stem: id.slice(id.indexOf(':') + 1), ...found }))
			// Maps first, then models, each alphabetically: the same order the two
			// pages sit in, and stable between visits so the list can be scanned.
			.sort((a, b) => (a.kind === b.kind ? a.stem.localeCompare(b.stem) : a.kind === 'map' ? -1 : 1)),
		bytes,
	};
}

/**
 * Delete one document's entries, whichever of the pair exist.
 *
 * The store's only destructive operation that a person asks for directly, and
 * the reason it exists is corruption: an entry that will not parse, a sidecar
 * whose document is gone, something a half-finished write left behind. Every
 * other write here is a consequence of typing.
 *
 * Takes the entry the inventory produced rather than a name, so what disappears
 * is exactly what was listed — including the case with no document at all,
 * which is the one a name could not have addressed.
 */
export function removeDocument(entry: StoredDocument): void {
	try {
		if (entry.doc) store()?.removeItem(entry.doc.key);
		if (entry.view) store()?.removeItem(entry.view.key);
	} catch {
		// A store that will not delete is a store that will not do anything else
		// either; the list re-reads after this and will still show the entry.
	}
}

/**
 * What the single-slot keys held, read once and then removed.
 *
 * Somebody who had a map open when this shipped should find it open on their
 * next visit, and the only way to give them that is to read the old keys before
 * a title is known — the new ones cannot be derived until the source has been
 * parsed. Read here, held in React state, and written back under the document's
 * own keys within a second; the removal is what stops it being read a second
 * time and overwriting whatever the visitor has done since.
 */
export function takeLegacyMap(): { source: string; view: MapView } | null {
	const source = loadText(LEGACY_SOURCE);
	if (source === null) return null;
	const view = {
		positions: readPoints(loadText(LEGACY_POSITIONS)),
		curves: readCurves(loadText(LEGACY_CURVES)),
	};
	try {
		store()?.removeItem(LEGACY_SOURCE);
		store()?.removeItem(LEGACY_POSITIONS);
		store()?.removeItem(LEGACY_CURVES);
	} catch {
		// Left behind, and read once more on the next visit. Harmless.
	}
	return { source, view };
}

export function takeLegacyModel(): { source: string; positions: Record<string, { x: number; y: number }> } | null {
	const source = loadText(LEGACY_MODEL_SOURCE);
	if (source === null) return null;
	const positions = readPoints(loadText(LEGACY_MODEL_POSITIONS));
	try {
		store()?.removeItem(LEGACY_MODEL_SOURCE);
		store()?.removeItem(LEGACY_MODEL_POSITIONS);
	} catch {
		// Same.
	}
	return { source, positions };
}

function readCurves(raw: string | null): Record<string, { dx: number; dy: number }> {
	try {
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const clean: Record<string, { dx: number; dy: number }> = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			const point = value as { dx?: unknown; dy?: unknown };
			if (Number.isFinite(point?.dx) && Number.isFinite(point?.dy)) {
				clean[id] = { dx: Number(point.dx), dy: Number(point.dy) };
			}
		}
		return clean;
	} catch {
		return {};
	}
}
