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
model "${context}" {

}
`;
}
