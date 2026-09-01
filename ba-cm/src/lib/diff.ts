/**
 * A line diff, for reviewing something before accepting it.
 *
 * Small on purpose. The one place this is used is the agent panel, where a
 * proposed document has to be read *before* it replaces the one somebody has
 * been working on — and a review that renders a one-line insertion as "the
 * whole file changed" is a review nobody performs. Longest-common-subsequence
 * over lines, which is what `diff` does and is about forty lines of it.
 *
 * Lines rather than words or characters. The unit that matters in a `.ddd` or a
 * `.ddm` is the line: a declaration, a field, a link. A word diff inside a
 * wrapped `intent` would be noise about where the fold landed.
 */

export type Change = 'same' | 'added' | 'removed';

export interface Row {
	readonly kind: Change;
	readonly text: string;
	/** The line number in the document this row belongs to, or null. */
	readonly before: number | null;
	readonly after: number | null;
}

/**
 * The rows that turn `before` into `after`.
 *
 * A quadratic table, and deliberately: these documents are hundreds of lines,
 * not hundreds of thousands, and the linear-space refinement would be another
 * fifty lines defending a millisecond nobody can perceive.
 */
export function diffLines(before: string, after: string): readonly Row[] {
	const a = before.split('\n');
	const b = after.split('\n');

	// lcs[i][j] — the length of the longest common subsequence of a[i…] and b[j…].
	const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
		}
	}

	const rows: Row[] = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			rows.push({ kind: 'same', text: a[i]!, before: i + 1, after: j + 1 });
			i += 1;
			j += 1;
			continue;
		}
		// A removal first when the table says the subsequence is no shorter that
		// way. The tie has to break the same direction every time or an edit shows
		// as add-then-remove in one place and remove-then-add in the next.
		if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
			rows.push({ kind: 'removed', text: a[i]!, before: i + 1, after: null });
			i += 1;
		} else {
			rows.push({ kind: 'added', text: b[j]!, before: null, after: j + 1 });
			j += 1;
		}
	}
	while (i < a.length) {
		rows.push({ kind: 'removed', text: a[i]!, before: i + 1, after: null });
		i += 1;
	}
	while (j < b.length) {
		rows.push({ kind: 'added', text: b[j]!, before: null, after: j + 1 });
		j += 1;
	}

	return rows;
}

/**
 * The rows worth showing: every change, with `context` unchanged lines around
 * it, and the long stretches of agreement collapsed.
 *
 * A proposal is usually a handful of lines in a file of two hundred. Printing
 * all two hundred is how a diff stops being read.
 */
export function hunks(rows: readonly Row[], context = 2): readonly (Row | null)[] {
	const keep = new Set<number>();
	rows.forEach((row, index) => {
		if (row.kind === 'same') return;
		for (let at = index - context; at <= index + context; at += 1) {
			if (at >= 0 && at < rows.length) keep.add(at);
		}
	});

	// null is a gap: the panel draws it as a rule rather than as a line.
	const out: (Row | null)[] = [];
	let gap = false;
	rows.forEach((row, index) => {
		if (keep.has(index)) {
			out.push(row);
			gap = false;
			return;
		}
		if (!gap) {
			out.push(null);
			gap = true;
		}
	});

	return out;
}

/** How much a proposal actually changes. For the sentence above the diff. */
export function tally(rows: readonly Row[]): { added: number; removed: number } {
	return {
		added: rows.filter((row) => row.kind === 'added').length,
		removed: rows.filter((row) => row.kind === 'removed').length,
	};
}
