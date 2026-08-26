/**
 * Model gestures, as edits to the source text.
 *
 * The map's `graph/edit.ts`, one zoom level down and on the same terms: a
 * gesture takes the source string, replaces the bytes in one known span, and
 * hands back a new string to be re-parsed. Nothing here parses, nothing here
 * validates, and nothing here mutates a model — the panel calls it, the editor
 * re-parses, and the problems list says what happened.
 *
 * Two halves.
 *
 * **The fields** — `intent` and `invariant` — are what the aggregate panel is
 * for. Neither has a box on the canvas: a class box already shows what a class
 * is, but nothing draws the case for a boundary existing. A panel that says an
 * aggregate with nothing to protect is a table with extra ceremony and then
 * sends you to a line number has made the point and refused the fix.
 *
 * **The declarations** — aggregates, entities, values, enumerations and the
 * links between them — are what the canvas is for. Every fragment written here
 * is valid the moment it lands, which is `fragmentFor`'s rule in the map and
 * bites harder here: an aggregate with no `root` is a parse *error*, so the
 * boundary cannot arrive without the entity you reach it through. What a
 * fragment does *not* do is invent. A new entity is unreachable from the root
 * and the parser says so; the warning is the to-do list for the box you just
 * drew, and writing a `contains` nobody asked for would be the tool making a
 * claim on your behalf.
 */

import { tokenize, type Token } from '../ddd/lexer';
import {
	blockEnd,
	indentInside,
	lineIndent,
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
	AggregateNode,
	DomainModel,
	Link,
	LinkKind,
	Member,
	MemberKind,
	Multiplicity,
	Span,
} from './model';

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

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/**
 * A name nothing else in this model has yet.
 *
 * One namespace check across aggregates *and* members, even though the parser
 * keeps two namespaces: the one collision it allows is an aggregate and its own
 * root, which is a thing the format writes on purpose and never a thing a
 * button should produce by accident. "New entity" is the single most likely
 * name to clash, since it is what the last new entity was called too.
 */
