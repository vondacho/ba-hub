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
 */

const SOURCE = 'ba-ddd-mapper-mapper:source';
const THEME = 'ba-ddd-mapper-mapper:graph-theme';
const SPLIT = 'ba-ddd-mapper-mapper:split';
const PANES = 'ba-ddd-mapper-mapper:panes';
const POSITIONS = 'ba-ddd-mapper-mapper:positions';
const CURVES = 'ba-ddd-mapper-mapper:curves';

export type GraphTheme = 'light' | 'dark';

/** Which panels are on screen: both, the text alone, or the map alone. */
export type Panes = 'both' | 'source' | 'graph';

function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function saveSource(text: string): boolean {
	try {
		store()?.setItem(SOURCE, text);
		return true;
	} catch {
		return false;
	}
}

export function loadSource(): string | null {
	try {
		return store()?.getItem(SOURCE) ?? null;
	} catch {
		return null;
	}
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

/**
 * Node positions the visitor has nudged.
 *
 * View state, deliberately — the same category as the theme and the split, and
 * emphatically **not** part of the document. A `.ddd` file carries no
 * coordinates, so opening one somewhere else shows the computed arrangement;
 * these are one browser's local preference about how to look at it.
 *
 * Keyed by node id, which is derived from the node's name. Renaming a context
 * therefore drops its override and the box returns to where ELK puts it. That
 * is a small surprise and the alternative — a second identifier that survives a
 * rename — is the thing the format refuses to have.
 */
export function loadPositions(): Record<string, { x: number; y: number }> {
	try {
		const raw = store()?.getItem(POSITIONS);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		// Validated rather than trusted: this came from a store a user can edit,
		// and a NaN reaching the SVG transform silently blanks the whole graph.
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

export function savePositions(positions: Record<string, { x: number; y: number }>): void {
	try {
		if (Object.keys(positions).length === 0) store()?.removeItem(POSITIONS);
		else store()?.setItem(POSITIONS, JSON.stringify(positions));
	} catch {
		// A layout that does not persist is a much smaller problem than a crash.
	}
}

/**
 * How far each edge's midpoint has been dragged. View state, like the
 * positions above and for the same reason: an edge's shape says nothing the
 * pattern and the direction do not already say, so it has no business in the
 * document.
 */
export function loadCurves(): Record<string, { dx: number; dy: number }> {
	try {
		const raw = store()?.getItem(CURVES);
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

export function saveCurves(curves: Record<string, { dx: number; dy: number }>): void {
	try {
		if (Object.keys(curves).length === 0) store()?.removeItem(CURVES);
		else store()?.setItem(CURVES, JSON.stringify(curves));
	} catch {
		// Same.
	}
}
