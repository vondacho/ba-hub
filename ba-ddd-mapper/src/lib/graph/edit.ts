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

import { tokenize, type Token } from '../ddd/lexer';
import {
	blockEnd,
	indentBefore,
	indentInside,
	lineRegion,
	openBraceAfter,
	quote,
	reindent,
	spaces,
	splice,
	spliceAll,
	step,
} from '../source';
import type {
	ContainmentEdge,
	DddDocument,
	Node,
	NodeKind,
	Pattern,
	RelationshipEdge,
	Span,
} from '../ddd/model';

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
	// No block. An arrow's fields are optional in the grammar, and seeding an
	// empty `because ""` would write an answer nobody gave — the panel warns
	// about a missing rationale either way, and the inspector builds the block
	// the moment one is typed.
	const line = `\n  ${quote(fromName)} ${arrow} ${quote(toName)} : ${pattern}\n`;

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

	const body = reindent(fragment, '', indentInside(source, open));

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

/** Append a declaration at the end of the map block. */
function insertIntoMap(source: string, fragment: string): string {
	const close = source.lastIndexOf('}');
	if (close < 0) return source;
	const indented = reindent(fragment, '', '  ');
	return `${source.slice(0, close)}\n${indented}\n${source.slice(close)}`;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** The fields that hold one quoted string. At most one of each, per the grammar. */
export type ScalarField = 'intent' | 'owner';

/** The fields that hold a list of quoted terms, spread over as many lines as you like. */
export type ListField = 'language' | 'aggregate';

/** A relationship's two prose fields. */
export type EdgeField = 'exchange' | 'because';

/**
 * The head of a declaration: where it starts, and where its block would open.
 *
 * A node's head ends after its name; a relationship's ends after its patterns.
 * Everything below works on this rather than on a node, because the fields are
 * the same idea in both places — `intent` on a context and `because` on an
 * arrow are both one keyword and one string inside a block that the grammar
 * lets you leave out entirely.
 */
interface Head {
	/** For the indentation a new block should take. */
	readonly start: number;
	/** The `{`, if there is one, is the next thing after this. */
	readonly end: number;
}

const nodeHead = (node: Node): Head => ({ start: node.span.start, end: node.nameSpan.end });

const edgeHead = (edge: RelationshipEdge): Head => ({
	start: edge.span.start,
	end: edge.patternSpan.end,
});

/**
 * Write one of a node's single-string fields, or remove it.
 *
 * An empty value removes the line rather than writing `owner ""`. The
 * difference matters here more than it would elsewhere: an absent `owner` is a
 * warning the problems panel raises — *an unowned boundary is a suggestion, and
 * suggestions lose to deadlines* — and an empty string would silence it while
 * answering nothing. Clearing the field puts the question back.
 *
 * A file with two `intent` lines parses, with a warning, and the later one
 * wins. Writing collapses them to one, because after an edit the visitor has
 * made exactly one claim and leaving the loser behind would mean the panel
 * kept complaining about a line they can no longer see.
 */
export function setField(
	source: string,
	document: DddDocument,
	node: Node,
	field: ScalarField,
	value: string,
): string {
	return writeField(source, document, nodeHead(node), field, value);
}

/**
 * Write a relationship's `exchange` or `because`, or remove it.
 *
 * `because` is the field this whole component argues for. The characteristic
 * failure of a context map is aspiration — every arrow labelled
 * customer/supplier because conformist feels like a defeat — and the rationale
 * is where *"the vendor will not change for us"* gets written down instead of
 * being dressed up. So it is editable for the same reason the panel names the
 * pattern by what it admits to: making the honest answer easy to type is most
 * of the job.
 *
 * Clearing it removes the line, and the panel goes back to saying the
 * rationale is missing. That is the correct outcome — an empty `because` is
 * not an answer — and it is why this cannot be a field that quietly holds "".
 */
export function setEdgeField(
	source: string,
	document: DddDocument,
	edge: RelationshipEdge,
	field: EdgeField,
	value: string,
): string {
	return writeField(source, document, edgeHead(edge), field, value);
}

/** The shared half of the two above. */
function writeField(
	source: string,
	document: DddDocument,
	head: Head,
	field: string,
	value: string,
): string {
	const trimmed = value.trim();
	return writeRuns(
		source,
		document,
		head,
		field,
		trimmed === '' ? null : (gap) => `${field}${gap}${quote(trimmed)}`,
	);
}

/**
 * Write a node's `language` or `aggregate` list, or remove it.
 *
 * The whole list is rewritten as one line rather than the changed term being
 * found and patched. A term is not addressable — the format lets the same list
 * be spread over any number of lines and any number of `language` keywords —
 * so "the third one" is a fact about the file's whitespace rather than about
 * the model. Rewriting is the only edit that means what the visitor did.
 *
 * The cost is a wrapped list coming back as one long line. That is a real loss
 * and it is bounded: it happens to the list being edited, on the edit, and
 * nowhere else in the file.
 */
export function setList(
	source: string,
	document: DddDocument,
	node: Node,
	field: ListField,
	values: readonly string[],
): string {
	const kept = values.map((value) => value.trim()).filter((value) => value !== '');
	return writeRuns(
		source,
		document,
		nodeHead(node),
		field,
		kept.length === 0 ? null : (gap) => `${field}${gap}${kept.map(quote).join(' ')}`,
	);
}

/** Change a context's `status`, or add one if the block has none. */
export function setStatus(
	source: string,
	document: DddDocument,
	node: Node,
	status: 'modelled' | 'drafted' | 'unmodelled',
): string {
	const runs = fieldRuns(document.source, nodeHead(node), 'status');
	if (runs.length === 0) return insertField(source, nodeHead(node), `status ${status}`);
	return spliceAll(source, [
		{ span: runs[0]!.span, replacement: `status${runs[0]!.gap}${status}` },
		...runs.slice(1).map((run) => ({ span: lineRegion(document.source, run.span), replacement: '' })),
	]);
}

// ---------------------------------------------------------------------------

/** One `keyword …` in a node's own block: where it is, and how it is spaced. */
interface FieldRun {
	readonly span: Span;
	/** The whitespace the file puts between the keyword and its first value. */
	readonly gap: string;
}

/**
 * Replace a node's runs of one keyword with a single line, or delete them all.
 *
 * The first run is rewritten in place and the rest are cut, so the field stays
 * where the author put it — near the top of the block, or wherever they moved
 * it to — instead of migrating to the front on every edit. The spacing is
 * reused from the run being replaced, which is what keeps the sample's aligned
 * columns aligned after a change.
 */
function writeRuns(
	source: string,
	document: DddDocument,
	head: Head,
	keyword: string,
	line: ((gap: string) => string) | null,
): string {
	const runs = fieldRuns(document.source, head, keyword);

	if (runs.length === 0) return line === null ? source : insertField(source, head, line(' '));

	const rest = runs.slice(1).map((run) => ({
		span: lineRegion(document.source, run.span),
		replacement: '',
	}));

	if (line === null) {
		return spliceAll(source, [
			{ span: lineRegion(document.source, runs[0]!.span), replacement: '' },
			...rest,
		]);
	}

	return spliceAll(source, [
		{ span: runs[0]!.span, replacement: line(runs[0]!.gap) },
		...rest,
	]);
}

/**
 * Every `keyword …` written directly in this node's block.
 *
 * Found with the lexer rather than with a search, because a search cannot tell
 * the `owner` that is a field from the one inside `intent "the owner decides"`,
 * and it cannot tell a context's own `owner` from the `owner` of a context
 * nested inside it. Depth 1 is this node's block; anything deeper belongs to
 * something else and is not this edit's business.
 */
function fieldRuns(source: string, head: Head, keyword: string): FieldRun[] {
	const open = openBraceAfter(source, head.end);
	if (open < 0) return [];
	const close = blockEnd(source, open);

	let tokens: readonly Token[];
	try {
		tokens = tokenize(source);
	} catch {
		// An unterminated string somewhere in the file. The caller re-parses and
		// the panel says so; refusing the edit is better than guessing at spans.
		return [];
	}

	const runs: FieldRun[] = [];
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

		let end = index + 1;
		while (tokens[end]?.type === 'string' || (keyword === 'status' && tokens[end]?.type === 'word')) {
			end += 1;
			// `status` takes exactly one bare word; a list takes as many strings
			// as follow.
			if (keyword === 'status') break;
		}
		// A keyword with nothing after it is malformed. The parser reports it;
		// rewriting it here would hide the error rather than fix it.
		if (end === index + 1) continue;

		runs.push({
			span: { ...token.span, end: tokens[end - 1]!.span.end },
			gap: source.slice(token.span.end, tokens[index + 1]!.span.start),
		});
		index = end - 1;
	}

	return runs;
}

/**
 * Add a field to a node that has none of it.
 *
 * Fields go at the top of the block, above any nested declarations, which is
 * where the format puts them and where a reader looks for them. A node written
 * without braces at all gets a block, because there is nowhere else to put the
 * line — and the alternative, refusing silently, is the worst of the three.
 */
function insertField(source: string, head: Head, line: string): string {
	const open = openBraceAfter(source, head.end);
	if (open >= 0) {
		const nextLine = source.indexOf('\n', open);
		if (nextLine < 0) return source;
		const indent = indentInside(source, open);
		return `${source.slice(0, nextLine + 1)}${indent}${line}\n${source.slice(nextLine + 1)}`;
	}

	// No block at all — the grammar allows that for both a node and an arrow —
	// so the field brings one with it. In spaces: `indentBefore` is verbatim
	// because its other caller matches it against existing text, and this one is
	// writing new lines.
	const indent = spaces(indentBefore(source, head.start));
	const at = head.end;
	return `${source.slice(0, at)} {\n${indent}${step()}${line}\n${indent}}${source.slice(at)}`;
}
