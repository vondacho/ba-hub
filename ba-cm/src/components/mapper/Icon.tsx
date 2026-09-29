/**
 * The icon set.
 *
 * One file, one viewBox, one stroke weight — so a row of them reads as a row
 * rather than as a collection.
 *
 * Icons carry no accessible name of their own: they are always inside a button
 * that has one, and a `<title>` here would be read out twice.
 *
 * ## Why the stroke is not a round number
 *
 * These are drawn on a 16-unit grid and the boards' are drawn on a 24-unit one,
 * which is a difference nobody should have to see. Weight on screen is the
 * stroke as a *fraction of the grid*, so the boards' 1.6-on-24 — doc-portal's
 * weight, and the estate's — is this grid's 1.6 x 16/24. Written as the
 * arithmetic rather than as 1.07, because the next person to touch it needs to
 * know which number is the one that must not drift.
 *
 * Redrawing 34 glyphs onto a 24 grid would be the other way to do this, and it
 * would be the same picture for a great deal more work.
 */

export type IconName =
	| 'open'
	| 'export'
	| 'sample'
	| 'zoom-in'
	| 'zoom-out'
	| 'fit'
	| 'reset'
	| 'fullscreen'
	| 'fullscreen-exit'
	| 'theme-dark'
	| 'theme-light'
	| 'theme-auto'
	| 'panes-both'
	| 'panes-source'
	| 'panes-graph'
	| 'add-domain'
	| 'add-subdomain'
	| 'add-context'
	| 'connect'
	| 'align-left'
	| 'align-centre'
	| 'align-right'
	| 'align-top'
	| 'align-middle'
	| 'align-bottom'
	| 'spread-across'
	| 'spread-down'
	| 'remove'
	| 'picture'
	| 'store'
	| 'format'
	| 'legend'
	| 'inspector'
	| 'agent'
	| 'new'
	| 'add-aggregate'
	| 'add-entity'
	| 'add-value'
	| 'add-enum'
	| 'vector'
	| 'diagram'
	| 'notes'
	| 'notation'
	| 'doctrine'
	| 'github';

