/**
 * The mapper island.
 *
 * Holds one piece of state that matters — `source`, a string — and derives
 * everything else from it. The document, the problems, the layout and the graph
 * are all functions of that string, which is what "the text is the source of
 * truth" means in practice rather than as a slogan.
 *
 * Two behaviours are worth reading the code for.
 *
 * **The debounce and the last-good document.** A file is unparseable for most
 * of the time somebody is typing in it — every half-written string literal and
 * unclosed brace is a failure. Parsing on every keystroke and blanking the
 * graph on every failure would strobe, and a graph that strobes is one nobody
 * watches while typing, which removes the only reason for two panels. So the
 * parse is debounced, and a failed parse leaves the previous document on
 * screen, dimmed, with the panel saying why.
 *
 * **Undo is the textarea's.** There is no history stack here. The browser
 * already has one for a textarea and it is better than anything worth writing;
 * the graph gestures go through `applyEdit`, which writes into the textarea's
 * own value in a way `execCommand('insertText')` records — so ⌘Z undoes a
 * pattern change exactly as it undoes a keystroke. That is a smaller component
 * and a more predictable one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse } from '../../lib/ddd/parser';
import { SAMPLE } from '../../lib/ddd/sample';
import type {
	Classification,
	ContainmentEdge,
	DddDocument,
	Node,
	NodeKind,
	Pattern,
	RelationshipEdge,
} from '../../lib/ddd/model';
import { symmetric } from '../../lib/ddd/model';
import type { Problem } from '../../lib/ddd/problems';
import {
	layout as computeLayout,
	type Curves,
	type Layout,
	type Positions,
} from '../../lib/graph/layout';
import * as edits from '../../lib/graph/edit';
import type { EdgeField, ListField, ScalarField } from '../../lib/graph/edit';
import {
	clearFileInput,
	DDD_ACCEPT,
	downloadText,
	filenameFor,
	readTextFile,
	svgFilenameFor,
	VIEW_ACCEPT,
	viewFilenameFor,
} from '../../lib/files';
import { seedModel } from '../../lib/ddm/seed';
import { modelHref } from '../../lib/links';
import { parseView, serializeView } from '../../lib/view-file';
import { useFullscreen } from '../../lib/fullscreen';
import Icon, { type IconName } from './Icon';
import IconButton from '../ui/IconButton';
import {
	forget,
	lastMap,
	loadMapView,
	loadPanes,
	loadSplit,
	loadText,
	loadTheme,
	mapKeys,
	modelKeys,
	rememberMap,
	rememberModel,
	saveMapView,
	savePanes,
	saveSplit,
	saveText,
	saveTheme,
	takeLegacyMap,
	type DocumentKeys,
	type GraphTheme,
	type Panes,
} from '../../lib/storage';
import StoreState from '../ui/StoreState';
import Editor from './Editor';
import Graph from './Graph';
import Inspector from './Inspector';
import { Legend } from './Legend';
import ProblemList from './ProblemList';

const DEBOUNCE_MS = 250;

/** Said whenever a gesture is refused because the text has not parsed. */
const STALE =
	'The source has not parsed since the last change, so the spans a gesture would edit are the previous document’s. Fix the errors and the tools come back.';

const NEW_NAME: Record<NodeKind, string> = {
	domain: 'New domain',
	subdomain: 'New subdomain',
	context: 'New context',
};

/**
 * The pattern a freshly drawn relationship gets.
 *
 * The grammar has no untagged arrow — a relationship *is* its pattern — so
 * something has to be written, and the choice is between a guess and a modal
 * that stops the gesture to ask. `customer-supplier` is the guess: it is
 * directed, which is the shape of the arrow that was just drawn, and it is the
 * one pattern that claims nothing except that the two teams negotiate. The
 * inspector opens on the new edge with all nine listed, and the map is only
 * honest once somebody has looked at that list.
 */
const NEW_RELATIONSHIP = { pattern: 'customer-supplier' as const };

/**
 * The layout picker, in the order the panes sit on screen: text, both, map.
 *
 * Two panels are the tool — the graph is a view of the text and editing either
 * one edits the same document — so `both` is the default and stays the middle
 * button. One panel is for the two moments when the other half is in the way:
 * writing a long map on a laptop, and showing the finished one to a room.
 */
/**
 * How far apart the exported files are handed to the browser.
 *
 * Two downloads from one click, and browsers that treat two anchor clicks in
 * the same task as one gesture drop the second. Spacing them is the only
 * reliable answer; a quarter of a second is under notice and well clear of the
 * coalescing window.
 */
