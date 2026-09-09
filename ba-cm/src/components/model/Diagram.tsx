/**
 * The domain model canvas.
 *
 * Hand-rolled SVG over ELK, same as the map's, and the same three things are
 * true of it: positions are view state that never reach the file, edges are
 * re-routed from current geometry on every frame of a drag, and nothing is
 * captured until a gesture is real — a press that never moves is a click, and a
 * click has to reach the box it landed on.
 *
 * What differs is what a box *is*. On the map a node is a name and a subtitle
 * in a fixed rectangle. Here it is a UML class: a stereotype, a name, and a
 * ruled list of attributes whose length decides the box's height. And an
 * aggregate is not a node at all in the drawing sense — it is the boundary its
 * members sit inside, drawn behind them, which is why boxes are painted
 * parents-first and hit-tested children-first.
 */

import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	AGGREGATE_RULE,
	applyPositions,
	BOX,
	extentOf,
	rowsOf,
	stereotypeOf,
	subtitleOf,
	type PlacedBox,
	type Placement,
	type Positions,
} from '../../lib/ddm/layout';
import { multiplicityMark, type AggregateNode, type DomainModel, type Member } from '../../lib/ddm/model';
import { routeLinks, type RoutedLink } from '../../lib/ddm/route';
import { paint } from '../../lib/ddm/style';
import { backgroundOf, toSvgFile, VIEWPORT_MARK } from '../../lib/graph/svg-file';
import { alignBoxes, spreadBoxes, type AlignTo, type SpreadAxis } from '../../lib/graph/align';
import CanvasBar, { type AddChoice } from '../mapper/CanvasBar';
import type { CanvasControls } from '../ui/ViewControls';
import { useNudge } from '../../lib/nudge';

interface Props {
	document: DomainModel;
	placement: Placement | null;
	stale: boolean;
	selected: string | null;
	/**
	 * The rest of the selection: the boxes picked with shift held, most recently
	 * picked first, and never the one in `selected`.
	 *
	 * Two fields rather than one list, for the map canvas's reason: `selected` is
	 * the *subject*, which the inspector describes and an Add button adds into,
	 * and there can only be one of those. The selection is what a gesture acts
	 * on, and a drag on one box of six has to move six.
	 */
	also: readonly string[];
	/**
	 * `extend` is shift held: the box joins the selection instead of replacing
	 * it, and joining is a toggle — the same click takes it back out again.
	 */
	onSelect: (id: string | null, extend?: boolean) => void;
	positions: Positions;
	onPositions: (next: Positions) => void;
	/** The top bar's handle on this canvas. See `Graph`, which carries the note. */
	controls: React.RefObject<CanvasControls | null>;
	onScale: (scale: number) => void;
	/** What this canvas can make, and why each button is off. */
	adds: readonly AddChoice[];
	onAdd: (kind: string) => void;
	/** Two boxes, in the order they were clicked. See `ModelEditor`'s table. */
	onConnect: (fromId: string, toId: string) => void;
}

interface View {
	x: number;
	y: number;
	scale: number;
}

/** Matches the map's. A press under this is a click, and captures nothing. */
const DRAG_SLOP = 4;

/**
 * What 100% means.
 *
 * A class box is denser than a context box — a stereotype, a name and a ruled
 * list, where the map has a name and a subtitle — so the size that reads
 * comfortably is not the size the arithmetic calls 1. Rather than inflate the
 * font sizes and lose the correspondence with the map's, the *unit* moves: the
 * diagram is drawn at 1.2 when the bar says 100%, and every limit below is in
 * units rather than in raw scale.
 */
const ZOOM_UNIT = 1.2;

/** Zoom limits, in units. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
/** A fit never magnifies past this, or a two-box model fills the wall. */
const MAX_FIT = 1.4;

