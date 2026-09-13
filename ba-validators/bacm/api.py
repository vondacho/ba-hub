"""
One entry point for all four kinds of file, and for a bundle of them.

Validating one document is the same three steps every time: read the file,
parse it collecting problems rather than raising, then read the doctrine over
whatever came back. This module is those three steps, once, with the format as a
parameter.

**The doctrine runs on a file that did not parse cleanly**, which is
deliberate. Both parsers recover - that is what `recover` and `skipDeclaration`
are for - so a map with two typos in it still has domains worth counting, and
reporting the syntax and the reading in one pass is what makes the validator
worth running at all. The only case the doctrine is skipped is a document that
produced nothing to read, which is what a lexical failure returns.

## Two guards that are this package's and not ba-cm's

ba-cm's lexer has no size limit and no NUL check: its input arrives through its
own editor and its own file picker, already known to be text. A validator is
pointed at whatever is on disk, and a JPEG scanned byte by byte produces fifty
"unexpected character" problems after a long pause. So `validate_file` refuses
a file with a NUL byte or over 2 MiB **before** the lexer sees it - the same
two guards doc-hub's scanner has, moved out to the file boundary so the lexer
itself stays faithful.

A leading byte-order mark is the third case and is handled differently, because
here it is a real difference in behaviour rather than a guard: ba-cm's lexer
would report it as an unexpected character. It is stripped so the rest of the
file can be read, and a warning says so - a BOM is invisible in every editor,
and a validator that silently accepted what the tool refuses would be lying
about whether the file opens.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Literal

from . import bundle as bundle_checks
from . import view as view_module
from .ddd import doctrine as ddd_doctrine
from .ddd import parser as ddd_parser
from .ddd.model import ContextMap
from .ddm import doctrine as ddm_doctrine
from .ddm import parser as ddm_parser
from .ddm.model import DomainModel
from .problems import Problem, Severity, Span, reading_at, warning_at
from .prose import count, quoted

Format = Literal["ddd", "ddm", "dddview", "ddmview"]

FORMATS: Final[tuple[Format, ...]] = ("ddd", "ddm", "dddview", "ddmview")

#: The four kinds of file that belong in one of these archives.
_EXTENSION: Final[dict[str, Format]] = {
    ".ddd": "ddd",
    ".ddm": "ddm",
    ".dddview": "dddview",
    ".ddmview": "ddmview",
}

NOUN: Final[dict[str, str]] = {
    "ddd": "context map",
    "ddm": "domain model",
    "dddview": "map view",
    "ddmview": "model view",
}

#: Refuse anything larger before scanning a character of it. See the module
#: docstring - this guard is the validator's, not the format's.
MAX_SOURCE_BYTES: Final[int] = 2 * 1024 * 1024

_HINTS: Final[dict[str, str]] = {
    **ddd_doctrine.hints(),
    **ddm_doctrine.hints(),
    **view_module.hints(),
    **bundle_checks.hints(),
}


def hint_for(code: str | None) -> str | None:
    """The doctrine's own words behind a reading, if there are any.

    Errors and warnings carry their argument in the message, because that is
    what ba-cm's problems panel shows. Readings carry a short message and keep
    the argument here, so a list of twelve of them stays a list.
    """
    return _HINTS.get(code) if code else None


@dataclass
class Result:
    """What a validation found, with the three severities kept apart."""

    format: Format
    #: The parsed document: a `ContextMap`, a `DomainModel`, a `View`, or None
    #: when there was nothing readable at all.
    document: object | None = None
    path: str | None = None
    #: Grammar findings: errors and the parser's own warnings.
    problems: list[Problem] = field(default_factory=list)
    #: Doctrine findings. Never errors.
    readings: list[Problem] = field(default_factory=list)

    @property
    def noun(self) -> str:
        return NOUN[self.format]

    @property
    def findings(self) -> list[Problem]:
        """Everything, worst first, then in file order."""
        rank = {Severity.ERROR: 0, Severity.WARNING: 1, Severity.READING: 2}
        return sorted(
            [*self.problems, *self.readings],
            key=lambda finding: (rank[finding.severity], finding.line, finding.column),
        )

    @property
    def errors(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.ERROR]

    @property
    def warnings(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.WARNING]

    @property
    def infos(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.READING]

    @property
    def parses(self) -> bool:
        """ba-cm's `ok`: the document may replace the last good one."""
        return not self.errors

    def ok(self, *, strict: bool = False) -> bool:
        """Whether this file passes.

        `strict` is what makes a warning fail a build, and it is opt-in for the
        reason ba-cm gives about its own panel: "Warnings never block a render.
        A map that has to be perfect before it draws is a map nobody starts."
        A team that has read the warning and decided to ship is making a call
        this package is not entitled to overrule.
        """
        return self.parses and (not strict or not self.warnings)

    def summary(self) -> str:
        from .prose import count

        where = f"{self.path}: " if self.path else ""
        if not self.parses:
            return (
                f"{where}{count(len(self.errors), 'error')} - "
                f"this {self.noun} does not parse."
            )
        return (
            f"{where}parses. {count(len(self.warnings), 'warning')}, "
            f"{count(len(self.infos), 'reading')}."
        )


