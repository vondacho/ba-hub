/**
 * The `.ddm` domain model.
 *
 * The map says a context has an aggregate called `Submission`. This says what
 * `Submission` *is*: what it holds, what it protects, and what it is allowed to
 * know about the rest of the world. One zoom level down, same discipline — the
 * text is the source of truth, every declaration carries the span it was parsed
 * from, and a gesture in the graph becomes a splice into the text.
 *
 * Four decisions distinguish this from a class diagram, and each one is the
 * reason for having a format at all rather than writing PlantUML by hand.
 *
 *   1. **An aggregate is a boundary, not a folder.** Its members nest inside
 *      it, so "this entity belongs to exactly one aggregate" is structural
 *      rather than a rule that can drift. What crosses the boundary is
 *      `references`, and what cannot cross is `contains`.
 *
 *   2. **The invariant is a field.** An aggregate exists to keep something
 *      true across a transaction; an aggregate with nothing to protect is a
 *      table with extra ceremony. So the rationale gets a place to live and a
 *      warning when it is empty, exactly as `because` does on a relationship
 *      in the map.
 *
 *   3. **Identity is the difference between an entity and a value.** An entity
 *      has an `id` and a value object may not — not as a style preference but
 *      as the definition, which is why the parser refuses it rather than
 *      warning.
 *
 *   4. **Names are identities, globally within one model.** Two things called
 *      `Line` in one bounded context is precisely the ubiquitous-language
 *      failure this tool exists to surface, so it is an error and not a
 *      namespacing problem to be solved with dots.
 *
 * PlantUML is an **export** of this and never an input. A round trip through a
 * rendering language would lose the invariants, the by-identity rule and the
 * distinction between a value object and an entity — everything above — and
 * would hand us the second source of truth the whole component refuses.
 */

import type { Span } from '../ddd/model';

export type { Span };

/** Stable within one parse. Derived from the name, which is the identity. */
export type Id = string;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberKind = 'entity' | 'value' | 'enum';

/**
 * How many, written as words rather than as `0..1` and `1..*`.
 *
 * The map spells its patterns out — `open-host-service`, not `OHS` — and this
 * follows it. The audience reads UML, so the symbols would be legible; but a
 * format whose every other token is an English word reads worse for one line
 * of punctuation, and the emitted PlantUML puts the symbols back for the
 * people who want them.
 */
export type Multiplicity = 'one' | 'optional' | 'many' | 'at-least-one';

export const MULTIPLICITIES: readonly Multiplicity[] = [
	'one',
	'optional',
	'many',
	'at-least-one',
];

/** What `1..*` and friends look like once they reach PlantUML. */
export const multiplicityMark: Record<Multiplicity, string> = {
	one: '1',
	optional: '0..1',
	many: '*',
	'at-least-one': '1..*',
};

export interface Attribute {
	readonly name: string;
	/** Free text. The model does not have a type system and should not grow one. */
	readonly type: string;
	readonly span: Span;
	readonly nameSpan: Span;
}

interface MemberBase {
	readonly id: Id;
	readonly name: string;
	/** The aggregate this belongs to, or null for a value shared across them. */
	readonly aggregate: Id | null;
	readonly attributes: readonly Attribute[];
	readonly span: Span;
	readonly nameSpan: Span;
}

export interface EntityNode extends MemberBase {
	readonly kind: 'entity';
	/** Exactly one entity per aggregate has this. */
	readonly root: boolean;
	/** The identity type. Absent is a warning: an entity without one is a value. */
	readonly identity?: string;
}

export interface ValueNode extends MemberBase {
	readonly kind: 'value';
}

export interface EnumNode extends MemberBase {
	readonly kind: 'enum';
	readonly literals: readonly string[];
}

export type Member = EntityNode | ValueNode | EnumNode;

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface AggregateNode {
	readonly id: Id;
	readonly name: string;
	readonly intent?: string;
	/**
	 * What must stay true across a transaction. Repeatable, because an
	 * aggregate usually protects more than one thing and a list of them is the
	 * most useful part of the file to a reader who did not write it.
	 */
	readonly invariants: readonly string[];
	/** The root entity. Null only in a document that failed its own check. */
	readonly root: Id | null;
	readonly members: readonly Id[];
	readonly span: Span;
	readonly nameSpan: Span;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * The three ways one declaration can name another, and the whole argument of
 * the format is in the difference between them.
 *
 *   contains   — composition inside one boundary. The part has no life of its
 *                own: it is created, saved and deleted with the root.
 *   embeds     — a value object or an enumeration, which has no identity and
 *                is therefore copied rather than shared.
 *   references — across a boundary, **by identity**. You name another
 *                aggregate, never something inside one, and you hold its id
 *                rather than the thing itself. This is the rule that makes an
 *                aggregate a consistency boundary rather than a diagram, and
 *                the parser enforces it.
 */
export type LinkKind = 'contains' | 'embeds' | 'references';

export interface Link {
	readonly id: Id;
	readonly kind: LinkKind;
	readonly from: Id;
	readonly to: Id;
	readonly multiplicity: Multiplicity;
	readonly span: Span;
	/** The quoted target, so a rename rewrites the name and nothing else. */
	readonly targetSpan: Span;
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface DomainModel {
	/**
	 * The bounded context this model is the inside of.
	 *
	 * A name, matching the map's, because the name is the identity in both
	 * formats. It is what lets the two documents be checked against each other
	 * without either one holding a pointer into the other.
	 */
	readonly context: string;
	readonly contextSpan: Span;
	readonly aggregates: readonly AggregateNode[];
	readonly members: readonly Member[];
	readonly links: readonly Link[];
	/** The source this was parsed from, verbatim. See `DddDocument.source`. */
	readonly source: string;
}

/** Every declaration, for the checks and for the graph. */
export type ModelNode = AggregateNode | Member;

export function isMember(node: ModelNode): node is Member {
	return 'kind' in node;
}

export const memberLabel: Record<MemberKind, string> = {
	entity: 'Entity',
	value: 'Value object',
	enum: 'Enumeration',
};

export const linkLabel: Record<LinkKind, string> = {
	contains: 'contains',
	embeds: 'embeds',
	references: 'references',
};