export default function Diagram({
	document,
	placement,
	stale,
	selected,
	also,
	onSelect,
	positions,
	onPositions,
	controls,
	onScale,
	adds,
	onAdd,
	onConnect,
}: Props) {
	const [view, setView] = useState<View>({ x: 0, y: 0, scale: ZOOM_UNIT });
	/*
	 * Set for exactly one render, and that render is the exported one: no
	 * selection ring, no session marks. Same trick as the map's, and the same
	 * serialiser underneath.
	 */
	const [exporting, setExporting] = useState(false);
	const [size, setSize] = useState({ width: 800, height: 600 });
	/*
	 * Drawing a link, in two pieces: the mode, and the half-drawn line.
	 *
	 * The map's `Graph`, and the map's reason for the split — `connecting` is
	 * the tool being held and `origin` is the box clicked first, so a completed
	 * stroke leaves the tool in hand and six links can be drawn without going
	 * back to the bar. A drag from a box already means "move it", which is why
	 * this is a mode and not a drag.
	 */
	const [connecting, setConnecting] = useState(false);
	const [origin, setOrigin] = useState<string | null>(null);
	const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
	const surface = useRef<SVGSVGElement>(null);
	const pan = useRef<{ x: number; y: number; originX: number; originY: number; pointerId: number; live: boolean } | null>(null);
	/*
	 * A move in progress — and it is a move of *the selection*, not of the box
	 * under the pointer: grab any member of a group and the whole group travels.
	 *
	 * `from` freezes each moving box's **own** coordinates when the press landed
	 * — its override, or its place in the raw layout — and every frame writes
	 * that plus the total distance travelled. Two bugs die there. The first is
	 * drift: `positions` is rewritten on every frame, so a step measured against
	 * the previous frame compounds its rounding for the length of the drag and a
	 * group does not stay in formation. The second is this canvas's own, and it
	 * was here before groups were: `applyPositions` adds a member's shift to its
	 * aggregate's, so a member inside a boundary that had been moved was drawn
	 * somewhere its override did not say — and the old drag wrote that *drawn*
	 * position straight back, folding the parent's shift in a second time. The
	 * box jumped by the width of the aggregate's last move on the first pixel of
	 * every drag. Starting from the box's own value is the fix, and it is the
	 * same rule `useNudge` has always used.
	 */
	const dragging = useRef<{
		id: string;
		from: ReadonlyMap<string, { x: number; y: number }>;
		/** Where the pointer was, in graph coordinates, when the press landed. */
		graphX: number;
		graphY: number;
		startX: number;
		startY: number;
		pointerId: number;
		moved: boolean;
	} | null>(null);
	const draggedLast = useRef(false);

	/**
	 * Where a box's override starts from, and the reason every gesture on this
	 * canvas goes through it.
	 *
	 * `placement.boxes` rather than `boxes`, and that distinction is load
	 * bearing: `applyPositions` adds a member's own shift to its aggregate's, so
	 * a member drawn inside a boundary that has moved is not where its override
	 * says it is. Writing a drawn position back as an override would fold the
	 * parent's shift in twice. The drag, the arrow keys and the two arrangement
	 * gestures are all handed this same function — see `useNudge` and
	 * `alignBoxes`, which both state the rule.
	 */
	const originOf = useCallback(
		(id: string) => placement?.boxes.find((box) => box.id === id) ?? null,
		[placement],
	);

	const boxes = useMemo(
		() => (placement ? applyPositions(placement.boxes, positions) : []),
		[placement, positions],
	);

	/**
	 * Everything picked right now, subject included, for the two questions the
	 * canvas asks of it: does this box wear a ring, and does this box come along
	 * when one of its neighbours is dragged.
	 */
	const picked = useMemo(
		() => new Set(selected === null ? also : [selected, ...also]),
		[selected, also],
	);

	/**
	 * The picked boxes — and only the ones a gesture should actually move.
	 *
	 * Two things are dropped here rather than at each of the four gestures. A
	 * selected *link* is not a box and has nothing to move. And a member whose
	 * own aggregate is picked is dropped as well: it already travels with its
	 * boundary, because `applyPositions` adds the parent's shift to its
	 * children's, so moving it too would move it twice. Aligning it would be the
	 * same argument with the same answer — a box that follows its parent cannot
	 * also be put somewhere else, and the boundary is the thing that was picked.
	 */
	const group = useMemo(
		() => boxes.filter((box) => picked.has(box.id) && !(box.parent && picked.has(box.parent))),
		[boxes, picked],
	);

	/*
	 * The arrow keys move the same set the drag does — see `useNudge`, which
	 * carries why they must not disagree, and why the override is written
	 * against the box's own coordinates rather than where it is drawn.
	 */
	const nudged = useMemo(() => group.map((box) => box.id), [group]);
	useNudge({ ids: nudged, positions, onPositions, originOf });

	const links = useMemo(
		() => routeLinks(document.links, boxes, multiplicityMark),
		[document.links, boxes],
	);
	const extent = useMemo(() => extentOf(boxes), [boxes]);

	const fit = useCallback(() => {
		const box = surface.current?.getBoundingClientRect();
		if (!box || box.width === 0 || extent.width <= 1) return;

		const scale = clampZoom(
			Math.min(box.width / extent.width, box.height / extent.height),
			MAX_FIT,
		);
		setView({
			scale,
			x: box.width / 2 - (extent.x + extent.width / 2) * scale,
			y: box.height / 2 - (extent.y + extent.height / 2) * scale,
		});
	}, [extent]);

	const fitNow = useRef(fit);
	fitNow.current = fit;

	useEffect(() => {
		const element = surface.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	/*
	 * Escape abandons the candidate, and a second Escape puts the tool down.
	 * Two steps because losing the tool on the same key that fixes a misclick
	 * would mean going back to the bar after every slip.
	 */
	useEffect(() => {
		if (!connecting) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setOrigin((current) => {
				if (current === null) setConnecting(false);
				return null;
			});
			setTip(null);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [connecting]);

	// Putting the tool down drops whatever was half-drawn with it — and so does
	// the origin going away, which happens when the box it started from is
	// deleted, or renamed out from under it, while the candidate is out.
	useEffect(() => {
		if (connecting && (origin === null || boxes.some((box) => box.id === origin))) return;
		setOrigin(null);
		setTip(null);
	}, [connecting, origin, boxes]);

	/*
	 * The canvas as a file, asked for from outside.
	 *
	 * `Graph`'s mechanism, moved here when the model page grew an export dialog
	 * of its own, and its note carries the argument in full. In short:
	 * `exporting` is one frame rather than a mode, every piece of interaction
	 * chrome renders as absent in it, and the clone has to wait for the paint
	 * after that render — so `serialize` raises the flag and hands back a
	 * promise, and the layout effect below settles it once the clean frame is on
	 * screen.
	 *
	 * This used to push instead: the canvas bar had its own picture button, the
	 * canvas rendered a clean frame and handed the string up. That worked for
	 * exactly one caller. A dialog that offers a `.svg` and a `.png` has to be
	 * able to *ask* — and to ask once for both, or the same picture is cloned
	 * twice and the two copies can disagree about which frame they came from.
	 */
	const pending = useRef<{ resolve: (svg: string | null) => void } | null>(null);

	const serialize = useCallback((): Promise<string | null> => {
		if (pending.current !== null) {
			// Already waiting for the clean frame. Chain rather than race: two
			// clones of one picture is work nobody asked for.
			const waiting = pending.current;
			return new Promise((resolve) => {
				const previous = waiting.resolve;
				waiting.resolve = (svg) => {
					previous(svg);
					resolve(svg);
				};
			});
		}
		return new Promise((resolve) => {
			pending.current = { resolve };
			setExporting(true);
		});
	}, []);

	useLayoutEffect(() => {
		if (!exporting) return;
		const waiting = pending.current;
		pending.current = null;
		setExporting(false);
		if (waiting === null) return;
		const svg = surface.current;
		waiting.resolve(
			svg === null ? null : toSvgFile(svg, extent, backgroundOf(svg), document.context),
		);
	}, [exporting, extent, document.context]);

	/*
	 * A canvas that goes away with a request outstanding answers it.
	 *
	 * Otherwise the dialog waits for a promise nothing will ever settle and the
	 * button says "Exporting…" until the page is reloaded. Null is the honest
	 * answer: there is no surface any more.
	 */
	useEffect(
		() => () => {
			pending.current?.resolve(null);
			pending.current = null;
		},
		[],
	);

	// Fit when the shape of the model changes materially, not on every render —
	// refitting while somebody is reading, because they typed an attribute, is
	// disorienting.
	const shape = `${Math.round(extent.width)}x${Math.round(extent.height)}`;
	const fitted = useRef('');
	useEffect(() => {
		if (boxes.length === 0 || size.width === 0 || fitted.current === shape) return;
		fitted.current = shape;
		fit();
	}, [shape, size.width, boxes.length, fit]);

	/* Above the early return below — see `Graph`, which carries the reason. */
	const zoomBy = (factor: number) => {
		setView((current) => {
			const scale = clampZoom(current.scale * factor, MAX_ZOOM);
			const cx = size.width / 2;
			const cy = size.height / 2;
			return {
				scale,
				x: cx - ((cx - current.x) / current.scale) * scale,
				y: cy - ((cy - current.y) / current.scale) * scale,
			};
		});
	};

	useImperativeHandle(controls, () => ({ zoomBy, serialize }), [size.width, size.height, serialize]);

	// In the same display units the readout shows — the diagram's own natural
	// size is ZOOM_UNIT, and nobody outside this file should have to know that.
	useEffect(() => {
		onScale(view.scale / ZOOM_UNIT);
	}, [view.scale, onScale]);

	if (!placement || boxes.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-muted dark:text-slate-400">
				{document.aggregates.length === 0
					? 'Nothing to draw yet. A file starts with `context "…" {`.'
					: 'Laying out…'}
			</div>
		);
	}

	const toGraph = (clientX: number, clientY: number) => {
		const box = surface.current?.getBoundingClientRect();
		return {
			x: (clientX - (box?.left ?? 0) - view.x) / view.scale,
			y: (clientY - (box?.top ?? 0) - view.y) / view.scale,
		};
	};

	/**
	 * A click on a box while the connect tool is held.
	 *
	 * First click sets the origin, second commits — unless it landed back on the
	 * origin, which is a cancel rather than a link to nowhere. A class that
	 * contains itself is not a thing this format can say, and refusing it with a
	 * message would be pedantry about an obvious slip.
	 */
	const connectTo = (id: string) => {
		if (origin === null) {
			setOrigin(id);
			return;
		}
		const from = origin;
		setOrigin(null);
		setTip(null);
		if (from !== id) onConnect(from, id);
	};

	/**
	 * A click on a box, with `extend` set when shift was held.
	 *
	 * Shift extends. A plain click on the only picked box lets go of it — around
	 * here clicking a thing twice has always meant that — but a plain click on
	 * one of several narrows to that one instead: clearing the lot is what the
	 * background is for, and losing five picks to a slightly misplaced click is
	 * not a gesture anybody asked for.
	 */
	const selectBox = (id: string, extend: boolean) => {
		if (extend) onSelect(id, true);
		else onSelect(selected === id && also.length === 0 ? null : id);
	};

	const originBox = origin === null ? null : (boxes.find((box) => box.id === origin) ?? null);

	// Aggregates first so their members draw on top of them.
	const aggregates = boxes.filter((box) => box.parent === null && !isMemberBox(box));
	const members = boxes.filter((box) => isMemberBox(box));

	return (
		<div className="relative h-full overflow-hidden">
			{stale && (
				<p className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950 dark:text-amber-200">
					Showing the last model that parsed
				</p>
			)}

			<CanvasBar
				adds={adds}
				onAdd={onAdd}
				connecting={connecting}
				onConnecting={setConnecting}
				onFit={fit}
				onAlign={(to: AlignTo) =>
					onPositions(alignBoxes({ placed: group, ids: picked, to, positions, originOf }))
				}
				onSpread={(axis: SpreadAxis) =>
					onPositions(spreadBoxes({ placed: group, ids: picked, axis, positions, originOf }))
				}
				picked={group.length}
				onReset={() => onPositions({})}
				moved={Object.keys(positions).length}
			/>

			<svg
				ref={surface}
				className={`h-full w-full touch-none ${stale ? 'opacity-40' : ''} ${
					connecting ? 'cursor-crosshair' : 'cursor-grab'
				}`}
				onWheel={(event) => {
					if (!event.ctrlKey && !event.metaKey) return;
					event.preventDefault();
					zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0 || dragging.current) return;
					// With the tool in hand the canvas is not a thing to pan: a drag
					// here would move the model out from under a half-drawn link.
					if (connecting) return;
					pan.current = {
						x: event.clientX,
						y: event.clientY,
						originX: view.x,
						originY: view.y,
						pointerId: event.pointerId,
						live: false,
					};
				}}
				onPointerMove={(event) => {
					if (connecting) {
						if (origin !== null) setTip(toGraph(event.clientX, event.clientY));
						return;
					}

					const drag = dragging.current;
					if (drag) {
						if (!drag.moved) {
							if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_SLOP) return;
							drag.moved = true;
							draggedLast.current = true;
							surface.current?.setPointerCapture(drag.pointerId);
						}
						const point = toGraph(event.clientX, event.clientY);
						const dx = point.x - drag.graphX;
						const dy = point.y - drag.graphY;
						const next: Record<string, { x: number; y: number }> = { ...positions };
						for (const [id, start] of drag.from) {
							next[id] = { x: start.x + dx, y: start.y + dy };
						}
						onPositions(next);
						return;
					}

					const start = pan.current;
					if (!start) return;
					if (!start.live) {
						if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_SLOP) return;
						start.live = true;
						surface.current?.setPointerCapture(start.pointerId);
					}
					setView((current) => ({
						...current,
						x: start.originX + (event.clientX - start.x),
						y: start.originY + (event.clientY - start.y),
					}));
				}}
				onPointerUp={() => {
					pan.current = null;
					dragging.current = null;
				}}
				onClick={(event) => {
					if (event.target !== event.currentTarget) return;
					// Clicking the canvas with a candidate out loses it, which is what
					// the hint line promises.
					if (connecting) {
						setOrigin(null);
						setTip(null);
						return;
					}
					onSelect(null);
				}}
				role="img"
				aria-label={`Domain model of ${document.context}: ${document.aggregates.length} aggregates, ${document.members.length} classes`}
			>
				<defs>
					{/*
						The dot grid, the map's exactly. In graph coordinates rather than
						screen ones, so it pans and zooms with the content — which is what
						makes the canvas read as a surface things sit on rather than as a
						texture painted on the window.
					*/}
					<pattern id="dots" width={28} height={28} patternUnits="userSpaceOnUse">
						<circle cx={1.5} cy={1.5} r={1.1} className="fill-slate-300 dark:fill-slate-700" />
					</pattern>
					<marker id="open-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0 1 L9 5 L0 9" fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={1.4} />
					</marker>
				</defs>

				<g
					transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
					{...{ [VIEWPORT_MARK]: '' }}
				>
					{/*
					   Decorative, and explicitly not a click target: a filled rect over
					   the canvas is the top hit for every click on empty space, and
					   clicking the background is how a selection is dropped.

					   Absent from the exported frame. The dots say "this is a surface
					   you can move things on", which is true of the canvas and not of a
					   picture in somebody's slide deck.
					*/}
					{!exporting && (
						<rect
							x={extent.x - 2000}
							y={extent.y - 2000}
							width={extent.width + 4000}
							height={extent.height + 4000}
							fill="url(#dots)"
							className="pointer-events-none"
						/>
					)}

					{aggregates.map((box) => (
						<AggregateBox
							key={box.id}
							box={box}
							aggregate={box.node as AggregateNode}
							selected={!exporting && picked.has(box.id)}
							pending={!exporting && origin === box.id}
							connecting={connecting}
							onSelect={selectBox}
							onConnect={connectTo}
							didDrag={() => draggedLast.current}
							onGrab={(event) => grab(event, box)}
						/>
					))}

					{links.map((routed) => (
						<LinkLine
							key={routed.id}
							routed={routed}
							selected={!exporting && selected === routed.id}
							onSelect={onSelect}
						/>
					))}

					{members.map((box) => (
						<MemberBox
							key={box.id}
							box={box}
							member={box.node as Member}
							selected={!exporting && picked.has(box.id)}
							pending={!exporting && origin === box.id}
							connecting={connecting}
							onSelect={selectBox}
							onConnect={connectTo}
							didDrag={() => draggedLast.current}
							onGrab={(event) => grab(event, box)}
						/>
					))}

					{/*
					 * The half-drawn link, from the middle of the origin to the
					 * pointer. Dashed and unrouted: it is a gesture in progress rather
					 * than a link, and drawing it the way a real one is drawn would
					 * claim it already exists.
					 */}
					{originBox && tip && (
						<line
							x1={originBox.x + originBox.width / 2}
							y1={originBox.y + originBox.height / 2}
							x2={tip.x}
							y2={tip.y}
							strokeWidth={2}
							strokeDasharray="6 4"
							className="pointer-events-none stroke-brand dark:stroke-purple-400"
						/>
					)}
				</g>
			</svg>

			<p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/85 px-2 py-1 text-[11px] text-ink-muted dark:bg-slate-900/85 dark:text-slate-400">
				{connecting
					? origin === null
						? 'click the class the link starts from · esc to put the tool down'
						: 'click what it points at · click anywhere else to lose it · esc to cancel'
					: 'drag a class to move it, or nudge it with the arrow keys · shift-click to pick several, then drag them as one or line them up from the bar · drag an aggregate to move it with its members · drag the canvas to pan · ⌘/ctrl + scroll to zoom'}
			</p>
		</div>
	);

	function grab(event: React.PointerEvent, box: PlacedBox) {
		const point = toGraph(event.clientX, event.clientY);
		/*
		 * A box outside the selection travels alone, and the selection is left
		 * exactly where it was. The alternative — a press that quietly re-selects
		 * — would move a group somebody had just spent six clicks assembling, on
		 * the one gesture that gives no chance to say otherwise.
		 */
		const movers = picked.has(box.id) ? group : [box];
		const from = new Map<string, { x: number; y: number }>();
		for (const mover of movers) {
			// Its own coordinates, never where it is drawn. See the ref's note.
			const own = positions[mover.id] ?? originOf(mover.id);
			if (own) from.set(mover.id, { x: own.x, y: own.y });
		}
		dragging.current = {
			id: box.id,
			from,
			graphX: point.x,
			graphY: point.y,
			startX: event.clientX,
			startY: event.clientY,
			pointerId: event.pointerId,
			moved: false,
		};
		draggedLast.current = false;
	}
}

