/**
 * The map as Mermaid: the same diagram, in the language a README renders.
 *
 * `puml.ts` beside it makes the argument for exporting a diagram as text at
 * all — it diffs, it renders in CI, it is what goes in the repository rather
 * than in the deck. This is the second answer to the same question, and the
 * reason for having both is where they get rendered.
 *
 * PlantUML needs a renderer: a jar, a server, a plugin. Mermaid is already
 * running in the places a map is read — GitHub and GitLab render a ```mermaid
 * fence in a comment, an issue or a `README.md`; Notion, Obsidian and most
 * wikis do the same. Pasting a `.mmd` into a pull-request description makes the
 * map appear in the review. Nothing else this tool writes can do that.
 *
 * What PlantUML has back is a renderer that will draw anything: notes, colours
 * and nested frames that Mermaid either lacks or lays out worse. So the two
 * rows sit together and the sentence on each says where the file is going.
 *
 * The rest of the reasoning is `puml.ts`'s and is not repeated: the arrangement
 * does not travel, this is an export and never an input, the arrows carry the
 * pattern and not the prose, and nothing is dated.
 *
 * ## Two things are this language's own
 *
 * A context is a stadium and everything in the problem space is a frame, which
 * is the canvas's rule — solutions are round — in the shapes Mermaid has.
 *
 * And the classification is a `classDef` applied at the end rather than a
 * colour on each node, because that is how Mermaid is written: one place to
 * change, and a reader who wants the map in their own palette edits three lines
 * instead of thirty.
 */

import { statusNote } from '../graph/style';
import { aliases, commentText, mermaidLabel } from '../diagram';
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
 * A domain, as the frame everything hangs in.
 *
 * Painted rather than left alone, because Mermaid's default subgraph fill is a
 * highlighter yellow that appears nowhere else in this tool and reads as a
 * warning. `DOMAIN_STYLE` on the canvas fills a domain with ink, which works
 * where it is drawn beside its subdomains and would swallow them here — see
 * `puml.ts`. So: white, with the ink as its border.
 */
const DOMAIN = 'fill:#ffffff,stroke:#334155,color:#0f172a';

/**
 * The canvas's classification colours, as Mermaid class definitions.
 *
 * `puml.ts` has the same three in the same hex and says why they are written
 * out rather than derived. `node` is a context; `frame` is the paler subdomain
 * it sits in, so the box still reads against it. Generic keeps its dashes,
 * because the classification has to survive being printed in grey.
 */
const PALETTE: Record<Classification, { node: string; frame: string }> = {
	core: {
		node: 'fill:#ddd6fe,stroke:#7c3aed,color:#2e1065',
		frame: 'fill:#f5f3ff,stroke:#7c3aed,color:#2e1065',
	},
	supporting: {
		node: 'fill:#e0f2fe,stroke:#0ea5e9,color:#082f49',
		frame: 'fill:#f0f9ff,stroke:#0ea5e9,color:#082f49',
	},
	generic: {
		node: 'fill:#f1f5f9,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3',
		frame: 'fill:#f8fafc,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3',
	},
};

