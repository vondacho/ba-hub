/**
 * The model as PlantUML: the class diagram, with the invariants still on it.
 *
 * `ddd/puml.ts` one zoom level down, and the argument for exporting a diagram
 * as text is the same one: a `.puml` committed beside the code renders in CI,
 * in a wiki and in an IDE, and its diff is the three lines that changed rather
 * than a new binary. The arrangement does not travel — see there — and this is
 * an export and never an input, which `ddm/model.ts` has said since before
 * there was one: a round trip through a rendering language would lose the
 * invariants, the by-identity rule and the difference between an entity and a
 * value object, which is everything the format is for.
 *
 * ## The invariants are on the picture, and that is the point of this file
 *
 * `outline.ts` puts it plainly: an aggregate exists to keep something true
 * across a transaction, and a class diagram is exactly where that sentence goes
 * to be left out. So each aggregate's invariants are a note on its root, in
 * full, unabridged. Everything else here is a shape UML already had; this is
 * the part that makes the file worth generating rather than drawing by hand.
 *
 * ## The three links are the canvas's marks, because UML decided them first
 *
 * `route.ts` chose a filled diamond for `contains`, an open one for `embeds`
 * and a dashed open arrow for `references`, which is what UML means by
 * composition, aggregation and dependency. PlantUML spells those `*--`, `o--`
 * and `..>`, so the exported diagram is the canvas's notation rather than a
 * second one — and the label beside each keeps the format's own word, since the
 * difference between the three is the whole argument of the format and a
 * reader should not have to remember which diamond is filled.
 *
 * ## Multiplicity comes back as marks
 *
 * `one`, `optional`, `many` and `at-least-one` are words in the `.ddm` because
 * a format whose every other token is an English word reads worse for a line of
 * punctuation. A diagram is the other case: `0..1` beside `*` is read at a
 * glance. `multiplicityMark` in the model has held the translation from the
 * beginning, waiting for this.
 *
 * ## Nothing is dated
 *
 * As everywhere else in this tool's exports.
 */

import { aliases, commentText, pumlLabel } from '../diagram';
import {
	memberLabel,
	multiplicityMark,
	type AggregateNode,
	type DomainModel,
	type Member,
} from './model';

/**
 * The canvas's colours, in hex, for the light theme.
 *
 * `ddm/style.ts` in a file with no stylesheet — see the same note in
 * `ddd/puml.ts`. A root is violet, an entity sky, an enumeration slate and a
 * value object white, which is `paint`'s reading exactly: the fourth thing in a
 * palette built for three takes the step below the greys rather than borrowing
 * a hue that would say it carries weight.
 */
const PALETTE = {
	root: { line: '7c3aed', back: 'ddd6fe' },
	entity: { line: '0ea5e9', back: 'e0f2fe' },
	enum: { line: '94a3b8', back: 'f1f5f9' },
	value: { line: '94a3b8', back: 'ffffff' },
	/** The boundary itself: violet, dashed, and paler than anything inside it. */
	aggregate: { line: '7c3aed', back: 'f5f3ff' },
};

