"""
The `.ddm` document model - a domain model, the **tactical** half.

The map says a context has an aggregate called `Submission`. This says what
`Submission` *is*: what it holds, what it protects, and what it is allowed to
know about the rest of the world.

Four decisions distinguish this from a class diagram, and each one is the
reason for having a format at all:

  1. **An aggregate is a boundary, not a folder.** Its members nest inside it,
     so "this entity belongs to exactly one aggregate" is structural rather
     than a rule that can drift. What crosses the boundary is `references`, and
     what cannot cross is `contains`.

  2. **The invariant is a field.** An aggregate exists to keep something true
     across a transaction; one with nothing to protect is a table with extra
     ceremony. So the rationale gets a place to live and a warning when it is
     empty, exactly as `because` does on a relationship in the map.

  3. **Identity is the difference between an entity and a value.** An entity
     has an `id` and a value object may not - not as a style preference but as
     the definition, which is why the parser refuses it rather than warning.

  4. **Names are identities, globally within one model.** Two things called
     `Line` in one bounded context is precisely the ubiquitous-language failure
     this tool exists to surface, so it is an error and not a namespacing
     problem to be solved with dots.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Literal

from ..problems import NOWHERE, Span

Id = str

MemberKind = Literal["entity", "value", "enum"]

#: How many, written as words rather than as `0..1` and `1..*`. The map spells
#: its patterns out - `open-host-service`, not `OHS` - and this follows it.
Multiplicity = Literal["one", "optional", "many", "at-least-one"]
MULTIPLICITIES: Final[tuple[Multiplicity, ...]] = (
    "one",
    "optional",
    "many",
    "at-least-one",
)

#: What `1..*` and friends look like once they reach PlantUML.
multiplicity_mark: Final[dict[str, str]] = {
    "one": "1",
    "optional": "0..1",
    "many": "*",
    "at-least-one": "1..*",
}

#: The three ways one declaration can name another, and the whole argument of
#: the format is in the difference between them.
#:
#:   contains   composition inside one boundary. The part has no life of its
#:              own: it is created, saved and deleted with the root.
#:   embeds     a value object or an enumeration, which has no identity and is
#:              therefore copied rather than shared.
#:   references across a boundary, **by identity**. You name another aggregate,
#:              never something inside one, and you hold its id rather than the
#:              thing itself.
LinkKind = Literal["contains", "embeds", "references"]
LINK_KINDS: Final[tuple[LinkKind, ...]] = ("contains", "embeds", "references")

member_label: Final[dict[str, str]] = {
    "entity": "Entity",
    "value": "Value object",
    "enum": "Enumeration",
}

link_label: Final[dict[str, str]] = {
    "contains": "contains",
    "embeds": "embeds",
    "references": "references",
}


def is_multiplicity(value: str) -> bool:
    return value in MULTIPLICITIES


def is_link_kind(value: str) -> bool:
    return value in LINK_KINDS


@dataclass
class Attribute:
    name: str
    #: Free text. The model does not have a type system and should not grow one.
    type: str
    span: Span = NOWHERE
    name_span: Span = NOWHERE


@dataclass
class MemberBase:
    name: str
    id: Id = ""
    #: The aggregate this belongs to, or None for a value shared across them.
    aggregate: Id | None = None
    attributes: list[Attribute] = field(default_factory=list)
    span: Span = NOWHERE
    name_span: Span = NOWHERE


@dataclass
class EntityNode(MemberBase):
    kind: str = "entity"
    #: Exactly one entity per aggregate has this.
    root: bool = False
    #: The identity type. Absent on a root is a warning: what other aggregates
    #: hold when they reference this one is its identity.
    identity: str | None = None


@dataclass
class ValueNode(MemberBase):
    kind: str = "value"


@dataclass
class EnumNode(MemberBase):
    kind: str = "enum"
    literals: list[str] = field(default_factory=list)


Member = EntityNode | ValueNode | EnumNode


@dataclass
class AggregateNode:
    name: str
    id: Id = ""
    intent: str | None = None
    #: What must stay true across a transaction. Repeatable, because an
    #: aggregate usually protects more than one thing and a list of them is the
    #: most useful part of the file to a reader who did not write it.
    invariants: list[str] = field(default_factory=list)
    #: The root entity. None only in a document that failed its own check.
    root: Id | None = None
    members: list[Id] = field(default_factory=list)
    span: Span = NOWHERE
    name_span: Span = NOWHERE


@dataclass
class Link:
    id: Id
    kind: LinkKind
    from_: Id
    to: Id
    multiplicity: Multiplicity = "one"
    span: Span = NOWHERE
    #: The quoted target, so a message points at the name and nothing else.
    target_span: Span = NOWHERE


@dataclass
class DomainModel:
    #: The bounded context this model is the inside of.
    #:
    #: A name, matching the map's, because the name is the identity in both
    #: formats. It is what lets the two documents be checked against each other
    #: without either one holding a pointer into the other.
    context: str = "Untitled model"
    context_span: Span = NOWHERE
    aggregates: list[AggregateNode] = field(default_factory=list)
    members: list[Member] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)
    source: str = ""

    @property
    def entities(self) -> list[EntityNode]:
        return [m for m in self.members if m.kind == "entity"]

    @property
    def values(self) -> list[ValueNode]:
        return [m for m in self.members if m.kind == "value"]

    @property
    def enums(self) -> list[EnumNode]:
        return [m for m in self.members if m.kind == "enum"]

    @property
    def shared(self) -> list[Member]:
        """Declared at model level rather than inside an aggregate."""
        return [m for m in self.members if m.aggregate is None]

    def member(self, id_: Id) -> Member | None:
        return next((m for m in self.members if m.id == id_), None)

    def aggregate(self, id_: Id) -> AggregateNode | None:
        return next((a for a in self.aggregates if a.id == id_), None)

    def name_of(self, id_: Id) -> str:
        found = self.member(id_) or self.aggregate(id_)
        return found.name if found else id_

    def members_of(self, aggregate: AggregateNode) -> list[Member]:
        return [m for m in (self.member(id_) for id_ in aggregate.members) if m is not None]

    @property
    def crossings(self) -> list[Link]:
        """The `references`, which are the links that cross a boundary."""
        return [link for link in self.links if link.kind == "references"]