export function unusedName(document: DomainModel, base: string): string {
	const taken = new Set<string>([
		...document.aggregates.map((aggregate) => aggregate.name),
		...document.members.map((member) => member.name),
	]);
	if (!taken.has(base)) return base;
	for (let n = 2; ; n += 1) {
		const candidate = `${base} ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

/**
 * Add an aggregate, and the root you reach it through.
 *
 * The two arrive together because one without the other is not a rough draft:
 * an aggregate with no `root` is a parse error, and a button that produced one
 * would blank the canvas and hand back a message instead of the model somebody
 * was drawing. `freshModel` in `seed.ts` writes exactly this shape and is the
 * reference for it.
 *
 * The aggregate and its root share a name deliberately — see the parser's note
 * on the two namespaces. It is the same thing seen from outside and from
 * inside, and it is the most idiomatic model in DDD.
 *
 * What it does not bring is an invariant. That is the one thing nobody else can
 * write for you, and the warning that follows says so better than a placeholder
 * would.
 */
export function addAggregate(source: string, document: DomainModel, name: string): string {
	const quoted = quote(name);
	const fragment = `aggregate ${quoted} {\n\n  root entity ${quoted} {\n    id ${quote(identityFor(name))}\n  }\n}`;
	return insertDeclaration(source, document.source, modelBrace(document), fragment, 'end');
}

/**
 * Add a class: an entity, a value object or an enumeration.
 *
 * `into` is the boundary it belongs to, or null for a value or an enum declared
 * at model level — shared, which is a real and different thing rather than a
 * missing answer. A value object used in two aggregates is declared at the top
 * of the model, and the sample's `Money` is exactly that; declaring it inside
 * one of them and embedding it from the other is the error the parser refuses.
 *
 * An entity is never null: it belongs to exactly one aggregate, which is what
 * makes the boundary structural rather than a rule that can drift.
 *
 * Only an entity gets an `id`. A value object with one is a contradiction the
 * parser reports rather than warns about — identity is the whole difference —
 * and an enumeration's values are the thing nobody can guess.
 */
export function addMember(
	source: string,
	document: DomainModel,
	kind: MemberKind,
	name: string,
	into: AggregateNode | null,
): string {
	const quoted = quote(name);
	const fragment =
		kind === 'entity'
			? `entity ${quoted} {\n  id ${quote(identityFor(name))}\n}`
			: `${kind} ${quoted} {\n}`;

	if (into) return insertDeclaration(source, document.source, blockOf(document.source, into), fragment, 'end');

	// Shared, so at the top of the model with the others — above the aggregates,
	// which is where the sample puts them and the order they are read in: the
	// vocabulary first, then the boundaries that use it.
	const shared = document.members.filter((member) => member.aggregate === null);
	const last = shared.at(-1);
	return insertDeclaration(
		source,
		document.source,
		modelBrace(document),
		fragment,
		last ? declarationEnd(document.source, last) : 'top',
	);
}

/**
 * Add a `contains`, an `embeds` or a `references` to a class's body.
 *
 * Which of the three it is belongs to the caller, because it is a fact about
 * the two ends rather than about the gesture — see `ModelEditor`'s table. All
 * this knows is where the line goes: under the last link of its kind, else
 * under the attributes, else at the top of the block, which is the order the
 * sample writes a class in.
 *
 * The multiplicity is written even though the grammar defaults to `one`
 * without it. The sample writes it, and a field whose absence means something
 * is a field worth saying out loud.
 */
export function addLink(
	source: string,
	document: DomainModel,
	from: Member,
	kind: LinkKind,
	targetName: string,
	multiplicity: Multiplicity,
): string {
	const runs = fieldRuns(document.source, from, kind);
	const anchor =
		runs.at(-1) ??
		fieldRuns(document.source, from, 'attribute').at(-1) ??
		fieldRuns(document.source, from, 'id').at(-1) ??
		null;

	const column = valueColumn(document.source, from);
	const tail = `${quote(targetName)} ${multiplicity}`;

	return insertLine(
		source,
		document.source,
		from,
		(indent) => `${kind}${padding(indent.length, kind, column)}${tail}`,
		anchor?.span.end ?? null,
		runs.length > 0 ? 'joined' : 'table',
	);
}

// ---------------------------------------------------------------------------
// Removals
// ---------------------------------------------------------------------------

/**
 * Delete an aggregate, everything inside it, and every reference to it.
 *
 * The references are not politeness: `references` naming an aggregate that no
 * longer exists is a parse *error*, so a delete that left one behind would
 * blank the canvas and leave somebody with a message instead of the model they
 * were editing — the failure this whole module exists to avoid.
 *
 * The members need no cut of their own. They are inside the braces and
 * therefore inside the region, which is the map's rule and is exact: it does
 * not need a second traversal to agree with the first.
 */
export function removeAggregate(
	source: string,
	document: DomainModel,
	aggregate: AggregateNode,
): string {
	const inside = new Set(aggregate.members);
	const pointing = document.links.filter(
		(link) => link.to === aggregate.id && !inside.has(link.from),
	);

	return spliceAll(source, [
		{ span: lineRegion(document.source, regionOf(document.source, aggregate)), replacement: '' },
		...pointing.map((link) => ({ span: removal(document.source, link.span), replacement: '' })),
	]);
}

/**
 * Delete a class, and every `contains`, `embeds` or `references` that names it.
 *
 * `removeAggregate`'s reasoning exactly, one level down — an unresolved link is
 * an error and not a loose end.
 */
export function removeMember(source: string, document: DomainModel, member: Member): string {
	const pointing = document.links.filter((link) => link.to === member.id);

	return spliceAll(source, [
		{ span: lineRegion(document.source, regionOf(document.source, member)), replacement: '' },
		...pointing.map((link) => ({ span: removal(document.source, link.span), replacement: '' })),
	]);
}

/** Delete one link. A line in a class's body, and nothing refers to it. */
export function removeLink(source: string, document: DomainModel, link: Link): string {
	return splice(source, removal(document.source, link.span), '');
}

// ---------------------------------------------------------------------------
// Renames
// ---------------------------------------------------------------------------

/**
 * Rename an aggregate, and every `references` that names it.
 *
 * The name is the identity here as in the map, so the cost lands on the rename:
 * every quoted mention has to move with it. What moves is only the declaration
 * and the link targets — a name inside an `intent` or an `invariant` is prose,
 * and rewriting English because it contains a noun would be a worse bug than
 * the one it fixed.
 *
 * The **root is left alone**, even when it shares the old name. It is its own
 * declaration with its own name, not a reference to this one, and renaming it
 * silently would be the tool deciding that the idiom matters more than what you
 * typed. The canvas shows both names, so the mismatch is visible and one more
 * gesture away from fixed.
 */
export function renameAggregate(
	source: string,
	document: DomainModel,
	aggregate: AggregateNode,
	to: string,
): string {
	return renameTo(source, document, aggregate.nameSpan, aggregate.id, to);
}

/** Rename a class, and every link that points at it. `renameAggregate`'s twin. */
export function renameMember(
	source: string,
	document: DomainModel,
	member: Member,
	to: string,
): string {
	return renameTo(source, document, member.nameSpan, member.id, to);
}

function renameTo(
	source: string,
	document: DomainModel,
	nameSpan: Span,
	id: string,
	to: string,
): string {
	const quoted = quote(to);
	return spliceAll(source, [
		{ span: nameSpan, replacement: quoted },
		...document.links
			.filter((link) => link.to === id)
			.map((link) => ({ span: link.targetSpan, replacement: quoted })),
	]);
}

// ---------------------------------------------------------------------------

/**
 * The identity type a new entity starts with.
 *
 * `New entity` becomes `NewEntityId`, which is what `freshModel` writes and
 * what somebody would have typed. A guess, and a visible one: it is on the
 * canvas under the class name, where a wrong guess is corrected rather than
 * discovered later.
 */
function identityFor(name: string): string {
	const stem = name
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part !== '')
		.map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
		.join('');
	return `${stem === '' ? 'New' : stem}Id`;
}

/** The `{` that opens the model, or -1 in a document that has none. */
function modelBrace(document: DomainModel): number {
	return openBraceAfter(document.source, document.contextSpan.end);
}

/** The `{` that opens this declaration's block, or -1. */
function blockOf(source: string, declaration: Declaration): number {
	return openBraceAfter(source, declaration.nameSpan.end);
}

/** The whole of a declaration, braces and all — enough to delete. */
function regionOf(source: string, declaration: Declaration): Span {
	return { ...declaration.span, end: declarationEnd(source, declaration) };
}

/** Where a declaration ends: past its block, or at its name when it has none. */
function declarationEnd(source: string, declaration: Declaration): number {
	const open = blockOf(source, declaration);
	return open < 0 ? declaration.nameSpan.end : blockEnd(source, open);
}

/**
 * Write a whole declaration into a block.
 *
 * `at` is `'end'` for a thing that goes after everything already there — a new
 * aggregate, a new class inside one — `'top'` for the first shared value in a
 * model that has none, or the offset to sit under. The map's rule: a field goes
 * where the fields are, and a declaration goes last, because a class landing
 * above the invariants of the aggregate that holds it reads as a mistake even
 * though it parses.
 *
 * Declarations are separated by blank lines in both samples, so one is opened
 * above and below unless the file already has a gap there. That symmetry is
 * what makes an add-then-remove return the file it started as.
 */
function insertDeclaration(
	source: string,
	parsed: string,
	open: number,
	fragment: string,
	at: number | 'top' | 'end',
): string {
	if (open < 0) return source;

	const indent = indentInside(parsed, open);
	const body = reindent(fragment, '', indent);

	const boundary = at === 'end' ? closingLine(source, open) : lineAfter(source, at === 'top' ? open : at);

	// A block written on one line — `entity "X" { id "XId" }` — has no line to
	// insert at. The declaration brings the newlines with it.
	if (boundary === null) {
		const close = blockEnd(parsed, open) - 1;
		const outer = lineIndent(parsed, open);
		return `${source.slice(0, close)}\n${body}\n${outer}${source.slice(close)}`;
	}

	const before = source.slice(0, boundary);
	const rest = source.slice(boundary);
	// A blank line above, unless the file already has one there. The opening
	// brace is *not* an exception, which is where this differs from a field: a
	// field goes directly under the `{` and a declaration is given air. Both
	// samples do it — `model "…" {` and `map "…" {` are each followed by a blank
	// line and then the first declaration.
	const lead = /\n[ \t]*\n$/.test(before) ? '' : '\n';
	const trail = /^[ \t]*(\n|\})/.test(rest) ? '' : '\n';

	return `${before}${lead}${body}\n${trail}${rest}`;
}

/**
 * The start of the line the block's `}` sits on, or null when it shares a line
 * with the block's contents.
 */
function closingLine(source: string, open: number): number | null {
	let at = blockEnd(source, open) - 1;
	while (at > 0 && (source[at - 1] === ' ' || source[at - 1] === '\t')) at -= 1;
	return at === 0 || source[at - 1] === '\n' ? at : null;
}

/**
 * The column this block's lines put their values at, when they agree on one.
 *
 * The sample rules its class bodies into a grid — `id`, `attribute`, `embeds`
 * and `contains` all starting their value in the same column — and a new
 * `contains` written with a single space after the keyword would break it. So
 * the grid is measured rather than assumed, from the lines that are already
 * there, and only believed when at least two of them agree.
 *
 * `references` is the case that proves the rule: it is one character too long
 * for the sample's own grid and overflows by one. Counting the majority rather
 * than the widest keyword is what reproduces the file instead of re-ruling it.
 */
function valueColumn(source: string, declaration: Declaration): number | null {
	const open = blockOf(source, declaration);
	if (open < 0) return null;
	const close = blockEnd(source, open);

	let tokens: readonly Token[];
	try {
		tokens = tokenize(source);
	} catch {
		return null;
	}

	const counts = new Map<number, number>();
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
		if (depth !== 1 || token.type !== 'word') continue;

		const value = tokens[index + 1];
		if (!value || value.type === '{' || value.type === '}' || value.type === 'eof') continue;

		// Only a keyword that starts its line says anything about the grid.
		const start = source.lastIndexOf('\n', Math.max(0, token.span.start - 1)) + 1;
		if (source.slice(start, token.span.start).trim() !== '') continue;

		const column = value.span.start - start;
		counts.set(column, (counts.get(column) ?? 0) + 1);
	}

	let best: number | null = null;
	let most = 1;
	for (const [column, count] of counts) {
		if (count > most) {
			best = column;
			most = count;
		}
	}
	return best;
}

/** The gap between a keyword and its value: onto the grid, or one space. */
function padding(indent: number, keyword: string, column: number | null): string {
	const want = (column ?? 0) - indent - keyword.length;
	return want > 0 ? ' '.repeat(want) : ' ';
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

/**
 * Anything with a name and a block: an aggregate, or a class inside one.
 *
 * The field helpers below work on this rather than on a node, because a field
 * is the same idea at both levels — `invariant` in an aggregate and `contains`
 * in an entity are both one keyword and one value inside a block the grammar
 * lets you leave out entirely.
 */
type Declaration = { readonly span: Span; readonly nameSpan: Span };

/** One `keyword "…"` in a declaration's own block. */
interface Run {
	/** The keyword and its string together, for removing the line. */
	readonly span: Span;
	/** The quoted string alone, for rewriting it in place. */
	readonly valueSpan: Span;
}

/**
 * Every `keyword "…"` written directly in this declaration's block, in order.
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
function fieldRuns(source: string, declaration: Declaration, keyword: string): Run[] {
	const open = openBraceAfter(source, declaration.nameSpan.end);
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
	declaration: Declaration,
	keyword: string,
	text: string,
	anchor: Run | null,
	joined: boolean,
): string {
	return insertLine(
		source,
		parsed,
		declaration,
		(indent) => `${keyword} ${render(text, indent, keyword.length + 1)}`,
		anchor?.span.end ?? null,
		joined ? 'joined' : 'paragraph',
	);
}

/**
 * How a new line sits among the ones already in the block.
 *
 *   joined     more of the field above it, so no gap either side.
 *   paragraph  a different kind of field in a block of paragraphs — an
 *              aggregate's `intent` and its invariants — so a blank line
 *              separates them.
 *   table      a different kind of field in a block that is a table. A
 *              member's body runs `id`, `attribute`, `embeds`, `contains`
 *              together with no gaps at all, and the spacing rule that is
 *              right one level up would open a hole the sample does not have.
 */
type Spacing = 'joined' | 'paragraph' | 'table';

/**
 * Write one line into a declaration's block.
 *
 * `after` is the offset it goes under — the last field of its kind, the
 * `intent` above a first invariant, the last attribute above a first link — or
 * null for the top of the block. The body is built from the indent rather than
 * given, because a field that folds has to know the column it starts in.
 */
function insertLine(
	source: string,
	parsed: string,
	declaration: Declaration,
	body: (indent: string) => string,
	after: number | null,
	spacing: Spacing,
): string {
	const open = openBraceAfter(parsed, declaration.nameSpan.end);

	// A declaration written without braces — legal for an aggregate and for a
	// member both, and for an aggregate a model that fails its own check for
	// want of a root. The field brings the block with it.
	if (open < 0) {
		const outer = lineIndent(parsed, declaration.span.start);
		const inner = outer + step();
		const head = declaration.nameSpan.end;
		return `${source.slice(0, head)} {\n${inner}${body(inner)}\n${outer}}${source.slice(head)}`;
	}

	const indent = indentInside(parsed, open);
	const line = `${indent}${body(indent)}\n`;
	const at = lineAfter(source, after ?? open);
	const rest = source.slice(at);

	const gaps = spacing === 'paragraph';
	// A blank line above, unless the line above is more of the same field.
	const lead = gaps && after !== null ? '\n' : '';
	// And one below, unless there is already a gap or the block ends here.
	const settled = !gaps || /^[ \t]*(\n|\})/.test(rest);

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

