/**
 * The `.ddd` document model.
 *
 * This file is the *decided interface* of ba-ddd-mapper-mapper: the shapes the parser
 * produces, the graph renders, and the serialiser writes back. It is written
 * before the parser on purpose — the argument in README.md turns on what a node
 * and an edge are, and that argument is easier to have against types than
 * against prose.
 *
 * Three things distinguish this model from doc-es's `.eventstorm` one, and each
 * is a decision rather than an accident:
 *
 *   1. **Every node carries the source span it was parsed from.** doc-es does
 *      not, because there the board is the source of truth and the file is a
 *      render of it. Here the text is the source of truth and the graph is a
 *      render, so a gesture in the graph has to become a *surgical edit to the
 *      text* — which is impossible without knowing which bytes to replace.
 *
 *   2. **There are no coordinates.** doc-es stores `@column` because on that
 *      board a column means a moment in time; position carries meaning. On a
 *      context map it does not, so layout is computed and never stored. A file
 *      whose diff is mostly position changes cannot be reviewed.
 *
 *   3. **Containment is an edge, not only a nesting.** A context usually sits
 *      inside one subdomain and occasionally serves two, and that straddle is
 *      the single most informative thing a catalog can record. A tree cannot
 *      express it; a graph can.
 */

/** Byte range in the source text, half-open. The basis of every graph edit. */
export interface Span {
	readonly start: number;
	readonly end: number;
	/** 1-based, for the problems panel. */
	readonly line: number;
	readonly column: number;
}

/** Stable within one parse. Derived from the name, which is the identity. */
export type Id = string;

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export type NodeKind = 'domain' | 'subdomain' | 'context';

/**
 * Why the business is in this part of the business. The classification is a
 * budget rather than a label — see ba-portal /doc/strategic/subdomain-types/.
 */
export type Classification = 'core' | 'supporting' | 'generic';

/** How far the model has been taken, not how important it is. */
export type ModelStatus = 'modelled' | 'drafted' | 'unmodelled';

interface NodeBase {
	readonly id: Id;
	/** The identity. Two nodes may not share one. */
	readonly name: string;
	/** Free prose. What this part of the business is for. */
	readonly intent?: string;
	/** A person, never a department. Absent is a warning, not an error. */
	readonly owner?: string;
	readonly span: Span;
	/** The span of the name alone, so a rename rewrites the name and nothing else. */
	readonly nameSpan: Span;
}

export interface DomainNode extends NodeBase {
	readonly kind: 'domain';
}

export interface SubdomainNode extends NodeBase {
	readonly kind: 'subdomain';
	readonly classification: Classification;
	/** The span of the classification keyword, so the graph can flip it in place. */
	readonly classificationSpan: Span;
	/** The domain this subdomain divides. Always exactly one. */
	readonly parent: Id;
}

export interface ContextNode extends NodeBase {
	readonly kind: 'context';
	/**
	 * The terms that mean something *here* that they do not mean next door.
	 * Not a glossary — a context listing forty generic nouns has recorded a data
	 * dictionary and learned nothing.
	 */
	readonly language: readonly string[];
	/**
	 * Consistency boundaries. Empty is a legitimate answer for a generic
	 * context and means "bought whole and wrapped", which is why `status`
	 * exists separately: it distinguishes a decision from an omission.
	 */
	readonly aggregates: readonly string[];
	readonly status: ModelStatus;
	/**
	 * The subdomains — or, rarely, domains — this context serves.
	 *
	 * Normally one, implied by nesting. More than one is the straddle, and it
	 * is the reason this is a list rather than a field. Zero is a problem the
	 * parser reports.
	 */
	readonly serves: readonly Id[];
}

export type Node = DomainNode | SubdomainNode | ContextNode;

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * Two edge classes, and keeping them apart is most of what makes the graph
 * readable.
 *
 *   containment  — a context serves a subdomain, a subdomain divides a domain.
 *                  Structural. Never carries a pattern. Drawn quietly.
 *   relationship — a context relates to a context. This is the one with the
 *                  information in it, and the only one anybody argues about.
 */
export type EdgeKind = 'containment' | 'relationship';

/**
 * The nine strategic patterns. The names are Evans's, and using them exactly is
 * worth more than it looks: `customer-supplier` and `conformist` describe the
 * same arrow and differ only in whether the downstream team has any negotiating
 * power — a political fact a generic "depends on" hides.
 */
export type Pattern =
	| 'partnership'
	| 'shared-kernel'
	| 'customer-supplier'
	| 'conformist'
	| 'anticorruption-layer'
	| 'open-host-service'
	| 'published-language'
	| 'separate-ways'
	| 'big-ball-of-mud';

