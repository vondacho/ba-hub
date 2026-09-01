import Icon, { type IconName } from './Icon';

/**
 * One `Add` button: what it makes, and why it is off.
 *
 * A list rather than a fixed three, because the two canvases make different
 * things — domains, subdomains and contexts on one; aggregates, entities,
 * value objects and enumerations on the other — and a bar that knew either
 * language would have to know both. `why` is the reason the button is
 * disabled, said on the button, or null when it is live.
 */
export interface AddChoice {
	readonly kind: string;
	readonly icon: IconName;
	readonly label: string;
	readonly why: string | null;
}

/**
 * The canvas widget bar.
 *
 * It began as view-only — the top bar handles the map, this one handles how
 * you are looking at it, which is why saving an arrangement lives here and
 * exporting the file lives up there. The drawing tools broke that line on
 * purpose. A tool that adds a box and a tool that draws an arrow between two
 * boxes are used *while looking at the canvas, with the pointer already on
 * it*, and putting them a panel away in the file toolbar would mean crossing
 * the whole component between every two strokes. They are kept in their own
 * group at the left, ahead of the divider, so the split is still legible: draw
 * on the left, look on the right.
 *
 * The controls here are the estate's 28px overlay size rather than the 36px a
 * toolbar uses, which is the size the boards' band and delivery rails take for
 * the same reason: this bar sits *on* the picture and takes space away from it.
 * The tooltip stays a native `title` for the same reason it does there — an
 * element tooltip is clipped at the edge of whatever scrolls.
 *
 * Zoom and full screen used to be here and are now in the top bar — see
 * `ViewControls`, which carries the argument. What is left is what genuinely
 * belongs to the picture: what you draw on it, and how it is arranged.
 *
 * Three controls are worth explaining.
 *
 * **Connect** is a mode rather than a drag, and that is deliberate. A drag
 * from a box already means "move the box", and overloading it would make every
 * nudge a possible accidental relationship. In connect mode you click the
 * origin, the candidate follows the pointer, and you click the target — or
 * click nothing, and lose it.
 *
 * **Reset layout** drops every position and curve the visitor has nudged and
 * goes back to what was computed. That button is why moving things is safe:
 * there is always a way back to the arrangement everybody else sees.
 *
 * **Export** writes the map as a standalone `.svg`: the whole map at its own
 * size rather than the current viewport, with the colours of the theme the
 * panel is showing baked in. It sits with the layout buttons because it is the
 * same kind of thing — an artefact of how the map looks, next to the file that
 * says what it means.
 *
 * **Save and load layout** write and read a `.dddview` sidecar. Positions stay
 * out of the `.ddd` file — otherwise every diff fills with coordinate churn —
 * but an arrangement in which the relationships finally read clearly is worth
 * keeping and worth handing to a colleague. Two files, two lifetimes; losing
 * the sidecar costs nothing.
 */

interface Props {
	/*
	 * The drawing tools and the layout sidecar are optional groups.
	 *
	 * The domain model editor uses this bar for the half it already has — fit
	 * the picture, reset it, write it out — and has no `.ddmview` sidecar of its
	 * own yet. Omitting a group is how it says so; the alternative was a second
	 * bar that would drift from this one in a week.
	 */
	onAdd?: (kind: string) => void;
	/** What this canvas can make, and what the selection allows right now. */
	adds?: readonly AddChoice[];
	connecting?: boolean;
	onConnecting?: (on: boolean) => void;
	onFit: () => void;
	onReset: () => void;
	onExportSvg: () => void;
	/** How many nodes and edges have been moved. Zero disables Reset. */
	moved: number;
}

export default function CanvasBar({
	onAdd,
	adds,
	connecting,
	onConnecting,
	onFit,
	onReset,
	onExportSvg,
	moved,
}: Props) {
	return (
		<div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-slate-300 bg-white/95 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
			{onAdd &&
				adds?.map((add) => (
					<Button
						key={add.kind}
						label={add.why ?? add.label}
						onClick={() => onAdd(add.kind)}
						disabled={add.why !== null}
					>
						<Icon name={add.icon} className="h-4 w-4" />
					</Button>
				))}
			{onConnecting && (
				<Button
					label={
						connecting ? 'Stop drawing edges' : 'Draw an edge: click the origin, then the target'
					}
					onClick={() => onConnecting(!connecting)}
					pressed={connecting}
				>
					<Icon name="connect" className="h-4 w-4" />
				</Button>
			)}
			{(adds || onConnecting) && (
				<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
			)}

			{/* A target rather than corner brackets: brackets read as "full screen",
			    which is a different button in a different bar. */}
			<Button label="Fit the whole map in view" onClick={onFit}>
				<Icon name="fit" className="h-4 w-4" />
			</Button>

			<Button
				label={moved === 0 ? 'Reset layout (nothing moved)' : `Reset layout (${moved} moved)`}
				onClick={onReset}
				disabled={moved === 0}
			>
				<Icon name="reset" className="h-4 w-4" />
			</Button>

			<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

			{/*
			 * The one export at this level, and it is the picture — the artefact
			 * that belongs to the canvas rather than to the document. The
			 * arrangement used to have its own save and load here, writing the
			 * `.dddview` by itself; the board's export carries that file now, and
			 * two buttons for one artefact is a choice nobody should have to make.
			 */}
			<Button label="Export the map as an .svg picture" onClick={onExportSvg}>
				<Icon name="picture" className="h-4 w-4" />
			</Button>
		</div>
	);
}

function Button({
	label,
	onClick,
	disabled,
	pressed,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	/** Set only on the mode button: everything else here fires and forgets. */
	pressed?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={label}
			aria-label={label}
			aria-pressed={pressed}
			className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none ${
				pressed
					? 'bg-brand text-white hover:bg-brand-strong'
					: 'hover:bg-slate-100 dark:hover:bg-slate-800'
			}`}
		>
			{children}
		</button>
	);
}
