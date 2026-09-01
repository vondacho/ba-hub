/**
 * Zoom and full screen, in the top bar.
 *
 * These four used to live on the canvas bar, with the drawing tools and the
 * layout buttons. They were moved up for two different reasons that happen to
 * point the same way.
 *
 * **Full screen** never acted on the canvas. It takes the whole editor — text,
 * problems and picture — because both panels are the tool, and a control that
 * takes the editor to the full screen was sitting inside one of the two panels
 * it moves. Beside the theme switch is where it belongs: those are the two
 * buttons about the shape of the window rather than about the document in it.
 *
 * **Zoom** does act on the canvas, and it is still reachable there — ⌘/ctrl and
 * the wheel, over the picture, which is the gesture anybody adjusting zoom
 * while looking at something actually uses. What the buttons add is the
 * readout and a keyboard path, and both of those are worth more in a bar that
 * is always visible than on an overlay that disappears with the graph pane.
 *
 * They keep the toolbar's 36px metric rather than the canvas bar's 28px, which
 * is the whole reason the estate writes that metric down: a control that moves
 * between the two surfaces takes the size of the surface it lands on.
 */

import Icon from '../mapper/Icon';
import IconButton from './IconButton';

/**
 * What the top bar may ask of a canvas.
 *
 * A handle rather than lifted state, and deliberately: the pan offset and the
 * scale are one value — zooming about the centre of the panel moves x and y as
 * well — and that value is only meaningful next to the panel's measured size.
 * Hoisting it into the editor would move three fields and a resize observer up
 * a level to give a button somewhere to point. The canvas keeps the view and
 * says what it currently is; the bar asks for a step.
 */
export interface CanvasControls {
	zoomBy: (factor: number) => void;
}

interface Props {
	controls: React.RefObject<CanvasControls | null>;
	/** In display units — 100% is what the canvas calls its natural size. */
	scale: number;
	fullscreen: boolean;
	onFullscreen: () => void;
	/**
	 * True while the picture is not on screen at all.
	 *
	 * The zoom buttons stay visible and go dead rather than disappearing: a
	 * toolbar whose buttons move under the pointer when a panel is toggled is one
	 * nobody builds muscle memory for. Full screen is never disabled — the source
	 * pane alone is a thing people take to the whole screen to read.
	 */
	noCanvas: boolean;
}

export default function ViewControls({ controls, scale, fullscreen, onFullscreen, noCanvas }: Props) {
	return (
		<>
			<IconButton
				label={noCanvas ? 'Zoom out (no picture showing)' : 'Zoom out'}
				onClick={() => controls.current?.zoomBy(0.8)}
				disabled={noCanvas}
			>
				<Icon name="zoom-out" />
			</IconButton>
			<span className="w-11 text-center text-xs tabular-nums text-ink-muted dark:text-slate-400">
				{noCanvas ? '—' : `${Math.round(scale * 100)}%`}
			</span>
			<IconButton
				label={noCanvas ? 'Zoom in (no picture showing)' : 'Zoom in'}
				onClick={() => controls.current?.zoomBy(1.25)}
				disabled={noCanvas}
			>
				<Icon name="zoom-in" />
			</IconButton>

			<IconButton
				label={fullscreen ? 'Leave full screen' : 'Full screen'}
				onClick={onFullscreen}
			>
				<Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} />
			</IconButton>
		</>
	);
}
