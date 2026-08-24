/**
 * The `.ddm` parser.
 *
 * Same shape as the map's, and deliberately so: recursive descent, one pass to
 * declare and a second to resolve names, recovery that reports one problem per
 * mistake rather than a cascade, and a document that comes back even when it
 * failed so the panel has something to say.
 *
 * The tokenizer and the problems module are the map's. They are not `.ddd`'s —
 * they are this family's: braces, quoted strings that may span lines, bare
 * hyphenated words and `//` comments describe both languages exactly. Sharing
 * them is what keeps a `.ddm` file feeling like a `.ddd` file to type, which is
 * most of what "one tool" means to somebody using both.
 *
 * What is *not* shared is the checking, because that is the whole point of
 * having a second language. Half of this file is the rules an aggregate has to
 * obey, and each one is written to fail with the reason rather than the symptom:
 * a `contains` reaching into another aggregate is not "unknown name", it is the
 * rule that a boundary is a boundary.
 */

import { DddLexError, tokenize, type Token, type TokenType } from '../ddd/lexer';
import { errorAt, hasErrors, report, warningAt, type Problem } from '../ddd/problems';
import {
	MULTIPLICITIES,
	type AggregateNode,
	type Attribute,
	type DomainModel,
	type EntityNode,
	type EnumNode,
	type Id,
	type Link,
	type LinkKind,
	type Member,
	type Multiplicity,
	type Span,
	type ValueNode,
} from './model';

export interface ParseResult {
	readonly document: DomainModel;
	readonly problems: readonly Problem[];
	/** False when the document does not parse, or parses into something illegal. */
	readonly ok: boolean;
}

/** A `contains` / `embeds` / `references` waiting for its target to exist. */
interface PendingLink {
	readonly kind: LinkKind;
	readonly from: Id;
	readonly name: string;
	readonly multiplicity: Multiplicity;
	readonly span: Span;
	readonly targetSpan: Span;
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
	const aggregates: AggregateNode[] = [];
	const members: Member[] = [];
	const links: Link[] = [];
	const pending: PendingLink[] = [];

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
	 * Skip to something that can start a declaration again.
	 *
	 * Without this a single bad token turns into one problem per token to the
	 * end of the file, and the panel stops being a list of problems and becomes
	 * a wall of them.
	 */
	const recover = (): void => {
		let depth = 0;
		while (!check('eof')) {
			if (check('{')) depth += 1;
			if (check('}')) {
				if (depth === 0) return;
				depth -= 1;
			}
			if (depth === 0 && check('word') && STARTERS.has(peek().value)) return;
			next();
		}
	};

	// ---- the file ----------------------------------------------------------

	const mapWord = peek();
	if (!check('word', 'model')) {
		fail(mapWord, `A domain model starts with \`model\`, found ${describe(mapWord)}.`);
		return { document: blank(source), problems, ok: false };
	}
	next();

	const contextToken = expect('string', 'a quoted bounded context name');
	const context = contextToken?.value ?? 'Untitled model';
	const contextSpan = contextToken?.span ?? mapWord.span;

	if (expect('{', '`{` after the context name')) {
		while (!check('}') && !check('eof')) {
			const before = cursor;

			if (check('word', 'aggregate')) parseAggregate();
			else if (check('word', 'value')) parseValue(null);
			else if (check('word', 'enum')) parseEnum(null);
			else {
				fail(
					peek(),
					`Expected \`aggregate\`, or a shared \`value\` or \`enum\`, found ${describe(peek())}.`,
				);
				recover();
			}

			if (cursor === before) next();
		}
		expect('}', '`}` closing the model');
	}

	// ---- pass two: names ---------------------------------------------------

	/*
	 * Two namespaces, not one.
	 *
	 * An aggregate is named after its root — `aggregate "Submission"` holding
	 * `root entity "Submission"` — and that is not a collision to be worked
	 * around, it is the same thing seen from outside and from inside. Insisting
	 * on one flat namespace would make the most idiomatic model in DDD an error,
	 * which the seed model demonstrated within a minute of the rule existing.
	 *
	 * Nothing is ambiguous, because the *link kind* says which namespace was
	 * meant: `references` crosses a boundary and therefore names an aggregate,
	 * while `contains` and `embeds` stay inside one and name a member. Each
	 * still falls back to the other namespace when the lookup fails, so
	 * `contains "Submission"` gets told it is pointing at an aggregate rather
	 * than that the name does not exist.
	 */
	const aggregatesByName = new Map<string, AggregateNode>();
	const membersByName = new Map<string, Member>();

