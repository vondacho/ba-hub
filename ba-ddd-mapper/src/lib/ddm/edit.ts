/**
 * Model gestures, as edits to the source text.
 *
 * The map's `graph/edit.ts`, one zoom level down and on the same terms: a
 * gesture takes the source string, replaces the bytes in one known span, and
 * hands back a new string to be re-parsed. Nothing here parses, nothing here
 * validates, and nothing here mutates a model — the panel calls it, the editor
 * re-parses, and the problems list says what happened.
 *
 * It writes the two fields the aggregate panel is for: the `intent` and the
 * `invariant`s. Neither has a box on the canvas — a class box already shows
 * what a class is, but nothing draws the case for a boundary existing — so
 * these are the two things the panel asks for and the two it must be able to
 * answer. A panel that says an aggregate with nothing to protect is a table
 * with extra ceremony and then sends you to a line number has made the point
 * and refused the fix.
 */

import { tokenize, type Token } from '../ddd/lexer';
import {
	blockEnd,
	indentInside,
	lineIndent,
	openBraceAfter,
	quote,
	spaces,
	splice,
	spliceAll,
	step,
} from '../source';
import type { AggregateNode, DomainModel, Span } from './model';

/**
 * The column a wrapped string is allowed to reach before it folds.
 *
 * The sample wraps its invariants at about here, and an edit that came back as
 * one 140-character line would rewrite the shape of a file somebody had laid
 * out by hand — a diff about formatting, attached to a change about meaning.
 */
const WIDTH = 78;

/**
 * Write one of an aggregate's invariants: change it, remove it, or add one.
 *
 * Addressed by index rather than rewritten as a list, which is the difference
 * from the map's `setList` and is earned by the grammar: `invariant` takes
 * exactly one string, so the *n*th one in the block is the *n*th one in the
 * document and nothing about the file's whitespace can make that untrue. So an
 * edit to the second of three touches the second of three, and the other two
 * come back byte-identical — comments, wrapping, alignment and all.
 *
 *   `index < invariants.length`, text given  — rewrite that one
 *   `index < invariants.length`, text empty  — remove its line
 *   `index >= invariants.length`             — add one after the last
 *
 * An empty invariant is a removal rather than `invariant ""`, for `setField`'s
 * reason: the missing-invariant warning is the most useful thing the panel
 * says, and a blank string would silence it while answering nothing.
 */
export function setInvariant(
	source: string,
	document: DomainModel,
	aggregate: AggregateNode,
	index: number,
	text: string,
): string {
	const runs = fieldRuns(document.source, aggregate, 'invariant');
	const trimmed = text.trim();
	const run = runs[index];

	if (run) {
		if (trimmed === '') return splice(source, removal(document.source, run.span), '');
		return splice(source, run.valueSpan, rewrite(document.source, run, trimmed));
	}

	if (trimmed === '') return source;

	// Under the last invariant, or under the `intent` when this is the first.
	const anchor = runs.at(-1) ?? fieldRuns(document.source, aggregate, 'intent').at(-1) ?? null;
	return insert(source, document.source, aggregate, 'invariant', trimmed, anchor, runs.length > 0);
}

/**
 * Write an aggregate's `intent`, or remove it.
 *
 * One string rather than a list, so this is the map's `setField` and not its
 * `setList`: the first `intent` in the block is rewritten where the author put
 * it, and any later one — legal, warned about, and the winner under the
 * parser's rule — is cut, because after an edit the visitor has made exactly
 * one claim and a loser left behind would keep the panel complaining about a
 * line they can no longer see.
 *
 * An empty intent removes the line rather than writing `intent ""`, for
 * `setInvariant`'s reason. The panel asks *what is this boundary for?* and a
 * blank string would silence the question while answering nothing.
 */
export function setIntent(
	source: string,
	document: DomainModel,
	aggregate: AggregateNode,
	text: string,
): string {
	const runs = fieldRuns(document.source, aggregate, 'intent');
	const trimmed = text.trim();
	const [first, ...rest] = runs;

	const cuts = rest.map((run) => ({ span: removal(document.source, run.span), replacement: '' }));

	if (!first) {
		if (trimmed === '') return source;
		return insert(source, document.source, aggregate, 'intent', trimmed, null, false);
	}

	if (trimmed === '') {
		return spliceAll(source, [
			{ span: removal(document.source, first.span), replacement: '' },
			...cuts,
		]);
	}

	return spliceAll(source, [
		{ span: first.valueSpan, replacement: rewrite(document.source, first, trimmed) },
		...cuts,
	]);
}

