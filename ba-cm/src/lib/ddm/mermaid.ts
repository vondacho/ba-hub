/**
 * The model as Mermaid: the class diagram a README renders.
 *
 * `ddm/puml.ts` beside it holds the reasoning, and `ddd/mermaid.ts` holds the
 * reason for having both languages: PlantUML needs a renderer, and Mermaid is
 * already running wherever a model is read — a ```mermaid fence in a pull
 * request, an issue or a wiki page draws the diagram where the discussion is.
 *
 * Same content: the aggregate is the boundary, the invariants are on the
 * picture, and `contains`, `embeds` and `references` keep UML's three marks.
 * What differs is what the language will take, and there are three of those.
 *
 * ## A namespace has no quoted form
 *
 * Mermaid's boundary is `namespace Name { … }`, and the name is a bare word: a
 * quoted one is a parse error and a spaced one is silently run together —
 * `Risk appetite` becomes `Riskappetite`, which is a name the model does not
 * have. So a multi-word aggregate is joined with underscores in the frame's
 * title, and the classes inside it keep their real names, which the label
 * syntax does allow. Underscores are visibly a substitution; a silent
 * concatenation is a wrong answer that looks like a right one.
 *
 * ## `style` rather than `classDef`
 *
 * The map's flowchart defines three classes and assigns them. A class diagram
 * takes `classDef` too, and this build of Mermaid applies it only if the
 * `cssClass` assignment comes *before* the definition — an ordering nothing
 * documents and nothing should depend on. `style` on each class is one line per
 * box and works whatever Mermaid does next.
 *
 * ## The boundary is coloured through the theme
 *
 * Nothing in Mermaid styles a namespace, so the aggregate frame takes its
 * violet from `themeVariables` in the header directive rather than from a line
 * of its own. That is also why there is exactly one frame colour here where the
 * map has three: the map's frames are subdomains and differ by classification;
 * every frame here is an aggregate and they are all the same kind of thing.
 */

import { aliases, commentText, mermaidLabel } from '../diagram';
import {
	memberLabel,
	multiplicityMark,
	type AggregateNode,
	type DomainModel,
	type Member,
} from './model';

/** `ddm/style.ts` in a file with no stylesheet. See `puml.ts` for the reading. */
const PALETTE = {
	root: 'fill:#ddd6fe,stroke:#7c3aed,color:#2e1065',
	entity: 'fill:#e0f2fe,stroke:#0ea5e9,color:#082f49',
	enum: 'fill:#f1f5f9,stroke:#94a3b8,color:#0f172a',
	value: 'fill:#ffffff,stroke:#94a3b8,color:#0f172a',
};

export function mermaid(model: DomainModel): string {
	const alias = aliases();
	const declared = new Set<string>();
	const styles: string[] = [];
	const notes: string[] = [];
	const taken = new Set<string>();

	// A model with no context named yet. See `ddd/puml.ts`.
	const context = commentText(model.context);

	const out: string[] = [
		context === ''
			? '%% The inside of one bounded context, exported from ba-cm.'
			: `%% ${context} — the inside of one bounded context, exported from ba-cm.`,
		'%% A rendering of the .ddm, which is the source. Regenerate rather than edit.',
		// The aggregate frame's violet. See the note at the top: a namespace is
		// the one thing here that cannot be styled where it is written.
		'%%{init: {"themeVariables": {"clusterBkg": "#f5f3ff", "clusterBorder": "#7c3aed"}}}%%',
		'classDiagram',
		// Left to right: a model is read as a spine of aggregates with their
		// parts hanging off, and Mermaid stacks a class diagram tall by default.
		'\tdirection LR',
	];

	for (const aggregate of model.aggregates) {
		declared.add(aggregate.id);
		out.push(`\tnamespace ${frameName(aggregate, taken)} {`);
		for (const member of model.members.filter((one) => one.aggregate === aggregate.id)) {
			out.push(...declaration(member, member.id === aggregate.root, alias, declared, styles, 2));
		}
		out.push('\t}');
		notes.push(...invariants(aggregate, alias, declared));
	}

	// Values and enumerations shared across boundaries, outside every frame.
	// `puml.ts` says why they are not gathered into one of their own.
	for (const member of model.members.filter((one) => one.aggregate === null)) {
		out.push(...declaration(member, false, alias, declared, styles, 1));
	}

	for (const link of model.links) {
		const from = target(link.from, model, alias, declared);
		const to = target(link.to, model, alias, declared);
		if (from === null || to === null) continue;
		// Composition, aggregation, dependency — the canvas's three marks, which
		// are UML's. `route.ts` chose them; `puml.ts` spells the same three.
		const mark = link.kind === 'contains' ? '*--' : link.kind === 'embeds' ? 'o--' : '..>';
		out.push(`\t${from} ${mark} "${multiplicityMark[link.multiplicity]}" ${to} : ${link.kind}`);
	}

	/*
	 * Nothing to draw.
	 *
	 * Stricter than the map's flowchart, which renders empty: a `classDiagram`
	 * with no body is a parse error, so a model exported before it has anything
	 * in it would produce a file that fails in the reader's page rather than in
	 * this tab. A standalone note is a legal diagram and a true statement.
	 */
	if (model.aggregates.length === 0 && model.members.length === 0) {
		out.push('\tnote "This model has nothing in it yet."');
	}

	out.push(...notes, ...styles);
	return `${out.join('\n')}\n`;
}

