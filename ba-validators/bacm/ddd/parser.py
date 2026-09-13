"""
The `.ddd` parser.

Produces a `ContextMap` and a list of `Problem`s. It does not raise for a
recoverable error - ba-cm calls its parser on every keystroke-ish, and a parser
that gave up on the first bad token would report one problem at a time and make
a half-written file feel hostile.

The one exception is a lexical failure, which the lexer raises and this catches:
an unterminated string makes every token after it meaningless.

## Two passes, on purpose

Pass one builds nodes and collects relationships as *unresolved name pairs*.
Pass two resolves those names against the nodes and runs the semantic checks.

The split exists because a relationship may be written above the context it
names - the sample file puts the whole map after the whole domain - and a
single-pass parser would have to either forbid that or forward-declare.

## Which checks live here

Everything ba-cm's own parser reports, at the severity it reports it:

  errors    the syntax, a duplicate name, a `serves` naming nothing or naming a
            context, a relationship end that is not a context, a self-relation,
            an arrow contradicting its pattern, two patterns without a `->`.
  warnings  no `because`, no `owner`, no `language`, a generic subdomain
            declaring aggregates, a subdomain with no context, a second
            `intent` or `owner`.

The doctrine's countable half - three `core` subdomains, the aspiration check -
is not here. It is in `doctrine.py`, because ba-cm puts it in `outline.ts`
rather than in the problems panel, and that separation is the one this package
keeps.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from ..lexer import (
    ARROW,
    BIARROW,
    COLON,
    EOF,
    LBRACE,
    RBRACE,
    SLASH,
    STRING,
    WORD,
    Token,
    describe,
    tokenize,
)
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
    ContainmentEdge,
    ContextMap,
    ContextNode,
    DomainNode,
    Id,
    RelationshipEdge,
    SubdomainNode,
    SYMMETRY,
    is_classification,
    is_pattern,
    is_status,
)

#: The words that can start a fresh declaration, for recovery.
STARTERS: Final[frozenset[str]] = frozenset({"map", "domain", "subdomain", "context"})


@dataclass
class Result:
    document: ContextMap
    problems: list[Problem]
    #: False when an error means the document should not replace the last good
    #: one.
    ok: bool


@dataclass
class _PendingRelationship:
    """A relationship before its endpoint names have been resolved to nodes."""

    from_name: str
    from_span: Span
    to_name: str
    to_span: Span
    directed: bool
    arrow_span: Span
    pattern: tuple[str, ...]
    pattern_span: Span
    span: Span
    exchange: str | None = None
    because: str | None = None


@dataclass
class _PendingServes:
    """A context's `serves` name, resolved in pass two."""

    context_id: Id
    name: str
    span: Span


def parse(source: str) -> Result:
    """Read a context map, returning whatever could be read and every problem."""
    problems: list[Problem] = []

    try:
        tokens = tokenize(source)
    except LexError as error:
        report(problems, error_at(error.span, error.message, error.code))
        return Result(ContextMap(source=source), problems, False)

    reader = _MapReader(tokens, problems, source)
    document = reader.parse_file()
    return Result(document, problems, not has_errors(problems))