/**
 * What removing a field takes with it: its own lines, and a blank line only
 * when leaving it would look like a mistake.
 *
 * `lineRegion`'s rule — always absorb the gap above — is right for a
 * declaration and wrong here, because these fields come in groups. Removing the
 * first of three invariants would eat the blank line that separates the whole
 * group from the `intent` above it, and the two remaining rules would come back
 * welded to a paragraph they are not part of.
 *
 * So the gap is only taken when keeping it would leave the file worse than it
 * was: two blank lines where there was one, or a blank line hard against the
 * `{`. Both are things nobody typed, and both are what an add-then-remove would
 * otherwise leave behind as evidence.
 */
function removal(source: string, span: Span): Span {
	let start = span.start;
	while (start > 0 && source[start - 1] !== '\n') start -= 1;

	let end = span.end;
	while (end < source.length && source[end] !== '\n') end += 1;
	end = Math.min(source.length, end + 1);

	const after = source.slice(end);
	const blankAfter = /^[ \t]*\n/.exec(after);
	if (!blankAfter) return { ...span, start, end };

	const before = source.slice(0, start);
	const doubles = /\n[ \t]*\n$/.test(before) || /\{[ \t]*\n$/.test(before);

	return { ...span, start, end: doubles ? end + blankAfter[0].length : end };
}

// ---------------------------------------------------------------------------

/** One `keyword "…"` in an aggregate's own block. */
interface Run {
	/** The keyword and its string together, for removing the line. */
	readonly span: Span;
	/** The quoted string alone, for rewriting it in place. */
	readonly valueSpan: Span;
}

/**
 * Every `keyword "…"` written directly in this aggregate's block, in order.
 *
 * The lexer rather than a search, for the map's `fieldRuns`' reason: a search
 * cannot tell the `invariant` that is a field from the word inside `intent "the
 * invariant is…"`, and it cannot tell this aggregate's `intent` from one
 * written three lines below inside an entity. Depth 1 is this block; anything
 * deeper is somebody else's.
 *
 * A keyword with no string after it is skipped rather than counted, which is
 * what keeps the invariants here aligned with `aggregate.invariants`: the
 * parser does not record one either, it reports it.
 */
function fieldRuns(source: string, aggregate: AggregateNode, keyword: string): Run[] {
	const open = openBraceAfter(source, aggregate.nameSpan.end);
	if (open < 0) return [];
	const close = blockEnd(source, open);

	let tokens: readonly Token[];
	try {
		tokens = tokenize(source);
	} catch {
		// An unterminated string somewhere in the file. The caller re-parses and
		// the panel says so; guessing at spans would be worse than refusing.
		return [];
	}

	const runs: Run[] = [];
	let depth = 0;

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (token.span.start < open || token.span.start >= close) continue;

		if (token.type === '{') {
			depth += 1;
			continue;
		}
		if (token.type === '}') {
			depth -= 1;
			continue;
		}
		if (depth !== 1 || token.type !== 'word' || token.value !== keyword) continue;

		const value = tokens[index + 1];
		if (value?.type !== 'string') continue;

		runs.push({ span: { ...token.span, end: value.span.end }, valueSpan: value.span });
		index += 1;
	}

	return runs;
}

/**
 * Write a field this aggregate does not have yet.
 *
 * `anchor` is the field it goes under — the last invariant when there are
 * invariants, the `intent` when there are not — or null for the top of the
 * block. An invariant grows the list from the bottom, because a list that grows
 * from the bottom is the one people can read twice; an intent goes above
 * everything, which is the order the sample writes them and the order the panel
 * reads them in: what the boundary is for, then what it keeps true.
 *
 * `joined` says the anchor is another line of the same field. That is the whole
 * of the spacing rule, and it is the sample's shape stated once: **fields of a
 * kind sit together, and different kinds are separated by a blank line.** The
 * invariants are a block of invariants; the intent above them is a paragraph;
 * the entities below are the declarations. Getting this right is what makes an
 * add-then-remove come back to the file it started as, rather than leaving the
 * gap it closed or the one it opened.
 */