	const duplicate = (node: AggregateNode | Member, what: string): void => {
		report(
			problems,
			errorAt(
				node.nameSpan,
				`"${node.name}" is declared twice as ${what}. The name is the identity here — two of them inside one bounded context is the ubiquitous language failing, not a naming collision to be worked around.`,
			),
		);
	};

	for (const aggregate of aggregates) {
		if (aggregatesByName.has(aggregate.name)) duplicate(aggregate, 'an aggregate');
		else aggregatesByName.set(aggregate.name, aggregate);
	}
	for (const member of members) {
		if (membersByName.has(member.name)) duplicate(member, 'a member');
		else membersByName.set(member.name, member);
	}

	// An aggregate may share its name with its own root and with nothing else.
	for (const aggregate of aggregates) {
		const twin = membersByName.get(aggregate.name);
		if (!twin || twin.id === aggregate.root) continue;
		report(
			problems,
			errorAt(
				twin.nameSpan,
				`"${twin.name}" has the same name as the aggregate "${aggregate.name}" without being its root. An aggregate is named after the entity you reach it through; anything else sharing that name is two ideas wearing one word.`,
			),
		);
	}

	for (const link of pending) {
		const target =
			link.kind === 'references'
				? (aggregatesByName.get(link.name) ?? membersByName.get(link.name))
				: (membersByName.get(link.name) ?? aggregatesByName.get(link.name));
		const owner = members.find((member) => member.id === link.from);
		if (!owner) continue;

		if (!target) {
			report(
				problems,
				errorAt(link.targetSpan, `\`${link.kind}\` names "${link.name}", which is not declared.`),
			);
			continue;
		}

		if (!admits(link, owner, target, problems)) continue;

		links.push({
			id: `${link.kind}:${owner.id}->${target.id}:${link.span.start}`,
			kind: link.kind,
			from: owner.id,
			to: target.id,
			multiplicity: link.multiplicity,
			span: link.span,
			targetSpan: link.targetSpan,
		});
	}

	// ---- checks that need the whole document -------------------------------

	for (const aggregate of aggregates) {
		if (aggregate.root === null) {
			report(
				problems,
				errorAt(
					aggregate.nameSpan,
					`"${aggregate.name}" has no \`root\`. An aggregate is reached through exactly one entity — without it there is no boundary, only a group of classes.`,
				),
			);
		}

		if (aggregate.invariants.length === 0) {
			report(
				problems,
				warningAt(
					aggregate.nameSpan,
					`"${aggregate.name}" protects no invariant. An aggregate exists to keep something true across a transaction; one with nothing to protect is usually a table, and its parts probably belong to their own boundaries.`,
				),
			);
		}

		for (const id of aggregate.members) {
			const member = members.find((candidate) => candidate.id === id);
			if (!member || member.id === aggregate.root) continue;

			const reached = links.some(
				(link) => link.to === member.id && (link.kind === 'contains' || link.kind === 'embeds'),
			);
			if (!reached) {
				report(
					problems,
					warningAt(
						member.nameSpan,
						`Nothing inside "${aggregate.name}" reaches "${member.name}". Everything in an aggregate is loaded and saved through the root, so a member the root cannot reach is either dead or a boundary of its own.`,
					),
				);
			}
		}
	}

	for (const member of members) {
		if (member.kind === 'entity' && member.root && member.identity === undefined) {
			report(
				problems,
				warningAt(
					member.nameSpan,
					`"${member.name}" is a root with no \`id\`. What other aggregates hold when they reference this one is its identity, so it is worth naming.`,
				),
			);
		}

		if (member.aggregate === null && !links.some((link) => link.to === member.id)) {
			report(
				problems,
				warningAt(
					member.nameSpan,
					`"${member.name}" is shared with nothing — it sits outside every aggregate and none embeds it.`,
				),
			);
		}
	}

	const document: DomainModel = { context, contextSpan, aggregates, members, links, source };
	return { document, problems, ok: !hasErrors(problems) };

	// ---- productions -------------------------------------------------------

