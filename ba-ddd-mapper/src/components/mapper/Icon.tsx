/**
 * The icon set.
 *
 * One file, one viewBox, one stroke weight — so a row of them reads as a row
 * rather than as a collection. Every icon is stroked at 1.6 on a 16-unit grid,
 * which is what keeps them the same visual weight at 14px.
 *
 * Icons carry no accessible name of their own: they are always inside a button
 * that has one, and a `<title>` here would be read out twice.
 */

export type IconName =
	| 'open'
	| 'export'
	| 'sample'
	| 'layout-save'
	| 'layout-open'
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
	| 'panes-graph';

const PATHS: Record<IconName, React.ReactNode> = {
	// A tray with an arrow coming *in* — the file comes to you.
	open: <path d="M2.5 10.5v2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2M8 2v7m0 0 2.5-2.5M8 9 5.5 6.5" />,
	// The same tray, arrow going *out*.
	export: <path d="M2.5 10.5v2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2M8 9.5v-7m0 0L5.5 5M8 2.5 10.5 5" />,
	// A document with a spark: the example map, not your work.
	sample: <path d="M4 2h5l3 3v9H4V2Zm5 0v3h3M6.5 11.5l.7-1.6 1.6-.7-1.6-.7-.7-1.6-.7 1.6-1.6.7 1.6.7.7 1.6Z" />,
	// A frame with a downward arrow: the arrangement, saved.
	'layout-save': <path d="M2.5 3.5h11v9h-11v-9Zm5.5 2v4m0 0 1.75-1.75M8 9.5 6.25 7.75" />,
	// The same frame, arrow up out of it.
	'layout-open': <path d="M2.5 3.5h11v9h-11v-9Zm5.5 6v-4m0 0L6.25 7.25M8 5.5l1.75 1.75" />,
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
			className={className ?? 'h-3.5 w-3.5'}
			fill="none"
			stroke="currentColor"
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{PATHS[name]}
		</svg>
	);
}
