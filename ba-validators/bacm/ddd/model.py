"""
The `.ddd` document model - a context map, the **strategic** half.

The shape of a business: its domains, the subdomains they divide into, the
bounded contexts that serve them, and the strategic relationships between those
contexts.

Three things distinguish this model from doc-hub's board models, and each is a
decision rather than an accident:

  1. **Every node carries the source span it was parsed from.** In ba-cm the
     text is the source of truth and the graph is a render, so a gesture in the
     graph has to become a surgical edit to the text. A validator never
     splices, and the spans still decide how wide an error caret is.

  2. **There are no coordinates.** Position carries no meaning on a context
     map, so layout is computed and never stored. A file whose diff is mostly
     position changes cannot be reviewed. An arrangement lives in a
     `.dddview` sidecar - see `bacm.view`.

  3. **Containment is an edge, not only a nesting.** A context usually sits
     inside one subdomain and occasionally serves two, and that straddle is the
     single most informative thing a catalog can record. A tree cannot express
     it; a graph can.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Literal

from ..problems import NOWHERE, Span

__all__ = [
    "CLASSIFICATIONS",
    "PATTERNS",
    "STATUSES",
    "Classification",
    "ContainmentEdge",
    "ContextMap",
    "ContextNode",
    "DomainNode",
    "Edge",
    "ModelStatus",
    "Node",
    "Pattern",
    "RelationshipEdge",
    "Span",
    "SubdomainNode",
    "SYMMETRY",
    "is_classification",
    "is_pattern",
    "pattern_admits",
    "pattern_label",
]

#: Stable within one parse. Derived from the name, which is the identity.
Id = str

NodeKind = Literal["domain", "subdomain", "context"]

#: Why the business is in this part of the business. The classification is a
#: **budget** rather than a label: `core` gets the deep model and the best
#: people, `generic` gets bought.
Classification = Literal["core", "supporting", "generic"]
CLASSIFICATIONS: Final[tuple[Classification, ...]] = ("core", "supporting", "generic")

#: How far the model has been taken, not how important it is. It exists
#: separately from `aggregate` so that an empty aggregate list can be read as a
#: decision rather than an omission.
ModelStatus = Literal["modelled", "drafted", "unmodelled"]
STATUSES: Final[tuple[ModelStatus, ...]] = ("modelled", "drafted", "unmodelled")

#: The nine strategic patterns. The names are Evans's, and using them exactly
#: is worth more than it looks: `customer-supplier` and `conformist` describe
#: the same arrow and differ only in whether the downstream team has any
#: negotiating power - a political fact a generic "depends on" hides.
Pattern = Literal[
    "partnership",
    "shared-kernel",
    "customer-supplier",
    "conformist",
    "anticorruption-layer",
    "open-host-service",
    "published-language",
    "separate-ways",
    "big-ball-of-mud",
]

PATTERNS: Final[tuple[Pattern, ...]] = (
    "partnership",
    "shared-kernel",
    "customer-supplier",
    "conformist",
    "anticorruption-layer",
    "open-host-service",
    "published-language",
    "separate-ways",
    "big-ball-of-mud",
)

#: Whether a pattern describes a relationship with a direction.
#:
#: Enforced by the parser: `partnership`, `shared-kernel` and `separate-ways`
#: are mutual and may not be written with `->`, because an arrow would assert
#: an upstream that the pattern denies. The rest require one.
#:
#: `big-ball-of-mud` is deliberately permitted either way. It is not a pattern
#: anybody chooses - it is one you record - and a ball of mud with a
#: discernible direction is still a ball of mud.
SYMMETRY: Final[dict[str, str]] = {
    "partnership": "mutual",
    "shared-kernel": "mutual",
    "separate-ways": "mutual",
    "customer-supplier": "directed",
    "conformist": "directed",
    "anticorruption-layer": "directed",
    "open-host-service": "directed",
    "published-language": "directed",
    "big-ball-of-mud": "either",
}

pattern_label: Final[dict[str, str]] = {
    "partnership": "Partnership",
    "shared-kernel": "Shared kernel",
    "customer-supplier": "Customer/supplier",
    "conformist": "Conformist",
    "anticorruption-layer": "Anticorruption layer",
    "open-host-service": "Open host service",
    "published-language": "Published language",
    "separate-ways": "Separate ways",
    "big-ball-of-mud": "Big ball of mud",
}

#: What choosing this pattern admits to. Quoted in a reading that asks whether
#: the map is honest about power.
pattern_admits: Final[dict[str, str]] = {
    "partnership": "Mutual dependence, and a real coordination cost.",
    "shared-kernel": "That neither side can be made downstream of the other without lying.",
    "customer-supplier": "That the downstream team has real negotiating power.",
    "conformist": "Powerlessness, honestly. That is the value of the name.",
    "anticorruption-layer": (
        "That the upstream model is unsuitable and the downstream one is worth protecting."
    ),
    "open-host-service": "That there are enough consumers to make one interface cheaper than N.",
    "published-language": "That the interchange format is an asset with more than two readers.",
    "separate-ways": "That integration costs more than duplication.",
    "big-ball-of-mud": "Reality. Not chosen - recorded, so everything around it can be defended.",
}


def is_pattern(value: str) -> bool:
    return value in SYMMETRY


def is_classification(value: str) -> bool:
    return value in CLASSIFICATIONS


def is_status(value: str) -> bool:
    return value in STATUSES


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class NodeBase:
    #: The identity. Two nodes may not share one.
    name: str
    id: Id = ""
    #: Free prose. What this part of the business is for.
    intent: str | None = None
    #: A person, never a department. Absent is a warning, not an error.
    owner: str | None = None
    span: Span = NOWHERE
    #: The span of the name alone, so a message points at the name and nothing
    #: else on the line.
    name_span: Span = NOWHERE


@dataclass
class DomainNode(NodeBase):
    kind: str = "domain"


@dataclass
class SubdomainNode(NodeBase):
    kind: str = "subdomain"
    classification: Classification = "supporting"
    classification_span: Span = NOWHERE
    #: The domain this subdomain divides. Always exactly one.
    parent: Id = ""


@dataclass
class ContextNode(NodeBase):
    kind: str = "context"
    #: The terms that mean something *here* that they do not mean next door.
    #: Not a glossary - a context listing forty generic nouns has recorded a
    #: data dictionary and learned nothing.
    language: list[str] = field(default_factory=list)
    #: Consistency boundaries. Empty is a legitimate answer for a generic
    #: context and means "bought whole and wrapped", which is why `status`
    #: exists separately: it distinguishes a decision from an omission.
    aggregates: list[str] = field(default_factory=list)
    status: ModelStatus = "modelled"
    #: The subdomains - or, rarely, domains - this context serves. Normally
    #: one, implied by nesting. More than one is the straddle, and it is the
    #: reason this is a list rather than a field.
    serves: list[Id] = field(default_factory=list)


Node = DomainNode | SubdomainNode | ContextNode


# ---------------------------------------------------------------------------
# Edges
# ---------------------------------------------------------------------------


@dataclass
class ContainmentEdge:
    """A context serves a subdomain, a subdomain divides a domain.

    Structural. Never carries a pattern.
    """

    id: Id
    #: The context or subdomain.
    from_: Id
    #: The subdomain or domain it serves.
    to: Id
    #: True when this edge is implied by nesting rather than written out as a
    #: `serves` line.
    implied: bool = True
    span: Span | None = None
    kind: str = "containment"


@dataclass
class RelationshipEdge:
    """A context relates to a context.

    This is the edge with the information in it, and the only one anybody
    argues about.
    """

    id: Id
    #: Upstream for a directed edge; one arbitrary end for a mutual one.
    from_: Id
    to: Id
    directed: bool
    #: One pattern, or two when the ends play different roles -
    #: `open-host-service / anticorruption-layer` is upstream publishing and
    #: downstream defending, which is one relationship and two named positions.
    pattern: tuple[str, ...] = ()
    pattern_span: Span = NOWHERE
    #: What actually crosses, in domain terms. Not "data".
    exchange: str | None = None
    #: Why this pattern and not the neighbouring one, including the politics.
    because: str | None = None
    span: Span = NOWHERE
    kind: str = "relationship"


Edge = ContainmentEdge | RelationshipEdge


# ---------------------------------------------------------------------------
# The document
# ---------------------------------------------------------------------------


@dataclass
class ContextMap:
    title: str = "Untitled map"
    title_span: Span = NOWHERE
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    #: The source this was parsed from, verbatim.
    source: str = ""

    @property
    def domains(self) -> list[DomainNode]:
        return [node for node in self.nodes if node.kind == "domain"]

    @property
    def subdomains(self) -> list[SubdomainNode]:
        return [node for node in self.nodes if node.kind == "subdomain"]

    @property
    def contexts(self) -> list[ContextNode]:
        return [node for node in self.nodes if node.kind == "context"]

    @property
    def relationships(self) -> list[RelationshipEdge]:
        return [edge for edge in self.edges if edge.kind == "relationship"]

    def by_id(self, id_: Id) -> Node | None:
        return next((node for node in self.nodes if node.id == id_), None)

    def name_of(self, id_: Id) -> str:
        node = self.by_id(id_)
        return node.name if node else id_

    def serving(self, parent: Id) -> list[ContextNode]:
        """The contexts attached to one parent, in document order.

        Read off `serves` rather than off the containment edges, because
        `serves` is the model's own answer and carries the straddle: a context
        serving two subdomains is returned for both, which is what it does on
        the canvas.
        """
        return [context for context in self.contexts if parent in context.serves]

    def classification_of(self, id_: Id) -> Classification | None:
        node = self.by_id(id_)
        return node.classification if node is not None and node.kind == "subdomain" else None

    def strongest(self, context: ContextNode) -> Classification:
        """A context takes the classification of the most demanding thing it
        serves.

        If any part of what a context does is core, it is not safe to read it
        as generic. `supporting` is the fallback when nothing it serves can be
        found.
        """
        found = {
            self.classification_of(parent)
            for parent in context.serves
            if self.classification_of(parent) is not None
        }
        for candidate in CLASSIFICATIONS:
            if candidate in found:
                return candidate
        return "supporting"
