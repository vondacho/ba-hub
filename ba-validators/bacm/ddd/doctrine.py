"""
Reading a context map - the doctrine, as findings.

Domain-driven design is Eric Evans's; the strategic patterns and the context
map are Part IV of *Domain-Driven Design* (2003). Everything in this module
comes from `ba-cm-doctrine.md` and from `ba-cm/src/lib/ddd/outline.ts`, whose
own docstring sets the rule the whole module obeys:

    Stated as findings, never as verdicts. Each one names what it saw so a
    reader can disagree with it - a document that said "this map is wrong"
    would be another opinion rather than the map's own account of itself.

So nothing here is an error and nothing here is a warning. They are
**readings**, at the third severity, because the doctrine's own claim is that
a map with three `core` subdomains may be right and a map with none of these
findings may still be a map of what everybody wishes were true - which is the
failure no count can see.

## Why this is not the parser's job

ba-cm splits the same way. `parser.ts` warns per node - this boundary has no
owner, this relationship has no `because` - because that is what you want while
typing, attached to the line. `outline.ts` counts - *four of six relationships
have no `because`* - because that is what you want when reading the map as a
document, and it is a different sentence. Both are here, at different
severities, and the aggregate reading names the nodes so it is not merely the
warnings again with a total.

## What is deliberately not checked

The doctrine's "what not to do" section is addressed to somebody editing a map,
and it is honoured by omission rather than by a check. No reading here:

  - upgrades a `conformist`, or suggests a pattern is the wrong one;
  - softens or rewrites a `because`;
  - proposes a new `core` subdomain, or any new boundary;
  - invents an `intent`, an `owner` or a `language` term.

The one reading that comes near the first of those is `ddd-reads-as-aspiration`,
and it is careful: it says the map contains no admission of powerlessness
anywhere, and asks. It never says which arrow is wrong.
"""

from __future__ import annotations

from ..problems import Problem, reading_at
from ..prose import adds_nothing_to, count, listed, verb
from .model import ContextMap, ContextNode, pattern_label

#: More `core` subdomains than this and the classification has stopped being a
#: budget. `outline.ts`'s own threshold.
TOO_MUCH_CORE = 2

#: A context listing more terms than this has recorded a data dictionary rather
#: than a language. From `model.ts`: "a context listing forty generic nouns has
#: recorded a data dictionary and learned nothing."
DICTIONARY = 15

#: Relationships needed before "every arrow is aspirational" is a fair question
#: to ask. Two arrows both labelled `customer-supplier` is a small map, not a
#: pattern of flattery.
ENOUGH_EDGES = 3

#: The patterns that admit something uncomfortable. A map with none of them is
#: the one the doctrine warns about.
ADMISSIONS = frozenset(
    {"conformist", "anticorruption-layer", "separate-ways", "big-ball-of-mud"}
)


def read(document: ContextMap) -> list[Problem]:
    """Every doctrine reading of this map."""
    findings: list[Problem] = []
    findings += _shape(document)
    findings += _core_budget(document)
    findings += _unowned(document)
    findings += _language(document)
    findings += _rationale(document)
    findings += _aspiration(document)
    findings += _status(document)
    return findings


def _at(node, message: str, code: str) -> Problem:
    return reading_at(node.name_span, message, code)


# -- the shape of it --------------------------------------------------------


def _shape(document: ContextMap) -> list[Problem]:
    """What is on the map, counted once.

    Not a finding about anything. It is the line a reader wants before any of
    the others, and in a terminal there is no canvas to glance at.
    """
    where = document.title_span
    if not document.nodes:
        return [
            reading_at(
                where,
                "This map is empty - it declares no domain.",
                "ddd-empty-map",
            )
        ]

    edges = document.relationships
    census: dict[str, int] = {}
    for edge in edges:
        for pattern in edge.pattern:
            census[pattern] = census.get(pattern, 0) + 1

    findings = [
        reading_at(
            where,
            f"{count(len(document.domains), 'domain')}, "
            f"{count(len(document.subdomains), 'subdomain')}, "
            f"{count(len(document.contexts), 'context')}, "
            f"{count(len(edges), 'relationship')}.",
            "ddd-shape",
        )
    ]

    if census:
        spelled = listed(
            [f"{pattern_label[name]} x{n}" if n > 1 else pattern_label[name]
             for name, n in sorted(census.items(), key=lambda item: (-item[1], item[0]))]
        )
        findings.append(reading_at(where, f"Patterns in use: {spelled}.", "ddd-patterns"))
    elif document.contexts:
        findings.append(
            reading_at(
                where,
                f"{count(len(document.contexts), 'context')} and no relationships "
                "between them.",
                "ddd-no-relationships",
            )
        )

    straddling = [c for c in document.contexts if len(c.serves) > 1]
    for context in straddling:
        others = listed([document.name_of(parent) for parent in context.serves])
        findings.append(
            _at(
                context,
                f'"{context.name}" straddles: it serves {others}.',
                "ddd-straddle",
            )
        )
    return findings


