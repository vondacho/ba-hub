/**
 * The `.ddd` parser.
 *
 * Produces a `DddDocument` and a list of `Problem`s. It does not throw for a
 * recoverable error — the editor calls this on every keystroke-ish, and a
 * parser that gave up on the first bad token would report one problem at a time
 * and make a half-written file feel hostile.
 *
 * The one exception is a lexical failure, which is thrown by the lexer and
 * caught here: an unterminated string makes every token after it meaningless.
 *
 * ## Two passes, on purpose
 *
 * Pass one builds nodes and collects relationships as *unresolved name pairs*.
 * Pass two resolves those names against the nodes and runs the semantic checks.
 *
 * The split exists because a relationship may be written above the context it
 * names — the sample file puts the whole map after the whole domain — and a
 * single-pass parser would have to either forbid that or forward-declare.
 * Neither is worth it to save one traversal of a few hundred nodes.
 */

import {
	isClassification,
	isPattern,
	symmetric,
	type ContainmentEdge,
	type ContextNode,
	type DddDocument,
	type DomainNode,
	type Edge,
	type Id,
	type ModelStatus,
	type Node,
	type Pattern,
	type RelationshipEdge,
	type Span,
	type SubdomainNode,
} from './model';
import { DddLexError, tokenize, type Token, type TokenType } from './lexer';
import { errorAt, hasErrors, report, warningAt, type Problem } from './problems';

export interface ParseResult {
	readonly document: DddDocument;
	readonly problems: readonly Problem[];
	/** False when an error means the document should not replace the last good one. */
	readonly ok: boolean;
}

const STATUSES: readonly string[] = ['modelled', 'drafted', 'unmodelled'];

/** A relationship before its endpoint names have been resolved to nodes. */
interface PendingRelationship {
	readonly fromName: string;
	readonly fromSpan: Span;
	readonly toName: string;
	readonly toSpan: Span;
	readonly directed: boolean;
	readonly arrowSpan: Span;
	readonly pattern: readonly [Pattern] | readonly [Pattern, Pattern];
	readonly patternSpan: Span;
	readonly exchange?: string;
	readonly because?: string;
	readonly span: Span;
}

/** A context's `serves` names, resolved in pass two. */
interface PendingServes {
	readonly contextId: Id;
	readonly name: string;
	readonly span: Span;
}

