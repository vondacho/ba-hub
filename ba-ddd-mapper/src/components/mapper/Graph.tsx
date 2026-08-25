/**
 * The graph panel.
 *
 * Hand-rolled SVG over ELK's coordinates. No graph framework, and the reason is
 * in README.md: React Flow and its neighbours own node positions as their own
 * state, which is exactly the second source of truth this component refuses.
 *
 * Nodes can be moved, and a move is a **view** operation. It changes
 * `positions`, which the parent keeps in `localStorage` next to the theme and
 * the split; it never touches the `.ddd` source. Nudging a box for readability
 * and changing what the map says are different acts, and only one of them
 * belongs in a pull request — which is also why the widget bar has a Reset that
 * puts everything back where ELK had it.
 *
 * Edges are re-routed from current positions on every frame of a drag, which is
 * why `routeEdges` is a pure function of geometry rather than something ELK
 * produces.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Classification, DddDocument, Node, NodeKind } from '../../lib/ddd/model';
import {
	applyPositions,
	borderTowards,
	extentOf,
	routeEdges,
	type Curves,
	type Layout,
	type PlacedNode,
	type Positions,
} from '../../lib/graph/layout';
import { classificationLabel, statusNote, styleFor } from '../../lib/graph/style';
import { backgroundOf, toSvgFile, VIEWPORT_MARK } from '../../lib/graph/svg-file';
import CanvasBar from './CanvasBar';
import Minimap from './Minimap';

interface Props {
	document: DddDocument;
	layout: Layout | null;
	/** True while the text does not parse, so the render is of an older document. */
	stale: boolean;
	selected: string | null;
	onSelect: (id: string | null) => void;
	positions: Positions;
	onPositions: (next: Positions) => void;
	curves: Curves;
	onCurves: (next: Curves) => void;
	onFullscreen: () => void;
	fullscreen: boolean;
	onSaveLayout: () => void;
	onLoadLayout: () => void;
	onAdd: (kind: NodeKind) => void;
	canAdd: Record<NodeKind, string | null>;
	/** Draw an edge between two nodes. The parent decides what that means. */
	onConnect: (fromId: string, toId: string) => void;
	onExportSvg: (svg: string) => void;
	/**
	 * Open a node's own document — a double click on a context.
	 *
	 * On the node rather than only in the inspector because the gesture already
	 * means this everywhere else: a double click is how you go *into* the thing
	 * under the pointer. The page decides what a given node opens, and for
	 * everything that is not a context the answer is nothing.
	 */
	onOpenNode: (id: string) => void;
}

/**
 * How far the pointer must travel before a press becomes a drag or a pan.
 *
 * In screen pixels rather than graph ones, because what it is measuring is a
 * hand rather than a map: the same twitch is the same twitch at every zoom.
 *
 * Without it, any movement at all counted — so a mouse that slid one pixel
 * between press and release both nudged the box and had its click discarded.
 *
 * It also decides when the pointer is **captured**, and that is the more
 * important of its two jobs. Capturing on press retargets everything that
 * follows to the capture element, the compatibility mouse events included — so
 * the `click` that ends a press on a box was delivered to the `<svg>` instead
 * of to the box, `NodeBox`'s own `onClick` never ran, and the canvas read the
 * click as landing on nothing and cleared the selection. A node could not be
 * selected at all, and the same went for an edge, whose press starts a pan.
 * Nothing is captured until a gesture is real, so a plain click is now a plain
 * click.
 */
const DRAG_SLOP = 4;

interface View {
	x: number;
	y: number;
	scale: number;
}

