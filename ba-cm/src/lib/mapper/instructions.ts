/**
 * The notations and the doctrine, written out for a session that is not here.
 *
 * Two Markdown files, and neither is about any particular map. Everything else
 * the export dialog offers is this map or a picture of it; these two are the
 * *reference* — what a `.ddd` and a `.ddm` are, and what a good context map and
 * a good domain model do — addressed to a model that has never seen ba-cm.
 *
 * ## Why the tool ships its own instructions
 *
 * Because the alternative is what people do instead, which is paste half of a
 * remembered grammar into a prompt. A context map goes into version control
 * next to the code it describes; the work of changing one therefore happens
 * wherever that repository is checked out, which is very often a terminal with
 * an agent in it and no ba-cm anywhere near. That session has to know the
 * notation exactly — an arrow on a `partnership`, or a `references` pointing
 * inside another aggregate, produces a file that will not open — and it has to
 * know the doctrine, or it will relabel every `conformist` as
 * `customer-supplier` and hand back a map of what everybody wishes were true.
 *
 * ## Both languages, in one pair of files
 *
 * ba-cm reads two: `.ddd` for the map and `.ddm` for the inside of one bounded
 * context. They are separate documents with different lifetimes, and they leave
 * this tab in *one archive* — see bundle.ts — because they are one body of
 * work. An agent handed that archive and only half the notation is an agent
 * that will guess at the other half, so the reference covers both.
 *
 * That is also why the files are named for the tool rather than for a format.
 * `ddd-notation.md` would be a filename making a claim about half its contents.
 *
 * ## Nothing here is written twice
 *
 * The body of both documents is `DDD_GRAMMAR`, `DDM_GRAMMAR`, `DDD_EBNF`,
 * `DDM_EBNF`, `DDD_DOCTRINE`, `DDM_DOCTRINE` and `EDITING` from
 * src/lib/agent/guide.ts, verbatim. This module contributes the framing — who
 * the reader is, what they are being asked to do, what the sidecars are, where
 * to read more, and where the file came from — and not one sentence of the
 * content.
 *
 * ## No date, no map, no version
 *
 * These files are constant: the same map, a different map or no map at all
 * produces the same bytes. So they are named for what they are rather than for
 * the map that happened to be open — see `stem` in the export catalogue — and
 * they carry no timestamp, so a repository holding one shows a diff only when
 * the notation itself has moved.
 */

import {
	DDD_DOCTRINE,
	DDD_EBNF,
	DDD_GRAMMAR,
	DDM_DOCTRINE,
	DDM_EBNF,
	DDM_GRAMMAR,
	EDITING,
} from '../agent/guide';

/**
 * What the two files are called, defined here rather than in the catalogue.
 *
 * Because each document names the other. "See the doctrine document beside this
 * one" is a useless sentence in a downloads folder — the reader has to guess
 * which file that is — and a filename written out by hand in the prose would be
 * a second copy of a string the export catalogue also holds. One constant, used
 * by the document that mentions it and by the destination that writes it, so
 * the cross-reference cannot come out pointing at nothing.
 */
export const NOTATION_STEM = 'ba-cm-notation';
export const DOCTRINE_STEM = 'ba-cm-doctrine';

/**
 * Where a file says what it is and how it can be wrong.
 *
 * Every instruction document an agent is handed should answer "who wrote this
 * and can I trust it", because the failure mode of a stale one is silent: it
 * reads exactly as authoritative as a current one. Saying plainly that the file
 * does not update itself is the part people forget to write.
 */
function provenance(extra: string | null): string {
	return `---

*Exported from ba-cm, the context mapper these come from. It is a snapshot of
what that tool's own assistant is told, it does not update itself, and nothing
in it was generated from the map that happened to be
open.${extra === null ? '' : ` ${extra}`}*`;
}

/**
 * The notations, as instructions.
 *
 * The editing rules are here rather than in the doctrine, because they are
 * about the *files*: whose they are, what may be reformatted, and the two
 * things — the `because` line and the coordinates — that a well-meaning edit
 * destroys most easily. Somebody handed only this document is the person about
 * to change a map.
 */
