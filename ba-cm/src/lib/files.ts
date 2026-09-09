/**
 * Import and export. Adapted from doc-es's, unchanged in substance.
 */

export const DDD_EXTENSION = '.ddd';
export const DDD_ACCEPT = '.ddd,text/plain';

/**
 * What the mapper's Import takes: every file this tool writes, and the archive
 * that holds several of them.
 *
 * One list because there is one input. There used to be two — a `.ddd` picker
 * and a `.zip` picker — and the split asked the visitor a question they should
 * never have been asked: *which kind of file is this?* They are holding the
 * file. They know what it is called. The extension is the answer, and the code
 * can read it as easily as they can.
 *
 * `text/plain` and `application/zip` ride along because some platforms filter
 * by MIME type rather than by suffix, and a picker that greys out the file
 * somebody is looking at is worse than one that offers too much.
 *
 * The list is deliberately not `*`: it is the set this tool can do something
 * with, and offering more would be inviting the "that is none of those" note
 * rather than preventing it.
 */
export const IMPORT_ACCEPT =
	'.ddd,.dddview,.ddm,.ddmview,.zip,text/plain,application/json,application/zip';


export async function readTextFile(file: File): Promise<string> {
	return file.text();
}

/**
 * Clearing the input matters: selecting the same file twice in a row fires no
 * `change` event otherwise, and re-opening the file you just closed is a
 * completely ordinary thing to do.
 */
export function clearFileInput(input: HTMLInputElement | null): void {
	if (input) input.value = '';
}

export const SVG_EXTENSION = '.svg';

/**
 * `type` matters for the SVG: a file saved as `text/plain` opens in an editor
 * rather than a viewer on every desktop this component is likely to meet.
 */
export function downloadText(
	filename: string,
	text: string,
	type = 'text/plain;charset=utf-8',
): void {
	downloadBlob(filename, new Blob([text], { type }));
}

/**
 * The same, for something that is already bytes — an archive.
 *
 * `downloadText` is this with an encoding step in front of it, which is why
 * there is one anchor dance in this file rather than two.
 */
export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	// Revoked on the next tick rather than immediately: Safari has not finished
	// with the URL when click() returns.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The picture's filename.
 *
 * The last of a family of three. The other two — the `.ddd` and its `.dddview`
 * — went when the board's export became one archive of the whole thing:
 * `bundle.ts` builds those names from the storage keys, which are the same
 * slug, so having a second way to spell them was a second thing to keep in
 * step.
 *
 * `fallback` is what an untitled document is called. It defaults to the map's
 * because the map is the page that had a picture first, and the model page
 * passes its own: a `.svg` of an unnamed domain model landing as `map.svg`
 * would be filed, and later found, as the wrong document entirely.
 */
export function svgFilenameFor(title: string, fallback = 'map'): string {
	return `${slug(title, fallback)}${SVG_EXTENSION}`;
}

export function slug(text: string, fallback: string): string {
	const cleaned = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return cleaned || fallback;
}