function isMemberBox(box: PlacedBox): boolean {
	return 'kind' in box.node;
}

/**
 * The boundary.
 *
 * Dashed, and drawn behind everything, because it is not a thing on the diagram
 * so much as a claim about the things inside it: these are loaded, saved and
 * kept consistent together. The invariant count sits in the header — the count
 * rather than the text, because one line is all there is room for and the
 * inspector has the words.
 */
function AggregateBox({
	box,
	aggregate,
	selected,
	pending,
	connecting,
	onSelect,
	onConnect,
	didDrag,
	onGrab,
}: {
	box: PlacedBox;
	aggregate: AggregateNode;
	selected: boolean;
	/** The origin of a half-drawn link. */
	pending: boolean;
	connecting: boolean;
	onSelect: (id: string, extend: boolean) => void;
	onConnect: (id: string) => void;
	didDrag: () => boolean;
	onGrab: (event: React.PointerEvent) => void;
}) {
	return (
		<g
			transform={`translate(${box.x} ${box.y})`}
			className={connecting ? 'cursor-crosshair' : 'cursor-move'}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				// With the tool in hand a box is a target, not a handle.
				if (!connecting) onGrab(event);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (connecting) {
					onConnect(box.id);
					return;
				}
				if (didDrag()) return;
				onSelect(box.id, event.shiftKey);
			}}
		>
			<rect
				width={box.width}
				height={box.height}
				rx={16}
				strokeWidth={selected || pending ? 3 : 1.5}
				strokeDasharray="7 5"
				// The boundary's violet is the map's core violet, one tint lighter in
				// the fill so the root box sitting on it stays the darker of the two.
				// A pending origin borrows the brand colour instead, so the box a link
				// is coming *from* is never mistaken for the current selection.
				className={`fill-violet-50/70 dark:fill-violet-950/40 ${
					pending
						? 'stroke-brand dark:stroke-purple-400'
						: selected
							? 'stroke-violet-600 dark:stroke-violet-300'
							: 'stroke-violet-600 dark:stroke-violet-700'
				}`}
			/>
			<text x={16} y={35} className="pointer-events-none fill-violet-950 text-[15px] font-semibold dark:fill-violet-200">
				{aggregate.name}
			</text>
			<text x={16} y={52} className="pointer-events-none fill-violet-700 text-[11px] dark:fill-violet-400">
				{/* From the sizer, which reserved room for exactly this string. */}
				{subtitleOf(aggregate)}
			</text>
			<line
				x1={0}
				y1={AGGREGATE_RULE}
				x2={box.width}
				y2={AGGREGATE_RULE}
				className="stroke-violet-300 dark:stroke-violet-800"
				strokeWidth={1}
			/>
		</g>
	);
}

