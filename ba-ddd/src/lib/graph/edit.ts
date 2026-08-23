/**
 * Graph gestures, as edits to the source text.
 *
 * This is the module the whole inversion in README.md rests on. The graph does
 * not own the model: a gesture takes the source string, replaces the bytes in
 * one known span, and hands back a new string to be re-parsed.
 *
 * The alternative — mutate a model, run a serialiser — is what doc-es does, and
 * it is why doc-es loses comments and formatting on every round trip. Here the
 * file is the artefact and lands in a pull request, so everything outside the
 * edited span has to come back byte-identical.
 *
 * Every function is total and pure: source in, source out. None of them parse,
 * and none of them validate — the caller re-parses and the problems panel says
 * what happened. That keeps the failure mode "your edit produced an error you
 * can see and undo" rather than "your edit was silently refused".
 */

import type { DddDocument, Node, Pattern, RelationshipEdge, Span } from '../ddd/model';

/** Replace one span. The single primitive; everything below is built on it. */
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

/**
 * Change the pattern on a relationship.
 *
 * Rewrites exactly the pattern token — or the `a / b` pair — and nothing else,
 * so the `because` prose two lines down and the comment above the block survive
 * untouched.
 *
 * The arrow moves with it when the shape demands: switching to a mutual pattern
 * turns `->` into `<->`, and switching to a directed one turns it back. Leaving
 * the arrow alone would produce a document that fails its own pairing check
 * immediately, which is a worse experience than being corrected.
 */
export function setPattern(
	source: string,
	edge: RelationshipEdge,
	pattern: readonly [Pattern] | readonly [Pattern, Pattern],
	arrowSpan: Span | null,
	shouldBeDirected: boolean,
): string {
	const edits: { span: Span; replacement: string }[] = [
		{ span: edge.patternSpan, replacement: pattern.join(' / ') },
	];

	if (arrowSpan && shouldBeDirected !== edge.directed) {
		edits.push({ span: arrowSpan, replacement: shouldBeDirected ? '->' : '<->' });
	}

	return spliceAll(source, edits);
}

/** Change a subdomain's classification. One keyword, in place. */
export function setClassification(
	source: string,
	span: Span,
	classification: 'core' | 'supporting' | 'generic',
): string {
	return splice(source, span, classification);
}

/** Change a context's `status`, or add one if the block has none. */
export function setStatus(
	source: string,
	document: DddDocument,
	node: Node,
	status: 'modelled' | 'drafted' | 'unmodelled',
): string {
	const existing = findKeywordValueSpan(document.source, node, 'status');
	if (existing) return splice(source, existing, status);
	return insertIntoBlock(source, node, `status ${status}`);
}

/**
 * Rename a node, and every reference to it.
 *
 * The name *is* the identity — there is no separate slug, because the whole
 * discipline rests on the claim that the words are the model and a file where
 * the human name and the machine name can drift teaches the wrong lesson on
 * sight. The cost lands here: a rename has to find every quoted mention.
 *
 * Only exact matches on the declaration's `nameSpan`, on relationship endpoint
 * spans, and on `serves` targets are touched. A name appearing inside an
 * `intent` or a `because` is prose and is deliberately left alone; rewriting
 * English because it contains a noun that happens to be a context name would be
 * a worse bug than the one it fixed.
 */
export function renameNode(source: string, document: DddDocument, node: Node, to: string): string {
	const quoted = quote(to);
	const edits: { span: Span; replacement: string }[] = [
		{ span: node.nameSpan, replacement: quoted },
	];

	for (const edge of document.edges) {
		if (edge.kind !== 'relationship') continue;
		// Endpoint spans are not on the edge, so they are recovered from the
		// relationship's own span by re-scanning it. Cheap: a relationship header
		// is one short line.
		for (const span of endpointSpans(document.source, edge, node.name)) {
			edits.push({ span, replacement: quoted });
		}
	}

	return spliceAll(source, edits);
}

/** Delete a relationship, including its block and the blank line after it. */
export function removeRelationship(source: string, edge: RelationshipEdge): string {
	let end = edge.span.end;
	// Swallow trailing whitespace up to and including one newline, so deleting
	// the middle of a list does not leave a gap where the entry was.
	while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
	if (source[end] === '\n') end += 1;

	// And the indentation on the line the relationship started on.
	let start = edge.span.start;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;

	// And one blank line above it, when there is one.
	//
	// Without this, removing an entry from a blank-line-separated list leaves
	// two blank lines at the seam, and an add followed by a remove does not
	// return the file to where it started — which would make every gesture
	// slightly lossy in a way that accumulates in the diff.
	if (source[start - 1] === '\n' && source[start - 2] === '\n') start -= 1;

	return source.slice(0, start) + source.slice(end);
}

/**
 * Append a relationship at the end of the map block.
 *
 * Placed last rather than near the contexts it names, because the sample and
 * every file written from it keep the catalog and the map in two halves, and a
 * new arrow appearing in the middle of the domain would read as a mistake.
 */
export function addRelationship(
	source: string,
	fromName: string,
	toName: string,
	pattern: Pattern,
	directed: boolean,
): string {
	const close = source.lastIndexOf('}');
	if (close < 0) return source;

	const arrow = directed ? '->' : '<->';
	const line = `\n  ${quote(fromName)} ${arrow} ${quote(toName)} : ${pattern} {\n    because ""\n  }\n`;

	return source.slice(0, close) + line + source.slice(close);
}

// ---------------------------------------------------------------------------

/** The quoted spans in a relationship header that hold exactly `name`. */
function endpointSpans(source: string, edge: RelationshipEdge, name: string): Span[] {
	const header = source.slice(edge.span.start, edge.patternSpan.start);
	const target = quote(name);
	const found: Span[] = [];

	let at = header.indexOf(target);
	while (at >= 0) {
		const start = edge.span.start + at;
		found.push({
			start,
			end: start + target.length,
			line: edge.span.line,
			column: edge.span.column,
		});
		at = header.indexOf(target, at + target.length);
	}
	return found;
}

/** The span of the bare word following `keyword` inside a node's block. */
function findKeywordValueSpan(source: string, node: Node, keyword: string): Span | null {
	const open = source.indexOf('{', node.nameSpan.end);
	if (open < 0) return null;

	const region = source.slice(open, blockEnd(source, open));
	const match = new RegExp(`\\b${keyword}\\s+([a-z-]+)`).exec(region);
	if (!match) return null;

	const start = open + match.index + match[0].length - match[1]!.length;
	return { start, end: start + match[1]!.length, line: node.nameSpan.line, column: 1 };
}

/** Insert a line just inside a node's block, indented to match its neighbours. */
function insertIntoBlock(source: string, node: Node, line: string): string {
	const open = source.indexOf('{', node.nameSpan.end);
	if (open < 0) return source;

	const nextLine = source.indexOf('\n', open);
	if (nextLine < 0) return source;

	const indent = /^[ \t]*/.exec(source.slice(nextLine + 1))?.[0] ?? '    ';
	return `${source.slice(0, nextLine + 1)}${indent}${line}\n${source.slice(nextLine + 1)}`;
}

function blockEnd(source: string, open: number): number {
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1;
		else if (source[index] === '}') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
	}
	return source.length;
}

function quote(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
