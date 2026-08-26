/**
 * The domain model island.
 *
 * The mapper's shape, deliberately: one piece of state that matters — `source`,
 * a string — with the document, the problems, the placement and the diagram all
 * derived from it. The parse is debounced and a failed one keeps the previous
 * model on screen, dimmed, because a file is unparseable for most of the time
 * somebody is typing in it.
 *
 * It is a **separate island from the mapper rather than a second tab inside
 * it**, and that is the important decision. The two documents have different
 * lifetimes: a `.ddd` map covers many contexts, a `.ddm` model is the inside of
 * exactly one. Sharing an island would mean one component owning two sources of
 * truth, which is the thing this whole component was written to refuse.
 *
 * What they *do* share is the desk. The theme, the split and which panes are
 * showing live in one place in `storage.ts` for both, because "text on the left,
 * picture pinned light" is a fact about the person rather than about either
 * document — and making them choose twice would be the two pages admitting they
 * are two programs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse } from '../../lib/ddm/parser';
import * as edits from '../../lib/ddm/edit';
import { format as formatSource } from '../../lib/format';
import { SAMPLE } from '../../lib/ddm/sample';
import { layout as computePlacement, type Placement, type Positions } from '../../lib/ddm/layout';
import type {
	AggregateNode,
	DomainModel,
	Link,
	LinkKind,
	Member,
	MemberKind,
} from '../../lib/ddm/model';
import type { Problem } from '../../lib/ddd/problems';
import {
	clearFileInput,
	downloadText,
	readTextFile,
	slug,
	SVG_EXTENSION,
} from '../../lib/files';
import {
	forget,
	lastModel,
	loadModelView,
	loadLegend,
	loadPanes,
	loadSplit,
	loadText,
	loadTheme,
	modelKeys,
	rememberModel,
	saveModelView,
	saveLegend,
	savePanes,
	saveSplit,
	saveText,
	saveTheme,
	takeLegacyModel,
	type DocumentKeys,
	type GraphTheme,
	type Panes,
} from '../../lib/storage';
import { freshModel, seedModel } from '../../lib/ddm/seed';
import { serializeModelView } from '../../lib/view-file';
import Editor from '../mapper/Editor';
import StoreState from '../ui/StoreState';
import Inspector from './Inspector';
import EmptyState from '../ui/EmptyState';
import { Legend } from './Legend';
import Icon, { type IconName } from '../mapper/Icon';
import ProblemList from '../mapper/ProblemList';
import IconButton from '../ui/IconButton';
import { useFullscreen } from '../../lib/fullscreen';
import Diagram from './Diagram';
import type { AddChoice } from '../mapper/CanvasBar';

const DEBOUNCE_MS = 250;

/** Said whenever a gesture is refused because the text has not parsed. */
const STALE =
	'The source has not parsed since the last change, so the spans a gesture would edit are the previous document’s. Fix the errors and the tools come back.';

/** The textarea this island writes into. See `Editor`'s `label`. */
const SOURCE_LABEL = 'Model source';

/**
 * What a class is called a second after it exists.
 *
 * Placeholders, and obviously so — the inspector opens with the name selected,
 * and the first keystroke replaces it. The map's `NEW_NAME`, one level down.
 */
const NEW_MEMBER: Record<MemberKind, string> = {
	entity: 'New entity',
	value: 'New value',
	enum: 'New enumeration',
};

const MODEL_EXTENSION = '.ddm';
const MODEL_ACCEPT = '.ddm,text/plain';
/** The layout sidecar. See src/lib/view-file.ts for why it is a separate file. */
const MODEL_VIEW_EXTENSION = '.ddmview';

/**
 * How far apart the exported files are handed to the browser.
 *
 * Two downloads from one click, and browsers that treat two anchor clicks in
 * the same task as one gesture drop the second. Spacing them is the only
 * reliable answer; a quarter of a second is under notice and well clear of the
 * coalescing window.
 */
const DOWNLOAD_GAP_MS = 250;

/** Parsed once, so the initial model and the initial key agree. */
const SEED = parse(SAMPLE).document;

/**
 * Nothing at all, as a document.
 *
 * The sample used to be what an empty visit rendered, and it was the wrong
 * default for the same reason a word processor does not open onto somebody
 * else's letter: it puts a document you did not write where yours goes, and
 * every visit begins by clearing it. It is still one click away — see the empty
 * state — and now it arrives because it was asked for.
 */
const EMPTY: DomainModel = {
	context: '',
	contextSpan: { start: 0, end: 0, line: 1, column: 1 },
	aggregates: [],
	members: [],
	links: [],
	source: '',
};

interface Arrival {
	readonly name: string;
	readonly source: string;
	readonly document: DomainModel;
	readonly positions: Positions;
	readonly keys: DocumentKeys;
	/** True when this is the sample rather than anything the visitor has. */
	readonly fresh: boolean;
}

