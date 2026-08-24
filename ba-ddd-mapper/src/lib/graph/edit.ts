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

import type {
	ContainmentEdge,
	DddDocument,
	Node,
	NodeKind,
	Pattern,
	RelationshipEdge,
	Span,
} from '../ddd/model';

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

/**
 * Rename the map.
 *
 * One splice and no search, which is the whole difference from `renameNode`
 * above: the title is a label on the file rather than an identifier, so nothing
 * refers back to it. Every mention of it elsewhere — in a `serves`, in an
 * endpoint — is a mention of a *domain* that happens to share the words, and
 * rewriting those because the file was renamed would silently repoint the
 * model.
 */
export function setTitle(source: string, document: DddDocument, to: string): string {
	return splice(source, document.titleSpan, quote(to));
}

/**
 * Delete a relationship, including its block and the blank line after it.
 *
 * The tidying rule lives in `lineRegion`, which every deletion shares.
 */
export function removeRelationship(source: string, edge: RelationshipEdge): string {
	const cut = lineRegion(source, edge.span);
	return source.slice(0, cut.start) + source.slice(cut.end);
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

/**
 * Where a fragment goes inside a node's block, and what it looks like there.
 *
 * Returned as a position and a string rather than applied, because a move —
 * `reparent` — has to delete in one place and insert in another *in the same
 * pass*. Doing it as two passes means the second one works on offsets the
 * first has already shifted, which is how a block lands in the middle of a
 * line somewhere else in the file.
 *
 * A single keyword line goes first, where the fields belong. A whole
 * declaration — `asBlock` — goes last, after the fields and any siblings,
 * because a `subdomain` landing above the `intent` of the domain that holds it
 * reads as a mistake even though it parses.
 */
function blockInsertion(
	source: string,
	node: Node,
	fragment: string,
	asBlock: boolean,
): { at: number; text: string } | null {
	const open = openBraceAfter(source, node.nameSpan.end);
	if (open < 0) return null;

	const body = reindent(fragment, '', indentInside(source, node));

	if (asBlock) {
		// Back over the closing brace's own indentation, so the block goes above
		// the line the `}` is on rather than into the middle of it.
		let at = blockEnd(source, open) - 1;
		while (at > 0 && (source[at - 1] === ' ' || source[at - 1] === '\t')) at -= 1;
		const gap = source[at - 1] === '\n' && source[at - 2] === '\n' ? '' : '\n';
		return { at, text: `${gap}${body}\n` };
	}

	const nextLine = source.indexOf('\n', open);
	if (nextLine < 0) return null;
	return { at: nextLine + 1, text: `${body}\n` };
}

/** Insert just inside a node's block. */
function insertIntoBlock(
	source: string,
	node: Node,
	fragment: string,
	options?: { asBlock: boolean },
): string {
	const insertion = blockInsertion(source, node, fragment, options?.asBlock ?? false);
	if (!insertion) return source;
	return source.slice(0, insertion.at) + insertion.text + source.slice(insertion.at);
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
function blockEnd(source: string, open: number): number {
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

function quote(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Creating and deleting
// ---------------------------------------------------------------------------

/**
 * The fragment a new node starts as.
 *
 * Every one is valid the moment it lands, because an edit that puts the file
 * into an error state has taken the graph away from the person who was using
 * it — the panel shows the last document that parsed, and they cannot see what
 * they just made.
 *
 * The defaults are chosen to be *honest rather than convenient*. A new
 * subdomain is `supporting`, which claims neither the deep model nor the
 * shrug; a new context is `unmodelled`, because the parser reads an absent
 * status as `modelled` and a box created a second ago has not been modelled.
 * Every one of them also arrives with no owner and no language, which the
 * problems panel says out loud. That is the point: the warnings are the
 * to-do list for the box you just drew.
 */
function fragmentFor(kind: NodeKind, name: string): string {
	const quoted = quote(name);
	if (kind === 'domain') return `domain ${quoted} {\n}`;
	if (kind === 'subdomain') return `subdomain supporting ${quoted} {\n}`;
	return `context ${quoted} {\n  status unmodelled\n}`;
}

/**
 * A name nothing else has yet.
 *
 * The name is the identity in this format, so two nodes sharing one is an
 * error rather than a cosmetic clash — which makes "New context" the single
 * most likely thing to collide, since it is what the *last* new context was
 * called too.
 */
export function unusedName(document: DddDocument, base: string): string {
	const taken = new Set(document.nodes.map((node) => node.name));
	if (!taken.has(base)) return base;
	for (let n = 2; ; n += 1) {
		const candidate = `${base} ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

/**
 * Add a node, inside `parent` or at the top of the map.
 *
 * A domain has no parent and goes at map level. A subdomain and a context are
 * *nested*, because nesting is how this format writes the common case: one
 * parent, implied, with no `serves` line to keep in step with it. The straddle
 * — a context serving a second subdomain — is the thing `serves` is for, and
 * it is added afterwards by drawing the edge.
 */
export function addNode(
	source: string,
	kind: NodeKind,
	name: string,
	parent: Node | null,
): string {
	const fragment = fragmentFor(kind, name);
	if (!parent) return insertIntoMap(source, fragment);
	return insertIntoBlock(source, parent, fragment, { asBlock: true });
}

/**
 * Delete a node, everything nested inside it, and every reference to any of it.
 *
 * The references are not optional politeness. A relationship naming a context
 * that no longer exists is a parse *error*, so a delete that left one behind
 * would blank the graph and leave the visitor with an error message instead of
 * the map they were editing — the failure mode this whole module exists to
 * avoid.
 *
 * What counts as "nested inside" is decided by span containment rather than by
 * walking the model. A subdomain's contexts sit inside its braces, so they sit
 * inside its span; anything the delete is about to swallow is anything that
 * lies within the region being cut. That is exact, and it does not need a
 * second traversal to agree with the first.
 */
export function removeNode(source: string, document: DddDocument, node: Node): string {
	// The nested nodes need no cut of their own: they are inside the region.
	const { region, references } = removalOf(document, node);
	return spliceAll(
		source,
		[region, ...references].map((span) => ({
			span: lineRegion(document.source, span),
			replacement: '',
		})),
	);
}

/**
 * What deleting `node` would take with it.
 *
 * Shared with the inspector rather than recomputed there, and that sharing is
 * the point: the sentence above the button and the edit the button performs
 * are the same analysis, so they cannot drift into telling the visitor one
 * thing and doing another.
 *
 * What counts as "nested inside" is decided by span containment rather than by
 * walking the model. A subdomain's contexts sit inside its braces, so they sit
 * inside its span; anything the delete is about to swallow is anything that
 * lies within the region being cut. That is exact, and it does not need a
 * second traversal to agree with the first.
 */
export function removalOf(
	document: DddDocument,
	node: Node,
): { region: Span; nested: readonly Node[]; references: readonly Span[] } {
	const region = declarationSpan(document.source, node);

	const nested = document.nodes.filter(
		(candidate) =>
			candidate.id !== node.id &&
			candidate.span.start >= region.start &&
			candidate.span.start < region.end,
	);
	const doomed = new Set([node.id, ...nested.map((candidate) => candidate.id)]);

	const references: Span[] = [];
	for (const edge of document.edges) {
		if (edge.kind === 'relationship') {
			// Both ends are contexts, and either one going means the line goes.
			if (doomed.has(edge.from) || doomed.has(edge.to)) references.push(edge.span);
			continue;
		}
		// A `serves` inside the region is already being cut with it; only the
		// ones written in a context that survives need removing on their own.
		if (edge.implied || !edge.span || doomed.has(edge.from)) continue;
		if (doomed.has(edge.to)) references.push(edge.span);
	}

	return { region, nested, references };
}

/**
 * Record that a context also serves a subdomain or a domain: the straddle.
 *
 * One line inside the context's own block, which is where the format puts it —
 * the alternative would be a list on the subdomain, and then a context's
 * membership would be written in two places that can disagree.
 */
export function addServes(source: string, context: Node, targetName: string): string {
	return insertIntoBlock(source, context, `serves ${quote(targetName)}`);
}

/** Remove one `serves` line. Implied containment has no line and cannot go. */
export function removeServes(source: string, edge: ContainmentEdge): string {
	if (!edge.span) return source;
	const cut = lineRegion(source, edge.span);
	return source.slice(0, cut.start) + source.slice(cut.end);
}

/**
 * Move a subdomain into a different domain.
 *
 * This is what "draw an edge from a subdomain to a domain" has to mean. A
 * subdomain divides exactly one domain and says so by sitting inside it, so
 * there is no line to add — the edge already exists, pointing somewhere else,
 * and the gesture re-points it by moving the text.
 *
 * The block is re-indented on the way. Whitespace is not semantic here and the
 * file would parse either way, but a block landing at its old depth inside a
 * new parent is exactly the kind of diff that makes a reviewer distrust a tool
 * that edits their source.
 */
export function reparent(
	source: string,
	document: DddDocument,
	subdomain: Node,
	domain: Node,
): string {
	const region = declarationSpan(document.source, subdomain);
	const block = document.source.slice(region.start, region.end);
	// The spans were measured in the last document that parsed. If the text has
	// moved on, refuse rather than cut a block out of the middle of something.
	if (source.slice(region.start, region.end) !== block) return source;

	const cut = lineRegion(source, region);
	// Strip the block's current indentation back to nothing; the insertion puts
	// the target's own indentation on. Whitespace is not semantic here, but a
	// block sitting at its old depth inside a new parent is the kind of diff
	// that makes a reviewer distrust a tool that edits their source.
	const fragment = reindent(block, indentBefore(source, region.start), '');

	const insertion = blockInsertion(source, domain, fragment, true);
	if (!insertion || (insertion.at > cut.start && insertion.at < cut.end)) return source;

	return spliceAll(source, [
		{ span: cut, replacement: '' },
		{ span: { ...region, start: insertion.at, end: insertion.at }, replacement: insertion.text },
	]);
}

// ---------------------------------------------------------------------------

/**
 * The whole of a node's declaration, braces and all.
 *
 * `node.span` is the keyword alone — enough to point a diagnostic at, not
 * enough to delete. The block is optional in the grammar, so the scan looks
 * for a `{` before the next declaration keyword and stops at the name when
 * there is none.
 */
function declarationSpan(source: string, node: Node): Span {
	const open = openBraceAfter(source, node.nameSpan.end);
	const end = open < 0 ? node.nameSpan.end : blockEnd(source, open);
	return { ...node.span, end };
}

/** The `{` that opens this declaration's block, or -1 if it has none. */
function openBraceAfter(source: string, from: number): number {
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
 * A span grown to the whole lines it sits on, with one blank line above it.
 *
 * Removing a declaration and leaving its indentation, its newline, or the gap
 * that separated it from its neighbour makes an add-then-remove fail to return
 * the file to where it started — every gesture slightly lossy, and the loss
 * accumulating in the diff. This is the rule `removeRelationship` was written
 * with, lifted out so the three deletions share it.
 */
function lineRegion(source: string, span: Span): Span {
	let end = span.end;
	while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
	if (source[end] === '\n') end += 1;

	let start = span.start;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	if (source[start - 1] === '\n' && source[start - 2] === '\n') start -= 1;

	return { ...span, start, end };
}

/** The indentation used by the lines inside a node's block. */
function indentInside(source: string, node: Node): string {
	const open = openBraceAfter(source, node.nameSpan.end);
	if (open < 0) return '  ';

	const nextLine = source.indexOf('\n', open);
	const indent = nextLine < 0 ? '' : (/^[ \t]*/.exec(source.slice(nextLine + 1))?.[0] ?? '');

	// An empty block's next line is its own `}`, whose indentation is the
	// parent's. One step in from there is where a child belongs.
	const closes = /^[ \t]*\}/.test(source.slice(nextLine + 1));
	return closes ? `${indent}  ` : indent;
}

/** The whitespace between the start of `at`'s line and `at` itself. */
function indentBefore(source: string, at: number): string {
	let start = at;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	return source.slice(start, at);
}

/**
 * Shift every line of a block from one indentation to another.
 *
 * The first line is exempt when it carries none: a declaration span starts at
 * its keyword, past the indentation, so line one is already bare.
 */
function reindent(block: string, from: string, to: string): string {
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

/** Append a declaration at the end of the map block. */
function insertIntoMap(source: string, fragment: string): string {
	const close = source.lastIndexOf('}');
	if (close < 0) return source;
	const indented = reindent(fragment, '', '  ');
	return `${source.slice(0, close)}\n${indented}\n${source.slice(close)}`;
}
