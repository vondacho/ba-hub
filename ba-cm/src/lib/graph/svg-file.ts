/**
 * The map, as a file somebody else can open.
 *
 * The graph on screen is already SVG, so this is a copy rather than a second
 * renderer — and that is the whole design. A function that walked the document
 * and drew boxes would be a second implementation of `Graph.tsx`, and the two
 * would drift: the day the context nodes became ellipses, the export would
 * have kept drawing rectangles and nobody would have noticed until a diagram
 * in a slide deck disagreed with the tool it came from.
 *
 * What a copy has to fix is the styling. Every colour in the graph is a
 * Tailwind class — `fill-violet-200`, `stroke-sky-500` — which resolves against
 * a stylesheet that a standalone file does not have. Cloning the markup alone
 * produces a page of black shapes on white. So the clone is walked beside the
 * live tree and each element's *computed* style is written onto it as
 * attributes: whatever the browser actually decided, including the theme the
 * panel is pinned to, gets baked in.
 *
 * Four things are deliberately not copied.
 *
 * **The viewport transform.** On screen the content sits under a pan-and-zoom
 * transform; in a file it should be the whole map at its own size, so the
 * transform is cleared and the `viewBox` is set to the map's extent. What you
 * exported does not depend on where you happened to be looking.
 *
 * **The class attributes.** They resolve to nothing outside the app and would
 * only mislead whoever opens the file.
 *
 * **Anything invisible.** The fat transparent paths that make edges easy to
 * click are interaction, not drawing.
 *
 * **The session.** The selection ring, the bend handle, the dot grid and the
 * "moved here in your browser" marks are all absent, because the canvas draws
 * one frame without them and that frame is what gets copied. Keeping that
 * knowledge in the component rather than in a list of selectors here is what
 * stops the two from drifting.
 */

/** The style properties this graph actually uses. */
const PAINTED = [
	'fill',
	'fill-opacity',
	'stroke',
	'stroke-width',
	'stroke-dasharray',
	'stroke-linecap',
	'stroke-linejoin',
	'opacity',
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'letter-spacing',
	'text-anchor',
	'dominant-baseline',
] as const;

/** Marks the group carrying the pan-and-zoom transform, which the file drops. */
export const VIEWPORT_MARK = 'data-viewport';

export interface Extent {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Serialize the live graph into a standalone SVG document.
 *
 * `background` is passed in rather than read off the element because the panel
 * paints it on an ancestor `<section>`, not on the `<svg>` — and a file with no
 * background at all is transparent, which reads as white in one viewer and as
 * black in the next. A diagram whose text disappears depending on who opens it
 * is not an export.
 */
export function toSvgFile(
	live: SVGSVGElement,
	extent: Extent,
	background: string,
	title: string,
): string {
	const clone = live.cloneNode(true) as SVGSVGElement;

	inline(live, clone);
	strip(clone);

	const viewport = clone.querySelector(`[${VIEWPORT_MARK}]`);
	viewport?.removeAttribute('transform');
	viewport?.removeAttribute(VIEWPORT_MARK);

	const box = `${round(extent.x)} ${round(extent.y)} ${round(extent.width)} ${round(extent.height)}`;
	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('viewBox', box);
	clone.setAttribute('width', String(round(extent.width)));
	clone.setAttribute('height', String(round(extent.height)));
	clone.removeAttribute('class');
	clone.removeAttribute('style');

	const paper = live.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
	paper.setAttribute('x', String(round(extent.x)));
	paper.setAttribute('y', String(round(extent.y)));
	paper.setAttribute('width', String(round(extent.width)));
	paper.setAttribute('height', String(round(extent.height)));
	paper.setAttribute('fill', background);
	clone.insertBefore(paper, clone.firstChild);

	const label = live.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title');
	label.textContent = title;
	clone.insertBefore(label, clone.firstChild);

	return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
}

/**
 * Copy every painted property from the live tree onto the clone.
 *
 * The two trees are walked in lockstep because `getComputedStyle` only answers
 * for an element that is in a document — the clone is not, and attaching it
 * off-screen to make it answerable would be a second copy of the same problem.
 *
 * Only properties that differ from the parent's are written. A file that
 * repeated `font-family` on all four hundred elements would be several times
 * the size for no difference on screen, and unreadable if anybody opened it.
 */
function inline(live: Element, clone: Element, inherited?: CSSStyleDeclaration): void {
	const computed = live.ownerDocument.defaultView?.getComputedStyle(live);

	if (computed) {
		for (const property of PAINTED) {
			const value = computed.getPropertyValue(property);
			if (!value) continue;
			if (inherited && inherited.getPropertyValue(property) === value) continue;
			clone.setAttribute(property, value);
		}
	}
	clone.removeAttribute('class');

	const liveKids = live.children;
	const cloneKids = clone.children;
	for (let index = 0; index < liveKids.length && index < cloneKids.length; index += 1) {
		inline(liveKids[index]!, cloneKids[index]!, computed);
	}
}

/**
 * Drop what was only ever there for the pointer.
 *
 * An element painted with nothing — no stroke, no fill, or either of them
 * fully transparent — is a hit target. There are a dozen of them behind the
 * edges, each a 14-unit-wide invisible band, and in a file they are pure
 * weight.
 */
function strip(clone: Element): void {
	for (const element of [...clone.querySelectorAll('*')]) {
		if (element.tagName === 'title' || element.closest('defs')) continue;

		const fill = element.getAttribute('fill');
		const stroke = element.getAttribute('stroke');
		const invisible =
			(fill === null || fill === 'none' || isClear(fill)) &&
			(stroke === null || stroke === 'none' || isClear(stroke));

		if (invisible && element.children.length === 0 && !element.textContent?.trim()) {
			element.remove();
		}
	}
}

function isClear(colour: string): boolean {
	return colour === 'transparent' || /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(colour);
}

function round(value: number): number {
	return Math.round(value);
}

/**
 * The nearest background the panel actually paints.
 *
 * Walked up from the `<svg>`, which has none of its own: the colour lives on
 * the themed `<section>`, and that is also the element the theme pin sets
 * `data-theme` on — so a graph pinned light on a dark page exports light, which
 * is the whole point of being able to pin it.
 */
export function backgroundOf(element: Element): string {
	const view = element.ownerDocument.defaultView;
	let at: Element | null = element;

	while (at && view) {
		const colour = view.getComputedStyle(at).backgroundColor;
		if (colour && colour !== 'transparent' && !isClear(colour)) return colour;
		at = at.parentElement;
	}
	return '#ffffff';
}