export function notationDocument(): string {
	return `${[
		'# Working with `.ddd` and `.ddm` files',
		`You are being asked to read, write or change a domain-driven design model
kept as text. There are two notations and this document is the whole of both:

- **\`.ddd\`, a context map** — the shape of a business. Its domains, the
  subdomains they divide into, the bounded contexts that serve them, and the
  strategic relationships between those contexts.
- **\`.ddm\`, a domain model** — the inside of exactly one bounded context. Its
  aggregates, the entities and value objects in them, and the links between.

One map covers many contexts; one model is one context. They are separate files
with different lifetimes, and they travel together as one archive. Follow both
grammars exactly: a file that does not parse cannot be opened by the tools these
are kept for.`,
		DDD_GRAMMAR,
		/*
		 * Prose first, production set second, and never the other way round.
		 *
		 * Somebody who reads the formal grammar first learns what a file may
		 * contain and nothing about what any of it means — `Pattern` is nine
		 * alternatives in a list, and which one an arrow should carry is the
		 * entire practice.
		 */
		DDD_EBNF,
		DDM_GRAMMAR,
		DDM_EBNF,
		`## The sidecars: \`.dddview\` and \`.ddmview\`

An archive from ba-cm holds up to four kinds of file:

    insurance/
      insurance.ddd
      insurance.dddview
      risk-appetite/
        risk-appetite.ddm
        risk-appetite.ddmview

The \`*view\` files are **JSON**, not a notation, and they hold one thing:
where somebody dragged the boxes, plus how far each edge was bent. They exist
because "never in the document" and "never anywhere" are different rules, and
only the first was ever the point — coordinates in a \`.ddd\` would fill every
diff with position churn and hide the one line where a pattern changed.

Three consequences, and they are the whole of what you need to know:

- **Do not write coordinates into a \`.ddd\` or a \`.ddm\`.** There is no syntax
  for them and there is not going to be.
- **Do not hand-edit a sidecar** unless that is specifically what was asked. It
  is generated, and it is keyed by node name — renaming a context in the
  document orphans its position, which is harmless and self-correcting.
- **Losing a sidecar costs nothing.** The map redraws from a computed layout.
  That asymmetry is what makes it safe to have at all, and it is why an archive
  missing one is not a broken archive.`,
		`## Changing somebody's map

A context map is a description a room argued its way to, and you are editing it
in their absence. Every rule below follows from that.

${EDITING}

Read \`${DOCTRINE_STEM}.md\` before adding or relabelling anything. These
notations will happily let you write a map that parses perfectly and flatters
everybody.`,
		provenance(
			'The grammars themselves are defined by `src/lib/ddd/` and `src/lib/ddm/` in ba-cm: where a document and these rules disagree, the parser is right and this file is old.',
		),
	].join('\n\n')}\n`;
}

/**
 * The doctrine, as instructions.
 *
 * The framing and the "what not to do" section are not in the prompt this
 * borrows from, and that asymmetry is deliberate rather than an omission. The
 * assistant in the panel is always looking at a document that already exists
 * and is corrected by a person reading its answer in a narrow column; a session
 * reading this file may be asked to draft a first map from a transcript, or to
 * carry one into code, and neither is safe without knowing which of these
 * fields is a political record rather than a label.
 */
export function doctrineDocument(): string {
	return `${[
		'# Reading a context map and a domain model',
		`Both notations serve **domain-driven design**, described in Eric Evans's
*Domain-Driven Design* (2003) and in Vaughn Vernon's *Implementing
Domain-Driven Design* (2013). The vocabulary is Evans's and using it exactly is
worth more than it looks: \`customer-supplier\` and \`conformist\` describe the
same arrow and differ only in whether the downstream team has any negotiating
power, which is a political fact that a generic "depends on" hides.

A context map is the **strategic** half — where the boundaries are, and what
runs between them. A domain model is the **tactical** half — what is inside one
boundary and what keeps it true. They are read by different people at different
moments, which is why they are two files.

You are almost certainly talking to somebody who works in this business and
knows it far better than you do. **Assume the facts on the map are true.** What
you have to offer is the reading: whether the boundaries are where the language
changes, whether the patterns are honest about power, and whether each aggregate
has something to protect.`,
		DDD_DOCTRINE,
		DDM_DOCTRINE,
		`## What not to do

**Do not upgrade a \`conformist\`.** It is an admission about power, not a
design failure to be fixed by relabelling. A map where every arrow says
\`customer-supplier\` is a map of what everybody wishes were true, and it tells
a reader nothing. If the evidence points at \`conformist\`, say so.

**Do not soften a \`because\`.** *"The vendor will not change for us"* is the
most valuable line in a context map precisely because it is the one nobody
enjoys writing. Rephrasing it into something diplomatic destroys the record, and
the record is why the file is in version control.

**Do not add \`core\` subdomains.** The classification is a budget: \`core\` gets
the deep model and the best people, \`generic\` gets bought. Marking a fourth
thing core does not fund it — it defunds the other three.

**Do not invent boundaries to tidy the picture.** A bounded context is where one
model's language stops and the next begins. If you cannot name a term that means
something different on the two sides, there is no boundary there, however much
neater the diagram would look.

**Do not draw an aggregate around things that merely belong together.** An
aggregate exists to keep something true across a transaction. If you cannot
write its \`invariant\`, either the rule is missing or the boundary is — and the
tool will tell you so, because an aggregate with no invariant is a warning it
raises by itself.`,
		`## Where this is described properly

- **Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of
  Software*** (Addison-Wesley, 2003) — the source. Part IV is where the
  strategic patterns and the context map come from; the names in the \`.ddd\`
  notation are his.
- **[The Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)**
  — Evans's own free summary of every definition and pattern in the book, plus
  three that came later. Creative Commons licensed, and the fastest way to
  settle an argument about what one of the patterns means. Direct PDF:
  <https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf>
- **Vaughn Vernon, *Implementing Domain-Driven Design*** (Addison-Wesley, 2013)
  — the tactical half in practice: aggregate design rules, and why a large
  aggregate is a contention problem before it is a design problem.

Neither this document nor the notation beside it is a facilitation guide — they
are what a model needs in order to be useful to somebody who already knows the
business.`,
		provenance(`The two notations are written up in \`${NOTATION_STEM}.md\`.`),
	].join('\n\n')}\n`;
}
