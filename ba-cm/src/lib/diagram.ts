/**
 * What the four diagram exports have in common: names, and the two ways of
 * spelling one.
 *
 * `ddd/puml.ts`, `ddd/mermaid.ts`, `ddm/puml.ts` and `ddm/mermaid.ts` are four
 * renderings of two documents into two languages, and they agree on exactly
 * two things — how a declaration gets an identifier a diagram language will
 * accept, and how a name somebody typed gets into a label without ending it
 * early. Both are small and both are the kind of thing that would be written
 * four slightly different ways, which is the failure this file exists to
 * prevent: three exports that escape a quote and one that does not is a bug
 * discovered by somebody whose context is called `"Policy"`.
 *
 * Everything else about the four is genuinely per-language and per-document,
 * and lives with the renderer. `destinations.ts` is the same seam one level up.
 */

/**
 * Short identifiers — `c1`, `c2`, `m1` — handed out in the order asked for.
 *
 * Not derived from the name, and that is the whole point. A name in either
 * format is a quoted string that may hold spaces, punctuation and non-Latin
 * script; PlantUML and Mermaid both want a bare word for the thing an arrow
 * refers to. Slugifying the name would produce a bare word, and would collide
 * the day a map holds `Risk appetite` and `Risk Appetite` — two names the
 * formats consider different and a slug considers the same, which is an arrow
 * silently drawn to the wrong box.
 *
 * So the alias carries no meaning and the display name goes in the label, where
 * it can be anything. The counter is per prefix so the ids read as what they
 * are — the contexts are `c1…cn` whatever order the domains came in.
 *
 * Deterministic: the same document produces the same file, which is what makes
 * the output diffable rather than merely regenerable.
 */
export function aliases(): (id: string, prefix: string) => string {
	const given = new Map<string, string>();
	const counts = new Map<string, number>();

	return (id, prefix) => {
		const had = given.get(id);
		if (had !== undefined) return had;
		const next = (counts.get(prefix) ?? 0) + 1;
		counts.set(prefix, next);
		const made = `${prefix}${next}`;
		given.set(id, made);
		return made;
	};
}

/**
 * What a thing with no name yet is drawn as.
 *
 * A document being typed holds `domain ""` for as long as it takes to type the
 * name, and both exports run on whatever is in the pane. Mermaid refuses an
 * empty bracketed label outright — a `.mmd` written from that document would
 * fail in the reader's page rather than in this tab — and PlantUML draws a box
 * with nothing in it, which reads as a rendering fault rather than as a name
 * nobody has chosen.
 *
 * A dash is neither: it is visibly a blank waiting to be filled in, and it is
 * the same blank in both languages.
 */
const UNNAMED = '—';

/**
 * A name, in a quoted PlantUML label.
 *
 * PlantUML has no escape for a `"` inside a quoted string: `\"` is passed
 * through and printed with its backslash, and `&quot;` is printed as those six
 * characters. Both were tried. What is left is substitution, so a double quote
 * becomes a typographic closing one — which is what the name means and, in a
 * label, what it should have looked like anyway.
 *
 * Newlines go too. A name cannot hold one, but `intent` can, and a label that
 * ran past a line break would end its own quoted string in the middle of a
 * sentence. Collapsing runs of whitespace is what a single-line label wants
 * regardless.
 *
 * The `<` is the one that actually bites. PlantUML reads `<…>` in a label as
 * markup and drops what it does not recognise, so an attribute typed
 * `List<String>` arrives as `List` — a wrong answer that looks like a right
 * one. A `~` in front is creole's escape and prints the bracket. Nothing else
 * in creole is escaped, on `outline.ts`'s reasoning: only the characters a name
 * or a type realistically contains, or the file fills with backslashes nobody
 * wants to read in the raw.
 */
export function pumlLabel(text: string): string {
	return text.replace(/\s+/g, ' ').replace(/"/g, '”').replace(/</g, '~<').trim() || UNNAMED;
}

/**
 * A name, in a quoted Mermaid label.
 *
 * Mermaid does have an escape — `#quot;` and friends, its own entity syntax —
 * so nothing is substituted here. The `#` has to go first, or escaping a quote
 * would leave a `#` that the next reader's Mermaid reads as the start of an
 * entity of its own.
 *
 * The angle brackets go for the reason they go next door, and here it is worse:
 * Mermaid draws labels as HTML, so `List<String>` loses `<String>` to a tag the
 * browser opens and never closes. Both ends are escaped, unlike PlantUML, where
 * a lone `>` is already literal.
 *
 * Whitespace collapses for the same reason as next door.
 */
export function mermaidLabel(text: string): string {
	return (
		text
			.replace(/\s+/g, ' ')
			.replace(/#/g, '#35;')
			.replace(/</g, '#lt;')
			.replace(/>/g, '#gt;')
			.replace(/"/g, '#quot;')
			.trim() || UNNAMED
	);
}

/**
 * A name in a comment line, in either language.
 *
 * Only the line break matters: a comment is `'` to the end of the line in
 * PlantUML and `%%` to the end of the line in Mermaid, so a title holding a
 * newline would put its second half into the diagram as syntax.
 */
export function commentText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
