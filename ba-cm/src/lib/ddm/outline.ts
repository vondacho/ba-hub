/**
 * The model as prose: one Markdown document.
 *
 * `ddd/outline.ts` one zoom level down, and for the same reasons — a wiki page,
 * a pull request, the body of a ticket, the places where a `.svg` is an
 * attachment nobody opens and an image is not searchable. What a screen reader,
 * a `grep` and a diff can read.
 *
 * The stakes are if anything higher here. A map's two valuable fields are
 * `because` and `intent`; a model's is `invariant`, which is the one line in
 * the file that says why the boundary is where it is — and a class diagram is
 * exactly where that sentence goes to be left out.
 *
 * ## It leads with what the model is telling you
 *
 * The doctrine names four things to look at, and three of them are countable:
 * aggregates protecting nothing, entities with no identity, and boundaries big
 * enough to be a contention problem. Stated as findings and never as verdicts,
 * each naming what it saw so a reader can disagree with it — the map's outline
 * carries the argument in full.
 *
 * ## Then each aggregate, then what crosses between them
 *
 * An aggregate, its invariants, its root and the members inside it, in the
 * document's own order. `references` are held back to a section at the end, for
 * the reason the map holds its relationships back: a link belongs to two
 * boundaries, and the crossings together are what somebody argues about.
 * `contains` and `embeds` stay with the aggregate they are inside, because
 * those do not cross anything — which is the whole distinction the format
 * exists to draw.
 *
 * ## Nothing is dated
 *
 * As next door: an outline is the export most likely to be committed beside the
 * code it describes, and a timestamp makes every regeneration a diff nobody can
 * act on.
 */

import {
	linkLabel,
	memberLabel,
	multiplicityMark,
	type DomainModel,
	type Link,
	type Member,
} from './model';

/** Big enough to be worth a second look. See `findings`. */
const CROWDED = 7;

