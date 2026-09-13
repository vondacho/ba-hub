"""
The tokenizer `.ddd` and `.ddm` share.

One scanner for both, which is ba-cm's own arrangement: `ddm/parser.ts` imports
the map's lexer and says why - "they are not `.ddd`'s, they are this family's:
braces, quoted strings that may span lines, bare hyphenated words and `//`
comments describe both languages exactly. Sharing them is what keeps a `.ddm`
file feeling like a `.ddd` file to type."

What is *not* shared is the checking, because that is the whole point of having
a second language.

## Differences from doc-hub's scanner, all deliberate

Both families are brace-delimited with quoted names and `//` comments, and
there the resemblance stops:

  - **This one raises.** doc-hub's collects every lexical problem and carries
    on. Here an unterminated string aborts the scan, because there is no useful
    recovery from one and the alternative is a cascade.
  - **Punctuation, not sigils.** `{ } : /` plus `->` and `<->`, matched longest
    first. No `@ # ~ +`.
  - **A word may not start with a digit.** doc-hub allows it so `#42` is one
    token; nothing here is numeric, and `open-host-service` needs the hyphen to
    be a word character rather than three tokens and two subtractions.
  - **Strings span lines.** A continuation is joined to the line above with a
    single space after its indentation is stripped, which is what lets `intent`
    and `because` hold a paragraph without the file growing 300-column lines.
    doc-hub's strings end at a bare newline and splice only on a trailing
    backslash.
  - **Two escapes, and a lone backslash is a backslash.** `\\"` and `\\\\` and
    nothing else, deliberately: inventing more would mean a Windows path in a
    note needed doubling.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from .problems import LexError, Span

TokenType = str

#: A bare word: keyword, classification, pattern, status, multiplicity.
WORD: Final[TokenType] = "word"
#: A quoted string, already unescaped and line-joined.
STRING: Final[TokenType] = "string"
LBRACE: Final[TokenType] = "{"
RBRACE: Final[TokenType] = "}"
COLON: Final[TokenType] = ":"
SLASH: Final[TokenType] = "/"
#: `->`
ARROW: Final[TokenType] = "arrow"
#: `<->`
BIARROW: Final[TokenType] = "biarrow"
EOF: Final[TokenType] = "eof"

_PUNCT: Final[dict[str, TokenType]] = {
    "{": LBRACE,
    "}": RBRACE,
    ":": COLON,
    "/": SLASH,
}

_WORD_START = re.compile(r"[A-Za-z_]")
# Hyphens are word characters so `open-host-service` and `big-ball-of-mud` lex
# as one token rather than three and two subtractions.
_WORD_PART = re.compile(r"[A-Za-z0-9_-]")


@dataclass(frozen=True)
class Token:
    type: TokenType
    #: For `word` and `string`, the value. Empty for punctuation.
    value: str
    span: Span


def tokenize(source: str) -> list[Token]:
    """Scan `source` into tokens, ending with `eof`.

    Raises `LexError` on an unexpected character or an unterminated string.
    """
    tokens: list[Token] = []
    index = 0
    line = 1
    column = 1
    size = len(source)

    def at(offset: int = 0) -> str:
        position = index + offset
        return source[position] if 0 <= position < size else ""

    def advance(count: int = 1) -> None:
        nonlocal index, line, column
        for _ in range(count):
            if index < size and source[index] == "\n":
                line += 1
                column = 1
            else:
                column += 1
            index += 1

    def span_from(start: int, start_line: int, start_column: int) -> Span:
        return Span(start, index, start_line, start_column)

    def read_string(start: int, start_line: int, start_column: int) -> Token:
        """A double-quoted literal, which may span lines.

        Continuation lines are joined with a single space after leading
        whitespace is stripped. `\\"` and `\\\\` escape; nothing else does.
        """
        advance()  # opening quote

        parts: list[str] = []
        current: list[str] = []
        saw_newline = False

        while True:
            if index >= size:
                raise LexError(
                    "Unterminated string - no closing quote.",
                    span_from(start, start_line, start_column),
                    "unterminated-string",
                )

            char = at()

            if char == "\\":
                following = at(1)
                if following in ('"', "\\"):
                    current.append(following)
                    advance(2)
                    continue
                # A lone backslash is a backslash.
                current.append(char)
                advance()
                continue

            if char == '"':
                advance()
                break

            if char == "\n":
                parts.append("".join(current).rstrip())
                current = []
                saw_newline = True
                advance()
                # Leading whitespace on the continuation line is indentation,
                # not content.
                while index < size and at() in " \t":
                    advance()
                continue

            current.append(char)
            advance()

        parts.append("".join(current))
        value = (
            " ".join(part for part in parts if part)
            if saw_newline
            else "".join(parts)
        )
        return Token(STRING, value, span_from(start, start_line, start_column))

    while index < size:
        char = source[index]

        if char in " \t\r\n":
            advance()
            continue

        # `//` line comment. Not emitted as a token: comments survive because
        # the graph splices the source rather than re-serialising a model, so
        # nothing downstream ever needs to know they were there.
        if char == "/" and at(1) == "/":
            while index < size and at() != "\n":
                advance()
            continue

        start, start_line, start_column = index, line, column

        # `<->` before `->` before `/`, longest match first.
        if char == "<" and at(1) == "-" and at(2) == ">":
            advance(3)
            tokens.append(Token(BIARROW, "<->", span_from(start, start_line, start_column)))
            continue

        if char == "-" and at(1) == ">":
            advance(2)
            tokens.append(Token(ARROW, "->", span_from(start, start_line, start_column)))
            continue

        punct = _PUNCT.get(char)
        if punct is not None:
            advance()
            tokens.append(Token(punct, char, span_from(start, start_line, start_column)))
            continue

        if char == '"':
            tokens.append(read_string(start, start_line, start_column))
            continue

        if _WORD_START.match(char):
            while index < size and _WORD_PART.match(at()):
                advance()
            tokens.append(
                Token(
                    WORD,
                    source[start:index],
                    span_from(start, start_line, start_column),
                )
            )
            continue

        advance()
        raise LexError(
            f"Unexpected character {char!r}.",
            span_from(start, start_line, start_column),
            "unexpected-character",
        )

    tokens.append(Token(EOF, "", Span(index, index, line, column)))
    return tokens


def describe(token: Token) -> str:
    """How a token is named in an expected-vs-found message.

    `.ddd` quotes a string bare and `.ddm` prefixes it with "the string"; the
    difference is not load-bearing and this is the map's spelling.
    """
    if token.type == EOF:
        return "the end of the file"
    if token.type == STRING:
        return f'"{token.value}"'
    return f"`{token.value}`"