# -- the budget -------------------------------------------------------------


def _core_budget(document: ContextMap) -> list[Problem]:
    """A subdomain's classification is a **budget**, not a compliment.

    `core` gets the deep model and the best people, `generic` gets bought. More
    than a few `core` subdomains means none of them are.
    """
    core = [s for s in document.subdomains if s.classification == "core"]
    if len(core) <= TOO_MUCH_CORE:
        return []
    return [
        reading_at(
            document.title_span,
            f"{count(len(core), 'subdomain')} {verb(len(core), 'is', 'are')} `core` - "
            f"{listed([s.name for s in core])}.",
            "ddd-too-much-core",
        )
    ]


# -- the boundaries ---------------------------------------------------------


def _unowned(document: ContextMap) -> list[Problem]:
    """An unowned boundary is a suggestion, and suggestions lose to deadlines.

    The parser has already warned at each one. This is the total, which is a
    different sentence: four unowned boundaries out of five is a map nobody has
    staffed, and no per-node warning says that.
    """
    unowned = [node for node in document.nodes if not node.owner]
    if not unowned:
        return []
    return [
        reading_at(
            document.title_span,
            f"{count(len(unowned), 'boundary', 'boundaries')} of "
            f"{len(document.nodes)} {verb(len(unowned), 'has', 'have')} no owner - "
            f"{listed([node.name for node in unowned])}.",
            "ddd-unowned",
        )
    ]


def _language(document: ContextMap) -> list[Problem]:
    """A context whose `language` is empty has no edge.

    The terms that mean something here and not next door are what make it a
    boundary. Two further readings come off the same field:

    **A term in two contexts' language** is the interesting case either way. If
    it means different things on the two sides, that is the boundary doing its
    job and worth knowing where it is; if it means the same thing, the doctrine
    says there is no boundary there. The reading names the word and asks.

    **A context listing dozens of terms** has recorded a data dictionary. The
    field is for the words that change meaning at the border, not a glossary.
    """
    findings: list[Problem] = []
    contexts = document.contexts

    mute = [c for c in contexts if not c.language]
    if mute:
        findings.append(
            reading_at(
                document.title_span,
                f"{count(len(mute), 'context')} of {len(contexts)} "
                f"{verb(len(mute), 'has', 'have')} no `language` - "
                f"{listed([c.name for c in mute])}.",
                "ddd-no-language",
            )
        )

    for context in contexts:
        if len(context.language) > DICTIONARY:
            findings.append(
                _at(
                    context,
                    f'"{context.name}" lists {len(context.language)} language terms.',
                    "ddd-language-is-a-dictionary",
                )
            )

    # Folded case, because "Policy" and "policy" in two files are one word
    # somebody typed twice.
    where: dict[str, list[ContextNode]] = {}
    for context in contexts:
        for term in context.language:
            where.setdefault(term.strip().lower(), []).append(context)
    for term, holders in sorted(where.items()):
        names = sorted({c.name for c in holders})
        if len(names) < 2:
            continue
        findings.append(
            _at(
                holders[0],
                f'"{term}" is in the language of {len(names)} contexts - '
                f"{listed(names)}.",
                "ddd-shared-term",
            )
        )
    return findings


def _rationale(document: ContextMap) -> list[Problem]:
    """`because` is where the honest answer goes.

    *"The vendor will not change for us"*, *"their team has no budget for us
    this year"*. An arrow whose rationale would embarrass somebody is usually
    the correctly labelled one.

    The parser warns on each missing one; this counts them, and adds the one
    heuristic reading in the module: a `because` whose words are already in the
    pattern's own name has recorded the label rather than the politics.
    """
    findings: list[Problem] = []
    edges = document.relationships
    if not edges:
        return findings

    unjustified = [edge for edge in edges if not edge.because]
    if unjustified:
        findings.append(
            reading_at(
                document.title_span,
                f"{len(unjustified)} of {count(len(edges), 'relationship')} "
                f"{verb(len(unjustified), 'has', 'have')} no `because`.",
                "ddd-unjustified",
            )
        )

    for edge in edges:
        if not edge.because:
            continue
        label = " ".join(name.replace("-", " ") for name in edge.pattern)
        if adds_nothing_to(edge.because, label):
            findings.append(
                reading_at(
                    edge.span,
                    f"The `because` on {document.name_of(edge.from_)} -> "
                    f"{document.name_of(edge.to)} restates the pattern's own name.",
                    "ddd-because-restates-pattern",
                )
            )
    return findings