def detect_format(path: str | Path, source: str | None = None) -> Format | None:
    """Which of the four this file is.

    The extension first, because filenames are the storage keys in ba-cm and
    the basename of a file *is* where it goes. Failing that, the first
    meaningful line: a `.txt` somebody renamed still says `map "..."` or
    `context "..."`, and refusing to read it over a file name would be
    pedantry.
    """
    suffix = Path(path).suffix.lower()
    if suffix in _EXTENSION:
        return _EXTENSION[suffix]
    if source is None:
        return None
    stripped = source.lstrip("﻿").lstrip()
    if stripped.startswith("{"):
        # Both sidecars are JSON objects; the format field says which, and
        # `validate_view` is what reads it. Guess the map's and let the format
        # check correct it.
        return "ddmview" if '"ba-cm-model-view"' in source else "dddview"
    for line in source.splitlines():
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        if line.startswith("map"):
            return "ddd"
        if line.startswith("context") or line.startswith("model"):
            return "ddm"
        return None
    return None


def validate(
    source: str,
    fmt: Format,
    *,
    path: str | None = None,
    owner: str | None = None,
) -> Result:
    """Parse `source` as `fmt`, then read the doctrine over it.

    `owner` is only meaningful for a sidecar: the title of the map, or the name
    of the context, the arrangement should belong to.
    """
    if fmt not in FORMATS:
        raise ValueError(f"Unknown format {fmt!r}. One of: {', '.join(FORMATS)}.")

    if fmt == "ddd":
        parsed = ddd_parser.parse(source)
        readings = ddd_doctrine.read(parsed.document) if parsed.document.nodes or parsed.ok else []
        return Result("ddd", parsed.document, path, list(parsed.problems), readings)

    if fmt == "ddm":
        model = ddm_parser.parse(source)
        readings = (
            ddm_doctrine.read(model.document)
            if model.document.aggregates or model.document.members or model.ok
            else []
        )
        return Result("ddm", model.document, path, list(model.problems), readings)

    checked = view_module.validate_view(source, model=fmt == "ddmview", owner=owner)
    problems = [p for p in checked.problems if p.severity is not Severity.READING]
    readings = [p for p in checked.problems if p.severity is Severity.READING]
    return Result(fmt, checked.view, path, problems, readings)


def validate_file(
    path: str | Path,
    fmt: Format | None = None,
    *,
    owner: str | None = None,
) -> Result:
    """Read a file and validate it, detecting the format from its name."""
    location = Path(path)
    try:
        raw = location.read_bytes()
    except OSError as error:
        return _refused("ddd", location, f"Cannot read this file: {error.strerror}.", "unreadable")

    if b"\x00" in raw:
        return _refused(
            fmt or "ddd",
            location,
            "This does not look like a text file.",
            "not-text",
        )
    if len(raw) > MAX_SOURCE_BYTES:
        return _refused(
            fmt or "ddd",
            location,
            f"The file is larger than {MAX_SOURCE_BYTES // 1024 // 1024} MiB.",
            "too-large",
        )

    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError:
        return _refused(
            fmt or "ddd", location, "This file is not UTF-8 text.", "not-utf8"
        )

    preamble: list[Problem] = []
    if source.startswith("﻿"):
        source = source[1:]
        preamble.append(
            warning_at(
                Span(0, 1, 1, 1),
                "This file starts with a byte-order mark. ba-cm's lexer reports it as "
                "an unexpected character, so the document will not open until it is "
                "removed - it is stripped here so the rest of the file can be read.",
                "byte-order-mark",
            )
        )

    detected = fmt or detect_format(location, source)
    if detected is None:
        return _refused(
            "ddd",
            location,
            f"Cannot tell which format {location.name} is.",
            "unknown-format",
        )

    result = validate(source, detected, path=str(location), owner=owner)
    result.problems = [*preamble, *result.problems]
    return result


