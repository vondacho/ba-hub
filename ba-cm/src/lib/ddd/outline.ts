/**
 * The map as prose: one Markdown document.
 *
 * The picture is for a deck; this is for a wiki page, a pull request, or the
 * body of a ticket — the places where a `.svg` is an attachment nobody opens
 * and an image is not searchable. It is also the only export a screen reader, a
 * `grep` or a diff can do anything with, which matters more here than anywhere
 * else in this tool: a context map's two most valuable fields are `because` and
 * `intent`, both of them prose, and a picture is where prose goes to be
 * truncated.
 *
 * ## It leads with what the map is telling you
 *
 * The doctrine names five things to check, and four of them are countable —
 * how many subdomains are `core`, which boundaries have no owner, which
 * contexts have no `language`, how many relationships have no `because`. On the
 * canvas those are things you notice; in a document they are nothing at all
 * unless somebody counts, so this counts.
 *
 * Stated as findings, never as verdicts. Each one names what it saw so a reader
 * can disagree with it — a document that said "this map is wrong" would be
 * another opinion rather than the map's own account of itself. That is the same
 * rule doc-em's `reading.ts` follows next door, and for the same reason.
 *
 * ## Then the structure, then the relationships
 *
 * Domains, their subdomains, the contexts inside them — the document's own
 * order and the source pane's — and the relationships in a section of their
 * own at the end.
 *
 * The relationships are *not* interleaved under the contexts they touch, and
 * that is deliberate. An edge belongs to two contexts, so printing it under
 * both would say everything twice and printing it under one would be an
 * arbitrary choice a reader has to reverse-engineer. They are the part of the
 * map people argue about, and a list of them together is what an argument needs.
 *
 * ## Nothing is dated
 *
 * There is no "exported on" line, and it is not an oversight. An outline is the
 * export most likely to be committed beside the code it describes, and a
 * timestamp would make every regeneration a diff — the same map, a different
 * file, for no reason a reviewer can act on.
 */

import {
	patternLabel,
	type ContextNode,
	type DddDocument,
	type Node,
	type RelationshipEdge,
	type SubdomainNode,
} from './model';