/**
 * Whether a pattern describes a relationship with a direction.
 *
 * Enforced by the parser: `partnership`, `shared-kernel` and `separate-ways`
 * are mutual and may not be written with `->`, because an arrow would assert an
 * upstream that the pattern denies. The rest require one.
 *
 * `big-ball-of-mud` is deliberately permitted either way. It is not a pattern
 * anybody chooses — it is one you record — and a ball of mud with a discernible
 * direction is still a ball of mud.
 */
export const symmetric: Record<Pattern, 'mutual' | 'directed' | 'either'> = {
	partnership: 'mutual',
	'shared-kernel': 'mutual',
	'separate-ways': 'mutual',
	'customer-supplier': 'directed',
	conformist: 'directed',
	'anticorruption-layer': 'directed',
	'open-host-service': 'directed',
	'published-language': 'directed',
	'big-ball-of-mud': 'either',
};

export interface ContainmentEdge {
	readonly kind: 'containment';
	readonly id: Id;
	/** The context or subdomain. */
	readonly from: Id;
	/** The subdomain or domain it serves. */
	readonly to: Id;
	/**
	 * True when this edge is implied by nesting rather than written out as a
	 * `serves` line. An implied edge has no span of its own to delete, so the
	 * graph offers "move" rather than "remove" on it.
	 */
	readonly implied: boolean;
	readonly span?: Span;
}

export interface RelationshipEdge {
	readonly kind: 'relationship';
	readonly id: Id;
	/** Upstream for a directed edge; one arbitrary end for a mutual one. */
	readonly from: Id;
	readonly to: Id;
	readonly directed: boolean;
	/**
	 * The pattern governing the relationship.
	 *
	 * Two entries when the ends play different roles — `open-host-service /
	 * anticorruption-layer` is upstream publishing and downstream defending,
	 * which is one relationship and two named positions. One entry is the
	 * common case and means both ends are described by it.
	 */
	readonly pattern: readonly [Pattern] | readonly [Pattern, Pattern];
	readonly patternSpan: Span;
	/** What actually crosses, in domain terms. Not "data". */
	readonly exchange?: string;
	/** Why this pattern and not the neighbouring one, including the politics. */
	readonly because?: string;
	readonly span: Span;
}

export type Edge = ContainmentEdge | RelationshipEdge;

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface DddDocument {
	readonly title: string;
	readonly titleSpan: Span;
	readonly nodes: readonly Node[];
	readonly edges: readonly Edge[];
	/**
	 * The source this was parsed from, verbatim.
	 *
	 * Held because the graph edits *text*, not the model: a gesture produces a
	 * new source string by splicing at a span, and the result is re-parsed. That
	 * round trip is what preserves comments, blank lines and hand formatting,
	 * none of which the model represents and all of which a reviewer relies on.
	 */
	readonly source: string;
}

export const CLASSIFICATIONS: readonly Classification[] = ['core', 'supporting', 'generic'];

export const PATTERNS: readonly Pattern[] = [
	'partnership',
	'shared-kernel',
	'customer-supplier',
	'conformist',
	'anticorruption-layer',
	'open-host-service',
	'published-language',
	'separate-ways',
	'big-ball-of-mud',
];

export const patternLabel: Record<Pattern, string> = {
	partnership: 'Partnership',
	'shared-kernel': 'Shared kernel',
	'customer-supplier': 'Customer/supplier',
	conformist: 'Conformist',
	'anticorruption-layer': 'Anticorruption layer',
	'open-host-service': 'Open host service',
	'published-language': 'Published language',
	'separate-ways': 'Separate ways',
	'big-ball-of-mud': 'Big ball of mud',
};

/** What choosing this pattern admits to. Shown in the graph's edge picker. */
export const patternAdmits: Record<Pattern, string> = {
	partnership: 'Mutual dependence, and a real coordination cost.',
	'shared-kernel': 'That neither side can be made downstream of the other without lying.',
	'customer-supplier': 'That the downstream team has real negotiating power.',
	conformist: 'Powerlessness, honestly. That is the value of the name.',
	'anticorruption-layer':
		'That the upstream model is unsuitable and the downstream one is worth protecting.',
	'open-host-service': 'That there are enough consumers to make one interface cheaper than N.',
	'published-language': 'That the interchange format is an asset with more than two readers.',
	'separate-ways': 'That integration costs more than duplication.',
	'big-ball-of-mud': 'Reality. Not chosen — recorded, so everything around it can be defended.',
};

export function isPattern(value: unknown): value is Pattern {
	return typeof value === 'string' && (PATTERNS as readonly string[]).includes(value);
}

export function isClassification(value: unknown): value is Classification {
	return typeof value === 'string' && (CLASSIFICATIONS as readonly string[]).includes(value);
}