def _refused(fmt: Format, location: Path, message: str, code: str) -> Result:
    from .problems import error_at

    return Result(
        format=fmt,
        path=str(location),
        problems=[error_at(Span(), message, code)],
    )


# ---------------------------------------------------------------------------
# A whole archive
# ---------------------------------------------------------------------------


@dataclass
class BundleResult:
    """One map, its models, their sidecars, and the cross-document findings."""

    results: list[Result] = field(default_factory=list)
    crossings: list[Problem] = field(default_factory=list)

    @property
    def errors(self) -> list[Problem]:
        return [f for result in self.results for f in result.errors]

    @property
    def warnings(self) -> list[Problem]:
        return [
            *(f for result in self.results for f in result.warnings),
            *(p for p in self.crossings if p.severity is Severity.WARNING),
        ]

    def ok(self, *, strict: bool = False) -> bool:
        return not self.errors and (not strict or not self.warnings)


def validate_bundle(paths: list[Path], *, fmt: Format | None = None) -> BundleResult:
    """Validate every file, then check the documents against each other.

    A bundle with no map, or with several, is not refused: the cross-document
    checks simply have less to say. Several maps in one directory is a
    collection of maps, which is an ordinary thing for a repository to hold -
    so the first is used and the rest are validated on their own.
    """
    results = [validate_file(path, fmt) for path in paths]

    holder = bundle_checks.Bundle()
    for result in results:
        if result.format == "ddd" and isinstance(result.document, ContextMap):
            if holder.map is None:
                holder.map = result.document
                holder.map_path = result.path
        elif result.format == "ddm" and isinstance(result.document, DomainModel):
            holder.models.append(result.document)
            holder.model_paths.append(result.path or "")

    # A sidecar is checked against the document it claims, which needs both to
    # have been read - so it happens here rather than in `validate_file`, where
    # only one file is in hand.
    for result in results:
        if result.format not in ("dddview", "ddmview"):
            continue
        expected = holder.map.title if result.format == "dddview" and holder.map else None
        if result.format == "ddmview":
            stem = Path(result.path or "").stem
            expected = next(
                (m.context for m in holder.models if _slug(m.context) == stem), None
            )
        view = result.document
        if not isinstance(view, view_module.View):
            continue
        if expected and view.owner and view.owner != expected:
            result.problems.append(
                warning_at(
                    Span(),
                    f'This view was made for "{view.owner}", and the document '
                    f'beside it is "{expected}".',
                    "view-for-another-document",
                )
            )

        # Positions for nodes the document no longer declares. Renaming a
        # context orphans its position, "which is harmless and
        # self-correcting" - so this is a reading, and it needs both files in
        # hand, which is why it is here rather than in `validate_view`.
        known = _known_ids(holder, result.format)
        if known is None:
            continue
        stale = view_module.orphans(view, known)
        if stale:
            result.readings.append(
                reading_at(
                    Span(),
                    f"{count(len(stale), 'position')} in this view "
                    f"{'names' if len(stale) == 1 else 'name'} something the document "
                    f"no longer declares: {quoted(stale)}.",
                    "view-orphaned-positions",
                )
            )

    crossings = bundle_checks.check(holder) if (holder.map or holder.models) else []
    return BundleResult(results, crossings)


def _known_ids(holder: bundle_checks.Bundle, fmt: Format) -> set[str] | None:
    """Every node id the documents in this bundle declare.

    `None` when there is no document to compare against - a sidecar on its own
    has nothing to be stale relative to.
    """
    if fmt == "dddview":
        if holder.map is None:
            return None
        return {node.id for node in holder.map.nodes}
    if not holder.models:
        return None
    return {
        node.id
        for model in holder.models
        for node in (*model.aggregates, *model.members)
    }


def _slug(name: str) -> str:
    """ba-cm's filename slug, as `files.ts` computes it.

    Lowercased, every run of non-alphanumerics to one hyphen, trimmed, and cut
    at sixty characters. Filenames are the storage keys, so this has to agree
    with the tool exactly - a model whose file this package looked for under a
    different name would silently never be checked against its view.
    """
    import re

    cleaned = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]
    return cleaned or "model"
