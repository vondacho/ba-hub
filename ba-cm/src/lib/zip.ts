/**
 * ZIP, in about as little as it can honestly be done in.
 *
 * A dependency was the obvious alternative and was not obviously better. The
 * browser now deflates and inflates natively — `CompressionStream('deflate-raw')`
 * — so what a library would add over this is the parts of the format nobody
 * here writes: encryption, spanning, zip64, the six ways to record a timestamp.
 * What it would cost is a supply-chain edge on a tool whose whole claim is that
 * your work is a text file you can read.
 *
 * Two rules keep this honest about what it is:
 *
 *   **It reads from the central directory, never from the local headers.** A
 *   zip written by a streaming writer — Finder, `zip`, half the libraries —
 *   sets a flag saying "the sizes are in a descriptor *after* the data", and a
 *   reader that trusted the local header would read zero bytes from every
 *   entry. The central directory at the end always has the real sizes.
 *
 *   **It refuses what it cannot read** rather than returning half a file.
 *   Encrypted entries, zip64, and methods other than store and deflate throw
 *   with the reason, and the caller says so.
 */

interface Entry {
	/** A path with `/` separators, relative to the archive root. */
	readonly path: string;
	readonly text: string;
}

export type { Entry as ZipEntry };

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

/** Bit 11: the name is UTF-8. Set on write; ignored on read, where we assume it. */
const UTF8 = 0x800;
/** Bit 0: encrypted. Nothing here can read one. */
const ENCRYPTED = 0x1;

const STORED = 0;
const DEFLATED = 8;

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function zip(entries: readonly Entry[]): Promise<Blob> {
	const encoder = new TextEncoder();
	// `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: `Blob` will not
	// take a view that might be backed by a `SharedArrayBuffer`, and the default
	// type parameter allows one.
	const locals: Uint8Array<ArrayBuffer>[] = [];
	const centrals: Uint8Array<ArrayBuffer>[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.path);
		const body = encoder.encode(entry.text);
		const crc = crc32(body);
		const packed = await deflate(body);
		// Deflate that made the file bigger is deflate not worth doing. A short
		// `.ddmview` is exactly that case.
		const stored = packed === null || packed.length >= body.length;
		const data = stored ? body : packed;
		const method = stored ? STORED : DEFLATED;

		const header = new Uint8Array(30 + name.length);
		const view = new DataView(header.buffer);
		view.setUint32(0, LOCAL, true);
		view.setUint16(4, 20, true); // version needed: 2.0, which is deflate
		view.setUint16(6, UTF8, true);
		view.setUint16(8, method, true);
		view.setUint16(10, 0, true); // time — see `dosDate`
		view.setUint16(12, dosDate(), true);
		view.setUint32(14, crc, true);
		view.setUint32(18, data.length, true);
		view.setUint32(22, body.length, true);
		view.setUint16(26, name.length, true);
		view.setUint16(28, 0, true); // no extra field
		header.set(name, 30);

		const central = new Uint8Array(46 + name.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, CENTRAL, true);
		centralView.setUint16(4, 20, true); // version made by
		centralView.setUint16(6, 20, true); // version needed
		centralView.setUint16(8, UTF8, true);
		centralView.setUint16(10, method, true);
		centralView.setUint16(12, 0, true);
		centralView.setUint16(14, dosDate(), true);
		centralView.setUint32(16, crc, true);
		centralView.setUint32(20, data.length, true);
		centralView.setUint32(24, body.length, true);
		centralView.setUint16(28, name.length, true);
		centralView.setUint32(38, 0o100644 << 16, true); // a regular file, rw-r--r--
		centralView.setUint32(42, offset, true);
		central.set(name, 46);

		locals.push(header, data);
		centrals.push(central);
		offset += header.length + data.length;
	}

	const directory = centrals.reduce((total, part) => total + part.length, 0);

	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, EOCD, true);
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, directory, true);
	endView.setUint32(16, offset, true);

	return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

