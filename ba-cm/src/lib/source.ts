/**
 * Text surgery, shared by both languages.
 *
 * `graph/edit.ts` explains why every gesture in this component is a splice
 * rather than a serialisation: the file is the artefact, it lands in a pull
 * request, and everything outside the edited span has to come back
 * byte-identical. This module is the part of that argument that is not about
 * `.ddd` at all.
 *
 * `.ddm` shares the map's lexer — braces, quoted strings that may span lines,
 * bare hyphenated words and `//` comments describe both languages exactly — and
 * therefore shares everything below, which knows only that shape and nothing
 * about what the words mean. Finding where a block ends, growing a span to the
 * lines it sits on, guessing the indentation a new line should take: the same
 * five answers in both formats, and two copies of them would drift the first
 * time one of the languages grew a comment syntax the other did not.
 *
 * Every function is total and pure. None of them parse, and none of them
 * validate — the caller re-parses and the problems panel says what happened.
 *
 * One rule they all keep: **what is written back is indented with spaces.** See
 * `INDENT`.
 */

import type { Span } from './ddd/model';

/** Replace one span. The single primitive; everything else is built on it. */
export function splice(source: string, span: Span, replacement: string): string {
	return source.slice(0, span.start) + replacement + source.slice(span.end);
}

/**
 * Replace several spans in one pass.
 *
 * Applied right to left so that an earlier edit does not shift the offsets of a
 * later one. Renaming a context needs this — the declaration and every
 * relationship that names it move together, and doing them one at a time
 * against stale spans would corrupt the file.
 */
export function spliceAll(
	source: string,
	edits: readonly { span: Span; replacement: string }[],
): string {
	return [...edits]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, edit) => splice(text, edit.span, edit.replacement), source);
}

/** A string as the format writes it. */
export function quote(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The `{` that opens this declaration's block, or -1 if it has none. */
export function openBraceAfter(source: string, from: number): number {
	let index = from;
	while (index < source.length) {
		const ch = source[index]!;
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			index += 1;
			continue;
		}
		if (ch === '/' && source[index + 1] === '/') {
			const newline = source.indexOf('\n', index);
			if (newline < 0) return -1;
			index = newline + 1;
			continue;
		}
		return ch === '{' ? index : -1;
	}
	return -1;
}

/**
 * Where the block opened at `open` closes, counting nested braces.
 *
 * Strings and comments are skipped rather than counted. A brace inside an
 * `intent` — `"the {invoice} aggregate"` — is text, and a counter that took it
 * for structure would put the end of the block in the wrong place. That is
 * harmless when the answer is only used to bound a search, and it deletes the
 * wrong half of somebody's file when it is used to remove a node.
 */
export function blockEnd(source: string, open: number): number {
	let depth = 0;
	let index = open;

	while (index < source.length) {
		const ch = source[index]!;

		if (ch === '"') {
			index += 1;
			while (index < source.length && source[index] !== '"') {
				index += source[index] === '\\' ? 2 : 1;
			}
			index += 1;
			continue;
		}

		if (ch === '/' && source[index + 1] === '/') {
			const newline = source.indexOf('\n', index);
			if (newline < 0) return source.length;
			index = newline + 1;
			continue;
		}

		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
		index += 1;
	}
	return source.length;
}

/**
 * A span grown to the whole lines it sits on, with one blank line above it.
 *
 * Removing a declaration and leaving its indentation, its newline, or the gap
 * that separated it from its neighbour makes an add-then-remove fail to return
 * the file to where it started — every gesture slightly lossy, and the loss
 * accumulating in the diff. This is the rule `removeRelationship` was written
 * with, lifted out so every deletion shares it.
 */
export function lineRegion(source: string, span: Span): Span {
	let end = span.end;
	while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
	if (source[end] === '\n') end += 1;

	let start = span.start;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	if (source[start - 1] === '\n' && source[start - 2] === '\n') start -= 1;

	return { ...span, start, end };
}

/**
 * The indentation used by the lines inside the block opened at `open`.
 *
 * The first line **with something on it**, which is the whole of the care this
 * needs. Reading the line straight after the `{` is right for the sample and
 * wrong for a block that opens on a blank line — and a block that opens on a
 * blank line is what `freshModel` writes, so the very first field anybody added
 * to a new model landed in column zero.
 *
 * An empty block's first non-blank line is its own `}`, whose indentation is
 * the parent's; one step in from there is where a child belongs. So is the `{`
 * line's own indentation, when the block runs to the end of the file.
 */
export function indentInside(source: string, open: number): string {
	if (open < 0) return '  ';

	let at = source.indexOf('\n', open);
	while (at >= 0) {
		const next = source.indexOf('\n', at + 1);
		const line = source.slice(at + 1, next < 0 ? source.length : next);
		if (line.trim() !== '') {
			const indent = spaces(/^[ \t]*/.exec(line)?.[0] ?? '');
			return line.trimStart().startsWith('}') ? indent + step() : indent;
		}
		if (next < 0) break;
		at = next;
	}

	// A block that runs to the end of the file. One step in from the line the
	// `{` is on is still the answer.
	const outer = lineIndent(source, open);
	return outer + step();
}

/**
 * One level of indentation. **Two spaces, always.**
 *
 * The DSL is written with spaces and no tabs. That is not a preference this
 * module gets to have per-file: it is what the editor's Tab key types, what
 * every sample and seed is written in, and the reason a `.ddd` or a `.ddm`
 * looks the same in a diff, in a review comment and in a terminal that has
 * opinions about tab stops. A file that arrives with tabs in it is expanded
 * rather than answered in kind — see `spaces`.
 */
export const INDENT = '  ';

export function step(): string {
	return INDENT;
}

/**
 * Leading whitespace as the format writes it: spaces, one `INDENT` per tab.
 *
 * Everything this module *emits* goes through here, so a tab never reaches the
 * text by way of an edit. Reading is untouched — the lexer takes whatever is
 * there, and text outside the spliced span comes back byte-identical, tabs and
 * all. The rule is about what gets written, not about rewriting somebody's
 * file underneath them.
 */
export function spaces(indent: string): string {
	return indent.replace(/\t/g, INDENT);
}

/**
 * Shift every line of a block from one indentation to another.
 *
 * The first line is exempt when it carries none: a declaration span starts at
 * its keyword, past the indentation, so line one is already bare. Called with
 * `from` empty it therefore indents a whole fragment while keeping the relative
 * shape its inner lines were written with.
 */
export function reindent(block: string, from: string, to: string): string {
	return block
		.split('\n')
		.map((line) => {
			// A blank line stays blank. Prefixing it would leave trailing
			// whitespace on a line that has nothing on it, which every linter and
			// half the reviewers in the world will flag.
			if (line.trim() === '') return line;
			return line.startsWith(from) ? to + line.slice(from.length) : line;
		})
		.join('\n');
}

/**
 * The leading whitespace of the line `at` sits on, in spaces.
 *
 * Not `indentBefore`, which is the whitespace immediately before `at` — for a
 * `{` at the end of `aggregate "Thing" {` that is one space, and the line's
 * indentation is two levels away. `indentBefore` also stays verbatim, because
 * its other caller matches it against existing text; this one is only ever used
 * to write a new line, so it comes back as spaces.
 */
export function lineIndent(source: string, at: number): string {
	const start = source.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
	return spaces(/^[ \t]*/.exec(source.slice(start))?.[0] ?? '');
}

/** The whitespace between the start of `at`'s line and `at` itself. */
export function indentBefore(source: string, at: number): string {
	let start = at;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	return source.slice(start, at);
}
