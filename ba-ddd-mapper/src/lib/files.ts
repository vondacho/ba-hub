/**
 * Import and export. Adapted from doc-es's, unchanged in substance.
 */

export const DDD_EXTENSION = '.ddd';
export const DDD_ACCEPT = '.ddd,text/plain';

/** The layout sidecar. See src/lib/view-file.ts for why it is a separate file. */
export const VIEW_EXTENSION = '.dddview';
export const VIEW_ACCEPT = '.dddview,application/json';

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

export function downloadText(filename: string, text: string): void {
	const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
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

export function filenameFor(title: string): string {
	return `${slug(title, 'map')}${DDD_EXTENSION}`;
}

/** The sidecar takes the map's stem, so the pair sorts together in a folder. */
export function viewFilenameFor(title: string): string {
	return `${slug(title, 'map')}${VIEW_EXTENSION}`;
}

export function slug(text: string, fallback: string): string {
	const cleaned = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return cleaned || fallback;
}
