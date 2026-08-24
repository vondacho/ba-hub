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
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={pressed}
			className={`flex h-7 w-7 items-center justify-center rounded-md border ${
				pressed
					? 'border-brand bg-white text-brand dark:border-purple-400 dark:bg-slate-800 dark:text-purple-300'
					: 'border-slate-300 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800'
			}`}
		>
			{children}
		</button>
	);
}
