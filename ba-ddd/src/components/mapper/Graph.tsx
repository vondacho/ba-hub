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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Classification, DddDocument, Node } from '../../lib/ddd/model';
import {
	applyPositions,
	extentOf,
	routeEdges,
	type Curves,
	type Layout,
	type PlacedNode,
	type Positions,
} from '../../lib/graph/layout';
import { classificationLabel, statusNote, styleFor } from '../../lib/graph/style';
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
}

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
}: Props) {
	const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
	const [size, setSize] = useState({ width: 800, height: 600 });
	const surface = useRef<SVGSVGElement>(null);
	const pan = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
	const dragging = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean } | null>(
		null,
	);
	// Dragging an edge's handle. Held separately from node dragging because the
	// two write to different state and a shared ref would need a discriminant
	// on every read.
	const bending = useRef<{ id: string; baseDx: number; baseDy: number; fromX: number; fromY: number } | null>(
		null,
	);

	const placed = useMemo(
		() => (layout ? applyPositions(layout.nodes, positions) : []),
		[layout, positions],
	);
	const edges = useMemo(() => routeEdges(document, placed, curves), [document, placed, curves]);
	const extent = useMemo(() => extentOf(placed), [placed]);

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
				onZoom={zoomBy}
				onFit={fit}
				onReset={() => {
					onPositions({});
					onCurves({});
				}}
				onSaveLayout={onSaveLayout}
				onLoadLayout={onLoadLayout}
				onFullscreen={onFullscreen}
				fullscreen={fullscreen}
				moved={Object.keys(positions).length + Object.keys(curves).length}
				scale={view.scale}
			/>

			<svg
				ref={surface}
				className={`h-full w-full touch-none ${stale ? 'opacity-40' : ''} ${
					dragging.current ? 'cursor-grabbing' : 'cursor-grab'
				}`}
				onWheel={(event) => {
					if (!event.ctrlKey && !event.metaKey) return;
					event.preventDefault();
					zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0 || dragging.current) return;
					pan.current = {
						x: event.clientX,
						y: event.clientY,
						originX: view.x,
						originY: view.y,
					};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					const bend = bending.current;
					if (bend) {
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
						const point = toGraph(event.clientX, event.clientY);
						drag.moved = true;
						onPositions({
							...positions,
							[drag.id]: { x: point.x - drag.offsetX, y: point.y - drag.offsetY },
						});
						return;
					}
					const start = pan.current;
					if (!start) return;
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
					if (event.target === event.currentTarget) onSelect(null);
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
						id="head-quiet"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="5"
						markerHeight="5"
						orient="auto-start-reverse"
					>
						<path d="M0 1 L9 5 L0 9 z" className="fill-slate-400 dark:fill-slate-600" />
					</marker>
				</defs>

				<g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
					<rect
						x={extent.x - 2000}
						y={extent.y - 2000}
						width={extent.width + 4000}
						height={extent.height + 4000}
						fill="url(#dots)"
					/>

					{/* Containment first, so relationships draw over it. */}
					{edges
						.filter((edge) => edge.kind === 'containment')
						.map((edge) => (
							<path
								key={edge.id}
								d={edge.path}
								fill="none"
								strokeWidth={1.25}
								className="stroke-slate-300 dark:stroke-slate-700"
								markerEnd="url(#head-quiet)"
							/>
						))}

					{edges
						.filter((edge) => edge.kind === 'relationship')
						.map((edge) => {
							const active = selected === edge.id;
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
												: 'stroke-violet-500/70 dark:stroke-violet-400/70'
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
												};
												surface.current?.setPointerCapture(pointer.pointerId);
											}}
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
												className="fill-white stroke-violet-300 dark:fill-slate-900 dark:stroke-violet-700"
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

					{placed.map((node) => (
						<NodeBox
							key={node.id}
							placed={node}
							selected={selected === node.id}
							moved={positions[node.id] !== undefined}
							classificationOf={classificationOf}
							onSelect={onSelect}
							onGrab={(event) => {
								const point = toGraph(event.clientX, event.clientY);
								dragging.current = {
									id: node.id,
									offsetX: point.x - node.x,
									offsetY: point.y - node.y,
									moved: false,
								};
								surface.current?.setPointerCapture(event.pointerId);
							}}
						/>
					))}
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
				drag a box to move it · click an edge then drag its handle to bend it · drag the canvas
				to pan · ⌘/ctrl + scroll to zoom
			</p>
		</div>
	);
}

function NodeBox({
	placed,
	selected,
	moved,
	classificationOf,
	onSelect,
	onGrab,
}: {
	placed: PlacedNode;
	selected: boolean;
	moved: boolean;
	classificationOf: (id: string) => Classification | null;
	onSelect: (id: string | null) => void;
	onGrab: (event: React.PointerEvent) => void;
}) {
	const { node, x, y, width, height } = placed;
	const style = styleFor(node, classificationOf);
	const second = secondLine(node);
	const dragged = useRef(false);

	return (
		<g
			transform={`translate(${x} ${y})`}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				// Stops the canvas pan from also starting. A box under the pointer
				// means the gesture is about the box.
				event.stopPropagation();
				dragged.current = false;
				onGrab(event);
			}}
			onPointerMove={() => {
				dragged.current = true;
			}}
			onClick={(event) => {
				event.stopPropagation();
				// A drag that ends over the box must not also select it — otherwise
				// every move opens the inspector.
				if (dragged.current) return;
				onSelect(selected ? null : node.id);
			}}
			className="cursor-move"
		>
			<rect
				width={width}
				height={height}
				rx={style.radius}
				strokeWidth={selected ? 3 : 1.5}
				strokeDasharray={style.dashed ? '6 4' : undefined}
				className={`${style.box} ${selected ? 'stroke-violet-600 dark:stroke-violet-300' : ''}`}
			/>
			{moved && (
				/* A moved box is marked, because its position is view state and does
				   not travel with the file — the next person to open it sees the
				   computed arrangement, not this one. */
				<circle cx={width - 9} cy={9} r={3} className="fill-brand dark:fill-purple-400">
					<title>Moved — position is local to this browser</title>
				</circle>
			)}
			<text
				x={width / 2}
				y={node.kind === 'context' ? 30 : height / 2 + 1}
				textAnchor="middle"
				className={`${style.label} pointer-events-none text-[13px] font-semibold`}
			>
				{truncate(node.name, node.kind === 'domain' ? 34 : 24)}
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