/**
 * Which model this visit is about, decided **before the first render**.
 *
 * Three ways in, in order of how explicitly they were asked for:
 *
 *   `?context=Claims`   a link from the map, or one somebody pasted. The name
 *                       in the URL wins over anything remembered: it is the
 *                       request.
 *   the pointer         no URL, so the last model worked on.
 *   the sample          neither, or a name with nothing stored and no link that
 *                       asked for it.
 *
 * This used to run in a mount effect, and the cost was visible: the page
 * painted the *sample* — text, diagram and all — and then replaced it a frame
 * later with what the visitor had actually asked for. Arriving from the map on
 * a context with no model yet, the swap was sample-then-four-lines-of-stub,
 * which reads exactly like the editor clearing itself.
 *
 * Reading the store during render is safe here and only here: the page is a
 * `client:only` island, so this never runs on the server, and every branch
 * below only *reads*. The one branch that writes — taking the legacy keys,
 * which deletes them — stays in an effect, where running twice cannot cost
 * anybody their work.
 */
function arrival(): Arrival {
	const asked = new URLSearchParams(window.location.search).get('context');
	const name = asked ?? lastModel();

	if (name) {
		const keys = modelKeys(name);
		const stored = loadText(keys.doc);
		// An entry that exists but is empty is not a document. It cannot be
		// parsed, it would autosave itself back over the key, and it is the one
		// thing a half-finished write can leave behind — so it falls through to
		// the stub rather than opening as a blank editor.
		if (stored) {
			return { name, source: stored, document: documentOf(stored), positions: loadModelView(keys.view), keys, fresh: false };
		}
		if (asked !== null) {
			// Asked for by name with nothing stored: a context whose model has not
			// been written yet, reached by a link the map did not seed — pasted, or
			// typed. The stub is the map's, minus what only the map knows.
			const seed = seedModel(asked, []);
			return { name: asked, source: seed, document: documentOf(seed), positions: {}, keys, fresh: false };
		}
	}

	return { name: '', source: '', document: EMPTY, positions: {}, keys: modelKeys(''), fresh: true };
}

/** The parse, or nothing if the text does not parse. */
function documentOf(text: string): DomainModel {
	const result = parse(text);
	return result.ok ? result.document : EMPTY;
}

/**
 * What the far end of a drawn link is, and which of the three links it makes.
 *
 * `contains` and `embeds` stay inside one boundary; `references` crosses one.
 * That is the whole table, and each refusal below is a rule of the format
 * rather than a limitation of the gesture — so each one says the rule.
 */
function resolve(
	document: DomainModel,
	toId: string,
	from: Member,
): { kind: LinkKind; id: string; name: string; note: string | null } | { why: string } {
	const aggregate = document.aggregates.find((candidate) => candidate.id === toId);

	if (aggregate) {
		if (aggregate.id === from.aggregate) {
			return {
				why: `"${from.name}" already belongs to "${aggregate.name}" — a member does not reference its own aggregate.`,
			};
		}
		return { kind: 'references', id: aggregate.id, name: aggregate.name, note: null };
	}

	const target = document.members.find((candidate) => candidate.id === toId);
	if (!target) return { why: 'That is not something a link can point at.' };

	// Inside another boundary: not a target, but its aggregate is. Retargeted
	// rather than refused, and said out loud — the rule is worth learning and
	// the gesture meant something.
	if (target.aggregate !== null && target.aggregate !== from.aggregate) {
		const owner = document.aggregates.find((candidate) => candidate.id === target.aggregate);
		if (!owner) return { why: `"${target.name}" is inside an aggregate this model cannot find.` };
		return {
			kind: 'references',
			id: owner.id,
			name: owner.name,
			note: `Drawn to "${owner.name}" rather than to "${target.name}": you hold an aggregate's identity, never its parts. Reaching past a root is how a boundary stops being one.`,
		};
	}

	// Everything past here is inside the same boundary — the branch above caught
	// the rest — and an entity is only ever declared inside one, so a shared
	// class never reaches this point with an entity in front of it.
	//
	// An entity has identity, so it is owned. A value or an enumeration has
	// none, so it is copied rather than shared. That distinction is the reason
	// there are two keywords instead of one.
	return target.kind === 'entity'
		? { kind: 'contains', id: target.id, name: target.name, note: null }
		: { kind: 'embeds', id: target.id, name: target.name, note: null };
}

/** Whitespace and comments are not a model. */
function blank(source: string): boolean {
	return source.trim() === '';
}