export function parse(source: string): ParseResult {
	const problems: Problem[] = [];

	let tokens: readonly Token[];
	try {
		tokens = tokenize(source);
	} catch (error) {
		if (error instanceof DddLexError) {
			report(problems, errorAt(error.span, error.message));
			return { document: blank(source), problems, ok: false };
		}
		throw error;
	}

	let cursor = 0;
	const nodes: Node[] = [];
	const edges: Edge[] = [];
	const relationships: PendingRelationship[] = [];
	const serves: PendingServes[] = [];

	const peek = (offset = 0): Token => tokens[Math.min(cursor + offset, tokens.length - 1)]!;
	const next = (): Token => tokens[Math.min(cursor++, tokens.length - 1)]!;
	const check = (type: TokenType, value?: string): boolean => {
		const token = peek();
		return token.type === type && (value === undefined || token.value === value);
	};
	const accept = (type: TokenType, value?: string): Token | null =>
		check(type, value) ? next() : null;

	const fail = (token: Token, message: string): void => {
		report(problems, errorAt(token.span, message));
	};

	const expect = (type: TokenType, what: string): Token | null => {
		if (check(type)) return next();
		fail(peek(), `Expected ${what}, found ${describe(peek())}.`);
		return null;
	};

	/**
	 * Abandon the declaration being parsed: swallow its name if it has one and
	 * its balanced block if it has one, so the enclosing loop resumes at the
	 * next sibling rather than at the wreckage.
	 *
	 * Without this, one bad `subdomain wrong "…"` reports three errors — the
	 * classification, then the name as an unexpected token, then the `{`. A
	 * cascade like that buries the one problem the author can act on.
	 */
	const skipDeclaration = (): void => {
		// Step over whatever the head was supposed to be — a stray classification
		// keyword, a name, or both — up to the block or the next sibling.
		while (!check('{') && !check('}') && !check('eof')) {
			const token = peek();
			if (
				token.type === 'word' &&
				['domain', 'subdomain', 'context', 'map'].includes(token.value)
			) {
				return;
			}
			next();
		}
		if (!accept('{')) return;
		let depth = 1;
		while (depth > 0 && !check('eof')) {
			const token = next();
			if (token.type === '{') depth += 1;
			else if (token.type === '}') depth -= 1;
		}
	};

	/** Skip to the next token that could start a fresh declaration. */
	const recover = (): void => {
		let depth = 0;
		while (!check('eof')) {
			const token = peek();
			if (token.type === '{') depth += 1;
			else if (token.type === '}') {
				if (depth === 0) return;
				depth -= 1;
			} else if (
				depth === 0 &&
				(token.type === 'string' ||
					(token.type === 'word' &&
						['domain', 'subdomain', 'context', 'map'].includes(token.value)))
			) {
				return;
			}
			next();
		}
	};

	// ---- the file -----------------------------------------------------------

	const mapWord = peek();
	if (!(mapWord.type === 'word' && mapWord.value === 'map')) {
		fail(mapWord, `A file starts with \`map "…"\`, found ${describe(mapWord)}.`);
		return { document: blank(source), problems, ok: false };
	}
	next();

	const titleToken = expect('string', 'a quoted map title');
	const title = titleToken?.value ?? 'Untitled map';
	const titleSpan = titleToken?.span ?? mapWord.span;

	if (expect('{', '`{` after the map title')) {
		while (!check('}') && !check('eof')) {
			const before = cursor;

			if (check('word', 'domain')) {
				parseDomain();
			} else if (check('string')) {
				parseRelationship();
			} else {
				fail(
					peek(),
					`Expected \`domain\` or a relationship starting with a quoted context name, found ${describe(peek())}.`,
				);
				recover();
			}

			// A recovery that consumed nothing would spin forever.
			if (cursor === before) next();
		}
		expect('}', '`}` closing the map');
	}

	// ---- pass two: resolve names -------------------------------------------

	const byName = new Map<string, Node>();
	for (const node of nodes) {
		const existing = byName.get(node.name);
		if (existing) {
			report(
				problems,
				errorAt(
					node.nameSpan,
					`Duplicate name "${node.name}" — already declared as a ${existing.kind} on line ${existing.nameSpan.line}. The name is the identity, so two nodes may not share one.`,
				),
			);
			continue;
		}
		byName.set(node.name, node);
	}

	for (const pending of serves) {
		const target = byName.get(pending.name);
		if (!target) {
			report(
				problems,
				errorAt(pending.span, `\`serves\` names "${pending.name}", which is not declared.`),
			);
			continue;
		}
		if (target.kind === 'context') {
			report(
				problems,
				errorAt(
					pending.span,
					`A context serves a subdomain or a domain, not another context. "${pending.name}" is a context.`,
				),
			);
			continue;
		}
		const context = nodes.find((node) => node.id === pending.contextId);
		if (context?.kind === 'context' && !context.serves.includes(target.id)) {
			(context.serves as Id[]).push(target.id);
			edges.push({
				kind: 'containment',
				id: `contain:${context.id}->${target.id}`,
				from: context.id,
				to: target.id,
				implied: false,
				span: pending.span,
			} satisfies ContainmentEdge);
		}
	}

	for (const pending of relationships) {
		const from = byName.get(pending.fromName);
		const to = byName.get(pending.toName);

		if (!from) {
			report(
				problems,
				errorAt(pending.fromSpan, `No context named "${pending.fromName}" is declared.`),
			);
		}
		if (!to) {
			report(
				problems,
				errorAt(pending.toSpan, `No context named "${pending.toName}" is declared.`),
			);
		}
		if (!from || !to) continue;

		if (from.kind !== 'context' || to.kind !== 'context') {
			const offender = from.kind !== 'context' ? from : to;
			report(
				problems,
				errorAt(
					offender === from ? pending.fromSpan : pending.toSpan,
					`Relationships run between bounded contexts. "${offender.name}" is a ${offender.kind}; a context's place in the business is expressed by nesting or \`serves\`.`,
				),
			);
			continue;
		}

		if (from.id === to.id) {
			report(problems, errorAt(pending.span, `A context cannot relate to itself.`));
			continue;
		}

		// The pairing check: an arrow asserts an upstream that a mutual pattern
		// denies, and a mutual arrow denies one that a directed pattern needs.
		//
		// Skipped when the dual-pattern check below has something to say, because
		// `<->` with two roles is one mistake and reporting it three times reads
		// as three.
		const dualOnMutual = pending.pattern.length === 2 && !pending.directed;
		for (const pattern of dualOnMutual ? [] : pending.pattern) {
			const shape = symmetric[pattern];
			if (shape === 'mutual' && pending.directed) {
				report(
					problems,
					errorAt(
						pending.arrowSpan,
						`\`${pattern}\` is mutual — neither side is upstream — so it is written with \`<->\` rather than \`->\`.`,
					),
				);
			}
			if (shape === 'directed' && !pending.directed) {
				report(
					problems,
					errorAt(
						pending.arrowSpan,
						`\`${pattern}\` has a direction: one side's model is the one the other accommodates. Write it with \`->\`, upstream first.`,
					),
				);
			}
		}

		if (pending.pattern.length === 2 && !pending.directed) {
			report(
				problems,
				errorAt(
					pending.patternSpan,
					`Two patterns describe an upstream role and a downstream one, which needs \`->\` to say which end is which.`,
				),
			);
		}

		edges.push({
			kind: 'relationship',
			id: `rel:${from.id}->${to.id}:${pending.patternSpan.start}`,
			from: from.id,
			to: to.id,
			directed: pending.directed,
			pattern: pending.pattern,
			patternSpan: pending.patternSpan,
			exchange: pending.exchange,
			because: pending.because,
			span: pending.span,
		} satisfies RelationshipEdge);

		if (!pending.because) {
			report(
				problems,
				warningAt(
					pending.span,
					`No \`because\` on ${from.name} → ${to.name}. The rationale is the field that keeps a map honest — it is where "the vendor will not change for us" gets written down instead of being dressed up.`,
				),
			);
		}
	}

	// ---- warnings that need the whole document ------------------------------

	for (const node of nodes) {
		if (!node.owner) {
			report(
				problems,
				warningAt(
					node.nameSpan,
					`"${node.name}" has no owner. An unowned boundary is a suggestion, and suggestions lose to deadlines.`,
				),
			);
		}

		if (node.kind === 'context') {
			if (node.serves.length === 0) {
				report(
					problems,
					warningAt(
						node.nameSpan,
						`"${node.name}" serves no part of the business — it is in the file and in no subdomain.`,
					),
				);
			}
			if (node.language.length === 0) {
				report(
					problems,
					warningAt(
						node.nameSpan,
						`"${node.name}" declares no language. The terms that mean something here and not next door are what give a boundary its edge.`,
					),
				);
			}
			const parents = node.serves
				.map((id) => nodes.find((candidate) => candidate.id === id))
				.filter((parent): parent is SubdomainNode => parent?.kind === 'subdomain');
			if (
				node.aggregates.length > 0 &&
				parents.length > 0 &&
				parents.every((parent) => parent.classification === 'generic')
			) {
				report(
					problems,
					warningAt(
						node.nameSpan,
						`"${node.name}" is in a generic subdomain and declares aggregates. Modelling a bought package is core-domain effort spent on somebody else's solved problem — either the classification is wrong or the aggregates are.`,
					),
				);
			}
		}

		if (node.kind === 'subdomain') {
			const hasContext = nodes.some(
				(candidate) => candidate.kind === 'context' && candidate.serves.includes(node.id),
			);
			if (!hasContext) {
				report(
					problems,
					warningAt(
						node.nameSpan,
						`"${node.name}" has no bounded context. Either it is served invisibly inside something else, or it is genuinely manual — both are worth knowing.`,
					),
				);
			}
		}
	}

	const document: DddDocument = { title, titleSpan, nodes, edges, source };
	return { document, problems, ok: !hasErrors(problems) };

	// ---- productions --------------------------------------------------------

	function parseDomain(): void {
		const keyword = next();
		const nameToken = expect('string', 'a quoted domain name');
		if (!nameToken) {
			skipDeclaration();
			return;
		}

		const domain: DomainNode = {
			kind: 'domain',
			id: `domain:${nameToken.value}`,
			name: nameToken.value,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		nodes.push(domain);

		if (!accept('{')) return;

		while (!check('}') && !check('eof')) {
			const before = cursor;
			if (check('word', 'intent')) assign(domain, 'intent');
			else if (check('word', 'owner')) assign(domain, 'owner');
			else if (check('word', 'subdomain')) parseSubdomain(domain.id);
			else if (check('word', 'context')) parseContext(domain.id);
			else {
				fail(
					peek(),
					`Expected \`intent\`, \`owner\`, \`subdomain\` or \`context\`, found ${describe(peek())}.`,
				);
				recover();
			}
			if (cursor === before) next();
		}
		expect('}', '`}` closing the domain');
	}

	function parseSubdomain(parent: Id): void {
		const keyword = next();

		const classToken = peek();
		if (classToken.type !== 'word' || !isClassification(classToken.value)) {
			fail(
				classToken,
				`A subdomain is classified \`core\`, \`supporting\` or \`generic\` — the classification is a budget, not a label — found ${describe(classToken)}.`,
			);
			skipDeclaration();
			return;
		}
		next();

		const nameToken = expect('string', 'a quoted subdomain name');
		if (!nameToken) {
			skipDeclaration();
			return;
		}

		const subdomain: SubdomainNode = {
			kind: 'subdomain',
			id: `subdomain:${nameToken.value}`,
			name: nameToken.value,
			classification: classToken.value,
			classificationSpan: classToken.span,
			parent,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		nodes.push(subdomain);
		edges.push({
			kind: 'containment',
			id: `contain:${subdomain.id}->${parent}`,
			from: subdomain.id,
			to: parent,
			implied: true,
		} satisfies ContainmentEdge);

		if (!accept('{')) return;

		while (!check('}') && !check('eof')) {
			const before = cursor;
			if (check('word', 'intent')) assign(subdomain, 'intent');
			else if (check('word', 'owner')) assign(subdomain, 'owner');
			else if (check('word', 'context')) parseContext(subdomain.id);
			else {
				fail(peek(), `Expected \`intent\`, \`owner\` or \`context\`, found ${describe(peek())}.`);
				recover();
			}
			if (cursor === before) next();
		}
		expect('}', '`}` closing the subdomain');
	}

	function parseContext(parent: Id): void {
		const keyword = next();
		const nameToken = expect('string', 'a quoted context name');
		if (!nameToken) {
			skipDeclaration();
			return;
		}

		const language: string[] = [];
		const aggregates: string[] = [];
		const context: ContextNode = {
			kind: 'context',
			id: `context:${nameToken.value}`,
			name: nameToken.value,
			language,
			aggregates,
			status: 'modelled',
			serves: [parent],
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		nodes.push(context);
		edges.push({
			kind: 'containment',
			id: `contain:${context.id}->${parent}`,
			from: context.id,
			to: parent,
			implied: true,
		} satisfies ContainmentEdge);

		if (!accept('{')) return;

		while (!check('}') && !check('eof')) {
			const before = cursor;

			if (check('word', 'intent')) assign(context, 'intent');
			else if (check('word', 'owner')) assign(context, 'owner');
			else if (check('word', 'language')) collect(language, 'language');
			else if (check('word', 'aggregate')) collect(aggregates, 'aggregate');
			else if (check('word', 'status')) {
				next();
				const value = peek();
				if (value.type === 'word' && STATUSES.includes(value.value)) {
					next();
					(context as { status: ModelStatus }).status = value.value as ModelStatus;
				} else {
					fail(
						value,
						`\`status\` is \`modelled\`, \`drafted\` or \`unmodelled\`, found ${describe(value)}.`,
					);
					recover();
				}
			} else if (check('word', 'serves')) {
				const servesWord = next();
				const target = expect('string', 'a quoted subdomain or domain name');
				if (target) {
					serves.push({
						contextId: context.id,
						name: target.value,
						span: { ...servesWord.span, end: target.span.end },
					});
				}
			} else {
				fail(
					peek(),
					`Expected \`intent\`, \`owner\`, \`language\`, \`aggregate\`, \`status\` or \`serves\`, found ${describe(peek())}.`,
				);
				recover();
			}

			if (cursor === before) next();
		}
		expect('}', '`}` closing the context');
	}

	function parseRelationship(): void {
		const fromToken = next();

		const arrowToken = peek();
		let directed: boolean;
		if (arrowToken.type === 'arrow') directed = true;
		else if (arrowToken.type === 'biarrow') directed = false;
		else {
			fail(
				arrowToken,
				`Expected \`->\` or \`<->\` after "${fromToken.value}", found ${describe(arrowToken)}. Direction is about the model: upstream is whoever's model the other has to accommodate.`,
			);
			recover();
			return;
		}
		next();

		const toToken = expect('string', 'a quoted context name');
		if (!toToken) {
			recover();
			return;
		}

		if (!expect(':', '`:` before the pattern')) {
			recover();
			return;
		}

		const first = readPattern();
		if (!first) {
			recover();
			return;
		}

		let pattern: readonly [Pattern] | readonly [Pattern, Pattern] = [first.pattern];
		let patternSpan = first.span;

		if (accept('/')) {
			const second = readPattern();
			if (second) {
				pattern = [first.pattern, second.pattern];
				patternSpan = { ...first.span, end: second.span.end };
			}
		}

		let exchange: string | undefined;
		let because: string | undefined;
		let end = patternSpan.end;

		if (accept('{')) {
			while (!check('}') && !check('eof')) {
				const before = cursor;
				if (check('word', 'exchange')) {
					next();
					exchange = expect('string', 'a quoted description of what crosses')?.value;
				} else if (check('word', 'because')) {
					next();
					because = expect('string', 'a quoted rationale')?.value;
				} else {
					fail(peek(), `Expected \`exchange\` or \`because\`, found ${describe(peek())}.`);
					recover();
				}
				if (cursor === before) next();
			}
			const close = expect('}', '`}` closing the relationship');
			if (close) end = close.span.end;
		}

		relationships.push({
			fromName: fromToken.value,
			fromSpan: fromToken.span,
			toName: toToken.value,
			toSpan: toToken.span,
			directed,
			arrowSpan: arrowToken.span,
			pattern,
			patternSpan,
			exchange,
			because,
			span: { ...fromToken.span, end },
		});
	}

	function readPattern(): { pattern: Pattern; span: Span } | null {
		const token = peek();
		if (token.type !== 'word' || !isPattern(token.value)) {
			fail(
				token,
				`Expected one of the nine strategic patterns, found ${describe(token)}. The names are Evans's and are used exactly, because several describe the same arrow and differ only in who has the leverage.`,
			);
			return null;
		}
		next();
		return { pattern: token.value, span: token.span };
	}

	/** `intent "…"` / `owner "…"` — at most one, last wins with a warning. */
	function assign(node: Node, field: 'intent' | 'owner'): void {
		const keyword = next();
		const value = expect('string', `a quoted ${field}`);
		if (!value) return;
		if (node[field] !== undefined) {
			report(
				problems,
				warningAt(keyword.span, `Second \`${field}\` on "${node.name}" — the later one wins.`),
			);
		}
		(node as unknown as Record<string, string>)[field] = value.value;
	}

	/** `language "a" "b" "c"` — one or more strings, appended. */
	function collect(into: string[], keyword: string): void {
		const word = next();
		if (!check('string')) {
			fail(peek(), `\`${keyword}\` takes one or more quoted terms, found ${describe(peek())}.`);
			recover();
			return;
		}
		while (check('string')) into.push(next().value);
		void word;
	}
}

function blank(source: string): DddDocument {
	return {
		title: 'Untitled map',
		titleSpan: { start: 0, end: 0, line: 1, column: 1 },
		nodes: [],
		edges: [],
		source,
	};
}

function describe(token: Token): string {
	switch (token.type) {
		case 'eof':
			return 'the end of the file';
		case 'string':
			return `"${token.value}"`;
		case 'word':
			return `\`${token.value}\``;
		default:
			return `\`${token.value}\``;
	}
}
