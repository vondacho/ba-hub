/**
 * A new model, for a context that has one on the map and none of its own yet.
 *
 * The map already knows two things about the inside of a bounded context: what
 * it is called, and — from its `aggregate` line — what its consistency
 * boundaries are named. Carrying those across is the whole point of the link
 * between the two pages: the name is the identity in both formats, so a model
 * that starts with the map's name is a model that can be checked against it
 * from its first keystroke.
 *
 * What it deliberately does **not** do is write the aggregates as declarations.
 * An `aggregate` block with no root entity is not a rough draft of a model, it
 * is a model that fails its own check, and opening a new document onto a
 * problems panel full of errors teaches the notation exactly the wrong thing.
 * So the names arrive as a comment: everything the map knows, nothing the
 * parser has to complain about.
 */
export function seedModel(context: string, aggregates: readonly string[]): string {
	const one = aggregates.length === 1;
	const known =
		aggregates.length > 0
			? `//
// The map says this context has ${one ? 'one aggregate' : `${aggregates.length} aggregates`}: ${aggregates.join(', ')}.
// ${one ? 'It becomes' : 'Each becomes'} an \`aggregate\` block below, with a root entity and
// the invariant it exists to protect.
`
			: '';

	return `// The inside of "${context}", opened from the map.
${known}
context "${context}" {

}
`;
}

/**
 * A fresh model: the smallest thing that is already a model.
 *
 * One aggregate with its root, for `freshMap`'s reason — a board you have just
 * asked for should have something on it — and because the root is the part of
 * the format that has to be there. An aggregate without one is not a rough
 * draft; it is a model that fails its own check, and starting somebody on an
 * error is a poor way to teach a notation.
 *
 * What it does *not* invent is an invariant. That is the one thing nobody else
 * can write for you, and the empty warning that follows says so better than a
 * placeholder would.
 */
export function freshModel(context = 'New context'): string {
	return `// The inside of one bounded context.
//
// Rename the aggregate, say what it keeps true, and give it the entities and
// values it owns. The panel below says what is still missing.

context "${context}" {

  aggregate "New aggregate" {

    root entity "New aggregate" {
      id "NewAggregateId"
    }
  }
}
`;
}
