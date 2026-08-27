/**
 * A top-bar button.
 *
 * Icon-only, and therefore `title` *and* `aria-label` on every one: an icon
 * with neither is a rebus. The title is what a pointer user gets and the label
 * is what a screen reader gets, and they say the same thing on purpose.
 *
 * Shared by the map's toolbar and the model's, which is the point at which it
 * stopped being a helper inside one component: two toolbars that look alike by
 * coincidence stop looking alike on the first change to either.
 *
 * ## The hub's one icon-button metric
 *
 * The same four numbers hold here, in doc-es, doc-sm and doc-em, so that moving
 * between the five tools does not move the controls under the pointer:
 *
 *   - a 36px box (`h-9 w-9`), fully rounded, for a toolbar;
 *   - a 28px box (`h-7 w-7`) for controls that sit *on* a canvas or a rail —
 *     `CanvasBar` here, the band and delivery rails there;
 *   - a 21px glyph in the first, 16px in the second;
 *   - a tooltip that is a real element, revealed on hover **and on keyboard
 *     focus**, because `title` alone is a mouse-only affordance and the person
 *     tabbing through a row of glyphs is exactly the one who cannot hover.
 *
 * The boards' copy of this file carries the same list. They are separate images
 * deployed separately and the estate copies rather than imports; keep them in
 * step by hand, and change all five when changing one.
 */
export default function IconButton({
	label,
	onClick,
	pressed,
	children,
}: {
	label: string;
	onClick: (event: React.MouseEvent) => void;
	/*
	 * Omitted by the buttons that *do* something. Present only on the ones that
	 * put the bar into a state, where a reader has to be able to see which state
	 * that is — and `aria-pressed` says the same thing the fill does.
	 */
	pressed?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span className="group relative inline-flex">
			<button
				type="button"
				onClick={onClick}
				aria-label={label}
				aria-pressed={pressed}
				className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
					pressed
						? 'border-brand bg-white text-brand dark:border-purple-400 dark:bg-slate-800 dark:text-purple-300'
						: 'border-slate-300 hover:border-brand hover:text-brand dark:border-slate-600 dark:hover:border-purple-400 dark:hover:text-purple-300'
				}`}
			>
				{children}
			</button>

			{/* No `role="tooltip"`: the accessible name already carries these words,
			    and a tooltip role on a hidden element only invites a second reading
			    of the same string. This element is here for eyes. */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none dark:bg-slate-200 dark:text-ink"
			>
				{label}
			</span>
		</span>
	);
}
