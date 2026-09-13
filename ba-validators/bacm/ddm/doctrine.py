"""
Reading a domain model - the doctrine, as findings.

Everything here comes from `ba-cm-doctrine.md` and from
`ba-cm/src/lib/ddm/outline.ts`, which sets the rule:

    Nothing here is a score. An aggregate with no invariant may be a boundary
    somebody has not finished thinking about, and a model with none of these
    findings can still be a drawing of the database, which is the failure no
    count can see.

So every finding is a **reading**. The errors and warnings are the parser's, and
they are the format's own rules rather than the doctrine's opinion.

## The threshold is not tunable

`CROWDED` is seven, and `outline.ts` is explicit about why it is a constant and
not a setting: "the doctrine's claim is that a large aggregate is a contention
problem before it is a design problem, and a number somebody can raise until
the warning stops is a number that will be raised until the warning stops."

## What is deliberately not checked

The doctrine's "what not to do" for a model is one instruction - **do not draw
an aggregate around things that merely belong together** - and it is honoured by
omission: no reading here proposes an aggregate, moves a member between two, or
writes an `invariant`. The reading says which aggregate protects nothing and
stops there, because "either the rule is missing or the boundary is" is a
question for somebody who knows the business.
"""

from __future__ import annotations

from ..problems import Problem, reading_at
from ..prose import count, listed, quoted, verb
from .model import DomainModel

#: An aggregate holding more than this is worth a second look. Everything
#: inside a boundary is loaded and saved together.
CROWDED = 7


def read(document: DomainModel) -> list[Problem]:
    """Every doctrine reading of this model."""
    findings: list[Problem] = []
    findings += _shape(document)
    findings += _unprotected(document)
    findings += _identity(document)
    findings += _size(document)
    findings += _values(document)
    findings += _crossings(document)
    return findings


def _at(node, message: str, code: str) -> Problem:
    return reading_at(node.name_span, message, code)


# -- the shape of it --------------------------------------------------------


def _shape(document: DomainModel) -> list[Problem]:
    where = document.context_span
    if not document.aggregates and not document.members:
        return [
            reading_at(
                where,
                "This model is empty - it declares no aggregate.",
                "ddm-empty-model",
            )
        ]

    findings = [
        reading_at(
            where,
            f"{count(len(document.aggregates), 'aggregate')}, "
            f"{count(len(document.entities), 'entity', 'entities')}, "
            f"{count(len(document.values), 'value object')}, "
            f"{count(len(document.enums), 'enumeration')}, "
            f"{count(len(document.crossings), 'crossing')}.",
            "ddm-shape",
        )
    ]

    shared = document.shared
    if shared:
        findings.append(
            reading_at(
                where,
                f"Shared at model level: "
                f"{quoted(f'{m.name}' for m in shared)}.",
                "ddm-shared",
            )
        )
    return findings


# -- what each boundary is for ----------------------------------------------


def _unprotected(document: DomainModel) -> list[Problem]:
    """An aggregate exists to keep something true across a transaction.

    One with nothing to protect is a table with extra ceremony, and its parts
    probably belong to their own boundaries. The parser warns at each one; this
    is the count, which is the sentence a reader of the whole model wants.
    """
    unprotected = [one for one in document.aggregates if not one.invariants]
    if not unprotected:
        return []
    return [
        reading_at(
            document.context_span,
            f"{count(len(unprotected), 'aggregate')} of {len(document.aggregates)} "
            f"{verb(len(unprotected), 'protects', 'protect')} no invariant - "
            f"{listed([one.name for one in unprotected])}.",
            "ddm-unprotected",
        )
    ]


def _identity(document: DomainModel) -> list[Problem]:
    """Identity is the whole difference between an entity and a value object.

    Counted across every entity rather than only the roots - the parser warns
    on a root with no `id` because that is what another aggregate holds, and
    `outline.ts` counts all of them because an entity with no identity is a
    value object that has been declared in the wrong place.
    """
    anonymous = [e for e in document.entities if e.identity is None]
    if not anonymous:
        return []
    return [
        reading_at(
            document.context_span,
            f"{count(len(anonymous), 'entity', 'entities')} "
            f"{verb(len(anonymous), 'has', 'have')} no `id` - "
            f"{listed([e.name for e in anonymous])}.",
            "ddm-anonymous-entities",
        )
    ]