/**
 * The modification date every entry gets: none, as far as the format can say
 * it.
 *
 * A real timestamp would make two exports of an unchanged map differ byte for
 * byte, which is the same objection this component makes to putting positions
 * in the `.ddd`. Zero is not a legal DOS date, so the epoch it uses — 1 January
 * 1980 — is the closest thing to "unset" the field has.
 */
function dosDate(): number {
	return (1 << 5) | 1; // month 1, day 1, year 1980
}

/** `deflate-raw` if the browser has it, else null and the caller stores. */
async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
	if (typeof CompressionStream === 'undefined') return null;
	try {
		const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Takes a view as well as a buffer, and the difference has teeth: Node pools
 * small `Buffer`s, so a 3KB file's `.buffer` is an 8KB arena with the file
 * somewhere inside it. Reading from offset zero of that finds nothing. A
 * browser's `File.arrayBuffer()` is exact, but an API that is only correct on
 * one of its two callers is not correct.
 */
export async function unzip(data: ArrayBuffer | Uint8Array): Promise<readonly Entry[]> {
	// A view is *copied* rather than adopted, because it may be a window onto a
	// larger arena and every offset below is measured from zero. Note this must
	// be the constructor and not `.slice()`: Node's `Buffer` overrides `slice`
	// to mean `subarray`, so the copy that looks obvious returns another view
	// into the same pool.
	const bytes: Uint8Array<ArrayBuffer> =
		data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
	const view = new DataView(bytes.buffer);
	const end = findEnd(view, bytes.length);

	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);

	const decoder = new TextDecoder();
	const entries: Entry[] = [];

	for (let index = 0; index < count; index += 1) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
			throw new ZipError('The archive’s directory is damaged.');
		}

		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const packedSize = view.getUint32(at + 20, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const localAt = view.getUint32(at + 42, true);
		const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

		at += 46 + nameLength + extraLength + commentLength;

		// A directory entry carries no data, and the folders here are implied by
		// the paths anyway.
		if (path.endsWith('/')) continue;
		// What macOS puts beside your files and nobody asked for.
		if (path.startsWith('__MACOSX/') || path.split('/').pop() === '.DS_Store') continue;

		if (flags & ENCRYPTED) throw new ZipError(`“${path}” is encrypted.`);
		if (method !== STORED && method !== DEFLATED) {
			throw new ZipError(`“${path}” uses a compression method this cannot read.`);
		}
		if (packedSize === 0xffffffff) throw new ZipError('The archive is zip64, which this cannot read.');

		// The local header again, only for the two lengths: they may differ from
		// the central directory's, and the data starts after them.
		if (view.getUint32(localAt, true) !== LOCAL) {
			throw new ZipError(`“${path}” is not where the directory says it is.`);
		}
		const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
		const packed = bytes.subarray(dataAt, dataAt + packedSize);

		entries.push({
			path,
			text: decoder.decode(method === DEFLATED ? await inflate(packed) : packed),
		});
	}

	return entries;
}

/**
 * The end-of-central-directory record, found by scanning backwards.
 *
 * There is no other way: the record is last, is variable length because it may
 * carry a comment, and the comment may contain its own signature. Scanning from
 * the end and taking the first match is what every reader does, and the comment
 * length field is checked so a signature *inside* a comment is not mistaken for
 * the record.
 */
function findEnd(view: DataView, length: number): number {
	const floor = Math.max(0, length - 0xffff - 22);
	for (let at = length - 22; at >= floor; at -= 1) {
		if (view.getUint32(at, true) !== EOCD) continue;
		if (at + 22 + view.getUint16(at + 20, true) === length) return at;
	}
	throw new ZipError('That does not look like a zip archive.');
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	if (typeof DecompressionStream === 'undefined') {
		throw new ZipError('This browser cannot decompress the archive.');
	}
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Thrown with a sentence the panel can show. */
export class ZipError extends Error {}

// ---------------------------------------------------------------------------

const TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array<ArrayBuffer>): number {
	let c = 0xffffffff;
	for (const byte of data) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