export function outline(document: DomainModel): string {
	const out: string[] = [`# ${escape(document.context)}`, ''];
	out.push(
		'*The inside of one bounded context.*',
		'',
		...findings(document),
		...aggregates(document),
		...loose(document),
		...crossings(document),
	);
	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * The countable half of the doctrine.
 *
 * Nothing here is a score. An aggregate with no invariant may be a boundary
 * somebody has not finished thinking about, and a model with none of these
 * findings can still be a drawing of the database, which is the failure no
 * count can see.
 *
 * The size threshold is a prompt rather than a limit, and it is deliberately
 * not tunable: the doctrine's claim is that a large aggregate is a contention
 * problem before it is a design problem, and a number somebody can raise until
 * the warning stops is a number that will be raised until the warning stops.
 */
function findings(document: DomainModel): readonly string[] {
	const found: string[] = [];

	const unprotected = document.aggregates.filter((one) => one.invariants.length === 0);
	if (unprotected.length > 0) {
		found.push(
			`- **${unprotected.length} ${unprotected.length === 1 ? 'aggregate protects' : 'aggregates protect'} no invariant** — ${list(unprotected.map((one) => one.name))}. An aggregate exists to keep something true across a transaction; one with nothing to protect is a table with extra ceremony, and its parts probably belong to their own boundaries.`,
		);
	}

	const anonymous = document.members.filter(
		(member) => member.kind === 'entity' && member.identity === undefined,
	);
	if (anonymous.length > 0) {
		found.push(
			`- **${anonymous.length} ${anonymous.length === 1 ? 'entity has' : 'entities have'} no \`id\`** — ${list(anonymous.map((member) => member.name))}. Identity is the whole difference between an entity and a value object, and what another aggregate holds when it references this one.`,
		);
	}

	const crowded = document.aggregates.filter((one) => one.members.length > CROWDED);
	if (crowded.length > 0) {
		found.push(
			`- **${crowded.length} ${crowded.length === 1 ? 'aggregate holds' : 'aggregates hold'} more than ${CROWDED} members** — ${list(crowded.map((one) => `${one.name} (${one.members.length})`))}. Everything inside a boundary is loaded and saved together, so a large aggregate is a contention problem before it is a design problem.`,
		);
	}

	if (found.length === 0) return [];
	return ['## What this model is telling you', '', ...found, '', ''];
}

/** Each aggregate, its rationale, and what sits inside it. */
function aggregates(document: DomainModel): readonly string[] {
	const out: string[] = [];

	for (const aggregate of document.aggregates) {
		out.push(`## ${escape(aggregate.name)}`, '');
		if (aggregate.intent !== undefined) out.push(escape(aggregate.intent), '');

		/*
		 * The invariants first, ahead of the members, and printed in full.
		 *
		 * They are the reason the boundary is drawn where it is, so a reader who
		 * stops after the first section has read the part that decides whether
		 * the rest is right. Their absence is said out loud rather than left as
		 * a missing heading — a section that is simply not there reads as an
		 * export that dropped something.
		 */
		if (aggregate.invariants.length === 0) {
			out.push('*Protects no invariant — either the rule is missing or the boundary is.*', '');
		} else {
			out.push('**Protects:**', '');
			for (const invariant of aggregate.invariants) out.push(`- ${escape(invariant)}`);
			out.push('');
		}

		const inside = document.members.filter((member) => member.aggregate === aggregate.id);
		for (const member of inside) {
			out.push(...memberSection(member, member.id === aggregate.root, document.links, document, 3));
		}
		if (inside.length === 0) out.push('*Nothing inside this aggregate yet.*', '');
	}

	return out;
}

/**
 * The members that belong to no aggregate.
 *
 * Values and enumerations shared across boundaries, which is a legitimate thing
 * for a value to be — it has no identity, so it is copied rather than shared,
 * and two of them with the same fields are the same value. A section of their
 * own rather than an appendix to the last aggregate, which is where they would
 * otherwise look like they belonged.
 */
function loose(document: DomainModel): readonly string[] {
	const shared = document.members.filter((member) => member.aggregate === null);
	if (shared.length === 0) return [];

	const out = ['## Shared across aggregates', ''];
	for (const member of shared) out.push(...memberSection(member, false, document.links, document, 3));
	return out;
}

function memberSection(
	member: Member,
	root: boolean,
	links: readonly Link[],
	document: DomainModel,
	depth: number,
): readonly string[] {
	const out: string[] = [`${'#'.repeat(depth)} ${escape(member.name)}`, ''];

	// The root is named on the member rather than only on its aggregate: this is
	// the section somebody is reading when they need to know which one it is.
	const badges = [`\`${memberLabel[member.kind].toLowerCase()}\``];
	if (root) badges.push('**root**');
	if (member.kind === 'entity' && member.identity !== undefined) {
		badges.push(`id \`${escape(member.identity)}\``);
	}
	out.push(badges.join(' · '), '');

	if (member.kind === 'enum') {
		out.push(
			member.literals.length === 0
				? '*No values listed.*'
				: member.literals.map((value) => `\`${escape(value)}\``).join(', '),
			'',
		);
	}

	if (member.attributes.length > 0) {
		// A table rather than a list: two columns of short strings is what a
		// table is for, and it is the shape anybody scanning for a field expects.
		out.push('| Attribute | Type |', '| --- | --- |');
		for (const attribute of member.attributes) {
			out.push(`| ${escape(attribute.name)} | \`${escape(attribute.type)}\` |`);
		}
		out.push('');
	}

	/*
	 * What this one holds, inside the boundary. `references` are not here —
	 * see the note at the top — and the multiplicity is printed in UML's marks
	 * rather than the format's words, because a table of `0..1` beside `*` is
	 * read at a glance and "optional" beside "many" is read a word at a time.
	 */
	const held = links.filter((link) => link.from === member.id && link.kind !== 'references');
	if (held.length > 0) {
		for (const link of held) {
			out.push(
				`- ${linkLabel[link.kind]} ${escape(nameOf(document, link.to))} \`${multiplicityMark[link.multiplicity]}\``,
			);
		}
		out.push('');
	}

	return out;
}

/**
 * The `references`, in one section, each named at both ends.
 *
 * These are the crossings — by identity, never by holding the thing itself —
 * and they are what makes an aggregate a consistency boundary rather than a
 * diagram. Printed together because a crossing belongs to two boundaries and
 * putting it under one of them is an arbitrary choice a reader has to undo.
 */
function crossings(document: DomainModel): readonly string[] {
	const crossing = document.links.filter((link) => link.kind === 'references');
	if (crossing.length === 0) return [];

	const out = ['## What crosses a boundary', ''];
	out.push(
		'Held by identity. Each of these is a place where two aggregates are consistent eventually rather than at once — which is the normal case, not a compromise.',
		'',
	);
	for (const link of crossing) {
		out.push(
			`- **${escape(nameOf(document, link.from))}** references **${escape(nameOf(document, link.to))}** \`${multiplicityMark[link.multiplicity]}\``,
		);
	}
	out.push('');
	return out;
}

/** A declaration's name, or its id when the document no longer holds it. */
function nameOf(document: DomainModel, id: string): string {
	const member = document.members.find((candidate) => candidate.id === id);
	if (member) return member.name;
	return document.aggregates.find((candidate) => candidate.id === id)?.name ?? id;
}

/** `a`, `a and b`, `a, b and c` — a list a person reads. */
function list(names: readonly string[]): string {
	const escaped = names.map(escape);
	if (escaped.length <= 1) return escaped[0] ?? '';
	return `${escaped.slice(0, -1).join(', ')} and ${escaped[escaped.length - 1]}`;
}

/**
 * Escape the characters that would make free text into markup.
 *
 * `ddd/outline.ts`'s, and deliberately the same set: only the ones that bite
 * inline, and only where an invariant realistically contains them. A general
 * escaper would backslash every `.` and `-` and turn a sentence somebody wrote
 * into something nobody wants to read in the raw.
 *
 * The pipe is this file's own addition, because this one has tables in it and a
 * `|` in an attribute's type would end the cell early.
 */
function escape(text: string): string {
	return text.replace(/([*_`[\]<|])/g, '\\$1');
}
