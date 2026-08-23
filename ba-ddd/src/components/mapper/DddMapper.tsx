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
	DddDocument,
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
import {
	clearFileInput,
	DDD_ACCEPT,
	downloadText,
	filenameFor,
	readTextFile,
	VIEW_ACCEPT,
	viewFilenameFor,
} from '../../lib/files';
import { parseView, serializeView } from '../../lib/view-file';
import Icon from './Icon';
import {
	loadCurves,
	loadPositions,
	loadSource,
	loadSplit,
	loadTheme,
	saveCurves,
	savePositions,
	saveSource,
	saveSplit,
	saveTheme,
	type GraphTheme,
} from '../../lib/storage';
import Editor from './Editor';
import Graph from './Graph';
import Inspector from './Inspector';
import ProblemList from './ProblemList';

const DEBOUNCE_MS = 250;

export default function DddMapper() {
	const [source, setSource] = useState(SAMPLE);
	const [document_, setDocument] = useState<DddDocument>(() => parse(SAMPLE).document);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [stale, setStale] = useState(false);
	const [layout, setLayout] = useState<Layout | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [split, setSplit] = useState(42);
	const [theme, setTheme] = useState<GraphTheme | null>(null);
	// Where the visitor has dragged boxes to. View state: it goes to
	// localStorage and never into `source`.
	const [positions, setPositions] = useState<Positions>({});
	const [curves, setCurves] = useState<Curves>({});
	const [fullscreen, setFullscreen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const [saveFailed, setSaveFailed] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const viewInput = useRef<HTMLInputElement>(null);
	// Shown after loading a view built for a different map, and after a failed
	// one. Cleared on the next successful load.
	const [viewNote, setViewNote] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);

	// Restore before first paint of anything the visitor could act on.
	useEffect(() => {
		const stored = loadSource();
		if (stored !== null) setSource(stored);
		setTheme(loadTheme());
		const storedSplit = loadSplit();
		if (storedSplit !== null) setSplit(storedSplit);
		setPositions(loadPositions());
		setCurves(loadCurves());
	}, []);

	/*
	 * Full screen takes the whole mapper — editor, problems panel and graph —
	 * rather than the graph alone. Both panels are the tool: a graph on a large
	 * display with the text it is made of hidden behind it is the wrong half,
	 * and the text is the source of truth.
	 *
	 * The state is read back from the `fullscreenchange` event rather than set
	 * optimistically on click, because Escape and the browser's own chrome can
	 * leave full screen without going through the button, and a flag that only
	 * the button updated would then be wrong.
	 */
	useEffect(() => {
		const sync = () => setFullscreen(window.document.fullscreenElement === root.current);
		window.document.addEventListener('fullscreenchange', sync);
		return () => window.document.removeEventListener('fullscreenchange', sync);
	}, []);

	const toggleFullscreen = useCallback(() => {
		if (window.document.fullscreenElement) {
			void window.document.exitFullscreen();
			return;
		}
		// Rejects when the gesture is not user-initiated or the feature is
		// blocked by permissions policy. Nothing to recover — the button simply
		// does not work, which is better than an unhandled rejection.
		void root.current?.requestFullscreen?.().catch(() => undefined);
	}, []);

	// Parse, debounced. A failure keeps the last good document.
	useEffect(() => {
		const timer = window.setTimeout(() => {
			const result = parse(source);
			setProblems(result.problems);
			if (result.ok) {
				setDocument(result.document);
				setStale(false);
			} else {
				setStale(true);
			}
		}, DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [source]);

	// Autosave, on the same rhythm.
	useEffect(() => {
		const timer = window.setTimeout(() => setSaveFailed(!saveSource(source)), 1000);
		return () => window.clearTimeout(timer);
	}, [source]);

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

	// Persist positions and curves, debounced — a drag fires these on every frame.
	useEffect(() => {
		const timer = window.setTimeout(() => savePositions(positions), 400);
		return () => window.clearTimeout(timer);
	}, [positions]);

	useEffect(() => {
		const timer = window.setTimeout(() => saveCurves(curves), 400);
		return () => window.clearTimeout(timer);
	}, [curves]);

	const saveLayout = useCallback(() => {
		downloadText(
			viewFilenameFor(document_.title),
			serializeView({ positions: { ...positions }, curves: { ...curves }, map: document_.title }),
		);
	}, [document_.title, positions, curves]);

	const loadLayout = async (file: File | undefined) => {
		if (!file) return;
		const result = parseView(await readTextFile(file), document_.title);
		clearFileInput(viewInput.current);

		if (!result.ok) {
			setViewNote({ kind: 'error', text: result.error });
			return;
		}
		setPositions(result.view.positions);
		setCurves(result.view.curves);
		setViewNote(result.warning ? { kind: 'warn', text: result.warning } : null);
	};

	const onOpen = async (file: File | undefined) => {
		if (!file) return;
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
				<strong className="mr-1 truncate">{document_.title}</strong>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					{counts.subdomains} subdomains · {counts.contexts} contexts · {counts.relationships}{' '}
					relationships
				</span>

				<span className="ml-auto flex flex-wrap items-center gap-2">
					{saveFailed && (
						<span className="text-xs text-amber-700 dark:text-amber-400">
							Not saving in this browser
						</span>
					)}
					<IconButton label="Open a .ddd map" onClick={() => fileInput.current?.click()}>
						<Icon name="open" />
					</IconButton>
					<IconButton
						label="Export this map as a .ddd file"
						onClick={() => downloadText(filenameFor(document_.title), source)}
					>
						<Icon name="export" />
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

			{viewNote && (
				<p
					className={
						viewNote.kind === 'error'
							? 'flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
							: 'flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
					}
				>
					<span className="grow">{viewNote.text}</span>
					<button
						type="button"
						onClick={() => setViewNote(null)}
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
				<section
					aria-label="Source"
					className="flex min-h-0 flex-col border-b border-slate-200 lg:border-r lg:border-b-0 dark:border-slate-800"
					style={{ flexBasis: `${split}%` }}
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
						onReveal={(line) => setRevealLine(line + Math.random() * 0.0001)}
						collapsed={collapsed}
						onToggle={() => setCollapsed((value) => !value)}
					/>
				</section>

				<Divider onMove={(percent) => {
					setSplit(percent);
					saveSplit(percent);
				}} />

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
					/>
					<Inspector
						document={document_}
						selected={selected}
						onSource={applyEdit}
						onReveal={(line) => {
							setRevealLine(line + Math.random() * 0.0001);
						}}
						onClose={() => setSelected(null)}
						setPattern={setPattern}
						setClassification={setClassification}
						removeRelationship={removeRelationship}
					/>
				</section>
			</div>
		</div>
	);
}

/**
 * The top bar's buttons.
 *
 * Icon-only, and therefore `title` *and* `aria-label` on every one: an icon
 * with neither is a rebus. The title is what a pointer user gets and the label
 * is what a screen reader gets, and they say the same thing on purpose.
 */
function IconButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: (event: React.MouseEvent) => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
		>
			{children}
		</button>
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
