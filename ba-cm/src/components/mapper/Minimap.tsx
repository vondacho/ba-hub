/**
 * The minimap: the whole graph at a glance, and where you are in it.
 *
 * It exists because the two decisions that make this graph readable — a domain
 * on top, a row of contexts at the bottom, relationships bowing below them —
 * also make it *wide*. The seed map is about 2,500 units across, which at a
 * readable zoom is several screens. Panning without a minimap in a graph that
 * wide means losing the shape of the thing you are editing.
 *
 * Deliberately not interactive beyond click-to-centre. A minimap that supports
 * dragging its own viewport rectangle is a second pan control with its own
 * gesture state, and the canvas already has one that works.
 */

import type { PlacedNode } from '../../lib/graph/layout';

interface Props {
	nodes: readonly PlacedNode[];
	extent: { x: number; y: number; width: number; height: number };
	/** The visible rectangle, in graph coordinates. */
	viewport: { x: number; y: number; width: number; height: number };
	onCentre: (point: { x: number; y: number }) => void;
}

const WIDTH = 168;
const HEIGHT = 112;

export default function Minimap({ nodes, extent, viewport, onCentre }: Props) {
	if (nodes.length === 0) return null;

	const scale = Math.min(WIDTH / extent.width, HEIGHT / extent.height);
	const offsetX = (WIDTH - extent.width * scale) / 2;
	const offsetY = (HEIGHT - extent.height * scale) / 2;

	const project = (x: number, y: number) => ({
		x: (x - extent.x) * scale + offsetX,
		y: (y - extent.y) * scale + offsetY,
	});

	const view = project(viewport.x, viewport.y);

	return (
		<div className="absolute right-3 bottom-3 overflow-hidden rounded-lg border border-slate-300 bg-white/95 shadow-md dark:border-slate-700 dark:bg-slate-900/95">
			<svg
				width={WIDTH}
				height={HEIGHT}
				className="block cursor-pointer"
				onClick={(event) => {
					const box = event.currentTarget.getBoundingClientRect();
					onCentre({
						x: (event.clientX - box.left - offsetX) / scale + extent.x,
						y: (event.clientY - box.top - offsetY) / scale + extent.y,
					});
				}}
				role="img"
				aria-label="Overview of the whole map"
			>
				{nodes.map((placed) => {
					const point = project(placed.x, placed.y);
					return (
						<rect
							key={placed.id}
							x={point.x}
							y={point.y}
							width={Math.max(1.5, placed.width * scale)}
							height={Math.max(1.5, placed.height * scale)}
							rx={1}
							className={
								placed.node.kind === 'domain'
									? 'fill-slate-700 dark:fill-slate-300'
									: placed.node.kind === 'subdomain'
										? 'fill-slate-400 dark:fill-slate-500'
										: 'fill-violet-400 dark:fill-violet-500'
							}
						/>
					);
				})}

				<rect
					x={view.x}
					y={view.y}
					width={Math.max(4, viewport.width * scale)}
					height={Math.max(4, viewport.height * scale)}
					className="fill-brand/10 stroke-brand dark:fill-purple-400/10 dark:stroke-purple-400"
					strokeWidth={1.5}
				/>
			</svg>
		</div>
	);
}
