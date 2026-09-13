"""
The `.ddm` parser.

Same shape as the map's, and deliberately so: recursive descent, one pass to
declare and a second to resolve names, recovery that reports one problem per
mistake rather than a cascade, and a document that comes back even when it
failed so the panel has something to say.

The tokenizer and the problems module are shared with `.ddd`. What is *not*
shared is the checking, because that is the whole point of having a second
language. Half of this file is the rules an aggregate has to obey, and each one
is written to fail with the reason rather than the symptom: a `contains`
reaching into another aggregate is not "unknown name", it is the rule that a
boundary is a boundary.

## Two namespaces, not one

An aggregate is named after its root - `aggregate "Submission"` holding
`root entity "Submission"` - and that is not a collision to be worked around,
it is the same thing seen from outside and from inside. Insisting on one flat
namespace would make the most idiomatic model in DDD an error.

Nothing is ambiguous, because the *link kind* says which namespace was meant:
`references` crosses a boundary and therefore names an aggregate, while
`contains` and `embeds` stay inside one and name a member. Each still falls
back to the other namespace when the lookup fails, so `contains "Submission"`
gets told it is pointing at an aggregate rather than that the name does not
exist.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from ..lexer import COLON, EOF, LBRACE, RBRACE, STRING, WORD, Token, describe, tokenize
from ..parsing import Reader
from ..problems import (
    LexError,
    Problem,
    Span,
    error_at,
    has_errors,
    report,
    warning_at,
)
from .model import (
    AggregateNode,
    Attribute,
    DomainModel,
    EntityNode,
    EnumNode,
    Id,
    Link,
    LinkKind,
    Member,
    Multiplicity,
    ValueNode,
    is_link_kind,
    is_multiplicity,
)

#: Words that can start a fresh declaration, for recovery.
STARTERS: Final[frozenset[str]] = frozenset(
    {"aggregate", "entity", "value", "enum", "root", "context", "model"}
)


@dataclass
class Result:
    document: DomainModel
    problems: list[Problem]
    #: False when the document does not parse, or parses into something illegal.
    ok: bool


@dataclass
class _PendingLink:
    """A `contains` / `embeds` / `references` waiting for its target to exist."""

    kind: LinkKind
    from_: Id
    name: str
    multiplicity: Multiplicity
    span: Span
    target_span: Span


def parse(source: str) -> Result:
    """Read a domain model, returning whatever could be read and every problem."""
    problems: list[Problem] = []

    try:
        tokens = tokenize(source)
    except LexError as error:
        report(problems, error_at(error.span, error.message, error.code))
        return Result(DomainModel(source=source), problems, False)

    reader = _ModelReader(tokens, problems, source)
    document = reader.parse_file()
    return Result(document, problems, not has_errors(problems))


class _ModelReader(Reader):
    starters = STARTERS
    # Unlike the map, a quoted string never starts a declaration here.
    string_starts_declaration = False

    def __init__(self, tokens: list[Token], problems: list[Problem], source: str) -> None:
        super().__init__(tokens, problems)
        self.source = source
        self.aggregates: list[AggregateNode] = []
        self.members: list[Member] = []
        self.links: list[Link] = []
        self.pending: list[_PendingLink] = []

    # -- the file -----------------------------------------------------------

    def parse_file(self) -> DomainModel:
        # The file names the bounded context it is the inside of, and the
        # keyword says so: `context "Rating" {`.
        #
        # `model` is the old spelling of the same statement and is still
        # accepted, silently, because it is sitting in browsers and in
        # repositories and a format that stops reading its own older files is a
        # format nobody trusts. Nothing writes it any more, so the alias fades
        # on its own.
        first = self.peek()
        if not self.check(WORD, "context") and not self.check(WORD, "model"):
            self.fail(
                first,
                f"A domain model starts with `context`, found {describe(first)}.",
                "expected-context",
            )
            return DomainModel(source=self.source)
        self.next()

        context_token = self.expect(
            STRING, "a quoted bounded context name", "expected-name"
        )
        context = context_token.value if context_token else "Untitled model"
        context_span = context_token.span if context_token else first.span

        if self.expect(LBRACE, "`{` after the context name", "expected-brace"):

            def item() -> bool:
                if self.check(WORD, "aggregate"):
                    self.parse_aggregate()
                elif self.check(WORD, "value"):
                    self.parse_value(None)
                elif self.check(WORD, "enum"):
                    self.parse_enum(None)
                else:
                    return False
                return True

            self.block(
                item,
                "`aggregate`, or a shared `value` or `enum`",
                "`}` closing the model",
            )

        self.resolve()
        return DomainModel(
            context=context,
            context_span=context_span,
            aggregates=self.aggregates,
            members=self.members,
            links=self.links,
            source=self.source,
        )

    # -- pass two -----------------------------------------------------------

    def resolve(self) -> None:
        aggregates_by_name: dict[str, AggregateNode] = {}
        members_by_name: dict[str, Member] = {}

        def duplicate(node, what: str) -> None:
            report(
                self.problems,
                error_at(
                    node.name_span,
                    f'"{node.name}" is declared twice as {what}. The name is the '
                    "identity here - two of them inside one bounded context is the "
                    "ubiquitous language failing, not a naming collision to be worked "
                    "around.",
                    "duplicate-name",
                ),
            )

        for aggregate in self.aggregates:
            if aggregate.name in aggregates_by_name:
                duplicate(aggregate, "an aggregate")
            else:
                aggregates_by_name[aggregate.name] = aggregate
        for member in self.members:
            if member.name in members_by_name:
                duplicate(member, "a member")
            else:
                members_by_name[member.name] = member

        # An aggregate may share its name with its own root and with nothing
        # else.
        for aggregate in self.aggregates:
            twin = members_by_name.get(aggregate.name)
            if twin is None or twin.id == aggregate.root:
                continue
            report(
                self.problems,
                error_at(
                    twin.name_span,
                    f'"{twin.name}" has the same name as the aggregate '
                    f'"{aggregate.name}" without being its root. An aggregate is named '
                    "after the entity you reach it through; anything else sharing that "
                    "name is two ideas wearing one word.",
                    "name-collides-with-aggregate",
                ),
            )

        for link in self.pending:
            if link.kind == "references":
                target = aggregates_by_name.get(link.name) or members_by_name.get(link.name)
            else:
                target = members_by_name.get(link.name) or aggregates_by_name.get(link.name)
            owner = next((m for m in self.members if m.id == link.from_), None)
            if owner is None:
                continue

            if target is None:
                report(
                    self.problems,
                    error_at(
                        link.target_span,
                        f'`{link.kind}` names "{link.name}", which is not declared.',
                        "unknown-target",
                    ),
                )
                continue

            if not self._admits(link, owner, target):
                continue

            self.links.append(
                Link(
                    id=f"{link.kind}:{owner.id}->{target.id}:{link.span.start}",
                    kind=link.kind,
                    from_=owner.id,
                    to=target.id,
                    multiplicity=link.multiplicity,
                    span=link.span,
                    target_span=link.target_span,
                )
            )

        self.whole_document_checks()

    def whole_document_checks(self) -> None:
        for aggregate in self.aggregates:
            if aggregate.root is None:
                report(
                    self.problems,
                    error_at(
                        aggregate.name_span,
                        f'"{aggregate.name}" has no `root`. An aggregate is reached '
                        "through exactly one entity - without it there is no boundary, "
                        "only a group of classes.",
                        "no-root",
                    ),
                )

            if not aggregate.invariants:
                report(
                    self.problems,
                    warning_at(
                        aggregate.name_span,
                        f'"{aggregate.name}" protects no invariant. An aggregate exists '
                        "to keep something true across a transaction; one with nothing "
                        "to protect is usually a table, and its parts probably belong "
                        "to their own boundaries.",
                        "no-invariant",
                    ),
                )

            for id_ in aggregate.members:
                member = next((m for m in self.members if m.id == id_), None)
                if member is None or member.id == aggregate.root:
                    continue
                reached = any(
                    link.to == member.id and link.kind in ("contains", "embeds")
                    for link in self.links
                )
                if not reached:
                    report(
                        self.problems,
                        warning_at(
                            member.name_span,
                            f'Nothing inside "{aggregate.name}" reaches "{member.name}". '
                            "Everything in an aggregate is loaded and saved through the "
                            "root, so a member the root cannot reach is either dead or a "
                            "boundary of its own.",
                            "unreachable-member",
                        ),
                    )

        for member in self.members:
            if member.kind == "entity" and member.root and member.identity is None:
                report(
                    self.problems,
                    warning_at(
                        member.name_span,
                        f'"{member.name}" is a root with no `id`. What other aggregates '
                        "hold when they reference this one is its identity, so it is "
                        "worth naming.",
                        "root-without-id",
                    ),
                )

            if member.aggregate is None and not any(
                link.to == member.id for link in self.links
            ):
                report(
                    self.problems,
                    warning_at(
                        member.name_span,
                        f'"{member.name}" is shared with nothing - it sits outside every '
                        "aggregate and none embeds it.",
                        "shared-with-nothing",
                    ),
                )

    # -- productions --------------------------------------------------------

    def parse_aggregate(self) -> None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted aggregate name", "expected-name")
        if name_token is None:
            self.recover()
            return

        aggregate = AggregateNode(
            name=name_token.value,
            id=f"aggregate:{name_token.value}",
            span=keyword.span,
            name_span=name_token.span,
        )
        self.aggregates.append(aggregate)

        # `aggregate "A"` with no body parses and is then refused by the
        # whole-document check: an aggregate is reached through exactly one
        # root, and without one there is no boundary.
        if self.accept(LBRACE) is None:
            return

        def item() -> bool:
            if self.check(WORD, "intent"):
                word = self.next()
                value = self.expect(STRING, "a quoted intent", "expected-intent")
                if value is not None:
                    if aggregate.intent is not None:
                        self.warn(
                            word.span,
                            f'Second `intent` on "{aggregate.name}" - the later one wins.',
                            "second-intent",
                        )
                    aggregate.intent = value.value
            elif self.check(WORD, "invariant"):
                self.next()
                value = self.expect(STRING, "a quoted invariant", "expected-invariant")
                if value is not None:
                    aggregate.invariants.append(value.value)
            elif self.check(WORD, "root"):
                word = self.next()
                if not self.check(WORD, "entity"):
                    self.fail(
                        self.peek(),
                        f"`root` is followed by an `entity`, found {describe(self.peek())}.",
                        "root-without-entity",
                    )
                    self.recover()
                else:
                    entity = self.parse_entity(aggregate, True)
                    if entity is not None:
                        if aggregate.root is not None:
                            report(
                                self.problems,
                                error_at(
                                    word.span,
                                    f'"{aggregate.name}" declares a second `root`. An '
                                    "aggregate has exactly one entry point - two means "
                                    "these are two aggregates that have been drawn in "
                                    "one box.",
                                    "second-root",
                                ),
                            )
                        else:
                            aggregate.root = entity.id
            elif self.check(WORD, "entity"):
                self.parse_entity(aggregate, False)
            elif self.check(WORD, "value"):
                value_node = self.parse_value(aggregate)
                if value_node is not None:
                    aggregate.members.append(value_node.id)
            elif self.check(WORD, "enum"):
                enumeration = self.parse_enum(aggregate)
                if enumeration is not None:
                    aggregate.members.append(enumeration.id)
            else:
                return False
            return True

        self.block(
            item,
            "`intent`, `invariant`, `root`, `entity`, `value` or `enum`",
            f'`}}` closing "{aggregate.name}"',
        )

    def parse_entity(self, aggregate: AggregateNode, root: bool) -> EntityNode | None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted entity name", "expected-name")
        if name_token is None:
            self.recover()
            return None

        entity = EntityNode(
            name=name_token.value,
            id=f"entity:{name_token.value}",
            aggregate=aggregate.id,
            root=root,
            span=keyword.span,
            name_span=name_token.span,
        )
        self.members.append(entity)
        aggregate.members.append(entity.id)

        if self.accept(LBRACE) is not None:
            self.parse_body(entity, identity=True)
            self.expect(RBRACE, f'`}}` closing "{entity.name}"', "unclosed-block")
        return entity

    def parse_value(self, aggregate: AggregateNode | None) -> ValueNode | None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted value object name", "expected-name")
        if name_token is None:
            self.recover()
            return None

        value = ValueNode(
            name=name_token.value,
            id=f"value:{name_token.value}",
            aggregate=aggregate.id if aggregate else None,
            span=keyword.span,
            name_span=name_token.span,
        )
        self.members.append(value)

        if self.accept(LBRACE) is not None:
            self.parse_body(value, identity=False)
            self.expect(RBRACE, f'`}}` closing "{value.name}"', "unclosed-block")
        return value

    def parse_enum(self, aggregate: AggregateNode | None) -> EnumNode | None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted enumeration name", "expected-name")
        if name_token is None:
            self.recover()
            return None

        enumeration = EnumNode(
            name=name_token.value,
            id=f"enum:{name_token.value}",
            aggregate=aggregate.id if aggregate else None,
            span=keyword.span,
            name_span=name_token.span,
        )
        self.members.append(enumeration)

        if self.accept(LBRACE) is not None:
            while self.check(STRING):
                enumeration.literals.append(self.next().value)
            if not enumeration.literals:
                self.warn(
                    name_token.span,
                    f'"{enumeration.name}" lists no values.',
                    "enum-without-values",
                )
            self.expect(RBRACE, f'`}}` closing "{enumeration.name}"', "unclosed-block")
        return enumeration

    def parse_body(self, owner: Member, *, identity: bool) -> None:
        """The inside of an entity or a value object."""
        while not self.check(RBRACE) and not self.check(EOF):
            before = self.cursor

            if self.check(WORD, "id"):
                word = self.next()
                value = self.expect(STRING, "a quoted identity type", "expected-id")
                if value is not None:
                    if not identity:
                        # Identity is the whole difference between a value and
                        # an entity: two values with the same fields are the
                        # same value. So this is refused rather than warned
                        # about.
                        report(
                            self.problems,
                            error_at(
                                word.span,
                                f'"{owner.name}" is a value object and cannot have an '
                                "`id`. Identity is the whole difference between a value "
                                "and an entity: two values with the same fields are the "
                                "same value.",
                                "value-with-id",
                            ),
                        )
                    else:
                        owner.identity = value.value
            elif self.check(WORD, "attribute"):
                word = self.next()
                name_token = self.expect(
                    STRING, "a quoted attribute name", "expected-name"
                )
                if name_token is not None and self.expect(
                    COLON, "`:` between an attribute and its type", "expected-colon"
                ):
                    type_token = self.expect(STRING, "a quoted type", "expected-type")
                    if type_token is not None:
                        owner.attributes.append(
                            Attribute(
                                name=name_token.value,
                                type=type_token.value,
                                span=word.span.through(type_token.span),
                                name_span=name_token.span,
                            )
                        )
            elif self.peek().type == WORD and is_link_kind(self.peek().value):
                word = self.next()
                kind = word.value
                target = self.expect(
                    STRING, f"a quoted name for `{kind}` to point at", "expected-name"
                )
                if target is not None:
                    multiplicity: Multiplicity = "one"
                    if self.peek().type == WORD and is_multiplicity(self.peek().value):
                        multiplicity = self.next().value
                    elif (
                        self.peek().type == WORD
                        and self.peek().value not in STARTERS
                        and not is_link_kind(self.peek().value)
                    ):
                        # A word here that is neither a multiplicity nor the
                        # start of the next declaration is a misspelled
                        # multiplicity, which is worth saying rather than
                        # letting it be "unexpected".
                        self.fail(
                            self.peek(),
                            "How many? `one`, `optional`, `many` or `at-least-one`, "
                            f"found {describe(self.peek())}.",
                            "expected-multiplicity",
                        )
                        self.next()
                    self.pending.append(
                        _PendingLink(
                            kind=kind,
                            from_=owner.id,
                            name=target.value,
                            multiplicity=multiplicity,
                            span=word.span.through(target.span),
                            target_span=target.span,
                        )
                    )
            else:
                self.fail(
                    self.peek(),
                    "Expected `id`, `attribute`, `contains`, `embeds` or `references`, "
                    f"found {describe(self.peek())}.",
                    "unexpected-in-body",
                )
                self.recover()

            if self.cursor == before:
                self.next()

    # -- the four rules that are the format ---------------------------------

    def _admits(self, link: _PendingLink, owner: Member, target) -> bool:
        """Whether a link is one this format is willing to draw, and why not
        when it is not.

        These rules are the format. Everything else is syntax.
        """
        is_aggregate = not hasattr(target, "kind")

        if link.kind == "contains":
            if is_aggregate:
                return self._refuse(
                    link,
                    f'"{target.name}" is an aggregate, and one aggregate never contains '
                    "another. What you can hold across a boundary is its identity - "
                    f'`references "{target.name}"`.',
                    "contains-an-aggregate",
                )
            if target.kind != "entity":
                what = "value object" if target.kind == "value" else "enumeration"
                return self._refuse(
                    link,
                    f'`contains` is for entities. "{target.name}" is a {what}, which has '
                    "no identity of its own and is `embeds`ed rather than owned.",
                    "contains-a-value",
                )
            if target.aggregate != owner.aggregate:
                return self._refuse(
                    link,
                    f'"{owner.name}" cannot contain "{target.name}": they are in '
                    "different aggregates. Composition inside one boundary is what "
                    "`contains` means - across a boundary you hold an identity and load "
                    "the other aggregate separately, which is the rule that makes a "
                    "boundary worth having.",
                    "contains-across-a-boundary",
                )
            return True

        if link.kind == "embeds":
            if is_aggregate:
                return self._refuse(
                    link,
                    f'"{target.name}" is an aggregate and cannot be embedded. Use '
                    "`references` and hold its identity.",
                    "embeds-an-aggregate",
                )
            if target.kind == "entity":
                return self._refuse(
                    link,
                    f'"{target.name}" is an entity, so it is `contains`ed rather than '
                    "embedded. Embedding is for things with no identity, which can be "
                    "copied freely because two of them with the same fields are the same "
                    "thing.",
                    "embeds-an-entity",
                )
            if target.aggregate is not None and target.aggregate != owner.aggregate:
                return self._refuse(
                    link,
                    f'"{target.name}" belongs to another aggregate. A value object used '
                    "in two places is declared at the top of the model rather than "
                    "inside one of them.",
                    "embeds-another-aggregates-value",
                )
            return True

        # references
        if not is_aggregate:
            return self._refuse(
                link,
                f'"{target.name}" is inside an aggregate, and you reference the '
                "aggregate rather than its parts. Reaching past a root is how a boundary "
                "stops being one - name the aggregate and let it protect its own "
                "insides.",
                "references-past-a-root",
            )
        if target.id == owner.aggregate:
            return self._refuse(
                link,
                f'"{owner.name}" already belongs to "{target.name}" - a member does not '
                "reference its own aggregate.",
                "references-own-aggregate",
            )
        return True

    def _refuse(self, link: _PendingLink, message: str, code: str) -> bool:
        report(self.problems, error_at(link.target_span, message, code))
        return False
