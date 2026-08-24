import Icon from './Icon';

/**
 * The canvas widget bar.
 *
 * Everything here is about the *view* rather than the document, which is why
 * saving and loading an arrangement lives on this bar and not on the one above
 * it: the top bar handles the map, this one handles how you are looking at it.
 *
 * Three controls are worth explaining.
 *
 * **Full screen** takes the whole mapper — editor, problems panel and graph —
 * to the full screen, not just the graph. Both panels are the tool; a graph
 * alone on a 27-inch display with the text it is made of hidden behind it would
 * be the wrong half.
 *
 * **Reset layout** drops every position and curve the visitor has nudged and
 * goes back to what was computed. That button is why moving things is safe:
 * there is always a way back to the arrangement everybody else sees.
 *
 * **Save and load layout** write and read a `.dddview` sidecar. Positions stay
 * out of the `.ddd` file — otherwise every diff fills with coordinate churn —
 * but an arrangement in which the relationships finally read clearly is worth
 * keeping and worth handing to a colleague. Two files, two lifetimes; losing
 * the sidecar costs nothing.
 */

interface Props {
	onZoom: (factor: number) => void;
	onFit: () => void;
	onReset: () => void;
	onSaveLayout: () => void;
	onLoadLayout: () => void;
	onFullscreen: () => void;
	fullscreen: boolean;
	/** How many nodes and edges have been moved. Zero disables Reset. */
	moved: number;
	scale: number;
}

export default function CanvasBar({
	onZoom,
	onFit,
	onReset,
	onSaveLayout,
	onLoadLayout,
	onFullscreen,
	fullscreen,
	moved,
	scale,
}: Props) {
	return (
		<div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-slate-300 bg-white/95 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
			<Button label="Zoom out" onClick={() => onZoom(0.8)}>
				<Icon name="zoom-out" />
			</Button>
			<span className="w-11 text-center text-[11px] tabular-nums text-ink-muted dark:text-slate-400">
				{Math.round(scale * 100)}%
			</span>
			<Button label="Zoom in" onClick={() => onZoom(1.25)}>
				<Icon name="zoom-in" />
			</Button>

			<span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

			{/* A target rather than corner brackets: brackets read as "full screen",
			    and full screen is a button on this same bar. */}
			<Button label="Fit the whole map in view" onClick={onFit}>
				<Icon name="fit" />
			</Button>

			<Button
				label={moved === 0 ? 'Reset layout (nothing moved)' : `Reset layout (${moved} moved)`}
				onClick={onReset}
				disabled={moved === 0}
			>
				<Icon name="reset" />
			</Button>

			<span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

			<Button
				label={moved === 0 ? 'Save this layout (nothing moved yet)' : 'Save this layout to a .dddview file'}
				onClick={onSaveLayout}
				disabled={moved === 0}
			>
				<Icon name="layout-save" />
			</Button>
			<Button label="Load a layout from a .dddview file" onClick={onLoadLayout}>
				<Icon name="layout-open" />
			</Button>

			<span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

			<Button
				label={fullscreen ? 'Leave full screen' : 'Full screen'}
				onClick={onFullscreen}
			>
				<Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} />
			</Button>
		</div>
	);
}

function Button({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={label}
			aria-label={label}
			className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent dark:hover:bg-slate-800"
		>
			{children}
		</button>
	);
}