export default function Graph({
	document,
	layout,
	stale,
	selected,
	onSelect,
	positions,
	onPositions,
	curves,
	onCurves,
	onFullscreen,
	fullscreen,
	onSaveLayout,
	onLoadLayout,
	onAdd,
	canAdd,
	onConnect,
	onExportSvg,
	onOpenNode,
}: Props) {
	const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
	const [size, setSize] = useState({ width: 800, height: 600 });
	/*
	 * Drawing an edge, in two pieces: the mode, and the half-drawn edge.
	 *
	 * `connecting` is the tool being held. `origin` is the node clicked first,
	 * and while it is set the candidate follows the pointer — so the two are not
	 * one nullable field: leaving the mode on after a stroke is what lets
	 * somebody draw six relationships without going back to the bar, and
	 * abandoning a candidate has to leave the tool in hand.
	 */
	/*
	 * Set for exactly one render, and that render is the exported one.
	 *
	 * The file should hold the map, not the session: no selection ring, no bend
	 * handle, no "this box was moved here in your browser" dot. Rather than
	 * teaching the serialiser which elements those are — a list it would have to
	 * be kept in step with forever — the graph simply draws a frame without
	 * them, and the frame is what gets copied.
	 *
	 * `useLayoutEffect` rather than `useEffect` so the serialise happens between
	 * the render and the paint: with the latter the visitor sees their selection
	 * blink off and on.
	 */
	const [exporting, setExporting] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [origin, setOrigin] = useState<string | null>(null);
	const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
	const surface = useRef<SVGSVGElement>(null);
	const pan = useRef<{
		x: number;
		y: number;
		originX: number;
		originY: number;
		pointerId: number;
		live: boolean;
	} | null>(null);
	const dragging = useRef<{
		id: string;
		offsetX: number;
		offsetY: number;
		startX: number;
		startY: number;
		pointerId: number;
		moved: boolean;
	} | null>(null);
	/*
	 * Whether the last press on a box turned into a move.
	 *
	 * Read by the box on its own click, and kept here rather than in the box
	 * because here is where the threshold below is applied — two copies of "did
	 * that count as a drag" would eventually disagree, and the symptom would be
	 * a click that neither selects nor moves.
	 *
	 * It outlives `dragging`, which is cleared on pointer-up: the click event
	 * arrives after that, and by then the only question left is what just
	 * happened.
	 */
	const draggedLast = useRef(false);
	// Dragging an edge's handle. Held separately from node dragging because the
	// two write to different state and a shared ref would need a discriminant
	// on every read.
	const bending = useRef<{
		id: string;
		baseDx: number;
		baseDy: number;
		fromX: number;
		fromY: number;
		startX: number;
		startY: number;
		pointerId: number;
		live: boolean;
	} | null>(null);

	const placed = useMemo(
		() => (layout ? applyPositions(layout.nodes, positions) : []),
		[layout, positions],
	);
	const edges = useMemo(() => routeEdges(document, placed, curves), [document, placed, curves]);
	const extent = useMemo(() => extentOf(placed), [placed]);

	/*
	 * The containment edges written as a `serves` line, as opposed to the ones
	 * implied by nesting. They are dashed on the canvas and they are the only
	 * ones that answer a click — the straddle is a claim somebody made in the
	 * file, and it is the only containment a gesture can take back.
	 */
	const removable = useMemo(
		() =>
			new Set(
				document.edges
					.filter((edge) => edge.kind === 'containment' && !edge.implied)
					.map((edge) => edge.id),
			),
		[document],
	);

	const classificationOf = useMemo(() => {
		const map = new Map<string, Classification>();
		for (const node of document.nodes) {
			if (node.kind === 'subdomain') map.set(node.id, node.classification);
		}
		return (id: string) => map.get(id) ?? null;
	}, [document]);

	/**
	 * Fit the whole map in view.
	 *
	 * Measures the element directly rather than reading the `size` state.
	 *
	 * That is not a micro-optimisation, it is the fix for a real ordering bug:
	 * `fullscreenchange` fires, React re-renders with `fullscreen` true, and the
	 * effect below runs — all before the ResizeObserver has reported the new
	 * dimensions. A fit computed from state at that moment uses the *old* panel
	 * size, which is exactly the "full screen does not resize the graph"
	 * symptom. `getBoundingClientRect` is always the truth at the moment it is
	 * asked.
	 */
	const fit = useCallback(() => {
		const box = surface.current?.getBoundingClientRect();
		if (!box || box.width === 0 || extent.width <= 1) return;

		const scale = clamp(Math.min(box.width / extent.width, box.height / extent.height), 0.1, 1.4);
		setView({
			scale,
			x: box.width / 2 - (extent.x + extent.width / 2) * scale,
			y: box.height / 2 - (extent.y + extent.height / 2) * scale,
		});
	}, [extent]);

	// The observer is installed once and must not close over a stale `fit`.
	const fitNow = useRef(fit);
	fitNow.current = fit;

	/**
	 * Set when full screen is entered or left, and cleared by the next resize.
	 *
	 * The two events are not simultaneous: the element is resized by the browser
	 * *after* the state change lands, so the only moment a fit is meaningful is
	 * once the resize has actually been observed. Deferring it here is what makes
	 * the button do what it looks like it does.
	 */
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
		if (connecting && (origin === null || placed.some((node) => node.id === origin))) return;
		setOrigin(null);
		setTip(null);
	}, [connecting, origin, placed]);

	useLayoutEffect(() => {
		if (!exporting) return;
		const svg = surface.current;
		if (svg) onExportSvg(toSvgFile(svg, extent, backgroundOf(svg), document.title));
		setExporting(false);
	}, [exporting, extent, document.title, onExportSvg]);

	const refitOnResize = useRef(false);
	useEffect(() => {
		refitOnResize.current = true;
	}, [fullscreen]);

	// Track the panel's own size, so the minimap's viewport rectangle is
	// computed against real pixels rather than a guess.
	useEffect(() => {
		const element = surface.current;
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setSize({ width: entry.contentRect.width, height: entry.contentRect.height });

			if (refitOnResize.current) {
				refitOnResize.current = false;
				fitNow.current();
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Fit on the first layout of a document and whenever its extent changes
	// materially — not on every render. Refitting while somebody is reading,
	// because they added a context and the canvas grew forty pixels, is
	// disorienting.
	//
	// Full screen is deliberately *not* in this key: it is handled by
	// `refitOnResize` above, because at the moment it changes the panel has not
	// been resized yet. A plain window or splitter resize refits nothing at all
	// — someone who has zoomed in to read a label should not lose it to a drag
	// of the divider.
	const shape = `${Math.round(extent.width)}x${Math.round(extent.height)}`;
	const fitted = useRef('');
	useEffect(() => {
		if (placed.length === 0 || size.width === 0 || fitted.current === shape) return;
		fitted.current = shape;
		fit();
	}, [shape, size.width, placed.length, fit]);

	if (!layout || placed.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-muted dark:text-slate-400">
				{document.nodes.length === 0
					? 'Nothing to draw yet. A file starts with `map "…" {`.'
					: 'Laying out…'}
			</div>
		);
	}

	/** Viewport in graph coordinates, for the minimap. */
	const viewport = {
		x: -view.x / view.scale,
		y: -view.y / view.scale,
		width: size.width / view.scale,
		height: size.height / view.scale,
	};

	const toGraph = (clientX: number, clientY: number) => {
		const box = surface.current?.getBoundingClientRect();
		return {
			x: ((clientX - (box?.left ?? 0)) - view.x) / view.scale,
			y: ((clientY - (box?.top ?? 0)) - view.y) / view.scale,
		};
	};

	/**
	 * A click on a node while the connect tool is held.
	 *
	 * First click sets the origin. Second commits — unless it landed back on the
	 * origin, which is a cancel rather than an edge to nowhere: an edge from a
	 * node to itself is not a thing this format can say, and refusing it with a
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

	const originNode = origin === null ? null : placed.find((node) => node.id === origin) ?? null;

	const zoomBy = (factor: number) => {
		setView((current) => {
			const scale = clamp(current.scale * factor, 0.1, 3);
			// Zoom about the centre of the panel rather than the origin, so the
			// thing being looked at stays under the eye.
			const cx = size.width / 2;
			const cy = size.height / 2;
			return {
				scale,
				x: cx - ((cx - current.x) / current.scale) * scale,
				y: cy - ((cy - current.y) / current.scale) * scale,
			};
		});
	};

	return (
		<div className="relative h-full overflow-hidden">
			{stale && (
				/*
				 * A document is unparseable for most of the time somebody is typing
				 * in it, and a graph that blanked on every half-written string would
				 * strobe — which would remove the only reason for the two panels to
				 * be side by side. So the last good render stays, dimmed, and says
				 * out loud that it is behind the text.
				 */
				<p className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950 dark:text-amber-200">
					Showing the last map that parsed
				</p>
			)}

			<CanvasBar
				onAdd={onAdd}
				canAdd={canAdd}
				connecting={connecting}
				onConnecting={setConnecting}
				onZoom={zoomBy}
				onFit={fit}
				onReset={() => {
					onPositions({});
					onCurves({});
				}}
				onSaveLayout={onSaveLayout}
				onLoadLayout={onLoadLayout}
				onExportSvg={() => setExporting(true)}
				onFullscreen={onFullscreen}
				fullscreen={fullscreen}
				moved={Object.keys(positions).length + Object.keys(curves).length}
				scale={view.scale}
			/>

			<svg
				ref={surface}
				className={`h-full w-full touch-none ${stale ? 'opacity-40' : ''} ${
					connecting ? 'cursor-crosshair' : dragging.current ? 'cursor-grabbing' : 'cursor-grab'
				}`}
				onWheel={(event) => {
					if (!event.ctrlKey && !event.metaKey) return;
					event.preventDefault();
					zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0 || dragging.current || origin !== null) return;
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
					// The candidate tracks the pointer and nothing else does while it
					// is out: panning under a half-drawn edge would leave it pointing
					// at a place the map has moved away from.
					if (origin !== null) {
						setTip(toGraph(event.clientX, event.clientY));
						return;
					}
					const bend = bending.current;
					if (bend) {
						if (!bend.live) {
							const travelled = Math.hypot(
								event.clientX - bend.startX,
								event.clientY - bend.startY,
							);
							// A press on the handle that never moves is a click, and a
							// click that captured the pointer would be delivered to the
							// canvas and clear the very selection the handle belongs to.
							if (travelled < DRAG_SLOP) return;
							bend.live = true;
							surface.current?.setPointerCapture(bend.pointerId);
						}
						const point = toGraph(event.clientX, event.clientY);
						onCurves({
							...curves,
							[bend.id]: {
								dx: bend.baseDx + (point.x - bend.fromX),
								dy: bend.baseDy + (point.y - bend.fromY),
							},
						});
						return;
					}
					const drag = dragging.current;
					if (drag) {
						if (!drag.moved) {
							const travelled = Math.hypot(
								event.clientX - drag.startX,
								event.clientY - drag.startY,
							);
							// Under the slop nothing happens at all: the box does not
							// creep, and the click that follows still selects.
							if (travelled < DRAG_SLOP) return;
							drag.moved = true;
							draggedLast.current = true;
							// Taken here rather than on the press: see DRAG_SLOP.
							surface.current?.setPointerCapture(drag.pointerId);
						}
						const point = toGraph(event.clientX, event.clientY);
						onPositions({
							...positions,
							[drag.id]: { x: point.x - drag.offsetX, y: point.y - drag.offsetY },
						});
						return;
					}
					const start = pan.current;
					if (!start) return;
					if (!start.live) {
						const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
						// Under the slop this is a click on whatever is underneath —
						// an edge, most usefully — and must be left alone to become
						// one.
						if (travelled < DRAG_SLOP) return;
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
					bending.current = null;
				}}
				onClick={(event) => {
					if (event.target !== event.currentTarget) return;
					// Clicking nothing loses the candidate — the gesture's own way
					// out, and the one the hint line promises.
					if (origin !== null) {
						setOrigin(null);
						setTip(null);
						return;
					}
					onSelect(null);
				}}
				role="img"
				aria-label={`Context map: ${document.nodes.length} nodes, ${document.edges.length} edges`}
			>
				<defs>
					{/*
						The dot grid. In graph coordinates rather than screen ones, so it
						pans and zooms with the content — which is what makes the canvas
						read as a surface things sit on rather than as a texture painted
						on the window.
					*/}
					<pattern id="dots" width={28} height={28} patternUnits="userSpaceOnUse">
						<circle cx={1.5} cy={1.5} r={1.1} className="fill-slate-300 dark:fill-slate-700" />
					</pattern>
					<marker
						id="head"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M0 1 L9 5 L0 9 z" className="fill-violet-600 dark:fill-violet-400" />
					</marker>
					<marker
						id="head-candidate"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M0 1 L9 5 L0 9 z" className="fill-brand dark:fill-purple-400" />
					</marker>
					<marker
						id="head-quiet"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="5"
						markerHeight="5"
						orient="auto-start-reverse"
					>
						<path d="M0 1 L9 5 L0 9 z" className="fill-slate-500 dark:fill-slate-600" />
					</marker>
				</defs>

				<g
					transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
					{...{ [VIEWPORT_MARK]: '' }}
				>
					{/*
					   Decorative, and explicitly not a click target. A filled rect
					   covering the canvas is the top hit for every click on empty
					   space, which made "the background" unclickable: selecting
					   nothing, and losing a half-drawn edge, both need the click to
					   reach the <svg> itself.

					   Absent from the exported frame. The dots say "this is a surface
					   you can move things on", which is true of the canvas and not of
					   a picture in somebody's slide deck.
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

					{/*
					   Edges stop answering the pointer while an edge is being drawn.
					   A click on an arc is not a click on a node, so by the rule the
					   hint line states it must lose the candidate — which means it
					   has to reach the canvas rather than being eaten by a curve.
					*/}
					<g className={origin === null ? undefined : 'pointer-events-none'}>
					{/* Containment first, so relationships draw over it. */}
					{edges
						.filter((edge) => edge.kind === 'containment')
						.map((edge) => {
							/*
							 * Only a written `serves` can be selected, because only a
							 * written `serves` can be deleted. The containment a node
							 * gets from sitting inside another one has no line of its
							 * own: removing it would mean moving the node, and a click
							 * target that opens a panel whose only button is greyed out
							 * is a worse answer than not being clickable.
							 */
							const written = removable.has(edge.id);
							const chosen = !exporting && selected === edge.id;
							return (
								<g key={edge.id}>
									{written && (
										<path
											d={edge.path}
											fill="none"
											strokeWidth={14}
											stroke="transparent"
											className="cursor-pointer"
											onClick={(event) => {
												event.stopPropagation();
												onSelect(chosen ? null : edge.id);
											}}
										/>
									)}
									<path
										d={edge.path}
										fill="none"
										strokeWidth={chosen ? 2.5 : 1.25}
										strokeDasharray={written ? '5 3' : undefined}
										className={
											chosen
												? 'stroke-violet-600 dark:stroke-violet-300'
												: 'stroke-slate-400 dark:stroke-slate-700'
										}
										markerEnd="url(#head-quiet)"
									/>
								</g>
							);
						})}

					{edges
						.filter((edge) => edge.kind === 'relationship')
						.map((edge) => {
							const active = !exporting && selected === edge.id;
							return (
								<g
									key={edge.id}
									onClick={(event) => {
										event.stopPropagation();
										onSelect(active ? null : edge.id);
									}}
									className="cursor-pointer"
								>
									{/* A fat invisible path so the curve is clickable without
									    demanding pixel accuracy on a 2px line. */}
									<path d={edge.path} fill="none" strokeWidth={14} stroke="transparent" />
									<path
										d={edge.path}
										fill="none"
										strokeWidth={active ? 2.75 : 1.75}
										className={
											active
												? 'stroke-violet-600 dark:stroke-violet-300'
												: 'stroke-violet-600/85 dark:stroke-violet-400/70'
										}
										markerEnd="url(#head)"
										markerStart={edge.directed ? undefined : 'url(#head)'}
									/>
									{active && edge.handle && (
										/*
										 * The bend handle, shown only on the selected edge.
										 *
										 * Not on hover: a handle that appears under the pointer
										 * on a canvas with eleven overlapping arcs is a handle
										 * you grab by accident. Clicking an edge is already how
										 * you inspect it, so selection is the gesture that says
										 * "this one".
										 */
										<circle
											cx={edge.handle.x}
											cy={edge.handle.y}
											r={6}
											className="cursor-move fill-white stroke-violet-600 dark:fill-slate-900 dark:stroke-violet-300"
											strokeWidth={2}
											onPointerDown={(pointer) => {
												if (pointer.button !== 0) return;
												pointer.stopPropagation();
												const point = toGraph(pointer.clientX, pointer.clientY);
												const existing = curves[edge.id];
												bending.current = {
													id: edge.id,
													baseDx: existing?.dx ?? 0,
													baseDy: existing?.dy ?? 0,
													fromX: point.x,
													fromY: point.y,
													startX: pointer.clientX,
													startY: pointer.clientY,
													pointerId: pointer.pointerId,
													live: false,
												};
											}}
											onClick={(pointer) => pointer.stopPropagation()}
										>
											<title>Drag to bend this edge</title>
										</circle>
									)}
									{edge.label && (
										<>
											<rect
												x={edge.label.x - labelWidth(edge.label.text) / 2}
												y={edge.label.y - 9}
												width={labelWidth(edge.label.text)}
												height={18}
												rx={4}
												className="fill-white stroke-violet-400 dark:fill-slate-900 dark:stroke-violet-700"
												strokeWidth={1}
											/>
											<text
												x={edge.label.x}
												y={edge.label.y + 4}
												textAnchor="middle"
												className="fill-violet-700 text-[11px] font-semibold dark:fill-violet-300"
											>
												{edge.label.text}
											</text>
										</>
									)}
								</g>
							);
						})}

					</g>

					{placed.map((node) => (
						<NodeBox
							key={node.id}
							placed={node}
							selected={!exporting && selected === node.id}
							pending={!exporting && origin === node.id}
							connecting={connecting}
							moved={!exporting && positions[node.id] !== undefined}
							classificationOf={classificationOf}
							onSelect={onSelect}
							onConnect={connectTo}
							onOpen={onOpenNode}
							didDrag={() => draggedLast.current}
							onGrab={(event) => {
								const point = toGraph(event.clientX, event.clientY);
								dragging.current = {
									id: node.id,
									offsetX: point.x - node.x,
									offsetY: point.y - node.y,
									startX: event.clientX,
									startY: event.clientY,
									pointerId: event.pointerId,
									moved: false,
								};
								draggedLast.current = false;
							}}
						/>
					))}

					{originNode && tip && !exporting && (
						/*
						 * The candidate. Drawn last so it lies over everything, dashed
						 * because it is not a fact about the map yet, and anchored on
						 * the origin's outline rather than its centre so it reads as
						 * leaving the box the way a settled edge does.
						 */
						<g className="pointer-events-none">
							{(() => {
								const start = borderTowards(originNode, tip);
								return (
									<path
										d={`M ${start.x} ${start.y} L ${tip.x} ${tip.y}`}
										fill="none"
										strokeWidth={2}
										strokeDasharray="7 5"
										className="stroke-brand dark:stroke-purple-400"
										markerEnd="url(#head-candidate)"
									/>
								);
							})()}
						</g>
					)}
				</g>
			</svg>

			<Minimap
				nodes={placed}
				extent={extent}
				viewport={viewport}
				onCentre={(point) =>
					setView((current) => ({
						...current,
						x: size.width / 2 - point.x * current.scale,
						y: size.height / 2 - point.y * current.scale,
					}))
				}
			/>

			<p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/85 px-2 py-1 text-[11px] text-ink-muted dark:bg-slate-900/85 dark:text-slate-400">
				{connecting
					? origin === null
						? 'click the box the edge starts from · esc to put the tool down'
						: 'click the box it ends at · click anywhere else to lose it · esc to cancel'
					: 'drag a box to move it · click an edge then drag its handle to bend it · drag the canvas to pan · ⌘/ctrl + scroll to zoom'}
			</p>
		</div>
	);
}