const PATHS: Record<IconName, React.ReactNode> = {
	// A blank sheet with a plus: a document that does not exist yet.
	new: (
		<>
			<path d="M4 2h5l3 3v9H4V2Zm5 0v3h3" />
			<path d="M8 8v4M6 10h4" />
		</>
	),
	/*
	 * The folder pair: the same two arrows as `open` and `export`, on a folder
	 * instead of a tray. A map and its models go out and come back together, and
	 * the icon should say "more than one file" before the tooltip does.
	 */
	/*
	 * The import/export pair, and they are drawn as a pair on purpose.
	 *
	 * One tray, one arrow, reversed. They are the two ends of one idea and they
	 * sit next to each other on the toolbar, so the only thing a reader has to
	 * tell apart is which way the arrow points.
	 *
	 * There were folder-shaped variants of both, from when each button meant one
	 * archive specifically. Neither button means that any more — Import takes
	 * whichever of this tool's files you hand it, and Export opens a dialog of
	 * six destinations, only one of which is an archive — so a folder glyph
	 * over-claimed on both, and both are gone.
	 */
	// A tray with an arrow coming *in* — the file comes to you.
	open: <path d="M2.5 10.5v2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2M8 2v7m0 0 2.5-2.5M8 9 5.5 6.5" />,
	// The same tray, arrow going *out*.
	export: <path d="M2.5 10.5v2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2M8 9.5v-7m0 0L5.5 5M8 2.5 10.5 5" />,
	// A speech mark with a spark in it: something that answers, and is not a
	// person. The same spark as `sample`, which is the house mark for generated.
	agent: (
		<>
			<path d="M13.5 3.5h-11v8h3v2.5l3-2.5h5v-8Z" />
			<path d="M8 5.6l.55 1.35L9.9 7.5l-1.35.55L8 9.4l-.55-1.35L6.1 7.5l1.35-.55L8 5.6Z" />
		</>
	),
	// A panel docked to the right of the frame, which is where it opens.
	inspector: (
		<>
			<rect x="2" y="3.5" width="12" height="9" rx="1" />
			<path d="M9.5 3.5v9" />
		</>
	),
	// Two swatches with their captions: a key, which is what a legend is.
	legend: (
		<>
			<rect x="2.5" y="3.5" width="3" height="3" rx="0.6" />
			<rect x="2.5" y="9.5" width="3" height="3" rx="0.6" />
			<path d="M7.5 5h6M7.5 11h6" />
		</>
	),
	// Lines stepped in from a margin: the shape of an indented block, which is
	// the whole of what this button does to the text.
	format: <path d="M2.5 3.5h11M6 6.5h7.5M6 9.5h7.5M2.5 12.5h11M3.5 6.5v3" />,
	// A document with a spark: the example map, not your work.
	sample: <path d="M4 2h5l3 3v9H4V2Zm5 0v3h3M6.5 11.5l.7-1.6 1.6-.7-1.6-.7-.7-1.6-.7 1.6-1.6.7 1.6.7.7 1.6Z" />,
	'zoom-in': <path d="M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm3.4 7.9L14 14M7 5v4M5 7h4" />,
	'zoom-out': <path d="M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm3.4 7.9L14 14M5 7h4" />,
	// A framed target: fit the content, as distinct from filling the screen.
	fit: (
		<>
			<rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
			<circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
		</>
	),
	reset: <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13 1.5V5H9.5" />,
	fullscreen: <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />,
	'fullscreen-exit': <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />,
	'theme-dark': <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />,
	'theme-light': <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1m10.9-3.9-1 1m-5.8 5.8-1 1m7.8 0-1-1M5.1 5.1l-1-1" />,
	/*
	 * The panel layouts. The same frame in all three, so they read as one
	 * control rather than as three unrelated pictures: split down the middle for
	 * two panes, and otherwise whole, holding the one thing that is left — lines
	 * of text, or two boxes and a relationship.
	 */
	'panes-both': (
		<>
			<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
			<path d="M8 3.5v9" />
		</>
	),
	'panes-source': (
		<>
			<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
			<path d="M5 6.25h6M5 8h6M5 9.75h3.5" />
		</>
	),
	'panes-graph': (
		<>
			<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
			<circle cx="6" cy="6.5" r="1.3" />
			<circle cx="10.25" cy="9.75" r="1.3" />
			<path d="M7 7.4 9.25 8.85" />
		</>
	),
	/*
	 * The three things you can add, drawn as the three things they are: the
	 * frame, the box inside it, and the round context the map is finally about.
	 * A plus in the corner of each, so the row reads as "add" before it reads
	 * as "domain".
	 */
	'add-domain': (
		<>
			<rect x="2" y="4" width="8" height="7" rx="1" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	'add-subdomain': (
		<>
			<rect x="2" y="4" width="8" height="7" rx="1" />
			<rect x="4" y="6" width="4" height="3" rx="0.5" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	'add-context': (
		<>
			<ellipse cx="6" cy="7.5" rx="4" ry="3.5" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	/*
	 * The four things the model canvas makes, and the same plus in the corner.
	 *
	 * They are drawn as what the diagram draws: a dashed boundary for the
	 * aggregate, a ruled class box for the entity, a plain one for the value
	 * object, and a list for the enumeration. Somebody who has looked at the
	 * canvas for ten seconds can read the row without the tooltips.
	 */
	'add-aggregate': (
		<>
			<rect x="2" y="4" width="8" height="7" rx="1" strokeDasharray="2 1.5" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	// The dot is the identity, which is the whole difference between the two.
	'add-entity': (
		<>
			<rect x="2" y="4" width="8" height="7" rx="1" />
			<path d="M2 6.5h8" />
			<circle cx="3.6" cy="8.6" r="0.7" fill="currentColor" stroke="none" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	'add-value': (
		<>
			<rect x="2" y="4" width="8" height="7" rx="1" />
			<path d="M2 6.5h8" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	'add-enum': (
		<>
			<path d="M2.5 4.5h7M2.5 7.5h7M2.5 10.5h4" />
			<path d="M11.5 11.5v4M9.5 13.5h4" />
		</>
	),
	// Two nodes and the line being drawn between them.
	connect: (
		<>
			<circle cx="4" cy="11.5" r="2" />
			<circle cx="12" cy="4.5" r="2" />
			<path d="M5.6 10.1 10.4 6" />
		</>
	),
	// Stacked discs: the drum every interface has meant "stored" with since
	// before anybody reading this was writing software.
	store: (
		<>
			<ellipse cx="8" cy="4" rx="5" ry="2" />
			<path d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" />
		</>
	),
	// A framed picture: a horizon and a sun, which is the one glyph everybody
	// reads as "image" at fourteen pixels.
	picture: (
		<>
			<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
			<circle cx="6" cy="6.5" r="1.1" />
			<path d="M3 11l3-2.5 2.5 2 2-1.5 2.5 2" />
		</>
	),
	remove: <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8.2a1 1 0 0 0 1 .8h2.8a1 1 0 0 0 1-.8l.6-8.2" />,
	/*
	 * The five the export dialog adds, drawn as what the file *is* rather than
	 * as what the format is called — "SVG" and "PNG" are the two strings a glyph
	 * conveys worst.
	 *
	 * A curve between two anchor handles for the vector, beside `picture`'s
	 * framed photograph for the raster: the pair has to be told apart at
	 * fourteen pixels, and a second framed rectangle would not be.
	 *
	 * A pair of braces for the notation — the one shape that says "this is a
	 * syntax" without a word of English in it — and an open book for the
	 * doctrine. Those two sit apart from the rest because what they carry is not
	 * this map; the dialog groups them under their own heading for the same
	 * reason.
	 */
	vector: (
		<>
			<path d="M3 13c0-5.5 3.5-9 9-9" />
			<rect x="1.5" y="12" width="3" height="3" rx="0.5" />
			<rect x="11.5" y="2.5" width="3" height="3" rx="0.5" />
		</>
	),
	/*
	 * Two boxes and the elbow between them: a diagram, as opposed to a picture
	 * of one. It sits on both diagram-source rows, because a `.puml` and a
	 * `.mmd` are the same drawing in two languages and the only glyph that
	 * could tell them apart would be a wordmark.
	 *
	 * Rectangles and a right angle, where `connect` is two circles and a
	 * diagonal. The pair has to be told apart at fourteen pixels.
	 */
	diagram: (
		<>
			<rect x="1.5" y="2.5" width="6" height="4" rx="1" />
			<rect x="8.5" y="9.5" width="6" height="4" rx="1" />
			<path d="M4.5 6.5v3a1 1 0 0 0 1 1h3" />
		</>
	),
	notes: <path d="M2.5 4h1.5M2.5 8h1.5M2.5 12h1.5M6.5 4h7M6.5 8h7M6.5 12h4.5" />,
	/*
	 * The six aligns, and they are one drawing with two variables: where the
	 * line is, and which part of the boxes touches it. Two boxes of *different*
	 * sizes hang off it in every one of them, because "these end up on one line"
	 * is the whole instruction and equal boxes would read as "these end up the
	 * same size" — which is the neighbouring idea nobody wants by accident.
	 *
	 * The line runs the full 16 in each, past the boxes at both ends, so the
	 * glyph says "line" rather than "edge of a shape" at the size it is used.
	 */
	'align-left': (
		<>
			<path d="M2.5 1.5v13" />
			<rect x="2.5" y="3" width="9" height="4" rx="1" />
			<rect x="2.5" y="9.5" width="6" height="4" rx="1" />
		</>
	),
	'align-centre': (
		<>
			<path d="M8 1.5v13" />
			<rect x="3.5" y="3" width="9" height="4" rx="1" />
			<rect x="5" y="9.5" width="6" height="4" rx="1" />
		</>
	),
	'align-right': (
		<>
			<path d="M13.5 1.5v13" />
			<rect x="4.5" y="3" width="9" height="4" rx="1" />
			<rect x="7.5" y="9.5" width="6" height="4" rx="1" />
		</>
	),
	'align-top': (
		<>
			<path d="M1.5 2.5h13" />
			<rect x="3" y="2.5" width="4" height="9" rx="1" />
			<rect x="9.5" y="2.5" width="4" height="6" rx="1" />
		</>
	),
	'align-middle': (
		<>
			<path d="M1.5 8h13" />
			<rect x="3" y="3.5" width="4" height="9" rx="1" />
			<rect x="9.5" y="5" width="4" height="6" rx="1" />
		</>
	),
	'align-bottom': (
		<>
			<path d="M1.5 13.5h13" />
			<rect x="3" y="4.5" width="4" height="9" rx="1" />
			<rect x="9.5" y="7.5" width="4" height="6" rx="1" />
		</>
	),
	/*
	 * The two spreads. Three bars rather than two, because two of anything are
	 * always evenly spaced and the glyph has to show the gap being *repeated*.
	 * Equal bars here on purpose, the opposite of the aligns above: what is
	 * equal in the result is the space, and drawing three different sizes would
	 * put the eye on the boxes instead of on the gaps between them.
	 */
	'spread-across': (
		<>
			<rect x="1.5" y="3" width="3" height="10" rx="1" />
			<rect x="6.5" y="3" width="3" height="10" rx="1" />
			<rect x="11.5" y="3" width="3" height="10" rx="1" />
		</>
	),
	'spread-down': (
		<>
			<rect x="3" y="1.5" width="10" height="3" rx="1" />
			<rect x="3" y="6.5" width="10" height="3" rx="1" />
			<rect x="3" y="11.5" width="10" height="3" rx="1" />
		</>
	),
	notation: (
		<path d="M6 2.5H5a1.5 1.5 0 0 0-1.5 1.5v2A1.5 1.5 0 0 1 2 7.5a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 0 5 12.5h1M10 2.5h1A1.5 1.5 0 0 1 12.5 4v2A1.5 1.5 0 0 0 14 7.5 1.5 1.5 0 0 0 12.5 9v2a1.5 1.5 0 0 1-1.5 1.5h-1" />
	),
	doctrine: (
		<>
			<path d="M8 4.5C7 3.5 5.3 3.2 2.5 3.2v9c2.8 0 4.5.3 5.5 1.3 1-1 2.7-1.3 5.5-1.3v-9c-2.8 0-4.5.3-5.5 1.3Z" />
			<path d="M8 4.5v9.5" />
		</>
	),
	/*
	 * GitHub's mark, the one glyph here that is somebody else's, and so the one
	 * not redrawn: it is doc-sm's path, on the 24 grid, left exactly as GitHub
	 * draws it. Filled rather than stroked because a logo is a silhouette.
	 *
	 * The transform does two things at once: 16/24 brings it onto this grid, and
	 * the extra inset puts it in the same field as the stroked glyphs, which stop
	 * short of the edge, instead of letting it run edge to edge and look a size
	 * larger than its neighbours. doc-sm's Icon.tsx insets it the same way.
	 */
	github: (
		<path
			transform="translate(1.3333 1.3333) scale(0.5556)"
			fill="currentColor"
			stroke="none"
			d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 5 18.3 5.3 18.3 5.3c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"
		/>
	),
	// Half-filled: following whatever the page is doing.
	'theme-auto': (
		<>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5Z" fill="currentColor" stroke="none" />
		</>
	),
};

export default function Icon({ name, className }: { name: IconName; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={className ?? 'h-[1.3125rem] w-[1.3125rem]'}
			fill="none"
			stroke="currentColor"
			strokeWidth={(1.6 * 16) / 24}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{PATHS[name]}
		</svg>
	);
}