class _MapReader(Reader):
    starters = STARTERS
    # A quoted string at depth zero starts a relationship, so it is somewhere
    # recovery can stop.
    string_starts_declaration = True

    def __init__(self, tokens: list[Token], problems: list[Problem], source: str) -> None:
        super().__init__(tokens, problems)
        self.source = source
        self.nodes: list[DomainNode | SubdomainNode | ContextNode] = []
        self.edges: list[ContainmentEdge | RelationshipEdge] = []
        self.relationships: list[_PendingRelationship] = []
        self.serves: list[_PendingServes] = []

    # -- the file -----------------------------------------------------------

    def parse_file(self) -> ContextMap:
        map_word = self.peek()
        if not self.check(WORD, "map"):
            self.fail(
                map_word,
                f'A file starts with `map "..."`, found {describe(map_word)}.',
                "expected-map",
            )
            return ContextMap(source=self.source)
        self.next()

        title_token = self.expect(STRING, "a quoted map title", "expected-title")
        title = title_token.value if title_token else "Untitled map"
        title_span = title_token.span if title_token else map_word.span

        # The map's own braces are required, where every body inside it is
        # optional: a file whose block never opened has nothing in it and is
        # almost always a truncated paste rather than an empty map.
        if self.expect(LBRACE, "`{` after the map title", "expected-brace"):
            while not self.check(RBRACE) and not self.check(EOF):
                before = self.cursor
                if self.check(WORD, "domain"):
                    self.parse_domain()
                elif self.check(STRING):
                    self.parse_relationship()
                else:
                    self.fail(
                        self.peek(),
                        "Expected `domain` or a relationship starting with a quoted "
                        f"context name, found {describe(self.peek())}.",
                        "unexpected-in-body",
                    )
                    self.recover()
                # A recovery that consumed nothing would spin forever.
                if self.cursor == before:
                    self.next()
            self.expect(RBRACE, "`}` closing the map", "unclosed-block")

        self.resolve()
        return ContextMap(
            title=title,
            title_span=title_span,
            nodes=self.nodes,
            edges=self.edges,
            source=self.source,
        )

    # -- pass two -----------------------------------------------------------

    def resolve(self) -> None:
        by_name: dict[str, DomainNode | SubdomainNode | ContextNode] = {}
        for node in self.nodes:
            existing = by_name.get(node.name)
            if existing is not None:
                report(
                    self.problems,
                    error_at(
                        node.name_span,
                        f'Duplicate name "{node.name}" - already declared as a '
                        f"{existing.kind} on line {existing.name_span.line}. The name "
                        "is the identity, so two nodes may not share one.",
                        "duplicate-name",
                    ),
                )
                continue
            by_name[node.name] = node

        self.resolve_serves(by_name)
        self.resolve_relationships(by_name)
        self.whole_document_warnings()

    def resolve_serves(self, by_name: dict) -> None:
        for pending in self.serves:
            target = by_name.get(pending.name)
            if target is None:
                report(
                    self.problems,
                    error_at(
                        pending.span,
                        f'`serves` names "{pending.name}", which is not declared.',
                        "unknown-serves",
                    ),
                )
                continue
            if target.kind == "context":
                report(
                    self.problems,
                    error_at(
                        pending.span,
                        "A context serves a subdomain or a domain, not another context. "
                        f'"{pending.name}" is a context.',
                        "serves-a-context",
                    ),
                )
                continue
            context = next(
                (node for node in self.nodes if node.id == pending.context_id), None
            )
            if (
                context is not None
                and context.kind == "context"
                and target.id not in context.serves
            ):
                context.serves.append(target.id)
                self.edges.append(
                    ContainmentEdge(
                        id=f"contain:{context.id}->{target.id}",
                        from_=context.id,
                        to=target.id,
                        implied=False,
                        span=pending.span,
                    )
                )

    def resolve_relationships(self, by_name: dict) -> None:
        for pending in self.relationships:
            upstream = by_name.get(pending.from_name)
            downstream = by_name.get(pending.to_name)

            if upstream is None:
                report(
                    self.problems,
                    error_at(
                        pending.from_span,
                        f'No context named "{pending.from_name}" is declared.',
                        "unknown-context",
                    ),
                )
            if downstream is None:
                report(
                    self.problems,
                    error_at(
                        pending.to_span,
                        f'No context named "{pending.to_name}" is declared.',
                        "unknown-context",
                    ),
                )
            if upstream is None or downstream is None:
                continue

            if upstream.kind != "context" or downstream.kind != "context":
                offender = upstream if upstream.kind != "context" else downstream
                report(
                    self.problems,
                    error_at(
                        pending.from_span if offender is upstream else pending.to_span,
                        "Relationships run between bounded contexts. "
                        f'"{offender.name}" is a {offender.kind}; a context\'s place in '
                        "the business is expressed by nesting or `serves`.",
                        "relationship-end-not-a-context",
                    ),
                )
                continue

            if upstream.id == downstream.id:
                report(
                    self.problems,
                    error_at(
                        pending.span,
                        "A context cannot relate to itself.",
                        "self-relationship",
                    ),
                )
                continue

            # The pairing check: an arrow asserts an upstream that a mutual
            # pattern denies, and a mutual arrow denies one that a directed
            # pattern needs.
            #
            # Skipped when the dual-pattern check below has something to say,
            # because `<->` with two roles is one mistake and reporting it
            # three times reads as three.
            dual_on_mutual = len(pending.pattern) == 2 and not pending.directed
            for pattern in () if dual_on_mutual else pending.pattern:
                shape = SYMMETRY[pattern]
                if shape == "mutual" and pending.directed:
                    report(
                        self.problems,
                        error_at(
                            pending.arrow_span,
                            f"`{pattern}` is mutual - neither side is upstream - so it "
                            "is written with `<->` rather than `->`.",
                            "mutual-pattern-with-arrow",
                        ),
                    )
                if shape == "directed" and not pending.directed:
                    report(
                        self.problems,
                        error_at(
                            pending.arrow_span,
                            f"`{pattern}` has a direction: one side's model is the one "
                            "the other accommodates. Write it with `->`, upstream first.",
                            "directed-pattern-without-arrow",
                        ),
                    )

            if dual_on_mutual:
                report(
                    self.problems,
                    error_at(
                        pending.pattern_span,
                        "Two patterns describe an upstream role and a downstream one, "
                        "which needs `->` to say which end is which.",
                        "dual-pattern-without-arrow",
                    ),
                )

            self.edges.append(
                RelationshipEdge(
                    id=f"rel:{upstream.id}->{downstream.id}:{pending.pattern_span.start}",
                    from_=upstream.id,
                    to=downstream.id,
                    directed=pending.directed,
                    pattern=pending.pattern,
                    pattern_span=pending.pattern_span,
                    exchange=pending.exchange,
                    because=pending.because,
                    span=pending.span,
                )
            )

            if not pending.because:
                report(
                    self.problems,
                    warning_at(
                        pending.span,
                        f"No `because` on {upstream.name} -> {downstream.name}. The "
                        "rationale is the field that keeps a map honest - it is where "
                        '"the vendor will not change for us" gets written down instead '
                        "of being dressed up.",
                        "no-because",
                    ),
                )

    def whole_document_warnings(self) -> None:
        for node in self.nodes:
            if not node.owner:
                report(
                    self.problems,
                    warning_at(
                        node.name_span,
                        f'"{node.name}" has no owner. An unowned boundary is a '
                        "suggestion, and suggestions lose to deadlines.",
                        "no-owner",
                    ),
                )

            if node.kind == "context":
                if not node.serves:
                    report(
                        self.problems,
                        warning_at(
                            node.name_span,
                            f'"{node.name}" serves no part of the business - it is in '
                            "the file and in no subdomain.",
                            "serves-nothing",
                        ),
                    )
                if not node.language:
                    report(
                        self.problems,
                        warning_at(
                            node.name_span,
                            f'"{node.name}" declares no language. The terms that mean '
                            "something here and not next door are what give a boundary "
                            "its edge.",
                            "no-language",
                        ),
                    )
                parents = [
                    parent
                    for parent in (
                        next((n for n in self.nodes if n.id == id_), None)
                        for id_ in node.serves
                    )
                    if parent is not None and parent.kind == "subdomain"
                ]
                if (
                    node.aggregates
                    and parents
                    and all(parent.classification == "generic" for parent in parents)
                ):
                    report(
                        self.problems,
                        warning_at(
                            node.name_span,
                            f'"{node.name}" is in a generic subdomain and declares '
                            "aggregates. Modelling a bought package is core-domain "
                            "effort spent on somebody else's solved problem - either "
                            "the classification is wrong or the aggregates are.",
                            "generic-with-aggregates",
                        ),
                    )

            if node.kind == "subdomain":
                has_context = any(
                    candidate.kind == "context" and node.id in candidate.serves
                    for candidate in self.nodes
                )
                if not has_context:
                    report(
                        self.problems,
                        warning_at(
                            node.name_span,
                            f'"{node.name}" has no bounded context. Either it is served '
                            "invisibly inside something else, or it is genuinely "
                            "manual - both are worth knowing.",
                            "subdomain-without-context",
                        ),
                    )

    # -- productions --------------------------------------------------------

    def parse_domain(self) -> None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted domain name", "expected-name")
        if name_token is None:
            self.skip_declaration()
            return

        domain = DomainNode(
            name=name_token.value,
            id=f"domain:{name_token.value}",
            span=keyword.span,
            name_span=name_token.span,
        )
        self.nodes.append(domain)

        # Every body inside the map is optional. `domain "X"` with no braces is
        # a legal domain nobody has said anything about yet.
        if self.accept(LBRACE) is None:
            return

        def item() -> bool:
            if self.check(WORD, "intent"):
                self.assign(domain, "intent")
            elif self.check(WORD, "owner"):
                self.assign(domain, "owner")
            elif self.check(WORD, "subdomain"):
                self.parse_subdomain(domain.id)
            elif self.check(WORD, "context"):
                self.parse_context(domain.id)
            else:
                return False
            return True

        self.block(
            item,
            "`intent`, `owner`, `subdomain` or `context`",
            "`}` closing the domain",
        )

    def parse_subdomain(self, parent: Id) -> None:
        keyword = self.next()

        class_token = self.peek()
        if class_token.type != WORD or not is_classification(class_token.value):
            self.fail(
                class_token,
                "A subdomain is classified `core`, `supporting` or `generic` - the "
                "classification is a budget, not a label - found "
                f"{describe(class_token)}.",
                "expected-classification",
            )
            self.skip_declaration()
            return
        self.next()

        name_token = self.expect(STRING, "a quoted subdomain name", "expected-name")
        if name_token is None:
            self.skip_declaration()
            return

        subdomain = SubdomainNode(
            name=name_token.value,
            id=f"subdomain:{name_token.value}",
            classification=class_token.value,
            classification_span=class_token.span,
            parent=parent,
            span=keyword.span,
            name_span=name_token.span,
        )
        self.nodes.append(subdomain)
        self.edges.append(
            ContainmentEdge(
                id=f"contain:{subdomain.id}->{parent}",
                from_=subdomain.id,
                to=parent,
                implied=True,
            )
        )

        if self.accept(LBRACE) is None:
            return

        def item() -> bool:
            if self.check(WORD, "intent"):
                self.assign(subdomain, "intent")
            elif self.check(WORD, "owner"):
                self.assign(subdomain, "owner")
            elif self.check(WORD, "context"):
                self.parse_context(subdomain.id)
            else:
                return False
            return True

        self.block(item, "`intent`, `owner` or `context`", "`}` closing the subdomain")

    def parse_context(self, parent: Id) -> None:
        keyword = self.next()
        name_token = self.expect(STRING, "a quoted context name", "expected-name")
        if name_token is None:
            self.skip_declaration()
            return

        context = ContextNode(
            name=name_token.value,
            id=f"context:{name_token.value}",
            # Nesting is containment, and it is the only way a context is
            # attached. `serves` is *additional*: it exists for the straddle.
            serves=[parent],
            span=keyword.span,
            name_span=name_token.span,
        )
        self.nodes.append(context)
        self.edges.append(
            ContainmentEdge(
                id=f"contain:{context.id}->{parent}",
                from_=context.id,
                to=parent,
                implied=True,
            )
        )

        if self.accept(LBRACE) is None:
            return

        def item() -> bool:
            if self.check(WORD, "intent"):
                self.assign(context, "intent")
            elif self.check(WORD, "owner"):
                self.assign(context, "owner")
            elif self.check(WORD, "language"):
                self.collect(context.language, "language")
            elif self.check(WORD, "aggregate"):
                self.collect(context.aggregates, "aggregate")
            elif self.check(WORD, "status"):
                self.next()
                value = self.peek()
                if value.type == WORD and is_status(value.value):
                    self.next()
                    context.status = value.value
                else:
                    self.fail(
                        value,
                        "`status` is `modelled`, `drafted` or `unmodelled`, found "
                        f"{describe(value)}.",
                        "expected-status",
                    )
                    self.recover()
            elif self.check(WORD, "serves"):
                serves_word = self.next()
                target = self.expect(
                    STRING, "a quoted subdomain or domain name", "expected-name"
                )
                if target is not None:
                    self.serves.append(
                        _PendingServes(
                            context_id=context.id,
                            name=target.value,
                            span=serves_word.span.through(target.span),
                        )
                    )
            else:
                return False
            return True

        self.block(
            item,
            "`intent`, `owner`, `language`, `aggregate`, `status` or `serves`",
            "`}` closing the context",
        )

    def parse_relationship(self) -> None:
        from_token = self.next()

        arrow_token = self.peek()
        if arrow_token.type == ARROW:
            directed = True
        elif arrow_token.type == BIARROW:
            directed = False
        else:
            self.fail(
                arrow_token,
                f'Expected `->` or `<->` after "{from_token.value}", found '
                f"{describe(arrow_token)}. Direction is about the model: upstream is "
                "whoever's model the other has to accommodate.",
                "expected-arrow",
            )
            self.recover()
            return
        self.next()

        to_token = self.expect(STRING, "a quoted context name", "expected-name")
        if to_token is None:
            self.recover()
            return

        if self.expect(COLON, "`:` before the pattern", "expected-colon") is None:
            self.recover()
            return

        first = self.read_pattern()
        if first is None:
            self.recover()
            return

        pattern: tuple[str, ...] = (first[0],)
        pattern_span = first[1]

        # A pattern may be a pair when the two ends play different roles. That
        # is one relationship with two named positions, not two relationships.
        if self.accept(SLASH) is not None:
            second = self.read_pattern()
            if second is not None:
                pattern = (first[0], second[0])
                pattern_span = pattern_span.through(second[1])

        exchange: str | None = None
        because: str | None = None
        end = pattern_span.end

        if self.accept(LBRACE) is not None:
            while not self.check(RBRACE) and not self.check(EOF):
                before = self.cursor
                if self.check(WORD, "exchange"):
                    self.next()
                    found = self.expect(
                        STRING,
                        "a quoted description of what crosses",
                        "expected-exchange",
                    )
                    exchange = found.value if found else exchange
                elif self.check(WORD, "because"):
                    self.next()
                    found = self.expect(STRING, "a quoted rationale", "expected-because")
                    because = found.value if found else because
                else:
                    self.fail(
                        self.peek(),
                        f"Expected `exchange` or `because`, found {describe(self.peek())}.",
                        "unexpected-in-body",
                    )
                    self.recover()
                if self.cursor == before:
                    self.next()
            close = self.expect(
                RBRACE, "`}` closing the relationship", "unclosed-block"
            )
            if close is not None:
                end = close.span.end

        self.relationships.append(
            _PendingRelationship(
                from_name=from_token.value,
                from_span=from_token.span,
                to_name=to_token.value,
                to_span=to_token.span,
                directed=directed,
                arrow_span=arrow_token.span,
                pattern=pattern,
                pattern_span=pattern_span,
                exchange=exchange,
                because=because,
                span=Span(
                    from_token.span.start,
                    end,
                    from_token.span.line,
                    from_token.span.column,
                ),
            )
        )

    def read_pattern(self) -> tuple[str, Span] | None:
        token = self.peek()
        if token.type != WORD or not is_pattern(token.value):
            self.fail(
                token,
                "Expected one of the nine strategic patterns, found "
                f"{describe(token)}. The names are Evans's and are used exactly, "
                "because several describe the same arrow and differ only in who has "
                "the leverage.",
                "expected-pattern",
            )
            return None
        self.next()
        return token.value, token.span

    def assign(self, node, field: str) -> None:
        """`intent "..."` / `owner "..."` - at most one, last wins with a warning."""
        keyword = self.next()
        value = self.expect(STRING, f"a quoted {field}", f"expected-{field}")
        if value is None:
            return
        if getattr(node, field) is not None:
            self.warn(
                keyword.span,
                f'Second `{field}` on "{node.name}" - the later one wins.',
                f"second-{field}",
            )
        setattr(node, field, value.value)

    def collect(self, into: list[str], keyword: str) -> None:
        """`language "a" "b" "c"` - one or more strings, appended.

        Either may be written more than once; the names accumulate.
        """
        self.next()
        if not self.check(STRING):
            self.fail(
                self.peek(),
                f"`{keyword}` takes one or more quoted terms, found "
                f"{describe(self.peek())}.",
                f"expected-{keyword}",
            )
            self.recover()
            return
        while self.check(STRING):
            into.append(self.next().value)