/** A class box: stereotype, name, a rule, and the attributes under it. */
function MemberBox({
	box,
	member,
	selected,
	pending,
	connecting,
	onSelect,
	onConnect,
	didDrag,
	onGrab,
}: {
	box: PlacedBox;
	member: Member;
	selected: boolean;
	/** The origin of a half-drawn link. */
	pending: boolean;
	connecting: boolean;
	onSelect: (id: string, extend: boolean) => void;
	onConnect: (id: string) => void;
	didDrag: () => boolean;
	onGrab: (event: React.PointerEvent) => void;
}) {
	const rows = rowsOf(member);
	const root = member.kind === 'entity' && member.root;

	return (
		<g
			transform={`translate(${box.x} ${box.y})`}
			className={connecting ? 'cursor-crosshair' : 'cursor-move'}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				// With the tool in hand a box is a target, not a handle.
				if (!connecting) onGrab(event);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (connecting) {
					onConnect(box.id);
					return;
				}
				if (didDrag()) return;
				onSelect(box.id, event.shiftKey);
			}}
		>
			<rect
				width={box.width}
				height={box.height}
				rx={6}
				strokeWidth={selected || pending ? 3 : 1.5}
				className={`${paint(member)} ${
					pending
						? 'stroke-brand dark:stroke-purple-400'
						: selected
							? 'stroke-violet-600 dark:stroke-violet-300'
							: ''
				}`}
			/>
			{/* Every coordinate here comes from BOX, which is also what sized the
			    box. Two sets of numbers that have to agree is a bug with a date on
			    it. */}
			<text
				x={box.width / 2}
				y={BOX.stereotypeBaseline}
				textAnchor="middle"
				className="pointer-events-none fill-ink-muted text-[10px] dark:fill-slate-400"
			>
				{stereotypeOf(member)}
			</text>
			<text
				x={box.width / 2}
				y={BOX.nameBaseline}
				textAnchor="middle"
				className={`pointer-events-none text-[13.5px] font-semibold ${
					root ? 'fill-violet-950 dark:fill-violet-100' : 'fill-ink dark:fill-slate-100'
				}`}
			>
				{member.name}
			</text>
			{rows.length > 0 && (
				<>
					<line
						x1={0}
						y1={BOX.title}
						x2={box.width}
						y2={BOX.title}
						className="stroke-slate-300 dark:stroke-slate-600"
						strokeWidth={1}
					/>
					{rows.map((row, index) => (
						<text
							key={row}
							x={BOX.padX - 4}
							y={BOX.title + BOX.firstRow + index * BOX.row}
							className="pointer-events-none fill-ink-muted text-[12px] dark:fill-slate-300"
						>
							{row}
						</text>
					))}
				</>
			)}
		</g>
	);
}

