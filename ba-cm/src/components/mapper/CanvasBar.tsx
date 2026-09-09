import type { AlignTo, SpreadAxis } from '../../lib/graph/align';
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
 * The controls that are not self-evident:
 *
 * **Connect** is a mode rather than a drag, and that is deliberate. A drag
 * from a box already means "move the box", and overloading it would make every
 * nudge a possible accidental relationship. In connect mode you click the
 * origin, the candidate follows the pointer, and you click the target — or
 * click nothing, and lose it.
 *
 * **Align and spread** are the arrangement cluster, and they are the one group
 * here that comes and goes. Eight controls appear when two or more boxes are
 * picked and are gone the rest of the time.
 *
 * That breaks this bar's own rule — everything else stays put and greys out,
 * with the reason on the tooltip, because a button you cannot see is a feature
 * you do not know exists. The Add buttons have to keep that treatment: they are
 * the only way to make a node, so they have to be visible before anything is
 * selected. The arrangement cluster is the opposite case. It is *eight* dead
 * controls sitting on top of the picture, permanently, for a gesture that
 * cannot mean anything until a group exists — and this bar takes space away
 * from the map it sits on. So it arrives with the thing it acts on, and the
 * canvas hint line carries the shift-click that summons it.
 *
 * It goes at the end, after everything else, so that appearing never moves a
 * button somebody was reaching for.
 *
 * Within the cluster: six aligns, then the two spreads. The aligns are ordered
 * left-centre-right, top-middle-bottom, which is the order they are drawn in
 * and the order every other tool lists them in. Spread is last because it is
 * the one that is not an align — it moves what is *between* the extremes rather
 * than putting anything on a line — and it needs three boxes rather than two,
 * so it is also the pair most often greyed out.
 *
 * **Reset layout** drops every position and curve the visitor has nudged and
 * goes back to what was computed. That button is why moving things is safe:
 * there is always a way back to the arrangement everybody else sees.
 *
 * **Export is not here any more, on either canvas.** It was on this bar for the
 * editor that had nowhere else to put it, because the picture is a copy of the
 * live tree rather than a second renderer — which is a true fact about where
 * the code lives and a useless one to somebody looking for a file. Both pages
 * now have an export panel where a row can carry a sentence saying what a file
 * is for, and both canvases hand the picture over through `serialize` on their
 * controls handle instead. See `ExportDialog`.
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
	/**
	 * Line the picked boxes up on one line.
	 *
	 * Optional, like the drawing tools, because this bar is shared and a canvas
	 * without a group selection would have nothing to hand it. Both canvases do
	 * have one now; the option stays because the next one might not.
	 */
	onAlign?: (to: AlignTo) => void;
	/** Even out the gaps between them. Present whenever `onAlign` is. */
	onSpread?: (axis: SpreadAxis) => void;
	/**
	 * How many boxes are picked.
	 *
	 * Fewer than two and there is nothing to line up, so the cluster is not
	 * there at all; fewer than three and there is nothing between anything, so
	 * the spreads are greyed.
	 */
	picked?: number;
	onReset: () => void;
	/** How many nodes and edges have been moved. Zero disables Reset. */
	moved: number;
}

/**
 * The six aligns, in the order they are drawn: the three that make a column,
 * then the three that make a row.
 *
 * A table rather than twelve lines of JSX, so that the only difference between
 * two of these buttons is the two words that differ.
 */
const ALIGNS: readonly { to: AlignTo; icon: IconName; label: string }[] = [
	{ to: 'left', icon: 'align-left', label: 'left edges' },
	{ to: 'centre', icon: 'align-centre', label: 'centres, on one vertical line' },
	{ to: 'right', icon: 'align-right', label: 'right edges' },
	{ to: 'top', icon: 'align-top', label: 'top edges' },
	{ to: 'middle', icon: 'align-middle', label: 'middles, on one horizontal line' },
	{ to: 'bottom', icon: 'align-bottom', label: 'bottom edges' },
];

const SPREADS: readonly { axis: SpreadAxis; icon: IconName; label: string }[] = [
	{ axis: 'across', icon: 'spread-across', label: 'across' },
	{ axis: 'down', icon: 'spread-down', label: 'down' },
];

export default function CanvasBar({
	onAdd,
	adds,
	connecting,
	onConnecting,
	onFit,
	onAlign,
	onSpread,
	picked = 0,
	onReset,
	moved,
}: Props) {
	return (
		/*
		 * Wraps rather than overflowing. The cluster above can take this bar past
		 * the width of a narrow graph pane — a 42% split, or a window somebody has
		 * dragged in — and a toolbar that runs off the edge of the panel takes its
		 * last buttons with it.
		 */
		<div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white/95 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
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

			{onAlign && onSpread && picked >= 2 && (
				<>
					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
					{ALIGNS.map((align) => (
						<Button
							key={align.to}
							label={`Line the ${picked} picked boxes up by their ${align.label}`}
							onClick={() => onAlign(align.to)}
						>
							<Icon name={align.icon} className="h-4 w-4" />
						</Button>
					))}
					{SPREADS.map((spread) => (
						<Button
							key={spread.axis}
							label={
								picked < 3
									? `Space boxes evenly ${spread.label} (pick three or more)`
									: `Space the ${picked} picked boxes evenly ${spread.label}`
							}
							onClick={() => onSpread(spread.axis)}
							disabled={picked < 3}
						>
							<Icon name={spread.icon} className="h-4 w-4" />
						</Button>
					))}
				</>
			)}
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