function insert(
	source: string,
	parsed: string,
	aggregate: AggregateNode,
	keyword: string,
	text: string,
	anchor: Run | null,
	joined: boolean,
): string {
	const open = openBraceAfter(parsed, aggregate.nameSpan.end);

	// An aggregate written without braces — legal, and a model that fails its
	// own check for want of a root. The field brings the block with it.
	if (open < 0) {
		const outer = lineIndent(parsed, aggregate.span.start);
		const inner = outer + step();
		const head = aggregate.nameSpan.end;
		const line = `${keyword} ${render(text, inner, keyword.length + 1)}`;
		return `${source.slice(0, head)} {\n${inner}${line}\n${outer}}${source.slice(head)}`;
	}

	const indent = indentInside(parsed, open);
	const line = `${indent}${keyword} ${render(text, indent, keyword.length + 1)}\n`;
	const at = lineAfter(source, anchor?.span.end ?? open);
	const rest = source.slice(at);

	// A blank line above, unless the line above is more of the same field.
	const lead = anchor !== null && !joined ? '\n' : '';
	// And one below, unless there is already a gap, the block ends here, or the
	// next line is more of the same field.
	const settled = joined || /^[ \t]*(\n|\})/.test(rest);

	return `${source.slice(0, at)}${lead}${line}${settled ? '' : '\n'}${rest}`;
}

/**
 * One field's string, rewritten where it stands.
 *
 * The line's own indentation and the file's own gap between the keyword and the
 * quote, both read back off the run, so a rewrite folds to the column the
 * author was already using — including the aligned one the sample keeps.
 */
function rewrite(source: string, run: Run, text: string): string {
	const start = source.lastIndexOf('\n', Math.max(0, run.span.start - 1)) + 1;
	// Measured on the line as it is, written back as spaces: a tab in somebody's
	// file is one character to `valueSpan`, and one `INDENT` to the fold.
	const raw = /^[ \t]*/.exec(source.slice(start))?.[0] ?? '';
	return render(text, spaces(raw), run.valueSpan.start - start - raw.length);
}

/** Just past the newline that ends `from`'s line. */
function lineAfter(source: string, from: number): number {
	const newline = source.indexOf('\n', from);
	return newline < 0 ? source.length : newline + 1;
}

/**
 * A string as the file would have written it: quoted, and folded to the
 * indentation of the line it starts on.
 *
 * `indent` is that line's indentation **in spaces** — the DSL has no tabs in
 * it, and a tab found in a file being edited is expanded rather than copied
 * forward. `lead` is what sits between the indentation and the opening quote —
 * the keyword and the gap the file put after it — so a continuation line starts
 * one column past the quote, under the first word, which is where the sample
 * puts it.
 *
 * The lexer joins a continuation line to the one above with a single space
 * after stripping its indentation, so this is lossless in the only sense that
 * matters: the model reads back the same sentence. What it buys is a file that
 * still looks hand-laid-out after an edit, which is the whole reason the
 * component splices spans instead of serialising a model.
 *
 * The text is flattened first. It arrives from a textarea, where Enter is a
 * newline and somebody will press it; an invariant is a sentence, and its line
 * breaks are the file's business rather than the model's.
 */
function render(text: string, indent: string, lead: number): string {
	const quoted = quote(text.replace(/\s+/g, ' ').trim());
	const at = indent.length + lead;
	if (at + quoted.length <= WIDTH) return quoted;

	const hanging = `${indent}${' '.repeat(lead + 1)}`;
	const lines: string[] = [];
	let line = '';

	for (const word of quoted.split(' ')) {
		const candidate = line === '' ? word : `${line} ${word}`;
		// The first line starts at the quote; the rest start one column in, under
		// the first character of the text.
		const from = lines.length === 0 ? at : hanging.length;
		if (from + candidate.length > WIDTH && line !== '') {
			lines.push(line);
			line = word;
			continue;
		}
		line = candidate;
	}
	lines.push(line);

	return lines.join(`\n${hanging}`);
}