def _aspiration(document: ContextMap) -> list[Problem]:
    """**The characteristic failure of a context map is aspiration.**

    Every arrow gets labelled `customer-supplier` because `conformist` feels
    like a defeat, and a map of what everyone wishes were true tells you
    nothing.

    This is the one reading that comes near "do not upgrade a `conformist`", so
    it is written to stay on the right side of it. It says what it counted -
    no pattern anywhere that admits to anything uncomfortable - and asks. It
    never names an arrow, never proposes a relabelling, and does not fire on a
    map small enough for the absence to mean nothing.
    """
    edges = document.relationships
    if len(edges) < ENOUGH_EDGES:
        return []

    used = {pattern for edge in edges for pattern in edge.pattern}
    if used & ADMISSIONS:
        return []

    return [
        reading_at(
            document.title_span,
            f"None of the {len(edges)} relationships uses a pattern that admits to "
            "anything uncomfortable: no `conformist`, `anticorruption-layer`, "
            "`separate-ways` or `big-ball-of-mud` anywhere.",
            "ddd-reads-as-aspiration",
        )
    ]


def _status(document: ContextMap) -> list[Problem]:
    """`status` exists to distinguish a decision from an omission.

    An empty aggregate list is a legitimate answer for a generic context and
    means "bought whole and wrapped" - which is only legible when the status
    says so. The two ways the pair can disagree are each worth a line.
    """
    findings: list[Problem] = []
    for context in document.contexts:
        if context.status == "modelled" and not context.aggregates:
            findings.append(
                _at(
                    context,
                    f'"{context.name}" is `modelled` and names no aggregate.',
                    "ddd-modelled-without-aggregates",
                )
            )
        elif context.status == "unmodelled" and context.aggregates:
            findings.append(
                _at(
                    context,
                    f'"{context.name}" is `unmodelled` and names '
                    f"{count(len(context.aggregates), 'aggregate')}.",
                    "ddd-unmodelled-with-aggregates",
                )
            )
    return findings


def hints() -> dict[str, str]:
    """What each reading is pointing at, in the doctrine's own words.

    Kept apart from the messages so a finding stays one line in a list and the
    argument is available to whoever wants it. The CLI prints these under the
    message; `--quiet` drops them.
    """
    return {
        "ddd-shape": "A context map is the strategic half: where the boundaries are, "
        "and what runs between them.",
        "ddd-patterns": "`customer-supplier` and `conformist` describe the same arrow "
        "and differ only in whether the downstream team has any negotiating power.",
        "ddd-no-relationships": "The relationships are the part of a map with the "
        "information in it, and the only part anybody argues about.",
        "ddd-straddle": "A context serving two subdomains is a fact about the "
        "business, and reading one section without knowing it belongs to another is "
        "how it gets missed.",
        "ddd-empty-map": "A file whose map declares nothing is legal. It is also "
        "almost always a truncated paste.",
        "ddd-too-much-core": "A classification is a budget rather than a compliment: "
        "if more than a couple are core, none of them are getting the deep model and "
        "the best people. Marking a fourth thing core does not fund it - it defunds "
        "the other three.",
        "ddd-unowned": "An unowned boundary is a suggestion, and suggestions lose to "
        "deadlines. An owner is a person, never a department.",
        "ddd-no-language": "The terms that mean something here and not next door are "
        "what make it a boundary; a context with none has no edge.",
        "ddd-language-is-a-dictionary": "`language` is not a glossary. A context "
        "listing forty generic nouns has recorded a data dictionary and learned "
        "nothing.",
        "ddd-shared-term": "If the word means different things on the two sides, that "
        "is the boundary working - and worth saying out loud. If it means the same "
        "thing, the doctrine says there is no boundary there.",
        "ddd-unjustified": "`because` is where the honest answer goes, including the "
        "politics. The characteristic failure of a context map is aspiration, and "
        "`because` is the field that catches it.",
        "ddd-because-restates-pattern": "The pattern name is already on the edge. What "
        "the rationale is for is the sentence nobody enjoys writing - \"the vendor "
        "will not change for us\".",
        "ddd-reads-as-aspiration": "Every arrow labelled `customer-supplier` because "
        "`conformist` feels like a defeat is the failure this format exists to catch. "
        "Which arrow, if any, is wrong is the room's call and not this tool's.",
        "ddd-modelled-without-aggregates": "`status` distinguishes a decision from an "
        "omission. Empty aggregates under `modelled` says neither.",
        "ddd-unmodelled-with-aggregates": "Either the status is stale or the "
        "aggregates are - both are worth a look.",
    }