function NodeBox({
	placed,
	selected,
	pending,
	connecting,
	moved,
	classificationOf,
	onSelect,
	onConnect,
	onOpen,
	onGrab,
	didDrag,
}: {
	placed: PlacedNode;
	selected: boolean;
	/** This is the origin of the edge currently being drawn. */
	pending: boolean;
	connecting: boolean;
	moved: boolean;
	classificationOf: (id: string) => Classification | null;
	onSelect: (id: string | null) => void;
	onConnect: (id: string) => void;
	onOpen: (id: string) => void;
	onGrab: (event: React.PointerEvent) => void;
	/** Did the press this click is ending actually move the box? */
	didDrag: () => boolean;
}) {
	const { node, x, y, width, height } = placed;
	const style = styleFor(node, classificationOf);
	const second = secondLine(node);

	return (
		<g
			transform={`translate(${x} ${y})`}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				// Stops the canvas pan from also starting. A box under the pointer
				// means the gesture is about the box.
				event.stopPropagation();
				// With the connect tool in hand a box is a target, not a handle:
				// starting a move here would mean every edge drawn also nudged the
				// node it started from.
				if (!connecting) onGrab(event);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (connecting) {
					onConnect(node.id);
					return;
				}
				// A drag that ends over the box must not also select it — otherwise
				// every move opens the inspector.
				if (didDrag()) return;
				onSelect(selected ? null : node.id);
			}}
			onDoubleClick={(event) => {
				event.stopPropagation();
				if (connecting) return;
				onOpen(node.id);
			}}
			className={connecting ? 'cursor-crosshair' : 'cursor-move'}
		>
			{style.shape === 'ellipse' ? (
				<ellipse
					cx={width / 2}
					cy={height / 2}
					rx={width / 2}
					ry={height / 2}
					strokeWidth={selected || pending ? 3 : 1.5}
					strokeDasharray={style.dashed ? '6 4' : undefined}
					className={`${style.box} ${outline(selected, pending)}`}
				/>
			) : (
				<rect
					width={width}
					height={height}
					rx={style.radius}
					strokeWidth={selected || pending ? 3 : 1.5}
					strokeDasharray={style.dashed ? '6 4' : undefined}
					className={`${style.box} ${outline(selected, pending)}`}
				/>
			)}
			{moved && (
				/* A moved box is marked, because its position is view state and does
				   not travel with the file — the next person to open it sees the
				   computed arrangement, not this one. The corner an ellipse does not
				   have is traded for a point on its upper right curve. */
				<circle
					cx={style.shape === 'ellipse' ? width * 0.82 : width - 9}
					cy={style.shape === 'ellipse' ? height * 0.17 : 9}
					r={3}
					className="fill-brand dark:fill-purple-400"
				>
					<title>Moved — position is local to this browser</title>
				</circle>
			)}
			<text
				x={width / 2}
				y={node.kind === 'context' ? 30 : height / 2 + 1}
				textAnchor="middle"
				className={`${style.label} pointer-events-none text-[13px] font-semibold`}
			>
				{/* A context gets fewer characters than a subdomain of the same width:
				    an ellipse narrows away from its waist, and the name sits above it. */}
				{truncate(node.name, node.kind === 'domain' ? 34 : node.kind === 'context' ? 22 : 24)}
			</text>
			{second && (
				<text
					x={width / 2}
					y={node.kind === 'context' ? 50 : height / 2 + 20}
					textAnchor="middle"
					className={`${style.sub} pointer-events-none text-[10.5px]`}
				>
					{second}
				</text>
			)}
			{node.kind === 'context' && (
				<text
					x={width / 2}
					y={72}
					textAnchor="middle"
					className={`${style.sub} pointer-events-none text-[10px] ${
						node.aggregates.length === 0 ? 'italic' : ''
					}`}
				>
					{node.aggregates.length === 0
						? 'no aggregates'
						: `${node.aggregates.length} aggregate${node.aggregates.length === 1 ? '' : 's'}`}
				</text>
			)}
		</g>
	);
}

/**
 * The stroke that says what the box is right now.
 *
 * The origin of a half-drawn edge outranks the selection, because it is the
 * thing the visitor is in the middle of doing and the selection is the thing
 * they did before it.
 */
function outline(selected: boolean, pending: boolean): string {
	if (pending) return 'stroke-brand dark:stroke-purple-400';
	if (selected) return 'stroke-violet-600 dark:stroke-violet-300';
	return '';
}

function secondLine(node: Node): string {
	if (node.kind === 'domain') return 'domain';
	if (node.kind === 'subdomain') return classificationLabel[node.classification];
	return statusNote[node.status] || `${node.language.length} terms`;
}

function labelWidth(text: string): number {
	return Math.max(30, text.length * 7.2 + 12);
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