const DOWNLOAD_GAP_MS = 250;

const PANE_CHOICES: readonly { panes: Panes; icon: IconName; label: string }[] = [
	{ panes: 'source', icon: 'panes-source', label: 'Show the source only' },
	{ panes: 'both', icon: 'panes-both', label: 'Show the source and the map' },
	{ panes: 'graph', icon: 'panes-graph', label: 'Show the map only' },
];

/** Parsed once, so the initial document and the initial key agree. */
const SEED = parse(SAMPLE).document;

export default function DddMapper() {
	const [source, setSource] = useState(SAMPLE);
	const [document_, setDocument] = useState<DddDocument>(SEED);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [stale, setStale] = useState(false);
	const [layout, setLayout] = useState<Layout | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [split, setSplit] = useState(42);
	const [panes, setPanes] = useState<Panes>('both');
	const [theme, setTheme] = useState<GraphTheme | null>(null);
	// Where the visitor has dragged boxes to. View state: it goes to
	// localStorage and never into `source`.
	const [positions, setPositions] = useState<Positions>({});
	const [curves, setCurves] = useState<Curves>({});
	const { root, fullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
	const [saveFailed, setSaveFailed] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const viewInput = useRef<HTMLInputElement>(null);
	/*
	 * The one-line banner under the bar.
	 *
	 * It began as news about `.dddview` files and now also carries the refusals
	 * — the edge somebody drew that this format cannot say. One banner rather
	 * than two, because they are the same thing from the visitor's side: a
	 * sentence about the gesture they just made, in the place they will look
	 * for it.
	 */
	const [note, setNote] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);
	/*
	 * The node added by the last click of an Add button.
	 *
	 * Only so the inspector can put the cursor in its name: a box called "New
	 * context" is not finished, and the format says so — the name is the
	 * identity every relationship and `serves` refers to. Cleared as soon as the
	 * selection moves, so the field does not grab focus again later.
	 */
	const [fresh, setFresh] = useState<string | null>(null);
	/**
	 * The name the map's entries are stored under.
	 *
	 * `document_.title` almost always, and deliberately not the same variable: a
	 * source that does not parse leaves `document_` describing the *previous*
	 * map, and writing this one's text under that one's key would overwrite a
	 * document the visitor never opened. So this only ever moves on a successful
	 * parse, or when a stored map is reopened by name.
	 */
	const [mapName, setMapName] = useState(SEED.title);
	/** `<mapName>.ddd` and `<mapName>.dddview` — what it would be called on disk. */
	const keys = useMemo(() => mapKeys(mapName), [mapName]);
	const keysRef = useRef<DocumentKeys | null>(null);
	/**
	 * Set by the title field alone, and read once by the effect below.
	 *
	 * A rename and an Open both change the name the keys derive from, and they
	 * mean opposite things about the entries under the old name: a rename should
	 * move them, an Open must leave them exactly where they are, because the map
	 * they belong to still exists and the visitor has simply gone to another one.
	 * Nothing in the resulting title distinguishes the two, so the gesture says.
	 */
	const renamed = useRef(false);
	/** The store panel. Read-only, and read fresh each time it opens. */
	const [showStore, setShowStore] = useState(false);

	// Restore before first paint of anything the visitor could act on.
	useEffect(() => {
		restore();
		setTheme(loadTheme());
		const storedSplit = loadSplit();
		if (storedSplit !== null) setSplit(storedSplit);
		const storedPanes = loadPanes();
		if (storedPanes !== null) setPanes(storedPanes);
	}, []);

	/**
	 * Reopen the last map, by name.
	 *
	 * The keys are derived from the title, so the title has to come from
	 * somewhere before anything can be read — and the source it would be parsed
	 * from is the thing being looked for. Hence the pointer. A pointer naming a
	 * map whose entry has since gone falls through to the sample rather than
	 * opening a blank editor.
	 */
	function restore(): void {
		const title = lastMap();
		if (title !== null) {
			const keys = mapKeys(title);
			const stored = loadText(keys.doc);
			if (stored !== null) {
				keysRef.current = keys;
				setMapName(title);
				setSource(stored);
				const view = loadMapView(keys.view);
				setPositions(view.positions);
				setCurves(view.curves);
				return;
			}
		}

		// Nothing under the new naming: this is the first visit since it shipped,
		// and whatever was in the single-slot keys is the visitor's open map.
		const legacy = takeLegacyMap();
		if (legacy) {
			setSource(legacy.source);
			setPositions(legacy.view.positions);
			setCurves(legacy.view.curves);
		}
	}

	// Parse, debounced. A failure keeps the last good document.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			const result = parse(source);
			setProblems(result.problems);
			if (result.ok) {
				setDocument(result.document);
				setMapName(result.document.title);
				setStale(false);
			} else {
				setStale(true);
			}
		}, DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [source]);

	// Autosave, on the same rhythm, under the title's own key.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			setSaveFailed(!saveText(keys.doc, source));
			rememberMap(mapName);
		}, 1000);
		return () => window.clearTimeout(timer);
	}, [source, keys.doc, mapName]);

	/**
	 * A rename moves the entries; an Open leaves them.
	 *
	 * Renaming a map changes what it would be called on disk, and the store
	 * follows the disk. Without the move, `insurance.ddd` would sit there for
	 * ever as a copy under a name nobody uses, and the arrangement — whose node
	 * ids survive a *title* change untouched — would be lost to the map that
	 * kept it.
	 */
	useEffect(() => {
		const previous = keysRef.current;
		keysRef.current = keys;
		const wasRename = renamed.current;
		renamed.current = false;
		if (!previous || previous.doc === keys.doc || !wasRename) return;

		// The source too, even though the autosave writes it within the second:
		// a reload in that second should find the map under its new name.
		const carried = loadText(previous.doc);
		if (carried !== null) saveText(keys.doc, carried);
		saveMapView(keys.view, mapName, loadMapView(previous.view));
		forget(previous);
	}, [keys, mapName]);

	// Lay out whenever the document changes. Cancelled on the way out so a slow
	// layout cannot land after a newer one and show an older graph.
	useEffect(() => {
		let live = true;
		computeLayout(document_).then((next) => {
			if (live) setLayout(next);
		});
		return () => {
			live = false;
		};
	}, [document_]);

	// A selection that no longer exists — the node was renamed or deleted in the
	// text — must not leave the inspector describing something that is gone.
	useEffect(() => {
		if (!selected) return;
		const exists =
			document_.nodes.some((node) => node.id === selected) ||
			document_.edges.some((edge) => edge.id === selected);
		if (!exists) setSelected(null);
	}, [document_, selected]);

	/**
	 * Apply a graph gesture.
	 *
	 * Goes through the textarea rather than setState directly, so the browser
	 * records it on the textarea's own undo stack and ⌘Z works on a pattern
	 * change exactly as it does on a keystroke. `execCommand` is deprecated and
	 * is still the only way to write into a textarea undoably; the fallback
	 * keeps the edit and loses only the undo entry.
	 */
	const applyEdit = useCallback((next: string) => {
		const area = window.document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Map source"]');
		if (area) {
			area.focus();
			area.setSelectionRange(0, area.value.length);
			const wrote = window.document.execCommand?.('insertText', false, next);
			if (wrote) {
				setSource(area.value);
				return;
			}
		}
		setSource(next);
	}, []);

	/**
	 * Show a line of the source, from a problem or from the inspector.
	 *
	 * Asking to see a line in the text is asking for the text, so a reveal with
	 * the source pane hidden opens it rather than doing nothing — a control that
	 * silently does nothing is worse than one that is not there. The nudge keeps
	 * every call a distinct value, so asking for the same line twice scrolls to
	 * it twice.
	 */
	const reveal = useCallback(
		(line: number) => {
			if (panes === 'graph') {
				setPanes('both');
				savePanes('both');
			}
			setRevealLine(line + Math.random() * 0.0001);
		},
		[panes],
	);

	const setPattern = useCallback(
		(edge: RelationshipEdge, pattern: Pattern) => {
			const shape = symmetric[pattern];
			const shouldBeDirected = shape === 'mutual' ? false : shape === 'directed' ? true : edge.directed;
			// The arrow's span is not on the edge, so it is found in the header —
			// between the two endpoint names and the colon.
			const header = source.slice(edge.span.start, edge.patternSpan.start);
			const at = header.lastIndexOf(edge.directed ? '->' : '<->');
			const arrowSpan =
				at >= 0
					? {
							start: edge.span.start + at,
							end: edge.span.start + at + (edge.directed ? 2 : 3),
							line: edge.span.line,
							column: edge.span.column,
						}
					: null;
			applyEdit(edits.setPattern(source, edge, [pattern], arrowSpan, shouldBeDirected));
		},
		[source, applyEdit],
	);

	const setClassification = useCallback(
		(subdomainId: string, classification: Classification) => {
			const node = document_.nodes.find((candidate) => candidate.id === subdomainId);
			if (node?.kind !== 'subdomain') return;
			applyEdit(edits.setClassification(source, node.classificationSpan, classification));
		},
		[document_, source, applyEdit],
	);

	const removeRelationship = useCallback(
		(edge: RelationshipEdge) => {
			setSelected(null);
			applyEdit(edits.removeRelationship(source, edge));
		},
		[source, applyEdit],
	);

	const counts = useMemo(() => {
		const contexts = document_.nodes.filter((node) => node.kind === 'context').length;
		const subdomains = document_.nodes.filter((node) => node.kind === 'subdomain').length;
		const relationships = document_.edges.filter((edge) => edge.kind === 'relationship').length;
		return { contexts, subdomains, relationships };
	}, [document_]);

	// Persist the arrangement, debounced — a drag fires this on every frame. One
	// key rather than two, because `.dddview` is one file.
	useEffect(() => {
		const timer = window.setTimeout(() => saveMapView(keys.view, mapName, { positions, curves }), 400);
		return () => window.clearTimeout(timer);
	}, [positions, curves, keys.view, mapName]);

	// ---- creating, deleting, connecting -------------------------------------


	useEffect(() => {
		if (fresh !== null && fresh !== selected) setFresh(null);
	}, [fresh, selected]);

	const selectedNode = useMemo(
		() => document_.nodes.find((node) => node.id === selected) ?? null,
		[document_, selected],
	);

	/**
	 * Why each `Add` button is off, or null when it is on.
	 *
	 * A subdomain divides a domain and a context sits in one of them, so both
	 * need somewhere to go — and the selection is that somewhere. Saying so on
	 * a disabled button beats putting the box in an arbitrary parent and making
	 * the visitor move it.
	 */
	const canAdd = useMemo(
		() => ({
			domain: stale ? STALE : null,
			subdomain: stale
				? STALE
				: selectedNode?.kind === 'domain'
					? null
					: 'Select a domain first — a subdomain divides one',
			context: stale
				? STALE
				: selectedNode?.kind === 'domain' || selectedNode?.kind === 'subdomain'
					? null
					: 'Select a domain or subdomain first — a context sits in one',
		}),
		[stale, selectedNode],
	);

	const addNode = useCallback(
		(kind: NodeKind) => {
			if (canAdd[kind] !== null) return;
			const name = edits.unusedName(document_, NEW_NAME[kind]);
			applyEdit(edits.addNode(source, kind, name, kind === 'domain' ? null : selectedNode));
			setFresh(`${kind}:${name}`);
			// The id is derived from the name, so it can be selected before the
			// parse that will produce it — the inspector opens on the new box with
			// its name field ready, which is where the title it needs comes from.
			setSelected(`${kind}:${name}`);
		},
		[applyEdit, canAdd, document_, selectedNode, source],
	);

	const removeNode = useCallback(
		(node: Node) => {
			applyEdit(edits.removeNode(source, document_, node));
			setSelected(null);
		},
		[applyEdit, document_, source],
	);

	const removeServes = useCallback(
		(edge: ContainmentEdge) => {
			applyEdit(edits.removeServes(source, edge));
			setSelected(null);
		},
		[applyEdit, source],
	);

	/**
	 * Write one of a node's fields.
	 *
	 * Refused while the text does not parse, like every other gesture that
	 * splices a span: the spans belong to the last document that parsed, and the
	 * text has moved on.
	 */
	const setField = useCallback(
		(node: Node, field: ScalarField, value: string) => {
			if (stale) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			applyEdit(edits.setField(source, document_, node, field, value));
		},
		[applyEdit, document_, source, stale],
	);

	const setList = useCallback(
		(node: Node, field: ListField, values: readonly string[]) => {
			if (stale) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			applyEdit(edits.setList(source, document_, node, field, values));
		},
		[applyEdit, document_, source, stale],
	);

	/**
	 * Write a relationship's `exchange` or `because`.
	 *
	 * Its own id survives the edit — a relationship is identified by its pattern
	 * token's offset, and both fields live in the block *after* that — so the
	 * inspector stays open on the arrow being described. Arrows further down the
	 * file are renumbered and would lose the selection, which is why this is the
	 * edit that gets to keep it.
	 */
	const setEdgeField = useCallback(
		(edge: RelationshipEdge, field: EdgeField, value: string) => {
			if (stale) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			applyEdit(edits.setEdgeField(source, document_, edge, field, value));
		},
		[applyEdit, document_, source, stale],
	);

	const renameNode = useCallback(
		(node: Node, to: string) => {
			if (stale) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			if (document_.nodes.some((candidate) => candidate.name === to)) {
				setNote({
					kind: 'error',
					text: `"${to}" is already the name of something else. The name is the identity in this format — two nodes cannot share one.`,
				});
				return;
			}
			applyEdit(edits.renameNode(source, document_, node, to));
			setSelected(`${node.kind}:${to}`);
		},
		[applyEdit, document_, source, stale],
	);

	/**
	 * What an edge drawn from one box to another *means*.
	 *
	 * The gesture is one gesture and this format has three edges, so the pair of
	 * kinds decides which one was drawn:
	 *
	 *   context → context      a relationship, and the only edge that carries a
	 *                          pattern. It gets one immediately, because the
	 *                          grammar has no way to write an untagged arrow —
	 *                          see `NEW_RELATIONSHIP`.
	 *   context → subdomain    a `serves` line: the straddle.
	 *   context → domain       the same, for a context that serves a domain
	 *                          directly.
	 *   subdomain → domain     not a line at all. A subdomain divides exactly
	 *                          one domain and says so by sitting inside it, so
	 *                          the edge already exists and drawing it re-points
	 *                          it — the block moves.
	 *
	 * Pointing the other way is taken to mean the same thing rather than
	 * refused. "Draw from the subdomain to the context" and "draw from the
	 * context to the subdomain" are the same claim about the world, and only one
	 * of them has a direction the file can hold.
	 */
	const connect = useCallback(
		(fromId: string, toId: string) => {
			if (stale) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			const a = document_.nodes.find((node) => node.id === fromId);
			const b = document_.nodes.find((node) => node.id === toId);
			if (!a || !b) return;

			if (a.kind === 'context' && b.kind === 'context') {
				applyEdit(
					edits.addRelationship(source, a.name, b.name, NEW_RELATIONSHIP.pattern, true),
				);
				// Selected once it exists: the pattern is a guess and the inspector
				// is where it stops being one.
				wanted.current = { from: a.id, to: b.id };
				return;
			}

			const context = a.kind === 'context' ? a : b.kind === 'context' ? b : null;
			const host = context === a ? b : a;

			if (context && host.kind !== 'context') {
				if (context.serves.includes(host.id)) {
					setNote({
						kind: 'warn',
						text: `"${context.name}" already serves "${host.name}".`,
					});
					return;
				}
				applyEdit(edits.addServes(source, context, host.name));
				return;
			}

			const subdomain = a.kind === 'subdomain' ? a : b.kind === 'subdomain' ? b : null;
			const domain = a.kind === 'domain' ? a : b.kind === 'domain' ? b : null;

			if (subdomain && domain) {
				if (subdomain.parent === domain.id) {
					setNote({
						kind: 'warn',
						text: `"${subdomain.name}" already divides "${domain.name}".`,
					});
					return;
				}
				applyEdit(edits.reparent(source, document_, subdomain, domain));
				return;
			}

			setNote({
				kind: 'warn',
				text:
					a.kind === 'domain' && b.kind === 'domain'
						? 'Domains do not relate to each other. A domain is divided into subdomains, and the relationships worth drawing run between bounded contexts.'
						: `A ${a.kind} and a ${b.kind} have no edge in this format. Relationships run context to context; membership runs context to subdomain, or subdomain to domain.`,
			});
		},
		[applyEdit, document_, source, stale],
	);

	/*
	 * Select a relationship that does not exist yet.
	 *
	 * A relationship's id carries the offset of its pattern token, which is not
	 * knowable until the text has been parsed — unlike a node's, which is its
	 * name. So the pair is remembered and claimed on the far side of the parse.
	 */
	const wanted = useRef<{ from: string; to: string } | null>(null);
	useEffect(() => {
		const pair = wanted.current;
		if (!pair) return;
		const found = document_.edges.find(
			(edge) =>
				edge.kind === 'relationship' && edge.from === pair.from && edge.to === pair.to,
		);
		if (!found) return;
		wanted.current = null;
		setSelected(found.id);
	}, [document_]);

	/**
	 * Write the picture the graph just drew.
	 *
	 * The graph hands over a finished string rather than being asked for its
	 * element: the serialising is the canvas's business — it owns the DOM and
	 * knows which frame is the exportable one — and the filename and the
	 * download are this component's, which is where every other file the mapper
	 * writes comes from.
	 */
	const exportSvg = useCallback(
		(svg: string) => {
			downloadText(svgFilenameFor(document_.title), svg, 'image/svg+xml;charset=utf-8');
		},
		[document_.title],
	);

	/**
	 * Export: the map and its sidecar, in one gesture.
	 *
	 * Two files because the map *is* two files — `insurance.ddd` and
	 * `insurance.dddview`, the same pair the store keeps and the same stem — and
	 * an export that wrote only the first would hand somebody a map that redraws
	 * to the computed layout, silently dropping an arrangement they had worked
	 * out. The sidecar goes out even when nothing has been dragged: an empty one
	 * costs nothing and means an export is always the same two files rather than
	 * one or two depending on history.
	 *
	 * The picture is not here. It belongs to the canvas — it is a copy of the
	 * live tree rather than a second renderer — and it stays where the thing it
	 * copies is, on the canvas's own toolbar.
	 */
	const exportMap = useCallback(() => {
		downloadText(filenameFor(document_.title), source);

		const sidecar = serializeView({
			positions: { ...positions },
			curves: { ...curves },
			map: document_.title,
		});
		window.setTimeout(() => downloadText(viewFilenameFor(document_.title), sidecar), DOWNLOAD_GAP_MS);
	}, [document_.title, source, positions, curves]);

	const saveLayout = useCallback(() => {
		downloadText(
			viewFilenameFor(document_.title),
			serializeView({ positions: { ...positions }, curves: { ...curves }, map: document_.title }),
		);
	}, [document_.title, positions, curves]);

	/**
	 * Everything that has to be true before the model page opens.
	 *
	 * The two pages are two documents with different lifetimes — a map covers
	 * many contexts, a model is the inside of exactly one — and this is the seam
	 * between them. It carries the *name*, because the name is the identity in
	 * both formats and is what lets one document be checked against the other
	 * without either holding a pointer into it.
	 *
	 * A model already written for this context is left exactly as it is: the
	 * store is keyed by name, so the other tab opening `risk-appetite.ddm` finds
	 * its arrangement too. Only when there is nothing there is a stub written —
	 * from the map's own knowledge of the context, which is the one moment that
	 * knowledge is to hand, and the reason the seeding lives on this side.
	 *
	 * Returns the address, so the caller that has to open a tab itself can.
	 */
	const prepareModel = useCallback(
		(id: string): string | null => {
			const node = document_.nodes.find((candidate) => candidate.id === id);
			// A domain and a subdomain have no inside to open. Nothing happens, and
			// nothing needs to be said about it: the gesture does not apply.
			if (node?.kind !== 'context') return null;

			// The map is written out before the other tab exists, not because this
			// one is going anywhere — it is not — but because both tabs now share
			// one store, and the model page reads the map's keys on the way in.
			// A line typed a moment ago should be there when it looks.
			saveText(keys.doc, source);
			saveMapView(keys.view, mapName, { positions, curves });
			rememberMap(mapName);

			const model = modelKeys(node.name);
			if (loadText(model.doc) === null) {
				saveText(model.doc, seedModel(node.name, node.aggregates));
			}
			rememberModel(node.name);
			return modelHref(node.name);
		},
		[document_, keys, mapName, source, positions, curves],
	);

	/**
	 * The double click's way in.
	 *
	 * A new tab rather than this one, and the same tab the inspector's link
	 * opens: the map is where you were, and going one level in to look at a
	 * context is not usually leaving. `noopener` because the other tab has no
	 * business reaching back into this one — they talk through the store, which
	 * is the only channel either of them should have.
	 */
	const openModel = useCallback(
		(id: string) => {
			const href = prepareModel(id);
			if (href) window.open(href, '_blank', 'noopener');
		},
		[prepareModel],
	);

	const loadLayout = async (file: File | undefined) => {
		if (!file) return;
		const result = parseView(await readTextFile(file), document_.title);
		clearFileInput(viewInput.current);

		if (!result.ok) {
			setNote({ kind: 'error', text: result.error });
			return;
		}
		setPositions(result.view.positions);
		setCurves(result.view.curves);
		setNote(result.warning ? { kind: 'warn', text: result.warning } : null);
	};

	const onOpen = async (file: File | undefined) => {
		if (!file) return;
		renamed.current = false;
		applyEdit(await readTextFile(file));
		setSelected(null);
		// A different map's boxes are not this map's boxes. Keeping the overrides
		// would scatter the new one across positions computed for the old.
		setPositions({});
		setCurves({});
		clearFileInput(fileInput.current);
	};

	return (
		<div
			ref={root}
			className={
				fullscreen
					? 'flex h-screen flex-col overflow-hidden bg-white dark:bg-night'
					: 'flex h-[calc(100vh-15rem)] min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-700'
			}
		>
			<div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
				<MapTitle
					title={document_.title}
					stale={stale}
					onRename={(next) => {
						renamed.current = true;
						applyEdit(edits.setTitle(source, document_, next));
					}}
				/>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					{counts.subdomains} subdomains · {counts.contexts} contexts · {counts.relationships}{' '}
					relationships
				</span>

				<span className="ml-auto flex flex-wrap items-center gap-2">
					{/* The layout picker leads the group, because it decides what the
					    other buttons are even acting on. */}
					<span role="group" aria-label="Panels" className="flex items-center gap-1">
						{PANE_CHOICES.map((choice) => (
							<IconButton
								key={choice.panes}
								label={choice.label}
								pressed={panes === choice.panes}
								onClick={() => {
									setPanes(choice.panes);
									savePanes(choice.panes);
								}}
							>
								<Icon name={choice.icon} />
							</IconButton>
						))}
					</span>

					{saveFailed && (
						<span className="text-xs text-amber-700 dark:text-amber-400">
							Not saving in this browser
						</span>
					)}
					<IconButton label="Open a .ddd map" onClick={() => fileInput.current?.click()}>
						<Icon name="open" />
					</IconButton>
					<IconButton
						label="Export this map: a .ddd file and its .dddview sidecar"
						onClick={exportMap}
					>
						<Icon name="export" />
					</IconButton>
					<IconButton
						label="What this browser is holding"
						onClick={() => setShowStore(true)}
					>
						<Icon name="store" />
					</IconButton>
					<IconButton
						label="Replace with the sample map"
						onClick={() => {
							applyEdit(SAMPLE);
							setSelected(null);
							setPositions({});
							setCurves({});
						}}
					>
						<Icon name="sample" />
					</IconButton>
					<IconButton
						label={`Graph theme: ${theme ?? 'following the page'}. Shift-click to follow the page.`}
						onClick={(event) => {
							// Shift-click hands the graph back to the page, because a
							// three-way button whose third state is invisible is one
							// nobody can predict.
							const next: GraphTheme | null = event.shiftKey
								? null
								: theme === 'dark'
									? 'light'
									: 'dark';
							setTheme(next);
							saveTheme(next);
						}}
					>
						<Icon name={theme === 'dark' ? 'theme-dark' : theme === 'light' ? 'theme-light' : 'theme-auto'} />
					</IconButton>
				</span>

				<input
					ref={fileInput}
					type="file"
					accept={DDD_ACCEPT}
					onChange={(event) => void onOpen(event.target.files?.[0])}
					className="hidden"
				/>
				<input
					ref={viewInput}
					type="file"
					accept={VIEW_ACCEPT}
					onChange={(event) => void loadLayout(event.target.files?.[0])}
					className="hidden"
				/>
			</div>

			{/* The legend explains the map's colours, so it goes when the map does. */}
			{showStore && <StoreState current={keys.doc} onClose={() => setShowStore(false)} />}

			{panes !== 'source' && <Legend theme={theme} />}

			{note && (
				<p
					className={
						note.kind === 'error'
							? 'flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
							: 'flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
					}
				>
					<span className="grow">{note.text}</span>
					<button
						type="button"
						onClick={() => setNote(null)}
						aria-label="Dismiss"
						className="shrink-0 font-semibold"
					>
						✕
					</button>
				</p>
			)}

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				{/* Editor first in the DOM, and first when stacked: on a narrow
				    viewport this is a thing you read, and the text is the source. */}
				{panes !== 'graph' && (
					<section
						aria-label="Source"
						className={`flex min-h-0 flex-col ${
							panes === 'both'
								? 'border-b border-slate-200 lg:border-r lg:border-b-0 dark:border-slate-800'
								: 'flex-1'
						}`}
						/* The split is a proportion between two panes and means nothing
						   to one, which grows instead — and the stored percentage is left
						   alone, so coming back to two restores the proportions. */
						style={panes === 'both' ? { flexBasis: `${split}%` } : undefined}
					>
						<div className="min-h-0 flex-1 overflow-auto">
							<Editor
								value={source}
								onChange={setSource}
								problems={problems}
								revealLine={revealLine}
							/>
						</div>
						<ProblemList
							problems={problems}
							onReveal={reveal}
							collapsed={collapsed}
							onToggle={() => setCollapsed((value) => !value)}
						/>
					</section>
				)}

				{panes === 'both' && (
					<Divider
						onMove={(percent) => {
							setSplit(percent);
							saveSplit(percent);
						}}
					/>
				)}

				{panes !== 'source' && (
					<section
						aria-label="Context map"
						data-theme={theme ?? undefined}
						className="relative min-h-0 flex-1 bg-white text-ink dark:bg-night dark:text-slate-100"
					>
						<Graph
							document={document_}
							layout={layout}
							stale={stale}
							selected={selected}
							onSelect={setSelected}
							positions={positions}
							onPositions={setPositions}
							curves={curves}
							onCurves={setCurves}
							onFullscreen={toggleFullscreen}
							fullscreen={fullscreen}
							onSaveLayout={saveLayout}
							onLoadLayout={() => viewInput.current?.click()}
							onAdd={addNode}
							canAdd={canAdd}
							onConnect={connect}
							onExportSvg={exportSvg}
							onOpenNode={openModel}
						/>
						<Inspector
							document={document_}
							selected={selected}
							onSource={applyEdit}
							onReveal={reveal}
							onClose={() => setSelected(null)}
							setPattern={setPattern}
							setClassification={setClassification}
							removeRelationship={removeRelationship}
							renameNode={renameNode}
							setField={setField}
							setList={setList}
							setEdgeField={setEdgeField}
							removeNode={removeNode}
							removeServes={removeServes}
							onOpenModel={prepareModel}
							focusName={fresh !== null && fresh === selected}
						/>
					</section>
				)}
			</div>
		</div>
	);
}

