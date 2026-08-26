/**
 * The formatter: whitespace at the edges of lines, and nothing else.
 *
 * Both languages share the lexer, so both share this. What it fixes is the one
 * thing hand-typing gets wrong and the one thing an edit cannot fix for you —
 * where a line starts. Indentation from the brace depth, continuation lines
 * under the thing they continue, tabs expanded, trailing whitespace gone, one
 * newline at the end.
 *
 * **What it deliberately does not do is reflow.** It never moves a token, never
 * rewraps a string, never inserts or removes a blank line, and never touches
 * the space between a keyword and its value. That last one is not laziness: the
 * samples align their fields into columns — `intent    `, `language  `,
 * `aggregate ` — and a formatter with an opinion about inter-token spacing
 * would flatten a deliberate layout on first use. Blank lines are the author's
 * paragraphing for the same reason.
 *
 * The test it is written against is that both samples are already formatted:
 * `format(SAMPLE) === SAMPLE`. A formatter that changes the file it is supposed
 * to be modelled on is not a formatter, it is a second opinion.
 */

import { tokenize } from './ddd/lexer';
import { INDENT } from './source';

/**
 * Reformat, or null when the text cannot be formatted safely.
 *
 * Null means the source does not lex — an unterminated string, most likely.
 * Every line after it would be read as being inside that string and re-indented
 * as its continuation, which is how a formatter eats a file. Parsing is *not*
 * required: a document full of errors is exactly when somebody reaches for
 * this, and the brace depth is legible long before the grammar is.
 */
export function format(source: string): string | null {
	try {
		tokenize(source);
	} catch {
		return null;
	}

	const lines = source.split('\n');
	const out: string[] = [];

	let depth = 0;
	let inString = false;
	/** Where the open string's text begins, for its continuation lines. */
	let stringColumn = 0;
	/** The line above, when a line starting with a string could be continuing it. */
	let previous: { opensBlock: boolean; argColumn: number | null } | null = null;

	for (const line of lines) {
		// Leading whitespace is what this rewrites; trailing whitespace goes. Both
		// are insignificant inside a multi-line string too — the lexer strips the
		// indentation off a continuation line and trims its end — so a string
		// spanning lines is re-indented as safely as anything else.
		const content = line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

		if (content === '') {
			out.push('');
			// A gap breaks a statement from anything below it. Without this, a
			// value list one blank line under another would be read as its
			// continuation and indented into it.
			if (!inString) previous = null;
			continue;
		}

		const indent = inString
			? stringColumn
			: content.startsWith('}')
				? Math.max(0, depth - 1) * INDENT.length
				: // A line that opens with a string continues the statement above —
					// `language "a" "b"` wrapping onto a second line — and lines up
					// under that statement's first value. Unless the line above opened
					// a block, in which case this is the first line inside it and an
					// ordinary child: an `enum`'s literals, not a wrapped list.
					content.startsWith('"') &&
						previous !== null &&
						!previous.opensBlock &&
						previous.argColumn !== null
					? previous.argColumn
					: depth * INDENT.length;

		const scanned = scan(content, indent, inString);
		out.push(' '.repeat(indent) + scanned.text);

		depth = Math.max(0, depth + scanned.depth);
		inString = scanned.open;
		// Only a line that *opened* a string says where its text begins. The
		// second continuation line of a three-line string opens nothing, and
		// taking its answer would put the third line in column zero.
		if (scanned.stringColumn !== null) stringColumn = scanned.stringColumn;
		// A comment is not a statement and cannot be continued.
		if (!inString) previous = content.startsWith('//') ? null : scanned;
	}

	// Exactly one newline at the end. A file that ends mid-line is a file that
	// every other tool will append to badly.
	while (out.length > 1 && out.at(-1) === '') out.pop();
	return `${out.join('\n')}\n`;
}

interface Scanned {
	readonly text: string;
	/** The change in brace depth across this line. */
	readonly depth: number;
	/** True when the line ends inside a string. */
	readonly open: boolean;
	/**
	 * Where the string this line opened begins, as a column of the formatted
	 * line, or null when it opened none.
	 */
	readonly stringColumn: number | null;
	/** Where this line's first value begins, for a continuation under it. */
	readonly argColumn: number | null;
	/** True when the line opens a block, so what follows is a child. */
	readonly opensBlock: boolean;
}

/**
 * Walk one line, knowing where the columns land once it is indented.
 *
 * The columns are the reason this cannot be a regex: a continuation line has to
 * start under the *formatted* position of the quote above it, so the scan is
 * given the indent the line is about to get and counts from there.
 *
 * A tab between tokens becomes one space. A tab inside a string is content and
 * is left exactly as it is — the rule is that the DSL is written with spaces,
 * not that a tab somebody quoted stops being a character.
 */
function scan(content: string, indent: number, startsInString: boolean): Scanned {
	let text = '';
	let depth = 0;
	let open = startsInString;
	let stringColumn: number | null = null;
	let argColumn: number | null = null;
	let opensBlock = false;

	for (let index = 0; index < content.length; index += 1) {
		const ch = content[index]!;

		if (open) {
			// `\"` and `\\` are the only escapes; a lone backslash is a backslash.
			if (ch === '\\' && (content[index + 1] === '"' || content[index + 1] === '\\')) {
				text += ch + content[index + 1];
				index += 1;
				continue;
			}
			if (ch === '"') open = false;
			text += ch;
			continue;
		}

		// `//` to the end of the line, verbatim. A brace or a quote in a comment
		// is prose, and counting it is how a formatter loses the plot.
		if (ch === '/' && content[index + 1] === '/') {
			text += content.slice(index);
			break;
		}

		if (ch === '"') {
			if (argColumn === null) argColumn = indent + text.length;
			open = true;
			stringColumn = indent + text.length + 1;
			text += ch;
			continue;
		}

		if (ch === '\t') {
			text += ' ';
			continue;
		}

		if (ch === '{') {
			depth += 1;
			opensBlock = true;
		}
		if (ch === '}') depth -= 1;

		text += ch;
	}

	return { text, depth, open, stringColumn, argColumn, opensBlock };
}
