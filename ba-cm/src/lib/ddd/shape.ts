/**
 * The three questions both diagram exports ask of a map.
 *
 * `puml.ts` and `mermaid.ts` render the same tree into two languages, so what
 * differs between them is syntax and what is common is *the reading of the
 * document*: which contexts hang off a parent, which subdomain carries which
 * classification, and what a context that serves two of them counts as. Three
 * identical copies of that reading — the outline keeps a fourth, in its own
 * shape — is three places for it to drift.
 *
 * It lives beside the model rather than in `../diagram.ts`, which is the
 * opposite seam: that file knows PlantUML and Mermaid and nothing about a
 * `.ddd`; this one knows a `.ddd` and nothing about either language.
 */

import type { Classification, ContextNode, DddDocument, SubdomainNode } from './model';

/**
 * The contexts attached to one parent, in document order.
 *
 * Read off `serves` rather than off the containment edges, because `serves` is
 * the model's own answer and carries the straddle: a context serving two
 * subdomains is returned for both, which is what it does on the canvas.
 * `outline.ts` reads it the same way and says the same thing.
 */
export function serving(
	contexts: readonly ContextNode[],
	parent: string,
): readonly ContextNode[] {
	return contexts.filter((context) => context.serves.includes(parent));
}

/** A subdomain's classification, by id. Null for anything else. */
export function classifier(document: DddDocument): (id: string) => Classification | null {
	const byId = new Map(
		document.nodes
			.filter((node): node is SubdomainNode => node.kind === 'subdomain')
			.map((node) => [node.id, node.classification] as const),
	);
	return (id) => byId.get(id) ?? null;
}

/**
 * A context takes the classification of the most demanding thing it serves.
 *
 * `styleFor` in `graph/style.ts` restated, because that one returns Tailwind
 * class names and a file with no stylesheet needs the classification itself.
 * The reading is the same, and so is the argument for it: if any part of what a
 * context does is core, it is not safe to draw it as generic. `supporting` is
 * the fallback when nothing it serves can be found, exactly as on the canvas.
 */
export function strongest(
	context: ContextNode,
	classificationOf: (id: string) => Classification | null,
): Classification {
	const ranked: Classification[] = ['core', 'supporting', 'generic'];
	const found = context.serves
		.map(classificationOf)
		.filter((value): value is Classification => value !== null);
	return ranked.find((candidate) => found.includes(candidate)) ?? 'supporting';
}