export default function ModelEditor() {
	// Computed once, on the first render, and never again.
	const [start] = useState(arrival);
	const [source, setSource] = useState(start.source);
	const [document_, setDocument] = useState<DomainModel>(start.document);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [stale, setStale] = useState(false);
	const [placement, setPlacement] = useState<Placement | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [split, setSplit] = useState(42);
	const [panes, setPanes] = useState<Panes>('both');
	/**
	 * The notation row. Shown until somebody says otherwise — see `loadLegend`.
	 *
	 * It has no bearing on the source pane, so the button stays live even with
	 * the graph hidden: the answer is about what the panel shows when it is
	 * showing, exactly as the split percentage survives a single pane.
	 */
	const [legend, setLegend] = useState(true);
	const [theme, setTheme] = useState<GraphTheme | null>(null);
	const [positions, setPositions] = useState<Positions>(start.positions);
	const [saveFailed, setSaveFailed] = useState(false);
	const [note, setNote] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);
	/** The id of a box created a moment ago, whose name is still a placeholder. */
	const [fresh, setFresh] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const { root, fullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
	/**
	 * The name the model's entries are stored under: the context it is the
	 * inside of, which is what it would be called on disk.
	 *
	 * Not `document_.context` directly, for the mapper's reason — a source that
	 * does not parse leaves `document_` describing the previous model, and this
	 * one's text must not be written under that one's key.
	 */
	const [modelName, setModelName] = useState(start.name);
	/** `<modelName>.ddm` and `<modelName>.ddmview`. */
	const keys = useMemo(() => modelKeys(modelName), [modelName]);
	const keysRef = useRef<DocumentKeys | null>(start.keys);
	/**
	 * The document key a load is heading for, or null when nothing is loading.
	 *
	 * The effect that moves entries cannot tell a load from a rename on its own,
	 * because both end with the name changing — and read wrong it does real
	 * damage: it copies the arriving document onto the departing one's key and
	 * deletes the original. So every way a different model arrives *after the
	 * first render* — Open, and the legacy migration — says where it is going,
	 * and that effect stands down until `keys` gets there.
	 *
	 * The way in from the map needs none of this any more: `arrival()` settles
	 * the name during the first render, so there is no gap between mounting and
	 * knowing to be misread.
	 */
	const loading = useRef<string | null>(null);
	/** The store panel. Read-only, and read fresh each time it opens. */
	const [showStore, setShowStore] = useState(false);

	useEffect(() => {
		migrate();
		setTheme(loadTheme());
		const storedSplit = loadSplit();
		if (storedSplit !== null) setSplit(storedSplit);
		const storedPanes = loadPanes();
		if (storedPanes !== null) setPanes(storedPanes);
		const storedLegend = loadLegend();
		if (storedLegend !== null) setLegend(storedLegend);
	}, []);

	/**
	 * The one part of arriving that cannot happen during a render: the legacy
	 * keys, whose reading deletes them.
	 *
	 * Only reachable on a first visit since the store stopped being one slot per
	 * page, and only when nothing else claimed this visit — a URL or a pointer
	 * means the visitor has moved on and whatever is under the old keys is a
	 * copy of something already migrated.
	 */
	function migrate(): void {
		if (!start.fresh) return;

		const legacy = takeLegacyModel();
		if (!legacy) return;

		// Parsed now rather than waited for: the name is what the key is made of,
		// and the effect that moves entries has to be told where this load is
		// going before the debounced parse could tell it.
		const parsed = parse(legacy.source);
		loading.current = parsed.ok ? modelKeys(parsed.document.context).doc : null;
		setSource(legacy.source);
		setPositions(legacy.positions);
	}

	/**
	 * The browser tab says which context this is. See `DddMapper`'s.
	 *
	 * `· model` rather than nothing, because the map tab next to it is a `· map`
	 * and the two names can be the same word: a context called Billing has a
	 * model, and a map of Billing is a different document.
	 */
	useEffect(() => {
		window.document.title = document_.context
			? `${document_.context} · model — DDD mapper`
			: 'Domain model — DDD mapper';
	}, [document_.context]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			// An empty editor is not a broken model. Parsing it would report that a
			// model starts with `model`, which is true, unhelpful, and the first
			// thing a visitor would see on an empty page.
			if (blank(source)) {
				setProblems([]);
				setDocument(EMPTY);
				setStale(false);
				return;
			}

			const result = parse(source);
			setProblems(result.problems);
			if (result.ok) {
				setDocument(result.document);
				setModelName(result.document.context);
				setStale(false);
			} else {
				setStale(true);
			}
		}, DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [source]);

	useEffect(() => {
		// An empty editor writes nothing. There is no document to name, the key it
		// would take is the fallback slug, and an empty entry is precisely what
		// `arrival` refuses to open — so saving one would be the store creating
		// the anomaly the reader is written to survive.
		if (blank(source)) return;

		const timer = window.setTimeout(() => {
			setSaveFailed(!saveText(keys.doc, source));
			rememberModel(modelName);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [source, keys.doc, modelName]);

	useEffect(() => {
		if (blank(source)) return;

		const timer = window.setTimeout(() => saveModelView(keys.view, modelName, { ...positions }), 400);
		return () => window.clearTimeout(timer);
	}, [positions, keys.view, modelName, source]);

	/**
	 * Renaming the context moves the entries; opening another model leaves them.
	 *
	 * The model has no title field of its own — the name is edited in the source
	 * — so the two are told apart by where the new text came from: `onOpen` says
	 * so, and everything else is the visitor typing in the context's name.
	 */
	useEffect(() => {
		const previous = keysRef.current;
		keysRef.current = keys;

		// A load in flight is never a rename. The entries under the old name
		// belong to a document that still exists and that nobody asked to move.
		if (loading.current !== null) {
			if (loading.current === keys.doc) loading.current = null;
			return;
		}

		if (!previous || previous.doc === keys.doc) return;

		const carried = loadText(previous.doc);
		if (carried !== null) saveText(keys.doc, carried);
		saveModelView(keys.view, modelName, loadModelView(previous.view));
		forget(previous);
	}, [keys, modelName]);

	/*
	 * ELK is asynchronous and a stale answer must not win.
	 *
	 * Typing fast enough produces overlapping layout runs, and the one that
	 * started first can finish last — which would put an older arrangement on
	 * screen than the text describes. The token makes the late one drop its
	 * result.
	 */
	const run = useRef(0);
	useEffect(() => {
		const token = (run.current += 1);
		void computePlacement(document_).then((next) => {
			if (run.current === token) setPlacement(next);
		});
	}, [document_]);

	/**
	 * Apply a panel gesture.
	 *
	 * `DddMapper`'s, and for its reason: the edit goes through the textarea
	 * rather than through `setSource`, so the browser records it on the
	 * textarea's own undo stack and ⌘Z takes back an invariant exactly as it
	 * takes back a keystroke. `execCommand` is deprecated and is still the only
	 * way to write into a textarea undoably; the fallback keeps the edit and
	 * loses only the undo entry.
	 */
	const applyEdit = useCallback((next: string) => {
		const area = window.document.querySelector<HTMLTextAreaElement>(
			`textarea[aria-label="${SOURCE_LABEL}"]`,
		);
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
	 * Splice one of an aggregate's fields.
	 *
	 * Refused when the text does not parse, like every gesture that edits a
	 * span: a span is an offset into a document, and there is no document. The
	 * panel says so rather than doing nothing, because a control that silently
	 * declines is a control people stop believing in.
	 *
	 * The parse happens **here**, on the text as it stands, rather than reusing
	 * the debounced `document_`. A quarter of a second is a long time in a panel
	 * where one human gesture makes two edits — committing a box by clicking the
	 * ✕ on the invariant below it is a blur and then a click, no pause between
	 * them — and the second edit would otherwise be splicing the first edit's
	 * output at offsets taken from the document before it. Re-parsing costs a
	 * millisecond on a file this size, and it is the only way the offsets are
	 * about the string being spliced.
	 */
	const onAggregate = useCallback(
		(
			aggregate: AggregateNode,
			edit: (source: string, document: DomainModel, current: AggregateNode) => string,
		) => {
			const parsed = parse(source);
			// The aggregate is found again by id rather than trusted from the
			// panel's props, for the same reason: its spans came from a render that
			// may be one edit behind. The id is made of the name, so this is the
			// same aggregate or it is gone.
			const current = parsed.ok
				? parsed.document.aggregates.find((candidate) => candidate.id === aggregate.id)
				: undefined;

			if (!current) {
				setNote({ kind: 'error', text: STALE });
				return;
			}

			applyEdit(edit(source, parsed.document, current));
		},
		[applyEdit, source],
	);

	/**
	 * Tidy the source: indentation, and nothing that moves a token.
	 *
	 * The map's, exactly — see `DddMapper`. Not refused while the text fails to
	 * parse, because a document full of errors is when somebody reaches for it;
	 * refused only when it will not lex, because then there is no line structure
	 * left to trust. Through `applyEdit`, so ⌘Z takes the reformat back whole.
	 */
	const format = useCallback(() => {
		const tidied = formatSource(source);
		if (tidied === null) {
			setNote({
				kind: 'error',
				text: 'The source will not tokenise — an unterminated string, most likely — so there is no line structure to indent. The problems panel says where.',
			});
			return;
		}
		if (tidied !== source) applyEdit(tidied);
	}, [applyEdit, source]);

	// A placeholder name stops being one the moment the selection moves off it.
	useEffect(() => {
		if (fresh !== null && fresh !== selected) setFresh(null);
	}, [fresh, selected]);

	// A selection that no longer exists — renamed or deleted in the text — must
	// not leave the inspector describing something that is gone.
	useEffect(() => {
		if (!selected) return;
		const exists =
			document_.aggregates.some((a) => a.id === selected) ||
			document_.members.some((m) => m.id === selected) ||
			document_.links.some((l) => l.id === selected);
		if (!exists) setSelected(null);
	}, [document_, selected]);

	/**
	 * The declaration the selection points at, whichever kind it is.
	 *
	 * A member box and an aggregate boundary are both selectable and their ids
	 * are in the same string space, so one lookup answers both — and the two
	 * answers are what every gesture below branches on.
	 */
	const selectedAggregate = useMemo(
		() => document_.aggregates.find((candidate) => candidate.id === selected) ?? null,
		[document_, selected],
	);
	const selectedMember = useMemo(
		() => document_.members.find((candidate) => candidate.id === selected) ?? null,
		[document_, selected],
	);

	/** The boundary a new class would land in: the selection, or the one it is in. */
	const host = useMemo((): AggregateNode | null => {
		if (selectedAggregate) return selectedAggregate;
		if (!selectedMember?.aggregate) return null;
		return document_.aggregates.find((a) => a.id === selectedMember.aggregate) ?? null;
	}, [document_, selectedAggregate, selectedMember]);

	/**
	 * The four things this canvas makes, and why a button is off.
	 *
	 * An **entity** needs a boundary and says so: it belongs to exactly one
	 * aggregate, which is what makes "this class is inside that consistency
	 * boundary" structural rather than a rule that can drift.
	 *
	 * A **value object** and an **enumeration** do not. With nothing selected
	 * they are declared at model level — *shared*, which is a real answer and
	 * not a missing one: a value used in two aggregates belongs to neither, and
	 * the sample's `Money` is exactly that. So those two buttons stay live with
	 * an empty selection, and what they make depends on it. The tooltip says
	 * which, because a button that quietly does two things is one nobody trusts.
	 */
	const adds = useMemo(
		(): readonly AddChoice[] => [
			{
				kind: 'aggregate',
				icon: 'add-aggregate',
				label: 'Add an aggregate and the root you reach it through',
				why: stale ? STALE : null,
			},
			{
				kind: 'entity',
				icon: 'add-entity',
				label: host ? `Add an entity to "${host.name}"` : 'Add an entity',
				why: stale
					? STALE
					: host
						? null
						: 'Select an aggregate first — an entity belongs to exactly one boundary',
			},
			{
				kind: 'value',
				icon: 'add-value',
				label: host
					? `Add a value object to "${host.name}"`
					: 'Add a value object, shared across the aggregates',
				why: stale ? STALE : null,
			},
			{
				kind: 'enum',
				icon: 'add-enum',
				label: host
					? `Add an enumeration to "${host.name}"`
					: 'Add an enumeration, shared across the aggregates',
				why: stale ? STALE : null,
			},
		],
		[host, stale],
	);

	/**
	 * Make something, and select it before it exists.
	 *
	 * The id is derived from the name — `entity:Order` — so it can be selected
	 * on this side of the parse that will produce it, which is the map's trick
	 * and is what lets the inspector open on the new box with its name ready to
	 * be typed over.
	 */
	const add = useCallback(
		(chosen: string) => {
			const parsed = parse(source);
			if (!parsed.ok) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			const document = parsed.document;

			if (chosen === 'aggregate') {
				const name = edits.unusedName(document, 'New aggregate');
				applyEdit(edits.addAggregate(source, document, name));
				setFresh(`aggregate:${name}`);
				setSelected(`aggregate:${name}`);
				return;
			}

			const kind = chosen as MemberKind;
			if (kind === 'entity' && !host) return;
			// Found again in the fresh parse, for `onAggregate`'s reason: the one
			// in the closure carries spans from a render that may be one edit old.
			const into = host ? (document.aggregates.find((a) => a.id === host.id) ?? null) : null;
			const name = edits.unusedName(document, NEW_MEMBER[kind]);
			applyEdit(edits.addMember(source, document, kind, name, into));
			setFresh(`${kind}:${name}`);
			setSelected(`${kind}:${name}`);
		},
		[applyEdit, host, source],
	);

	/**
	 * What a link drawn from one box to another *means*.
	 *
	 * The gesture is one gesture and the format has three links, so the pair of
	 * ends decides which was drawn — and the three are not decoration, they are
	 * the argument of the whole format:
	 *
	 *   contains    composition inside one boundary. The part has no life of
	 *               its own and is created, saved and deleted with the root.
	 *   embeds      a value object or an enumeration, which has no identity and
	 *               is therefore copied rather than shared.
	 *   references  across a boundary, by identity.
	 *
	 * Two ends need translating before any of that applies. An **aggregate**
	 * resolves to its root, because a link lives in a class's body and the root
	 * is the way in — which is exactly what "the aggregate holds it" means. And
	 * a **class inside another aggregate** resolves to that aggregate, with a
	 * note saying so: you hold an aggregate's identity, never its parts, and
	 * reaching past a root is how a boundary stops being one. Refusing would be
	 * correct and would teach nothing; the map already reads an edge drawn
	 * backwards as the same claim rather than as a mistake.
	 */
	const connect = useCallback(
		(fromId: string, toId: string) => {
			const parsed = parse(source);
			if (!parsed.ok) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			const document = parsed.document;
			const rootOf = (aggregate: AggregateNode) =>
				document.members.find((member) => member.id === aggregate.root) ?? null;

			const fromAggregate = document.aggregates.find((a) => a.id === fromId);
			const from = fromAggregate
				? rootOf(fromAggregate)
				: (document.members.find((m) => m.id === fromId) ?? null);

			if (!from) {
				setNote({
					kind: 'warn',
					text: fromAggregate
						? `"${fromAggregate.name}" has no root yet, and a link is written in the class you reach the aggregate through. Give it one first.`
						: 'That is not something a link can start from.',
				});
				return;
			}

			// An enumeration is a list of values. It has no body to hold a link.
			if (from.kind === 'enum') {
				setNote({
					kind: 'warn',
					text: `"${from.name}" is an enumeration — a closed list of values, which holds nothing. Draw the link from the class that embeds it instead.`,
				});
				return;
			}

			const target = resolve(document, toId, from);
			if ('why' in target) {
				setNote({ kind: 'warn', text: target.why });
				return;
			}

			if (
				document.links.some(
					(link) => link.from === from.id && link.kind === target.kind && link.to === target.id,
				)
			) {
				setNote({ kind: 'warn', text: `"${from.name}" already ${target.kind} "${target.name}".` });
				return;
			}

			applyEdit(edits.addLink(source, document, from, target.kind, target.name, 'one'));
			wanted.current = { from: from.id, to: target.id, kind: target.kind };
			if (target.note) setNote({ kind: 'warn', text: target.note });
		},
		[applyEdit, source],
	);

	/*
	 * Select a link that does not exist yet.
	 *
	 * A link's id carries the offset of the line it was parsed from, which is
	 * not knowable until the text has been re-parsed — unlike a class's, which
	 * is its name. So the pair is remembered and claimed on the far side.
	 */
	const wanted = useRef<{ from: string; to: string; kind: LinkKind } | null>(null);
	useEffect(() => {
		const want = wanted.current;
		if (!want) return;
		const found = document_.links.find(
			(link) => link.from === want.from && link.to === want.to && link.kind === want.kind,
		);
		if (!found) return;
		wanted.current = null;
		setSelected(found.id);
	}, [document_]);

	/** Delete whatever is selected, and everything that would dangle after it. */
	const remove = useCallback(
		(what: AggregateNode | Member | Link) => {
			const parsed = parse(source);
			if (!parsed.ok) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			const document = parsed.document;

			if ('kind' in what && (what.kind === 'contains' || what.kind === 'embeds' || what.kind === 'references')) {
				const link = document.links.find((candidate) => candidate.id === what.id);
				if (link) applyEdit(edits.removeLink(source, document, link));
			} else if ('kind' in what) {
				const member = document.members.find((candidate) => candidate.id === what.id);
				if (member) applyEdit(edits.removeMember(source, document, member));
			} else {
				const aggregate = document.aggregates.find((candidate) => candidate.id === what.id);
				if (aggregate) applyEdit(edits.removeAggregate(source, document, aggregate));
			}
			setSelected(null);
		},
		[applyEdit, source],
	);

	/** Rename a class or a boundary, and every link that names it. */
	const rename = useCallback(
		(what: AggregateNode | Member, to: string) => {
			const parsed = parse(source);
			if (!parsed.ok) {
				setNote({ kind: 'error', text: STALE });
				return;
			}
			const document = parsed.document;

			const taken = [...document.aggregates, ...document.members].some(
				(candidate) => candidate.id !== what.id && candidate.name === to,
			);
			// An aggregate may share its name with its own root and with nothing
			// else — the parser's rule, restated here so the panel refuses before
			// the file has to.
			const twin = 'kind' in what
				? document.aggregates.find((a) => a.root === what.id)?.name === to
				: document.members.find((m) => m.id === (what as AggregateNode).root)?.name === to;

			if (taken && !twin) {
				setNote({
					kind: 'error',
					text: `"${to}" is already the name of something else. The name is the identity in this format — two of them inside one bounded context is the ubiquitous language failing.`,
				});
				return;
			}

			if ('kind' in what) {
				const member = document.members.find((candidate) => candidate.id === what.id);
				if (!member) return;
				applyEdit(edits.renameMember(source, document, member, to));
				setSelected(`${member.kind}:${to}`);
			} else {
				const aggregate = document.aggregates.find((candidate) => candidate.id === what.id);
				if (!aggregate) return;
				applyEdit(edits.renameAggregate(source, document, aggregate, to));
				setSelected(`aggregate:${to}`);
			}
		},
		[applyEdit, source],
	);

	const setIntent = useCallback(
		(aggregate: AggregateNode, text: string) => {
			onAggregate(aggregate, (source_, document, current) =>
				edits.setIntent(source_, document, current, text),
			);
		},
		[onAggregate],
	);

	const setInvariant = useCallback(
		(aggregate: AggregateNode, index: number, text: string) => {
			onAggregate(aggregate, (source_, document, current) =>
				edits.setInvariant(source_, document, current, index, text),
			);
		},
		[onAggregate],
	);

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

	/**
	 * Export: the model and its sidecar, in one gesture.
	 *
	 * The map's pair exactly, one zoom level down — `risk-appetite.ddm` and
	 * `risk-appetite.ddmview`, the same two keys the store holds and the same
	 * stem. Writing only the first would hand somebody a model that redraws to
	 * the computed layout, silently dropping an arrangement they had worked out,
	 * so the sidecar goes out even when nothing has been dragged.
	 *
	 * The picture is not here. It belongs to the canvas — it is a copy of the
	 * live tree rather than a second renderer — and it stays where the thing it
	 * copies is, on the canvas's own toolbar.
	 */
	const exportModel = useCallback(() => {
		const stem = slug(document_.context, 'model');
		downloadText(`${stem}${MODEL_EXTENSION}`, source);

		const sidecar = serializeModelView({ positions: { ...positions }, model: document_.context });
		window.setTimeout(() => downloadText(`${stem}${MODEL_VIEW_EXTENSION}`, sidecar), DOWNLOAD_GAP_MS);
	}, [document_.context, source, positions]);

	/**
	 * Write this model out now, rather than at the end of the debounce.
	 *
	 * `DddMapper`'s twin, for the same moment: the store panel is about to send
	 * this page somewhere else, and the debounce has not fired yet. An empty
	 * editor writes nothing, here as everywhere.
	 */
	const flush = useCallback(() => {
		if (blank(source)) return;
		saveText(keys.doc, source);
		saveModelView(keys.view, modelName, { ...positions });
		rememberModel(modelName);
	}, [keys, modelName, source, positions]);

	/**
	 * Put the example in the editor, by request.
	 *
	 * Flagged as a load rather than left to look like one. The example carries
	 * its own context name, so the keys are about to change — and a change of
	 * name that nobody flags is read as a rename, which would move the entries
	 * of whatever was open onto the example's key.
	 */
	const loadExample = useCallback(() => {
		open_(SAMPLE, SEED.context);
	}, []);

	/**
	 * A model that did not exist a second ago.
	 *
	 * Keeps the context name when there is one — arriving from the map on an
	 * unmodelled context and pressing this means "yes, model *this*", not "give
	 * me something called New model".
	 */
	const startFresh = useCallback(() => {
		const name = document_.context || 'New model';
		open_(freshModel(name), name);
	}, [document_.context]);

	/**
	 * Put a document in the editor, by request, and show both halves of it.
	 *
	 * Flagged as a load rather than left to look like one: the text carries its
	 * own context name, so the keys are about to change, and a change of name
	 * that nobody flags is read as a rename — which would move the entries of
	 * whatever was open onto the new key.
	 *
	 * The panes open because a document nobody can see is not a document. The
	 * notation is what the text is for and the shape is what the picture is for,
	 * and somebody who has just asked for one to exist should not have to go
	 * looking for the other pane.
	 */
	function open_(text: string, name: string): void {
		loading.current = modelKeys(name).doc;
		setSelected(null);
		setPositions({});
		setSource(text);
		setPanes('both');
		savePanes('both');
	}

	const onOpen = async (file: File | undefined) => {
		if (!file) return;
		// Another model is another document: the one on screen keeps its entries
		// under its own name rather than being moved onto this one's. Parsed now
		// to learn where this load is going — the debounced parse would answer a
		// quarter of a second after the question stops mattering.
		const text = await readTextFile(file);
		const parsed = parse(text);
		loading.current = parsed.ok ? modelKeys(parsed.document.context).doc : keys.doc;
		setSource(text);
		setSelected(null);
		setPositions({});
		clearFileInput(fileInput.current);
	};

	const counts = useMemo(
		() => ({
			aggregates: document_.aggregates.length,
			classes: document_.members.length,
			links: document_.links.length,
		}),
		[document_],
	);

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
				{/* An empty editor has no name to show, and a blank space where the
				    title goes reads as a bug rather than as a state. */}
				<strong className="mr-1 truncate">
					{document_.context || <span className="text-ink-muted dark:text-slate-400">No model open</span>}
				</strong>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					{counts.aggregates} aggregates · {counts.classes} classes · {counts.links} links
				</span>

				<span className="ml-auto flex flex-wrap items-center gap-2">
					{/* The map's toolbar, button for button and in its order: the two
					    editors are one tool, and a control that means the same thing
					    should look the same and sit in the same place in both. The
					    layout picker leads, because it decides what the rest are even
					    acting on. */}
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

					{/* Next to the picker that decides which panels show, because it
					    is the same question one row down: what the panel shows. */}
					<IconButton
						label={legend ? 'Hide the legend' : 'Show the legend'}
						pressed={legend}
						onClick={() => {
							setLegend(!legend);
							saveLegend(!legend);
						}}
					>
						<Icon name="legend" />
					</IconButton>

					{saveFailed && (
						<span className="text-xs text-amber-700 dark:text-amber-400">
							Not saving in this browser
						</span>
					)}
					{/* First of the document buttons, because it acts on what you are
					    typing rather than on where the file goes. The map's toolbar
					    has it in the same place, for the same reason. */}
					<IconButton
						label="Format the source: indentation only, nothing moves"
						onClick={format}
					>
						<Icon name="format" />
					</IconButton>
					<IconButton label="Open a .ddm model" onClick={() => fileInput.current?.click()}>
						<Icon name="open" />
					</IconButton>
					<IconButton
						label="Export this model: a .ddm file and its .ddmview sidecar"
						onClick={exportModel}
					>
						<Icon name="export" />
					</IconButton>
					<IconButton label="What this browser is holding" onClick={() => setShowStore(true)}>
						<Icon name="store" />
					</IconButton>
					{/* The same path the empty state's button takes. Setting the source
					    here directly used to skip the load flag, which made replacing
					    this model with the example look like a rename of it — and a
					    rename moves the entries of whatever was open. */}
					<IconButton label="Replace with the sample model" onClick={loadExample}>
						<Icon name="sample" />
					</IconButton>
					<IconButton
						label={`Diagram theme: ${theme ?? 'following the page'}. Shift-click to follow the page.`}
						onClick={(event) => {
							const next: GraphTheme | null = event.shiftKey
								? null
								: theme === 'dark'
									? 'light'
									: 'dark';
							setTheme(next);
							saveTheme(next);
						}}
					>
						<Icon
							name={theme === 'dark' ? 'theme-dark' : theme === 'light' ? 'theme-light' : 'theme-auto'}
						/>
					</IconButton>
				</span>

				<input
					ref={fileInput}
					type="file"
					accept={MODEL_ACCEPT}
					onChange={(event) => void onOpen(event.target.files?.[0])}
					className="hidden"
				/>
			</div>

			{/* The legend explains the diagram's shapes, so it goes when the diagram
			    does — the map's rule, in the map's place — and when it is turned
			    off, which is a different question with the same answer on screen. */}
			{showStore && (
				<StoreState current={keys.doc} onLeaving={flush} onClose={() => setShowStore(false)} />
			)}

			{panes !== 'source' && legend && <Legend theme={theme} />}

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
				{panes !== 'graph' && (
					<section
						aria-label="Source"
						className={`flex min-h-0 flex-col ${
							panes === 'both'
								? 'border-b border-slate-200 lg:border-r lg:border-b-0 dark:border-slate-800'
								: 'flex-1'
						}`}
						style={panes === 'both' ? { flexBasis: `${split}%` } : undefined}
					>
						<div className="min-h-0 flex-1 overflow-auto">
							<Editor
								value={source}
								onChange={setSource}
								problems={problems}
								revealLine={revealLine}
								label={SOURCE_LABEL}
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
						aria-label="Domain model"
						data-theme={theme ?? undefined}
						className="relative min-h-0 flex-1 bg-white text-ink dark:bg-night dark:text-slate-100"
					>
						<Diagram
							document={document_}
							placement={placement}
							stale={stale}
							selected={selected}
							onSelect={setSelected}
							positions={positions}
							onPositions={setPositions}
							onFullscreen={toggleFullscreen}
							fullscreen={fullscreen}
							onExportSvg={(svg) =>
								downloadText(
									`${slug(document_.context, 'model')}${SVG_EXTENSION}`,
									svg,
									'image/svg+xml;charset=utf-8',
								)
							}
							adds={adds}
							onAdd={add}
							onConnect={connect}
						/>
						{document_.aggregates.length === 0 && document_.members.length === 0 && (
							<EmptyState
								heading={
									blank(source) ? 'Nothing open' : `Nothing in “${document_.context}” yet`
								}
								blurb={
									blank(source)
										? 'A domain model is the inside of one bounded context: its aggregates, what they hold, and what each one keeps true.'
										: 'The map says this context exists. What its aggregates hold and protect is written here, in the text on the left.'
								}
								startLabel={blank(source) ? 'Start a fresh model' : 'Start modelling it'}
								onLoadExample={loadExample}
								onStart={startFresh}
							/>
						)}
						<Inspector
							document={document_}
							selected={selected}
							onReveal={reveal}
							onClose={() => setSelected(null)}
							setIntent={setIntent}
							setInvariant={setInvariant}
							rename={rename}
							remove={remove}
							focusName={fresh !== null && fresh === selected}
						/>
					</section>
				)}
			</div>
		</div>
	);
}

const PANE_CHOICES: readonly { panes: Panes; icon: IconName; label: string }[] = [
	{ panes: 'source', icon: 'panes-source', label: 'Show the source only' },
	{ panes: 'both', icon: 'panes-both', label: 'Show the source and the diagram' },
	{ panes: 'graph', icon: 'panes-graph', label: 'Show the diagram only' },
];

/** The drag handle. Keyboard-operable, because a mouse-only split is a trap. */
function Divider({ onMove }: { onMove: (percent: number) => void }) {
	const dragging = useRef(false);

	useEffect(() => {
		const move = (event: PointerEvent) => {
			if (!dragging.current) return;
			onMove(Math.min(75, Math.max(20, (event.clientX / window.innerWidth) * 100)));
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