/**
 * A link, drawn the way UML already decided.
 *
 * The diamond sits at the owning end and points back at it, which is why the
 * marker is placed and rotated by hand rather than left to `marker-start`: the
 * angle is of the first segment, and an orthogonal path's first segment is not
 * the line between the two centres.
 */
function LinkLine({
	routed,
	selected,
	onSelect,
}: {
	routed: RoutedLink;
	selected: boolean;
	onSelect: (id: string | null) => void;
}) {
	const { link } = routed;
	const dashed = link.kind === 'references';

	return (
		<g>
			<path
				d={routed.path}
				fill="none"
				strokeWidth={12}
				stroke="transparent"
				className="cursor-pointer"
				onClick={(event) => {
					event.stopPropagation();
					onSelect(selected ? null : routed.id);
				}}
			/>
			<path
				d={routed.path}
				fill="none"
				strokeWidth={selected ? 2.5 : 1.4}
				strokeDasharray={dashed ? '6 4' : undefined}
				className={
					selected
						? 'stroke-violet-600 dark:stroke-violet-300'
						: 'stroke-slate-500 dark:stroke-slate-400'
				}
				markerEnd={dashed ? 'url(#open-arrow)' : undefined}
			/>
			{link.kind !== 'references' && (
				<polygon
					points="0,0 7,-5 14,0 7,5"
					transform={`translate(${routed.from.x} ${routed.from.y}) rotate(${routed.angle})`}
					strokeWidth={1.4}
					className={
						link.kind === 'contains'
							? 'fill-slate-500 stroke-slate-500 dark:fill-slate-400 dark:stroke-slate-400'
							: 'fill-white stroke-slate-500 dark:fill-slate-900 dark:stroke-slate-400'
					}
				/>
			)}
			{routed.label && (
				<text
					x={routed.label.x}
					y={routed.label.y}
					textAnchor="middle"
					className="pointer-events-none fill-ink-muted text-[10px] tabular-nums dark:fill-slate-400"
				>
					{routed.label.text}
				</text>
			)}
		</g>
	);
}

function clampZoom(scale: number, ceiling: number): number {
	return Math.min(ceiling, Math.max(MIN_ZOOM, scale / ZOOM_UNIT)) * ZOOM_UNIT;
}