/**
 * The map's name, edited in place.
 *
 * An input that looks like a heading until you touch it, rather than a heading
 * with a pencil next to it: the title is one short string and a mode to change
 * it costs more than it saves. Tab reaches it, which a click-to-edit heading
 * would not.
 *
 * The draft is local and commits on Enter or blur, because every commit is a
 * splice into the source that reparses on a debounce — a controlled input fed
 * from the parsed document would show the visitor their own keystrokes
 * arriving a quarter-second late and out of order. Escape abandons the draft,
 * and the flag is a ref because the blur that follows it runs with the
 * pre-Escape render's closure.
 *
 * Read-only while the text is unparsed. The title's span was measured in the
 * last document that parsed, and splicing it into text that has moved on since
 * would write the new name at an offset that is no longer the title.
 */
function MapTitle({
	title,
	stale,
	onRename,
}: {
	title: string;
	stale: boolean;
	onRename: (to: string) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const abandoned = useRef(false);

	const commit = () => {
		const pending = draft;
		setDraft(null);
		if (abandoned.current) {
			abandoned.current = false;
			return;
		}
		if (pending === null) return;
		const next = pending.trim();
		// An empty name would take the export filename with it, and a rename to
		// the same name is not a rename. Both put the heading back.
		if (next === '' || next === title) return;
		onRename(next);
	};

	const shown = draft ?? title;

	return (
		<input
			value={shown}
			/*
			 * As long as the name is, rather than a fixed width: map names run from
			 * two words to a sentence, and a field that fits "Claims" wastes the bar
			 * on every other map while a field that fits the sample's thirty-two
			 * characters is a trench next to a short one. `size` counts characters
			 * and works everywhere, which `field-sizing: content` does not yet.
			 *
			 * The floor keeps an empty draft from collapsing to a sliver you cannot
			 * click back into; the ceiling and `max-w` keep a pasted paragraph from
			 * pushing the buttons off the bar.
			 */
			size={Math.min(44, Math.max(12, shown.length + 1))}
			readOnly={stale}
			aria-label="Map name"
			title={stale ? 'The map is renamed once the source parses again' : 'Rename the map'}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
				if (event.key === 'Escape') {
					abandoned.current = true;
					setDraft(null);
					event.currentTarget.blur();
				}
			}}
			className={`mr-1 max-w-[40vw] min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-semibold ${
				stale
					? 'cursor-default'
					: 'hover:border-slate-300 focus:border-brand focus:bg-white focus:outline-none dark:hover:border-slate-600 dark:focus:bg-slate-800'
			}`}
		/>
	);
}

/** The drag handle. Keyboard-operable, because a mouse-only split is a trap. */
function Divider({ onMove }: { onMove: (percent: number) => void }) {
	const dragging = useRef(false);

	useEffect(() => {
		const move = (event: PointerEvent) => {
			if (!dragging.current) return;
			const percent = (event.clientX / window.innerWidth) * 100;
			onMove(Math.min(75, Math.max(20, percent)));
		};
		const up = () => {
			dragging.current = false;
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
	}, [onMove]);

	return (
		<div
			role="separator"
			aria-label="Resize panels"
			aria-orientation="vertical"
			tabIndex={0}
			onPointerDown={() => {
				dragging.current = true;
			}}
			onKeyDown={(event) => {
				if (event.key === 'ArrowLeft') onMove(30);
				if (event.key === 'ArrowRight') onMove(60);
			}}
			className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-brand focus-visible:bg-brand focus-visible:outline-none lg:block dark:bg-slate-800"
		/>
	);
}
