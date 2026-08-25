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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import CanvasBar from '../mapper/CanvasBar';

interface Props {
	document: DomainModel;
	placement: Placement | null;
	stale: boolean;
	selected: string | null;
	onSelect: (id: string | null) => void;
	positions: Positions;
	onPositions: (next: Positions) => void;
	onFullscreen: () => void;
	fullscreen: boolean;
	onExportSvg: (svg: string) => void;
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
	onSelect,
	positions,
	onPositions,
	onFullscreen,
	fullscreen,
	onExportSvg,
}: Props) {
	const [view, setView] = useState<View>({ x: 0, y: 0, scale: ZOOM_UNIT });
	/*
	 * Set for exactly one render, and that render is the exported one: no
	 * selection ring, no session marks. Same trick as the map's, and the same
	 * serialiser underneath.
	 */
	const [exporting, setExporting] = useState(false);
	const [size, setSize] = useState({ width: 800, height: 600 });
	const surface = useRef<SVGSVGElement>(null);
	const pan = useRef<{ x: number; y: number; originX: number; originY: number; pointerId: number; live: boolean } | null>(null);
	const dragging = useRef<{ id: string; offsetX: number; offsetY: number; startX: number; startY: number; pointerId: number; moved: boolean } | null>(null);
	const draggedLast = useRef(false);

	const boxes = useMemo(
		() => (placement ? applyPositions(placement.boxes, positions) : []),
		[placement, positions],
	);
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

	useLayoutEffect(() => {
		if (!exporting) return;
		const svg = surface.current;
		if (svg) onExportSvg(toSvgFile(svg, extent, backgroundOf(svg), document.context));
		setExporting(false);
	}, [exporting, extent, document.context, onExportSvg]);

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

	if (!placement || boxes.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink-muted dark:text-slate-400">
				{document.aggregates.length === 0
					? 'Nothing to draw yet. A file starts with `model "…" {`.'
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
				onZoom={zoomBy}
				onFit={fit}
				onReset={() => onPositions({})}
				onExportSvg={() => setExporting(true)}
				onFullscreen={onFullscreen}
				fullscreen={fullscreen}
				moved={Object.keys(positions).length}
				scale={view.scale / ZOOM_UNIT}
			/>

			<svg
				ref={surface}
				className={`h-full w-full touch-none ${stale ? 'opacity-40' : ''} cursor-grab`}
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
						pointerId: event.pointerId,
						live: false,
					};
				}}
				onPointerMove={(event) => {
					const drag = dragging.current;
					if (drag) {
						if (!drag.moved) {
							if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_SLOP) return;
							drag.moved = true;
							draggedLast.current = true;
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
					if (event.target === event.currentTarget) onSelect(null);
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
							selected={!exporting && selected === box.id}
							onSelect={onSelect}
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
							selected={!exporting && selected === box.id}
							onSelect={onSelect}
							didDrag={() => draggedLast.current}
							onGrab={(event) => grab(event, box)}
						/>
					))}
				</g>
			</svg>

			<p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/85 px-2 py-1 text-[11px] text-ink-muted dark:bg-slate-900/85 dark:text-slate-400">
				drag a class to move it · drag an aggregate to move it with its members · drag the canvas
				to pan · ⌘/ctrl + scroll to zoom
			</p>
		</div>
	);

	function grab(event: React.PointerEvent, box: PlacedBox) {
		const point = toGraph(event.clientX, event.clientY);
		dragging.current = {
			id: box.id,
			offsetX: point.x - box.x,
			offsetY: point.y - box.y,
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
	onSelect,
	didDrag,
	onGrab,
}: {
	box: PlacedBox;
	aggregate: AggregateNode;
	selected: boolean;
	onSelect: (id: string | null) => void;
	didDrag: () => boolean;
	onGrab: (event: React.PointerEvent) => void;
}) {
	return (
		<g
			transform={`translate(${box.x} ${box.y})`}
			className="cursor-move"
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				onGrab(event);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (didDrag()) return;
				onSelect(selected ? null : box.id);
			}}
		>
			<rect
				width={box.width}
				height={box.height}
				rx={16}
				strokeWidth={selected ? 3 : 1.5}
				strokeDasharray="7 5"
				// The boundary's violet is the map's core violet, one tint lighter in
				// the fill so the root box sitting on it stays the darker of the two.
				className={`fill-violet-50/70 dark:fill-violet-950/40 ${
					selected ? 'stroke-violet-600 dark:stroke-violet-300' : 'stroke-violet-600 dark:stroke-violet-700'
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
	onSelect,
	didDrag,
	onGrab,
}: {
	box: PlacedBox;
	member: Member;
	selected: boolean;
	onSelect: (id: string | null) => void;
	didDrag: () => boolean;
	onGrab: (event: React.PointerEvent) => void;
}) {
	const rows = rowsOf(member);
	const root = member.kind === 'entity' && member.root;

	return (
		<g
			transform={`translate(${box.x} ${box.y})`}
			className="cursor-move"
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.stopPropagation();
				onGrab(event);
			}}
			onClick={(event) => {
				event.stopPropagation();
				if (didDrag()) return;
				onSelect(selected ? null : box.id);
			}}
		>
			<rect
				width={box.width}
				height={box.height}
				rx={6}
				strokeWidth={selected ? 3 : 1.5}
				className={`${paint(member)} ${selected ? 'stroke-violet-600 dark:stroke-violet-300' : ''}`}
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