export function plantuml(model: DomainModel): string {
	const alias = aliases();
	const declared = new Set<string>();

	// A model with no context named yet. `ddd/puml.ts` says why the `title` line
	// goes rather than being written empty.
	const context = commentText(model.context);

	const out: string[] = [
		'@startuml',
		context === ''
			? "' The inside of one bounded context, exported from ba-cm."
			: `' ${context} — the inside of one bounded context, exported from ba-cm.`,
		"' A rendering of the .ddm, which is the source. Regenerate rather than edit.",
		'',
		'skinparam packageStyle rectangle',
		'skinparam shadowing false',
		'skinparam ArrowColor #64748b',
		'skinparam ArrowFontColor #334155',
		// Invariants are sentences, and a note is as wide as its longest line
		// unless something says otherwise. Without this one aggregate's rule
		// sets the width of the whole diagram.
		'skinparam wrapWidth 260',
		// A value object with no attributes is a box with an empty compartment
		// under its name, which reads as something missing rather than as
		// something that has nothing.
		'hide empty members',
		'',
		...(context === '' ? [] : [`title ${pumlLabel(model.context)}`, '']),
	];

	for (const aggregate of model.aggregates) {
		declared.add(aggregate.id);
		out.push(
			`package "${pumlLabel(aggregate.name)}" as ${alias(aggregate.id, 'a')} <<aggregate>> #line.dashed:${PALETTE.aggregate.line};back:${PALETTE.aggregate.back} {`,
		);
		for (const member of model.members.filter((one) => one.aggregate === aggregate.id)) {
			out.push(...declaration(member, member.id === aggregate.root, alias, declared, 1));
		}
		out.push('}');
		out.push(...invariants(aggregate, alias, declared));
		out.push('');
	}

	/*
	 * The members that belong to no aggregate.
	 *
	 * Values and enumerations shared across boundaries. Drawn outside every
	 * package rather than gathered into one called "Shared", because a package
	 * here is a consistency boundary and inventing one would say these are
	 * inside something. They are not: that is what makes them shareable.
	 */
	const shared = model.members.filter((member) => member.aggregate === null);
	if (shared.length > 0) {
		for (const member of shared) out.push(...declaration(member, false, alias, declared, 0));
		out.push('');
	}

	for (const link of model.links) {
		const from = target(link.from, model, alias, declared);
		const to = target(link.to, model, alias, declared);
		if (from === null || to === null) continue;
		// `*--` composition, `o--` aggregation, `..>` dependency: the canvas's
		// three marks, which are UML's. See the note at the top.
		const mark = link.kind === 'contains' ? '*--' : link.kind === 'embeds' ? 'o--' : '..>';
		out.push(`${from} ${mark} "${multiplicityMark[link.multiplicity]}" ${to} : ${link.kind}`);
	}

	// Nothing to draw. `ddd/puml.ts` says why the emptiness is drawn rather than
	// left as an empty diagram PlantUML will not open.
	if (model.aggregates.length === 0 && model.members.length === 0) {
		out.push('note as empty', '\tThis model has nothing in it yet.', 'end note');
	}

	out.push('', '@enduml', '');
	return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** One class, entity or enumeration, with its attributes in the compartment. */
function declaration(
	member: Member,
	root: boolean,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
	depth: number,
): readonly string[] {
	declared.add(member.id);
	const pad = '\t'.repeat(depth);
	const id = alias(member.id, 'm');
	const paint = root ? PALETTE.root : PALETTE[member.kind];
	// `root` before the kind, because on this diagram it is the more useful of
	// the two: which entity the outside is allowed to name is the question a
	// reader has about an aggregate they did not write.
	const stereotype = root ? 'root entity' : memberLabel[member.kind].toLowerCase();
	// `enum` rather than `class` for an enumeration: PlantUML draws it with its
	// own header, and the literals belong in the body rather than in a label.
	const keyword = member.kind === 'enum' ? 'enum' : 'class';

	const body: string[] = [];
	if (member.kind === 'entity' && member.identity !== undefined) {
		// The identity first and named `id`, as the `.ddm` writes it. It is what
		// another aggregate holds when it references this one, so it is the line
		// that has to be visible without reading the rest of the compartment.
		body.push(`${pad}\t{field} id : ${pumlLabel(member.identity)}`);
	}
	if (member.kind === 'enum') {
		for (const literal of member.literals) body.push(`${pad}\t${pumlLabel(literal)}`);
	}
	for (const attribute of member.attributes) {
		// `{field}` said out loud: a type holding brackets would otherwise be
		// read as a method signature and drawn in the wrong compartment.
		body.push(`${pad}\t{field} ${pumlLabel(attribute.name)} : ${pumlLabel(attribute.type)}`);
	}

	const head = `${pad}${keyword} "${pumlLabel(member.name)}" as ${id} <<${stereotype}>> #line:${paint.line};back:${paint.back}`;
	if (body.length === 0) return [head];
	return [`${head} {`, ...body, `${pad}}`];
}

/**
 * What an aggregate protects, as a note on the way in.
 *
 * On the root, because the root is the aggregate as far as the outside is
 * concerned, and a note floating beside a package is a note about a rectangle.
 * An aggregate with no root is a document that failed its own check — the
 * parser says so — and its rules still get written, attached to the boundary
 * itself, rather than being the one thing an invalid document silently drops.
 *
 * The absence is said out loud too. A section that is simply not there reads as
 * an export that lost something, which is `outline.ts`'s argument for printing
 * the same sentence.
 */
function invariants(
	aggregate: AggregateNode,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
): readonly string[] {
	const anchor =
		aggregate.root !== null && declared.has(aggregate.root)
			? alias(aggregate.root, 'm')
			: alias(aggregate.id, 'a');

	if (aggregate.invariants.length === 0) {
		return [`note top of ${anchor}`, '\t//Protects no invariant.//', 'end note'];
	}
	return [
		`note top of ${anchor}`,
		`\t**${pumlLabel(aggregate.name)} protects**`,
		// Creole bullets. The text is not escaped past its line breaks: a note
		// is not a quoted string, so the only character that could end it early
		// is a newline of its own.
		...aggregate.invariants.map((invariant) => `\t* ${pumlLabel(invariant)}`),
		'end note',
	];
}

/**
 * The alias a link's end refers to.
 *
 * `references` names an aggregate — that is the rule the parser enforces, and
 * the reason an aggregate is a consistency boundary rather than a diagram — so
 * the end resolves to the aggregate's root, which is what you actually hold the
 * identity of. When the aggregate has no root there is nothing to point at but
 * the boundary, and the package takes the arrow instead.
 *
 * Null for a name this file never wrote out. Both diagram languages invent an
 * element for an alias they have not seen, so an arrow to a member that the
 * document no longer holds would draw a bare box with `m7` in it.
 */
function target(
	id: string,
	model: DomainModel,
	alias: (id: string, prefix: string) => string,
	declared: Set<string>,
): string | null {
	if (declared.has(id)) {
		const aggregate = model.aggregates.find((one) => one.id === id);
		if (aggregate === undefined) return alias(id, 'm');
		return aggregate.root !== null && declared.has(aggregate.root)
			? alias(aggregate.root, 'm')
			: alias(aggregate.id, 'a');
	}
	return null;
}
