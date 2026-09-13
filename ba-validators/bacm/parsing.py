"""
The recursive-descent scaffolding both parsers share.

`ddd/parser.ts` and `ddm/parser.ts` are the same shape and say so: "recursive
descent, one pass to declare and a second to resolve names, recovery that
reports one problem per mistake rather than a cascade, and a document that
comes back even when it failed so the panel has something to say."

The cursor, the `expect`/`accept` pair and the two recovery strategies are
identical between them, so they live here once. Everything domain-specific -
what may appear inside an aggregate, whether a pattern is mutual - stays in the
parser it belongs to.
"""

from __future__ import annotations

from typing import Callable, Iterable

from .lexer import EOF, LBRACE, RBRACE, STRING, WORD, Token, TokenType, describe
from .problems import Problem, Span, error_at, report, warning_at


class Reader:
    """A cursor over the token list, plus the recovery policy."""

    #: Words that can start a fresh declaration. Set by each parser; `recover`
    #: stops at one.
    starters: frozenset[str] = frozenset()
    #: True when a quoted string at brace depth zero can start a declaration.
    #: It can in a `.ddd` - that is how a relationship begins - and cannot in a
    #: `.ddm`.
    string_starts_declaration: bool = False

    def __init__(self, tokens: list[Token], problems: list[Problem]) -> None:
        self.tokens = tokens
        self.problems = problems
        self.cursor = 0

    # -- the cursor ---------------------------------------------------------

    def peek(self, offset: int = 0) -> Token:
        return self.tokens[min(self.cursor + offset, len(self.tokens) - 1)]

    def next(self) -> Token:
        token = self.tokens[min(self.cursor, len(self.tokens) - 1)]
        self.cursor += 1
        return token

    def check(self, type_: TokenType, value: str | None = None) -> bool:
        token = self.peek()
        return token.type == type_ and (value is None or token.value == value)

    def accept(self, type_: TokenType, value: str | None = None) -> Token | None:
        return self.next() if self.check(type_, value) else None

    def at_word(self, *values: str) -> bool:
        token = self.peek()
        return token.type == WORD and token.value in values

    # -- reporting ----------------------------------------------------------

    def fail(self, token: Token, message: str, code: str | None = None) -> None:
        report(self.problems, error_at(token.span, message, code))

    def warn(self, span: Span, message: str, code: str | None = None) -> None:
        report(self.problems, warning_at(span, message, code))

    def expect(self, type_: TokenType, what: str, code: str = "expected") -> Token | None:
        if self.check(type_):
            return self.next()
        self.fail(
            self.peek(),
            f"Expected {what}, found {describe(self.peek())}.",
            code,
        )
        return None

    # -- recovery -----------------------------------------------------------

    def recover(self) -> None:
        """Skip to the next token that could start a fresh declaration.

        Without this a single bad token turns into one problem per token to the
        end of the file, and the panel stops being a list of problems and
        becomes a wall of them.
        """
        depth = 0
        while not self.check(EOF):
            token = self.peek()
            if token.type == LBRACE:
                depth += 1
            elif token.type == RBRACE:
                if depth == 0:
                    return
                depth -= 1
            elif depth == 0 and (
                (self.string_starts_declaration and token.type == STRING)
                or (token.type == WORD and token.value in self.starters)
            ):
                return
            self.next()

    def skip_declaration(self) -> None:
        """Abandon the declaration being parsed.

        Swallow its name if it has one and its balanced block if it has one, so
        the enclosing loop resumes at the next sibling rather than at the
        wreckage. Without this, one bad `subdomain wrong "..."` reports three
        errors - the classification, then the name as an unexpected token, then
        the `{` - and a cascade like that buries the one problem the author can
        act on.
        """
        while not self.check(LBRACE) and not self.check(RBRACE) and not self.check(EOF):
            token = self.peek()
            if token.type == WORD and token.value in self.starters:
                return
            self.next()
        if self.accept(LBRACE) is None:
            return
        depth = 1
        while depth > 0 and not self.check(EOF):
            token = self.next()
            if token.type == LBRACE:
                depth += 1
            elif token.type == RBRACE:
                depth -= 1

    # -- the block loop -----------------------------------------------------

    def block(self, item: Callable[[], bool], expected: str, closing: str) -> None:
        """The body of a braced declaration, assuming `{` is already consumed.

        `item` returns True when it handled the current token. Anything else is
        one reported problem and a recovery - and a recovery that consumed
        nothing would spin forever, so the cursor is checked for progress.
        """
        while not self.check(RBRACE) and not self.check(EOF):
            before = self.cursor
            if not item():
                self.fail(
                    self.peek(),
                    f"Expected {expected}, found {describe(self.peek())}.",
                    "unexpected-in-body",
                )
                self.recover()
            if self.cursor == before:
                self.next()
        self.expect(RBRACE, closing, "unclosed-block")


def quoted(names: Iterable[str]) -> str:
    return ", ".join(f'"{name}"' for name in names)


def listed(names: list[str]) -> str:
    """`a`, `a and b`, `a, b and c` - a list a person reads rather than a JSON
    array. `outline.ts`'s own helper."""
    if len(names) <= 1:
        return names[0] if names else ""
    return f"{', '.join(names[:-1])} and {names[-1]}"


def backticked(names: Iterable[str]) -> str:
    return ", ".join(f"`{name}`" for name in names)