export function mermaid(document: DddDocument): string {
	const alias = aliases();
	const contexts = document.nodes.filter((node): node is ContextNode => node.kind === 'context');
	const classificationOf = classifier(document);

	/** See `puml.ts`: an arrow to a name never declared draws a box out of nothing. */
	const declared = new Set<string>();
	/*
	 * Which `classDef` each alias ends up in, collected as the diagram is
	 * written. Two maps rather than one: a subdomain frame and a context box
	 * take the same classification and a different definition of it, and
	 * telling them apart afterwards by the shape of their alias would be a rule
	 * held in a string.
	 */
	const boxes = new Map<string, Classification>();
	const frames = new Map<string, Classification>();

	// An untitled map. `puml.ts` says why the title is left out rather than
	// written empty; here it is only the comment that would look odd.
	const title = commentText(document.title);

	const out: string[] = [
		title === ''
			? '%% A context map exported from ba-cm.'
			: `%% ${title} — a context map exported from ba-cm.`,
		'%% A rendering of the .ddd, which is the source. Regenerate rather than edit.',
		// Left to right, because a map is a row of small boxes and a column of
		// them is a page nobody scrolls. A hint rather than an instruction:
		// once frames are nested Mermaid lays them out as it sees fit, and it
		// is the renderer's diagram from here.
		'flowchart LR',
	];

	const domains: string[] = [];

	for (const domain of document.nodes.filter((node) => node.kind === 'domain')) {
		declared.add(domain.id);
		domains.push(alias(domain.id, 'd'));
		out.push(`\tsubgraph ${alias(domain.id, 'd')}["${mermaidLabel(domain.name)}"]`);

		for (const context of serving(contexts, domain.id)) {
			out.push(box(context, alias, classificationOf, declared, boxes, 2));
		}

		for (const subdomain of document.nodes.filter(
			(node): node is SubdomainNode => node.kind === 'subdomain' && node.parent === domain.id,
		)) {
			declared.add(subdomain.id);
			frames.set(alias(subdomain.id, 's'), subdomain.classification);
			/*
			 * The guillemets are UML's stereotype marks, and PlantUML prints
			 * them for the same word next door. The classification is the
			 * strongest signal on the canvas and it is not going to be carried
			 * by a fill alone in a diagram somebody may re-theme.
			 *
			 * On one line, unlike the boxes. Mermaid measures a frame's title
			 * as a single line however many it holds, so a `<br/>` in a
			 * subgraph label draws its second line straight through whatever is
			 * inside the frame.
			 */
			out.push(
				`\t\tsubgraph ${alias(subdomain.id, 's')}["${mermaidLabel(subdomain.name)} «${mermaidLabel(subdomain.classification)}»"]`,
			);
			for (const context of serving(contexts, subdomain.id)) {
				out.push(box(context, alias, classificationOf, declared, boxes, 3));
			}
			out.push('\t\tend');
		}

		out.push('\tend');
	}

	// The contexts no frame took. `puml.ts` says why they are drawn rather than
	// dropped.
	for (const context of contexts.filter((one) => !declared.has(one.id))) {
		out.push(box(context, alias, classificationOf, declared, boxes, 1));
	}

	// The straddle, as a dotted line to the other parent. A subgraph is a legal
	// end of a link in Mermaid, which is the one place this reads better than
	// PlantUML: the line lands on the frame rather than on a box inside it.
	for (const context of contexts) {
		for (const parent of context.serves.slice(1)) {
			if (declared.has(parent)) {
				out.push(`\t${alias(context.id, 'c')} -.->|serves| ${alias(parent, 's')}`);
			}
		}
	}

	for (const edge of document.edges.filter(
		(edge): edge is RelationshipEdge => edge.kind === 'relationship',
	)) {
		if (!declared.has(edge.from) || !declared.has(edge.to)) continue;
		// `-->` from the upstream end, `---` with no head for the mutual
		// patterns. See `puml.ts`: an arrowhead on a partnership asserts an
		// upstream the pattern denies.
		const line = edge.directed ? '-->' : '---';
		const pattern = edge.pattern.map((one) => patternLabel[one]).join(' / ');
		out.push(
			`\t${alias(edge.from, 'c')} ${line}|"${mermaidLabel(pattern)}"| ${alias(edge.to, 'c')}`,
		);
	}

	/*
	 * The palette last, and only the classes this map actually used.
	 *
	 * A `classDef` nothing is assigned to is three lines of noise in a file
	 * somebody is going to read, and the whole reason for defining classes here
	 * rather than colouring each node is that the top of the file stays short.
	 */
	// Nothing to draw. A flowchart with no nodes renders as a blank image, which
	// is not wrong so much as useless: it looks like the export failed. See
	// `puml.ts`, where the same file would not open at all.
	if (document.nodes.length === 0) {
		out.push('\tempty["This map has nothing in it yet."]');
	}

	const used = [...new Set([...boxes.values(), ...frames.values()])];
	if (used.length > 0 || domains.length > 0) out.push('');
	if (domains.length > 0) {
		out.push(`\tclassDef domain ${DOMAIN}`);
		out.push(`\tclass ${domains.join(',')} domain`);
	}
	for (const classification of used) {
		const taken = named(boxes, classification);
		const framed = named(frames, classification);
		if (taken.length > 0) {
			out.push(`\tclassDef ${classification} ${PALETTE[classification].node}`);
			out.push(`\tclass ${taken.join(',')} ${classification}`);
		}
		if (framed.length > 0) {
			out.push(`\tclassDef ${classification}Frame ${PALETTE[classification].frame}`);
			out.push(`\tclass ${framed.join(',')} ${classification}Frame`);
		}
	}

	return `${out.join('\n')}\n`;
}

/** One context, as a stadium. Solutions are round — see `graph/style.ts`. */
function box(
	context: ContextNode,
	alias: (id: string, prefix: string) => string,
	classificationOf: (id: string) => Classification | null,
	declared: Set<string>,
	boxes: Map<string, Classification>,
	depth: number,
): string {
	declared.add(context.id);
	const id = alias(context.id, 'c');
	boxes.set(id, strongest(context, classificationOf));
	const note = statusNote[context.status];
	const label =
		note === ''
			? mermaidLabel(context.name)
			: `${mermaidLabel(context.name)}<br/>${mermaidLabel(note)}`;
	return `${'\t'.repeat(depth)}${id}(["${label}"])`;
}

/** The aliases in one map that carry a given classification. */
function named(
	painted: ReadonlyMap<string, Classification>,
	classification: Classification,
): readonly string[] {
	return [...painted].filter(([, value]) => value === classification).map(([id]) => id);
}