	function parseAggregate(): void {
		const keyword = next();
		const nameToken = expect('string', 'a quoted aggregate name');
		if (!nameToken) {
			recover();
			return;
		}

		const invariants: string[] = [];
		const owned: Id[] = [];
		const aggregate: AggregateNode = {
			id: `aggregate:${nameToken.value}`,
			name: nameToken.value,
			invariants,
			root: null,
			members: owned,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		aggregates.push(aggregate);

		if (!accept('{')) return;

		while (!check('}') && !check('eof')) {
			const before = cursor;

			if (check('word', 'intent')) {
				const word = next();
				const value = expect('string', 'a quoted intent');
				if (value) {
					if (aggregate.intent !== undefined) {
						report(
							problems,
							warningAt(word.span, `Second \`intent\` on "${aggregate.name}" — the later one wins.`),
						);
					}
					(aggregate as { intent?: string }).intent = value.value;
				}
			} else if (check('word', 'invariant')) {
				next();
				const value = expect('string', 'a quoted invariant');
				if (value) invariants.push(value.value);
			} else if (check('word', 'root')) {
				const word = next();
				if (!check('word', 'entity')) {
					fail(peek(), `\`root\` is followed by an \`entity\`, found ${describe(peek())}.`);
					recover();
				} else {
					const entity = parseEntity(aggregate, owned, true);
					if (entity) {
						if (aggregate.root !== null) {
							report(
								problems,
								errorAt(
									word.span,
									`"${aggregate.name}" declares a second \`root\`. An aggregate has exactly one entry point — two means these are two aggregates that have been drawn in one box.`,
								),
							);
						} else {
							(aggregate as { root: Id | null }).root = entity.id;
						}
					}
				}
			} else if (check('word', 'entity')) {
				parseEntity(aggregate, owned, false);
			} else if (check('word', 'value')) {
				const value = parseValue(aggregate);
				if (value) owned.push(value.id);
			} else if (check('word', 'enum')) {
				const enumeration = parseEnum(aggregate);
				if (enumeration) owned.push(enumeration.id);
			} else {
				fail(
					peek(),
					`Expected \`intent\`, \`invariant\`, \`root\`, \`entity\`, \`value\` or \`enum\`, found ${describe(peek())}.`,
				);
				recover();
			}

			if (cursor === before) next();
		}

		expect('}', `\`}\` closing "${aggregate.name}"`);
	}

	function parseEntity(
		aggregate: AggregateNode,
		owned: Id[],
		root: boolean,
	): EntityNode | null {
		const keyword = next();
		const nameToken = expect('string', 'a quoted entity name');
		if (!nameToken) {
			recover();
			return null;
		}

		const attributes: Attribute[] = [];
		const entity: EntityNode = {
			id: `entity:${nameToken.value}`,
			kind: 'entity',
			name: nameToken.value,
			aggregate: aggregate.id,
			root,
			attributes,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		members.push(entity);
		owned.push(entity.id);

		if (accept('{')) {
			parseBody(entity, attributes, { identity: true, links: true });
			expect('}', `\`}\` closing "${entity.name}"`);
		}
		return entity;
	}

	function parseValue(aggregate: AggregateNode | null): ValueNode | null {
		const keyword = next();
		const nameToken = expect('string', 'a quoted value object name');
		if (!nameToken) {
			recover();
			return null;
		}

		const attributes: Attribute[] = [];
		const value: ValueNode = {
			id: `value:${nameToken.value}`,
			kind: 'value',
			name: nameToken.value,
			aggregate: aggregate?.id ?? null,
			attributes,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		members.push(value);

		if (accept('{')) {
			parseBody(value, attributes, { identity: false, links: true });
			expect('}', `\`}\` closing "${value.name}"`);
		}
		return value;
	}

	function parseEnum(aggregate: AggregateNode | null): EnumNode | null {
		const keyword = next();
		const nameToken = expect('string', 'a quoted enumeration name');
		if (!nameToken) {
			recover();
			return null;
		}

		const literals: string[] = [];
		const enumeration: EnumNode = {
			id: `enum:${nameToken.value}`,
			kind: 'enum',
			name: nameToken.value,
			aggregate: aggregate?.id ?? null,
			attributes: [],
			literals,
			span: keyword.span,
			nameSpan: nameToken.span,
		};
		members.push(enumeration);

		if (accept('{')) {
			while (check('string')) literals.push(next().value);
			if (literals.length === 0) {
				report(
					problems,
					warningAt(nameToken.span, `"${enumeration.name}" lists no values.`),
				);
			}
			expect('}', `\`}\` closing "${enumeration.name}"`);
		}
		return enumeration;
	}

	/** The inside of an entity or a value object. */
	function parseBody(
		owner: Member,
		attributes: Attribute[],
		allow: { identity: boolean; links: boolean },
	): void {
		while (!check('}') && !check('eof')) {
			const before = cursor;

			if (check('word', 'id')) {
				const word = next();
				const value = expect('string', 'a quoted identity type');
				if (value) {
					if (!allow.identity) {
						report(
							problems,
							errorAt(
								word.span,
								`"${owner.name}" is a value object and cannot have an \`id\`. Identity is the whole difference between a value and an entity: two values with the same fields are the same value.`,
							),
						);
					} else {
						(owner as { identity?: string }).identity = value.value;
					}
				}
			} else if (check('word', 'attribute')) {
				const word = next();
				const nameToken = expect('string', 'a quoted attribute name');
				if (nameToken && expect(':', '`:` between an attribute and its type')) {
					const typeToken = expect('string', 'a quoted type');
					if (typeToken) {
						attributes.push({
							name: nameToken.value,
							type: typeToken.value,
							span: { ...word.span, end: typeToken.span.end },
							nameSpan: nameToken.span,
						});
					}
				}
			} else if (LINKS.has(peek().value) && check('word')) {
				const word = next();
				const kind = word.value as LinkKind;
				const target = expect('string', `a quoted name for \`${kind}\` to point at`);
				if (target) {
					let multiplicity: Multiplicity = 'one';
					if (check('word') && MULTIPLICITIES.includes(peek().value as Multiplicity)) {
						multiplicity = next().value as Multiplicity;
					} else if (check('word') && !STARTERS.has(peek().value) && !LINKS.has(peek().value)) {
						fail(
							peek(),
							`How many? \`one\`, \`optional\`, \`many\` or \`at-least-one\`, found ${describe(peek())}.`,
						);
						next();
					}
					pending.push({
						kind,
						from: owner.id,
						name: target.value,
						multiplicity,
						span: { ...word.span, end: target.span.end },
						targetSpan: target.span,
					});
				}
			} else {
				fail(
					peek(),
					`Expected \`id\`, \`attribute\`, \`contains\`, \`embeds\` or \`references\`, found ${describe(peek())}.`,
				);
				recover();
			}

			if (cursor === before) next();
		}
	}
}

// ---------------------------------------------------------------------------

const STARTERS = new Set(['aggregate', 'entity', 'value', 'enum', 'root', 'model']);
const LINKS = new Set(['contains', 'embeds', 'references']);

/**
 * Whether a link is one this format is willing to draw, and why not when it is
 * not.
 *
 * These four rules are the format. Everything else is syntax.
 */
function admits(
	link: PendingLink,
	owner: Member,
	target: AggregateNode | Member,
	problems: Problem[],
): boolean {
	const isAggregate = !('kind' in target);

	if (link.kind === 'contains') {
		if (isAggregate) {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`"${target.name}" is an aggregate, and one aggregate never contains another. What you can hold across a boundary is its identity — \`references "${target.name}"\`.`,
				),
			);
			return false;
		}
		if (target.kind !== 'entity') {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`\`contains\` is for entities. "${target.name}" is a ${target.kind === 'value' ? 'value object' : 'enumeration'}, which has no identity of its own and is \`embeds\`ed rather than owned.`,
				),
			);
			return false;
		}
		if (target.aggregate !== owner.aggregate) {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`"${owner.name}" cannot contain "${target.name}": they are in different aggregates. Composition inside one boundary is what \`contains\` means — across a boundary you hold an identity and load the other aggregate separately, which is the rule that makes a boundary worth having.`,
				),
			);
			return false;
		}
		return true;
	}

	if (link.kind === 'embeds') {
		if (isAggregate) {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`"${target.name}" is an aggregate and cannot be embedded. Use \`references\` and hold its identity.`,
				),
			);
			return false;
		}
		if (target.kind === 'entity') {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`"${target.name}" is an entity, so it is \`contains\`ed rather than embedded. Embedding is for things with no identity, which can be copied freely because two of them with the same fields are the same thing.`,
				),
			);
			return false;
		}
		if (target.aggregate !== null && target.aggregate !== owner.aggregate) {
			report(
				problems,
				errorAt(
					link.targetSpan,
					`"${target.name}" belongs to another aggregate. A value object used in two places is declared at the top of the model rather than inside one of them.`,
				),
			);
			return false;
		}
		return true;
	}

	// references
	if (!isAggregate) {
		report(
			problems,
			errorAt(
				link.targetSpan,
				`"${target.name}" is inside an aggregate, and you reference the aggregate rather than its parts. Reaching past a root is how a boundary stops being one — name the aggregate and let it protect its own insides.`,
			),
		);
		return false;
	}
	if (target.id === owner.aggregate) {
		report(
			problems,
			errorAt(
				link.targetSpan,
				`"${owner.name}" already belongs to "${target.name}" — a member does not reference its own aggregate.`,
			),
		);
		return false;
	}
	return true;
}

function describe(token: Token): string {
	if (token.type === 'eof') return 'the end of the file';
	if (token.type === 'string') return `the string ${JSON.stringify(token.value)}`;
	if (token.type === 'word') return `\`${token.value}\``;
	return `\`${token.value}\``;
}

function blank(source: string): DomainModel {
	return {
		context: 'Untitled model',
		contextSpan: { start: 0, end: 0, line: 1, column: 1 },
		aggregates: [],
		members: [],
		links: [],
		source,
	};
}
