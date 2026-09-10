/**
 * The map as PlantUML: a diagram somebody else's tool draws.
 *
 * ## Why, when there is already a picture
 *
 * The `.svg` and the `.png` are copies of the canvas — see `graph/raster.ts` —
 * and they land finished. This lands as *text*: a description of the map that a
 * renderer somewhere else turns into a picture. Which is the point. A `.puml`
 * committed beside the code is rendered by a CI job, by Confluence, by an IDE
 * plugin and by a reviewer's browser, and when the map changes the diff is the
 * three lines that changed rather than a new binary. The picture is what goes
 * in the deck; this is what goes in the repository.
 *
 * ## The arrangement does not travel, and that is the trade
 *
 * A `.ddd` holds no coordinates on purpose — `model.ts` argues it — and the
 * `.dddview` beside it is this browser's arrangement, which neither diagram
 * language can express. So the layout here is graphviz's, and it will not agree
 * with the one on screen. Somebody who has spent an afternoon arranging a map
 * wants the `.svg`; somebody who wants the map to render in a pull request
 * wants this. Both rows are offered, and the sentence on each says which is
 * which.
 *
 * ## An export and never an input
 *
 * The same rule `ddm/model.ts` states for the domain model, and for the same
 * reason: a round trip through a rendering language would lose `intent`,
 * `because`, `owner`, `language` and the difference between a classification
 * and a colour. Everything this tool exists to record is the part a diagram
 * language has no word for. There is one source of truth and it is the `.ddd`.
 *
 * ## What is on the arrows, and what is not
 *
 * The pattern, in full. Not `exchange`, not `because` — both are a sentence or
 * two each, and an arrow label two sentences long is a paragraph with a line
 * through it. The outline is where prose goes; a picture is for the shape.
 *
 * Full pattern names rather than the canvas's `C/S` and `ACL`, because the
 * abbreviations exist to stop two adjacent arcs overlapping in a fixed layout,
 * and a renderer given full names makes room for them.
 *
 * ## Nothing is dated
 *
 * As in `outline.ts`: this is an export made to be committed, and a timestamp
 * would make every regeneration a diff nobody can act on.
 */

import { statusNote } from '../graph/style';
import { aliases, commentText, pumlLabel } from '../diagram';
import { classifier, serving, strongest } from './shape';
import {
	patternLabel,
	type Classification,
	type ContextNode,
	type DddDocument,
	type RelationshipEdge,
	type SubdomainNode,
} from './model';

/**
 * The canvas's classification colours, in hex, for the light theme.
 *
 * Written out rather than derived, because there is nothing to derive them
 * from: every colour in `graph/style.ts` is a Tailwind class name that resolves
 * against a stylesheet, and a standalone `.puml` has no stylesheet. The legend
 * keeps a second copy of the same values for the same reason — see the note in
 * `style.ts` — and this is the third.
 *
 * `back` is the fill of a context; `tint` is the paler fill of the subdomain
 * package it sits in, so the box still reads against the frame around it.
 * `dashed` is generic's dashed border: the classification has to survive being
 * printed in grey, which is the rule the canvas follows too.
 */
const PALETTE: Record<
	Classification,
	{ line: string; back: string; tint: string; dashed: boolean }
> = {
	core: { line: '7c3aed', back: 'ddd6fe', tint: 'f5f3ff', dashed: false },
	supporting: { line: '0ea5e9', back: 'e0f2fe', tint: 'f0f9ff', dashed: false },
	generic: { line: '94a3b8', back: 'f1f5f9', tint: 'f8fafc', dashed: true },
};