export function outline(document: DddDocument): string {
	const out: string[] = [`# ${escape(document.title)}`, ''];

	out.push(...findings(document), ...structure(document), ...relationships(document));

	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * The countable half of the doctrine.
 *
 * Only checks the doctrine actually names, and each one says what it saw.
 * Nothing here is a score: a map with three `core` subdomains may be right, and
 * a map with none of these findings may still be a map of what everybody wishes
 * were true, which is the failure no count can see.
 */
function findings(document: DddDocument): readonly string[] {
	const nodes = document.nodes;
	const contexts = nodes.filter((node): node is ContextNode => node.kind === 'context');
	const subdomains = nodes.filter((node): node is SubdomainNode => node.kind === 'subdomain');
	const edges = document.edges.filter((edge): edge is RelationshipEdge => edge.kind === 'relationship');

	const found: string[] = [];

	const core = subdomains.filter((subdomain) => subdomain.classification === 'core');
	if (core.length > 2) {
		found.push(
			`- **${core.length} subdomains are \`core\`** — ${list(core.map((s) => s.name))}. A classification is a budget rather than a compliment: if more than a couple are core, none of them are getting the deep model and the best people.`,
		);
	}

	const unowned = nodes.filter((node) => node.owner === undefined);
	if (unowned.length > 0) {
		found.push(
			`- **${unowned.length} ${unowned.length === 1 ? 'boundary has' : 'boundaries have'} no owner** — ${list(unowned.map((n) => n.name))}. An unowned boundary is a suggestion, and suggestions lose to deadlines.`,
		);
	}

	const mute = contexts.filter((context) => context.language.length === 0);
	if (mute.length > 0) {
		found.push(
			`- **${mute.length} ${mute.length === 1 ? 'context has' : 'contexts have'} no \`language\`** — ${list(mute.map((c) => c.name))}. The terms that mean something here and not next door are what make it a boundary; a context with none has no edge.`,
		);
	}

	const unjustified = edges.filter((edge) => edge.because === undefined);
	if (unjustified.length > 0) {
		found.push(
			`- **${unjustified.length} of ${edges.length} relationships have no \`because\`.** That is where the honest answer goes, including the politics. The characteristic failure of a context map is aspiration — every arrow labelled \`customer-supplier\` because \`conformist\` feels like a defeat — and \`because\` is the field that catches it.`,
		);
	}

	if (found.length === 0) return [];
	return ['## What this map is telling you', '', ...found, '', ''];
}

function structure(document: DddDocument): readonly string[] {
	const out: string[] = [];
	const byId = new Map(document.nodes.map((node) => [node.id, node]));

	for (const domain of document.nodes.filter((node) => node.kind === 'domain')) {
		out.push(`## ${escape(domain.name)}`, '');
		out.push(...prose(domain));

		const children = document.nodes.filter(
			(node) => node.kind === 'subdomain' && node.parent === domain.id,
		) as SubdomainNode[];

		// A context written straight into a domain, with no subdomain between
		// them. Legal, and usually a map that has not finished dividing yet — so
		// it is listed rather than quietly attached to nothing.
		const direct = contextsServing(document, domain.id);
		for (const context of direct) out.push(...contextSection(context, byId, 3));

		for (const subdomain of children) {
			out.push(`### ${escape(subdomain.name)}`, '');
			out.push(`\`${subdomain.classification}\``, '');
			out.push(...prose(subdomain));
			const inside = contextsServing(document, subdomain.id);
			if (inside.length === 0) out.push('*No contexts yet.*', '');
			for (const context of inside) out.push(...contextSection(context, byId, 4));
		}

		if (children.length === 0 && direct.length === 0) out.push('*Nothing inside this domain yet.*', '');
	}

	return out;
}

/**
 * The contexts attached to one parent, in document order.
 *
 * Read off `serves` rather than off the containment edges, because `serves` is
 * the model's own answer and carries the straddle: a context serving two
 * subdomains appears under both, which is exactly what it does on the canvas
 * and exactly what somebody reading either section needs to know.
 */
function contextsServing(document: DddDocument, parent: string): readonly ContextNode[] {
	return document.nodes.filter(
		(node): node is ContextNode => node.kind === 'context' && node.serves.includes(parent),
	);
}

function contextSection(
	context: ContextNode,
	byId: ReadonlyMap<string, Node>,
	depth: number,
): readonly string[] {
	const out: string[] = [`${'#'.repeat(depth)} ${escape(context.name)}`, ''];

	const badges = [`\`${context.status}\``];
	if (context.serves.length > 1) {
		// The straddle, named where it happens. A context serving two subdomains
		// is a fact about the business, and reading one section without knowing
		// the context also belongs to another is how it gets missed.
		const others = context.serves.map((id) => byId.get(id)?.name).filter((n): n is string => n !== undefined);
		badges.push(`serves ${list(others)}`);
	}
	out.push(badges.join(' · '), '');

	out.push(...prose(context));

	if (context.language.length > 0) {
		out.push(`**Language:** ${context.language.map((term) => `\`${escape(term)}\``).join(', ')}`, '');
	}
	if (context.aggregates.length > 0) {
		out.push(`**Aggregates:** ${context.aggregates.map((name) => escape(name)).join(', ')}`, '');
	}

	return out;
}

/**
 * The relationships, in one section, each with its rationale.
 *
 * `because` is printed in full and never summarised. It is the line the whole
 * format exists to capture and the one a reviewer opens this document to read.
 */
function relationships(document: DddDocument): readonly string[] {
	const edges = document.edges.filter((edge): edge is RelationshipEdge => edge.kind === 'relationship');
	if (edges.length === 0) return [];

	const name = (id: string) => document.nodes.find((node) => node.id === id)?.name ?? id;
	const out = ['## Relationships', ''];

	for (const edge of edges) {
		const arrow = edge.directed ? '→' : '↔';
		const pattern = edge.pattern.map((p) => patternLabel[p]).join(' / ');
		out.push(`### ${escape(name(edge.from))} ${arrow} ${escape(name(edge.to))}`, '');
		out.push(`**${escape(pattern)}**`, '');
		if (edge.directed) {
			// Which end is upstream is the fact the arrow carries, and an arrow
			// glyph in prose is easy to read past. Said in words as well.
			out.push(`*${escape(name(edge.from))} is upstream: ${escape(name(edge.to))} accommodates its model.*`, '');
		}
		if (edge.exchange !== undefined) out.push(`**What crosses:** ${escape(edge.exchange)}`, '');
		if (edge.because !== undefined) out.push(`**Why:** ${escape(edge.because)}`, '');
		else out.push('*No `because`. Why this pattern and not the neighbouring one is not recorded.*', '');
	}

	return out;
}

/** A node's `intent` and `owner`, in that order, when it has them. */
function prose(node: Node): readonly string[] {
	const out: string[] = [];
	if (node.intent !== undefined) out.push(escape(node.intent), '');
	if (node.owner !== undefined) out.push(`**Owner:** ${escape(node.owner)}`, '');
	return out;
}

/** `a`, `a and b`, `a, b and c` — a list a person reads rather than a JSON array. */
function list(names: readonly string[]): string {
	const escaped = names.map(escape);
	if (escaped.length <= 1) return escaped[0] ?? '';
	return `${escaped.slice(0, -1).join(', ')} and ${escaped[escaped.length - 1]}`;
}

/**
 * Escape the characters that would make free text into markup.
 *
 * Only the ones that bite *inline*, and only where a name or a sentence of
 * `because` realistically contains them: a `*` or a `_` mid-sentence turns the
 * rest of the line italic, a `` ` `` opens a code span that swallows the next
 * one, a `[` starts a link, and a `<` is raw HTML in every renderer that allows
 * it. A general-purpose escaper would also backslash every `#`, `-` and `.`,
 * which turns readable prose into something nobody wants to read in the raw.
 */
function escape(value: string): string {
	return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}