/**
 * The name of an aggregate's frame: one bare word, and unique.
 *
 * Two aggregates cannot share a name — the parser says so — but two names can
 * arrive at the same bare word once the punctuation between them is joined up,
 * and two namespaces of one name in Mermaid are one frame holding both. The
 * alias goes on the end of the second, which is ugly and visible, where a
 * silent merge would be neither.
 */
function frameName(aggregate: AggregateNode, taken: Set<string>): string {
	const base = aggregate.name.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
	let name = base === '' ? 'aggregate' : base;
	let next = 2;
	while (taken.has(name)) name = `${base}_${next++}`;
	taken.add(name);
	return name;
}

/** One class, with its stereotype, its identity and its attributes. */
function declaration(
	member: Member,
	root: boolean,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
	styles: string[],
	depth: number,
): readonly string[] {
	declared.add(member.id);
	const pad = '\t'.repeat(depth);
	const id = alias(member.id, 'm');
	styles.push(`\tstyle ${id} ${root ? PALETTE.root : PALETTE[member.kind]}`);

	// `root` before the kind, as next door: which entity the outside may name is
	// the question a reader has about an aggregate they did not write.
	const stereotype = root ? 'root entity' : memberLabel[member.kind].toLowerCase();
	const body: string[] = [`${pad}\t<<${mermaidLabel(stereotype)}>>`];
	if (member.kind === 'entity' && member.identity !== undefined) {
		body.push(`${pad}\t+id : ${mermaidLabel(member.identity)}`);
	}
	if (member.kind === 'enum') {
		for (const literal of member.literals) body.push(`${pad}\t${mermaidLabel(literal)}`);
	}
	for (const attribute of member.attributes) {
		body.push(`${pad}\t+${mermaidLabel(attribute.name)} : ${mermaidLabel(attribute.type)}`);
	}

	return [`${pad}class ${id}["${mermaidLabel(member.name)}"] {`, ...body, `${pad}}`];
}

/**
 * What an aggregate protects, as a note on its root.
 *
 * `puml.ts` argues the placement and the absence. One note per aggregate rather
 * than one per invariant, because Mermaid puts every note in the same band
 * beside the diagram and three of them for one aggregate would read as three
 * unrelated remarks.
 */
function invariants(
	aggregate: AggregateNode,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
): readonly string[] {
	// No root, nothing to hang it on: Mermaid has no note for a namespace, so
	// the aggregate that failed its own check is the one case where the rules
	// stay in the outline alone.
	if (aggregate.root === null || !declared.has(aggregate.root)) return [];

	const anchor = alias(aggregate.root, 'm');
	if (aggregate.invariants.length === 0) {
		return [`\tnote for ${anchor} "Protects no invariant."`];
	}
	const lines = [
		`${mermaidLabel(aggregate.name)} protects`,
		...aggregate.invariants.map((invariant) => `• ${mermaidLabel(invariant)}`),
	];
	return [`\tnote for ${anchor} "${lines.join('<br/>')}"`];
}

/** The alias a link's end refers to. `puml.ts` holds the reasoning. */
function target(
	id: string,
	model: DomainModel,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
): string | null {
	if (!declared.has(id)) return null;
	const aggregate = model.aggregates.find((one) => one.id === id);
	if (aggregate === undefined) return alias(id, 'm');
	// An aggregate is a frame, and a frame is not an end a link may have here —
	// unlike the map, where a subdomain takes the straddle's dotted line. So a
	// reference to an aggregate whose root is missing has nothing to land on.
	return aggregate.root !== null && declared.has(aggregate.root) ? alias(aggregate.root, 'm') : null;
}
