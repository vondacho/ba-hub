/**
 * The picture the canvas drew, as a PNG.
 *
 * ## There is no second renderer here, and there must not be
 *
 * Everywhere else in the estate the exported picture is *laid out again* from
 * the model, because those boards are grids and a grid is cheap to re-derive.
 * This one is not: the map's geometry comes from ELK, from an arrangement the
 * visitor may have dragged into shape by hand, and from a routing pass that
 * knows where every other edge went. Re-deriving that would be a second layout
 * engine whose only job is to agree with the first, and it would disagree the
 * first time either one changed.
 *
 * So the SVG is a copy of the live tree — `toSvgFile` clones it, inlines the
 * computed paint and strips the interaction — and this rasters *that*. The
 * canvas is the drawing; the SVG is a photograph of the canvas, and the PNG is
 * a photograph of the SVG.
 *
 * The consequence, and it is a real one: **no canvas, no picture.** With the
 * panes set to source only the graph is unmounted, there is nothing to clone,
 * and both picture rows in the export dialog say so rather than writing an
 * empty file. See `unavailable` in the dialog.
 *
 * ## At twice the size
 *
 * The one thing a PNG is for here is being pasted into a deck, a ticket or a
 * chat, and all three are read on displays where a 1× raster of small label
 * text looks like a fax.
 */

/** A drawn map: the markup, and the size it came out at. */
export interface Picture {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
}

/**
 * The size `toSvgFile` wrote onto the document.
 *
 * Read back off the markup rather than passed alongside it, because the caller
 * that has the SVG is the canvas and the caller that wants the size is the
 * export — and threading an `Extent` from one to the other would mean the
 * dialog knowing what a graph extent is. The attributes are written by
 * `toSvgFile` two lines apart and in that order, so this is reading a format
 * this repository controls rather than parsing XML in general.
 */
export function sizeOf(svg: string): { width: number; height: number } | null {
	const width = /\swidth="([\d.]+)"/.exec(svg);
	const height = /\sheight="([\d.]+)"/.exec(svg);
	if (width === null || height === null) return null;
	return { width: Number(width[1]), height: Number(height[1]) };
}

export async function svgToPng(picture: Picture, scale = 2): Promise<Blob> {
	const width = Math.max(1, Math.round(picture.width * scale));
	const height = Math.max(1, Math.round(picture.height * scale));

	const image = new Image();
	// Base64 of the UTF-8 bytes, built in chunks. `btoa` only takes latin-1, so
	// a map whose names are in any other script throws without the encode —
	// names are free text, so that is not hypothetical — and spreading the whole
	// byte array into `String.fromCharCode` overflows the argument stack on a
	// large map, which is a failure that only shows up on somebody's real work.
	const bytes = new TextEncoder().encode(picture.svg);
	let binary = '';
	for (let at = 0; at < bytes.length; at += 8192) {
		binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
	}
	image.src = `data:image/svg+xml;base64,${btoa(binary)}`;

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('The browser could not render the picture.'));
	});

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (context === null) throw new Error('This browser has no 2D canvas to raster with.');
	context.drawImage(image, 0, 0, width, height);

	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob === null) reject(new Error('The browser produced no PNG.'));
			else resolve(blob);
		}, 'image/png');
	});
}
