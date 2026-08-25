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
import { SAMPLE } from '../../lib/ddm/sample';
import { layout as computePlacement, type Placement, type Positions } from '../../lib/ddm/layout';
import type { DomainModel } from '../../lib/ddm/model';
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
	loadPanes,
	loadSplit,
	loadText,
	loadTheme,
	modelKeys,
	rememberModel,
	saveModelView,
	savePanes,
	saveSplit,
	saveText,
	saveTheme,
	takeLegacyModel,
	type DocumentKeys,
	type GraphTheme,
	type Panes,
} from '../../lib/storage';
import { seedModel } from '../../lib/ddm/seed';
import { serializeModelView } from '../../lib/view-file';
import Editor from '../mapper/Editor';
import Icon, { type IconName } from '../mapper/Icon';
import ProblemList from '../mapper/ProblemList';
import IconButton from '../ui/IconButton';
import { useFullscreen } from '../../lib/fullscreen';
import Diagram from './Diagram';

const DEBOUNCE_MS = 250;
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

export default function ModelEditor() {
	const [source, setSource] = useState(SAMPLE);
	const [document_, setDocument] = useState<DomainModel>(SEED);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [stale, setStale] = useState(false);
	const [placement, setPlacement] = useState<Placement | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [collapsed, setCollapsed] = useState(false);
	const [split, setSplit] = useState(42);
	const [panes, setPanes] = useState<Panes>('both');
	const [theme, setTheme] = useState<GraphTheme | null>(null);
	const [positions, setPositions] = useState<Positions>({});
	const [saveFailed, setSaveFailed] = useState(false);
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
	const [modelName, setModelName] = useState(SEED.context);
	/** `<modelName>.ddm` and `<modelName>.ddmview`. */
	const keys = useMemo(() => modelKeys(modelName), [modelName]);
	const keysRef = useRef<DocumentKeys | null>(null);
	/** Set by Open alone, and read once by the effect that moves the entries. */
	const opened = useRef(false);

	useEffect(() => {
		restore();
		setTheme(loadTheme());
		const storedSplit = loadSplit();
		if (storedSplit !== null) setSplit(storedSplit);
		const storedPanes = loadPanes();
		if (storedPanes !== null) setPanes(storedPanes);
	}, []);

	/**
	 * Open the model this visit is about.
	 *
	 * Three ways in, in order of how explicitly they were asked for:
	 *
	 *   `?context=Risk appetite`  a link from the map, or one somebody pasted.
	 *                             The name in the URL wins over anything
	 *                             remembered: it is the request.
	 *   the pointer               no URL, so the last model worked on.
	 *   the sample                neither, or a name with nothing stored and no
	 *                             link that asked for it.
	 *
	 * The keys derive from the name, so the name has to be known before anything
	 * can be read — which is why one arrives rather than being discovered.
	 */
	function restore(): void {
		const asked = new URLSearchParams(window.location.search).get('context');
		const name = asked ?? lastModel();

		if (name) {
			const found = modelKeys(name);
			const stored = loadText(found.doc);
			if (stored !== null) {
				// Already written — the nodes and, from the sidecar key, the
				// arrangement. Arriving from the map must not disturb either.
				keysRef.current = found;
				setModelName(name);
				setSource(stored);
				setPositions(loadModelView(found.view));
				return;
			}

			if (asked !== null) {
				// Asked for by name with nothing stored: a context whose model has
				// not been written yet, reached by a link the map did not seed —
				// pasted, or typed. The stub is the map's, minus what only the map
				// knows.
				keysRef.current = found;
				setModelName(asked);
				setSource(seedModel(asked, []));
				setPositions({});
				return;
			}
		}

		// First visit since the entries stopped being one slot per page.
		const legacy = takeLegacyModel();
		if (legacy) {
			setSource(legacy.source);
			setPositions(legacy.positions);
		}
	}

	useEffect(() => {
		const timer = window.setTimeout(() => {
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
		const timer = window.setTimeout(() => {
			setSaveFailed(!saveText(keys.doc, source));
			rememberModel(modelName);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [source, keys.doc, modelName]);

	useEffect(() => {
		const timer = window.setTimeout(() => saveModelView(keys.view, modelName, { ...positions }), 400);
		return () => window.clearTimeout(timer);
	}, [positions, keys.view, modelName]);

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
		const wasOpen = opened.current;
		opened.current = false;
		if (!previous || previous.doc === keys.doc || wasOpen) return;

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

	const onOpen = async (file: File | undefined) => {
		if (!file) return;
		// Another model is another document: the one on screen keeps its entries
		// under its own name rather than being moved onto this one's.
		opened.current = true;
		setSource(await readTextFile(file));
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
				<strong className="mr-1 truncate">{document_.context}</strong>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					{counts.aggregates} aggregates · {counts.classes} classes · {counts.links} links
				</span>

				<span className="ml-auto flex flex-wrap items-center gap-2">
					{saveFailed && (
						<span className="text-xs text-amber-700 dark:text-amber-400">
							Not saving in this browser
						</span>
					)}
					{/* The map's toolbar, button for button: the two editors are one
					    tool, and a control that means the same thing should look the
					    same and sit in the same place in both. */}
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

					<IconButton label="Open a .ddm model" onClick={() => fileInput.current?.click()}>
						<Icon name="open" />
					</IconButton>
					<IconButton
						label="Export this model: a .ddm file and its .ddmview sidecar"
						onClick={exportModel}
					>
						<Icon name="export" />
					</IconButton>
					<IconButton
						label="Replace with the sample model"
						onClick={() => {
							setSource(SAMPLE);
							setSelected(null);
							setPositions({});
						}}
					>
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
