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
	loadModelPositions,
	loadModelSource,
	loadPanes,
	loadSplit,
	loadTheme,
	saveModelPositions,
	saveModelSource,
	savePanes,
	saveSplit,
	saveTheme,
	type GraphTheme,
	type Panes,
} from '../../lib/storage';
import Editor from '../mapper/Editor';
import Icon, { type IconName } from '../mapper/Icon';
import ProblemList from '../mapper/ProblemList';
import IconButton from '../ui/IconButton';
import { useFullscreen } from '../../lib/fullscreen';
import Diagram from './Diagram';

const DEBOUNCE_MS = 250;
const MODEL_EXTENSION = '.ddm';
const MODEL_ACCEPT = '.ddm,text/plain';

export default function ModelEditor() {
	const [source, setSource] = useState(SAMPLE);
	const [document_, setDocument] = useState<DomainModel>(() => parse(SAMPLE).document);
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

	useEffect(() => {
		const stored = loadModelSource();
		if (stored !== null) setSource(stored);
		setTheme(loadTheme());
		const storedSplit = loadSplit();
		if (storedSplit !== null) setSplit(storedSplit);
		const storedPanes = loadPanes();
		if (storedPanes !== null) setPanes(storedPanes);
		setPositions(loadModelPositions());
	}, []);

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

	useEffect(() => {
		const timer = window.setTimeout(() => setSaveFailed(!saveModelSource(source)), 400);
		return () => window.clearTimeout(timer);
	}, [source]);

	useEffect(() => {
		const timer = window.setTimeout(() => saveModelPositions({ ...positions }), 400);
		return () => window.clearTimeout(timer);
	}, [positions]);

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

	const onOpen = async (file: File | undefined) => {
		if (!file) return;
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
						label="Export this model as a .ddm file"
						onClick={() =>
							downloadText(`${slug(document_.context, 'model')}${MODEL_EXTENSION}`, source)
						}
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