def _size(document: DomainModel) -> list[Problem]:
    """A large aggregate is a contention problem before it is a design problem.

    Everything inside it is loaded and saved together.
    """
    crowded = [one for one in document.aggregates if len(one.members) > CROWDED]
    if not crowded:
        return []
    return [
        reading_at(
            document.context_span,
            f"{count(len(crowded), 'aggregate')} "
            f"{verb(len(crowded), 'holds', 'hold')} more than {CROWDED} members - "
            f"{listed([f'{one.name} ({len(one.members)})' for one in crowded])}.",
            "ddm-crowded",
        )
    ]


def _values(document: DomainModel) -> list[Problem]:
    """Two values with the same fields *are* the same value.

    That sentence is the definition the format is built on - it is why a `value`
    carrying an `id` is refused - and read forwards it is a check: two value
    objects declared with identical attributes are one value object written
    twice, whatever they have been called. Attribute *names and types* both, and
    order ignored, because a value is its fields and nothing else.

    A value with no attributes at all gets its own line rather than being
    collapsed into the above, where every empty value would look like a
    duplicate of every other.
    """
    findings: list[Problem] = []

    empty = [v for v in document.values if not v.attributes]
    for value in empty:
        findings.append(
            _at(
                value,
                f'The value object "{value.name}" has no attributes.',
                "ddm-value-without-fields",
            )
        )

    by_fields: dict[frozenset[tuple[str, str]], list] = {}
    for value in document.values:
        if not value.attributes:
            continue
        key = frozenset((a.name, a.type) for a in value.attributes)
        by_fields.setdefault(key, []).append(value)
    for group in by_fields.values():
        if len(group) < 2:
            continue
        findings.append(
            _at(
                group[0],
                f"{count(len(group), 'value object')} have identical fields - "
                f"{listed([v.name for v in group])}.",
                "ddm-identical-values",
            )
        )
    return findings


def _crossings(document: DomainModel) -> list[Problem]:
    """What crosses between the boundaries, and which of them nothing crosses to.

    `references` is the only link that leaves an aggregate, so the crossings
    are the model's own account of how its boundaries depend on each other -
    the same thing the map's relationship section is, one zoom level down.
    """
    findings: list[Problem] = []
    crossings = document.crossings
    if not crossings:
        if len(document.aggregates) > 1:
            findings.append(
                reading_at(
                    document.context_span,
                    f"{count(len(document.aggregates), 'aggregate')} and nothing "
                    "references anything.",
                    "ddm-no-crossings",
                )
            )
        return findings

    for link in crossings:
        owner = document.member(link.from_)
        target = document.aggregate(link.to)
        if owner is None or target is None:
            continue
        findings.append(
            reading_at(
                link.span,
                f'"{owner.name}" holds the identity of "{target.name}" '
                f"({link.multiplicity}).",
                "ddm-crossing",
            )
        )
    return findings


def hints() -> dict[str, str]:
    """What each reading is pointing at, in the doctrine's own words."""
    return {
        "ddm-shape": "A domain model is the tactical half: what is inside one "
        "boundary and what keeps it true.",
        "ddm-shared": "A value object used in two places is declared at the top of "
        "the model rather than inside one of them.",
        "ddm-empty-model": "A model declaring nothing is legal, and is almost always "
        "a truncated paste.",
        "ddm-unprotected": "An aggregate exists to keep something true across a "
        "transaction; one with nothing to protect is a table with extra ceremony, and "
        "its parts probably belong to their own boundaries. Either the rule is missing "
        "or the boundary is - which of the two is not this tool's call.",
        "ddm-anonymous-entities": "Identity is the whole difference between an entity "
        "and a value object, and what another aggregate holds when it references this "
        "one.",
        "ddm-crowded": f"Everything inside a boundary is loaded and saved together, so "
        f"an aggregate holding more than {CROWDED} members is a contention problem "
        "before it is a design problem.",
        "ddm-value-without-fields": "A value object is its fields. One with none is "
        "either unfinished or a marker that wants to be an enumeration.",
        "ddm-identical-values": "Two values with the same fields are the same value - "
        "that is the definition identity is drawn against. Two names for it is the "
        "ubiquitous language having two words for one idea.",
        "ddm-no-crossings": "`references` is the only link that leaves an aggregate. "
        "Several boundaries that never refer to each other are either genuinely "
        "independent or one model that has been split on paper.",
        "ddm-crossing": "Across a boundary you hold an identity and load the other "
        "aggregate separately. Eventual consistency between aggregates is the normal "
        "case, not a compromise.",
    }