export function plantuml(document: DddDocument): string {
	const alias = aliases();
	const contexts = document.nodes.filter((node): node is ContextNode => node.kind === 'context');
	const classificationOf = classifier(document);

	/*
	 * What has actually been written out.
	 *
	 * Both languages invent an element for a name they have not seen, so an
	 * arrow to a node this file never declared draws a bare box with an alias
	 * in it. A document being typed has dangling names in it all the time —
	 * that is what the problems panel is for — so every arrow below is written
	 * only when both of its ends exist.
	 */
	const declared = new Set<string>();

	/*
	 * A map with no title yet, which is what a document is for the first minute
	 * of its life. The `title` line is left out rather than written empty:
	 * PlantUML refuses a title with nothing after it, and an export that wrote
	 * an unopenable file would be the worst way to find that out.
	 */
	const title = commentText(document.title);

	const out: string[] = [
		'@startuml',
		title === ''
			? "' A context map exported from ba-cm."
			: `' ${title} — a context map exported from ba-cm.`,
		"' A rendering of the .ddd, which is the source. Regenerate rather than edit.",
		'',
		// The four that change what the diagram *is* rather than how it is
		// decorated: packages as plain frames — the default tabbed folder reads
		// as a filesystem — no drop shadows, and arrows in the canvas's slate.
		'skinparam packageStyle rectangle',
		'skinparam shadowing false',
		'skinparam ArrowColor #64748b',
		'skinparam ArrowFontColor #334155',
		'',
		...(title === '' ? [] : [`title ${pumlLabel(document.title)}`, '']),
	];

	for (const domain of document.nodes.filter((node) => node.kind === 'domain')) {
		/*
		 * A domain is a frame here and a filled box on the canvas.
		 *
		 * `DOMAIN_STYLE` fills it with ink, which works where a domain is drawn
		 * beside its subdomains and would swallow them whole where it is drawn
		 * around them. So the frame keeps the default border, and the colour is
		 * left to the classifications inside it — which are the signal anyway.
		 */
		declared.add(domain.id);
		out.push(`package "${pumlLabel(domain.name)}" as ${alias(domain.id, 'd')} {`);

		// Contexts written straight into a domain, with no subdomain between
		// them. Legal, and usually a map that has not finished dividing yet.
		for (const context of serving(contexts, domain.id)) {
			out.push(box(context, alias, classificationOf, declared, 1));
		}

		for (const subdomain of document.nodes.filter(
			(node): node is SubdomainNode => node.kind === 'subdomain' && node.parent === domain.id,
		)) {
			declared.add(subdomain.id);
			const paint = PALETTE[subdomain.classification];
			out.push(
				`\tpackage "${pumlLabel(subdomain.name)}" as ${alias(subdomain.id, 's')} <<${subdomain.classification}>> ${border(paint)};back:${paint.tint} {`,
			);
			for (const context of serving(contexts, subdomain.id)) {
				out.push(box(context, alias, classificationOf, declared, 2));
			}
			out.push('\t}');
		}

		out.push('}', '');
	}

	/*
	 * The contexts no package took.
	 *
	 * A context whose `serves` names nothing this document holds. The parser
	 * calls that a problem, and an export still runs on a document being typed,
	 * so they are drawn at the top level rather than dropped: a box quietly
	 * missing from a picture is read as a map that does not have one.
	 */
	const loose = contexts.filter((context) => !declared.has(context.id));
	if (loose.length > 0) {
		for (const context of loose) out.push(box(context, alias, classificationOf, declared, 0));
		out.push('');
	}

	/*
	 * The straddle: a context serving more than one parent.
	 *
	 * Nested inside the first and reaching the others with a dotted line,
	 * because a package is a tree and this is the one fact about a context map
	 * that is not. Labelled `serves`, after the keyword that produced it, so a
	 * reader can find it in the source.
	 */
	const straddles = contexts.flatMap((context) =>
		context.serves
			.slice(1)
			.filter((parent) => declared.has(parent))
			.map((parent) => `${alias(context.id, 'c')} ..> ${alias(parent, 's')} : serves`),
	);
	if (straddles.length > 0) out.push(...straddles, '');

	for (const edge of document.edges.filter(
		(edge): edge is RelationshipEdge => edge.kind === 'relationship',
	)) {
		if (!declared.has(edge.from) || !declared.has(edge.to)) continue;
		// `-->` from the upstream end; `--`, with no head, for the mutual
		// patterns. An arrowhead on a partnership would assert an upstream the
		// pattern denies, which is what `symmetric` in the model exists to stop.
		const line = edge.directed ? '-->' : '--';
		const pattern = edge.pattern.map((one) => patternLabel[one]).join(' / ');
		out.push(`${alias(edge.from, 'c')} ${line} ${alias(edge.to, 'c')} : ${pumlLabel(pattern)}`);
	}

	/*
	 * Nothing to draw.
	 *
	 * An empty `@startuml … @enduml` is not a picture of an empty map, it is a
	 * file PlantUML refuses with "no diagram found" — so the emptiness is drawn
	 * instead. Somebody who exports a map before writing one gets a diagram
	 * saying so, which is a true answer, rather than a file that will not open.
	 */
	if (document.nodes.length === 0) {
		out.push('note as empty', '\tThis map has nothing in it yet.', 'end note');
	}

	out.push('', '@enduml', '');
	return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** One context box, indented to the package it sits in. */
function box(
	context: ContextNode,
	alias: (id: string, prefix: string) => string,
	classificationOf: (id: string) => Classification | null,
	declared: Set<string>,
	depth: number,
): string {
	declared.add(context.id);
	const paint = PALETTE[strongest(context, classificationOf)];
	// The status under the name, in the canvas's own words. A context nobody
	// has modelled is the map saying where it stops, and a picture that left
	// that out would look finished.
	const note = statusNote[context.status];
	const label =
		note === ''
			? pumlLabel(context.name)
			: `${pumlLabel(context.name)}\\n<size:11><i>${pumlLabel(note)}</i></size>`;
	return `${'\t'.repeat(depth)}rectangle "${label}" as ${alias(context.id, 'c')} ${border(paint)};back:${paint.back}`;
}

/** `#line:…` or `#line.dashed:…`, which is how PlantUML spells a border. */
function border(paint: { line: string; dashed: boolean }): string {
	return paint.dashed ? `#line.dashed:${paint.line}` : `#line:${paint.line}`;
}
