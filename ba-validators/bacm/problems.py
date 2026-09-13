"""
Positions and diagnostics.

The Python counterpart of `ba-cm/src/lib/ddd/problems.ts`, which both grammars
share on the TypeScript side too - it knows about spans, messages and
severities, and nothing about domains or aggregates.

## Three severities, where ba-cm has two

ba-cm's parser reports `error` and `warning`, and the distinction is the one
that decides whether the graph draws:

    error    the document does not parse, or parses into something
             self-contradictory. The graph shows the last good render.
    warning  it parses fine and is worth saying anyway - an unowned boundary,
             a relationship with no rationale, an aggregate with no invariant.

Both of those are reproduced here exactly, because they are the format's own
rules and a validator that disagreed with the tool would be worse than no
validator.

This module adds a third, `reading`, for the countable half of the doctrine
that ba-cm puts in `outline.ts` rather than in the problems panel: three `core`
subdomains, four relationships with no `because`, an aggregate holding more
than seven members. `outline.ts` is explicit that these are "stated as
findings, never as verdicts" - a map with three core subdomains may be right -
so they are neither errors nor warnings, and giving them a severity of their
own is what lets `--strict` mean "warnings too" without also meaning "and every
observation".

## A cap, and a deduplicating report

Both are ba-cm's. One malformed line can cascade, and fifty entries is already
more than anybody reads. A recovering parser can reach the same bad token by
two routes, and reporting it twice makes the panel look broken - so `report`
folds on position and text.

Unlike doc-hub's three boards there is **no fifty-first entry** saying the list
was truncated: ba-cm's `report` returns silently once saturated, and matching
that matters more than the nicety.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class Span:
    """Byte range in the source text, half-open.

    ba-cm's model carries these on every node because there the graph edits
    *text*: a gesture becomes a splice at a span. A validator never splices,
    and the spans are kept anyway - `end - start` is what makes an error caret
    the width of the thing it is pointing at, and reconstructing that later
    means re-lexing.
    """

    start: int = 0
    end: int = 0
    #: 1-based, for the problems panel.
    line: int = 1
    column: int = 1

    @property
    def length(self) -> int:
        return max(0, self.end - self.start)

    def through(self, other: "Span") -> "Span":
        """This span extended to the end of a later one.

        `serves "X"` and `attribute "a" : "T"` are each reported as one range
        covering the keyword and its arguments, which is what ba-cm does with
        its `{ ...span, end: other.end }` spread.
        """
        return Span(self.start, max(self.end, other.end), self.line, self.column)


NOWHERE = Span()


class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    READING = "reading"

    def __str__(self) -> str:  # pragma: no cover - display only
        return self.value


@dataclass(frozen=True)
class Problem:
    severity: Severity
    message: str
    line: int = 1
    column: int = 1
    #: Present when the problem points at a stretch of source worth selecting.
    span: Span | None = None
    #: A stable kebab-case identifier, so a finding can be grepped for, counted
    #: across a repository, or muted by a team that has decided it disagrees.
    #: ba-cm has no such field - its panel is read by a person looking at the
    #: document - and a validator run in CI needs one.
    code: str | None = None

    @property
    def is_error(self) -> bool:
        return self.severity is Severity.ERROR

    def format(self, path: str | None = None) -> str:
        where = f"{path}:" if path else ""
        head = f"{where}{self.line}:{self.column} {self.severity.value}: {self.message}"
        if self.code:
            head = f"{head} [{self.code}]"
        return head


#: A cap, matching ba-cm's. Past fifty the list stops being a list of problems
#: and becomes a wall of them.
MAX_PROBLEMS = 50


def is_saturated(problems: list[Problem]) -> bool:
    return len(problems) >= MAX_PROBLEMS


def report(problems: list[Problem], problem: Problem) -> None:
    """Append unless saturated or already said.

    Deduplicates on position and text, as ba-cm does: a recovering parser can
    reach the same bad token by two routes.
    """
    if is_saturated(problems):
        return
    for existing in problems:
        if (
            existing.line == problem.line
            and existing.column == problem.column
            and existing.message == problem.message
        ):
            return
    problems.append(problem)


def error_at(span: Span, message: str, code: str | None = None) -> Problem:
    return Problem(Severity.ERROR, message, span.line, span.column, span, code)


def warning_at(span: Span, message: str, code: str | None = None) -> Problem:
    return Problem(Severity.WARNING, message, span.line, span.column, span, code)


def reading_at(span: Span, message: str, code: str | None = None) -> Problem:
    return Problem(Severity.READING, message, span.line, span.column, span, code)


def count_by(problems: list[Problem], severity: Severity) -> int:
    return sum(1 for problem in problems if problem.severity is severity)


def has_errors(problems: list[Problem]) -> bool:
    return any(problem.severity is Severity.ERROR for problem in problems)


class LexError(Exception):
    """A lexical failure.

    **Raised rather than collected**, which is ba-cm's decision and worth
    keeping: a broken string literal makes every token after it meaningless,
    there is no useful recovery, and pretending otherwise produces a cascade of
    nonsense in the problems panel.

    Both parsers catch it, report it as the one error, and return an empty
    document - so the caller still has something to render.
    """

    def __init__(self, message: str, span: Span, code: str) -> None:
        super().__init__(message)
        self.message = message
        self.span = span
        self.code = code
