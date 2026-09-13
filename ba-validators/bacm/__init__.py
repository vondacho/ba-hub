"""
Validators for ba-cm's two notations and their two sidecars.

    .ddd       a context map - the shape of a business, and the strategic
               relationships between its bounded contexts
    .ddm       a domain model - the inside of exactly one bounded context
    .dddview   where somebody dragged the boxes on a map (JSON)
    .ddmview   the same, one zoom level down (JSON)

Both notations serve domain-driven design, described in Eric Evans's
*Domain-Driven Design* (2003) and Vaughn Vernon's *Implementing Domain-Driven
Design* (2013). A context map is the **strategic** half - where the boundaries
are, and what runs between them. A domain model is the **tactical** half - what
is inside one boundary and what keeps it true.

Each document is checked on **three levels**, and keeping them apart is the one
design decision in this package worth arguing about.

**Errors** are decidable and come from the grammars in `ba-cm-notation.md` and
`ba-cm/src/lib/{ddd,ddm}/`: a `value` carrying an `id`, an arrow under
`partnership`, a `contains` reaching into another aggregate, an aggregate with
no `root`. These are ba-cm's own messages, and a document carrying one cannot
be opened by the tool these files are kept for.

**Warnings** are the format's own second thoughts, and they are ba-cm's too: an
unowned boundary, a relationship with no `because`, an aggregate protecting no
invariant. The document parses and draws. "Warnings never block a render. A map
that has to be perfect before it draws is a map nobody starts."

**Readings** are the doctrine's countable half, which ba-cm puts in
`outline.ts` rather than in its problems panel: three `core` subdomains, four
of six relationships with no rationale, an aggregate holding more than seven
members. Stated as findings and never as verdicts - a map with three core
subdomains may be right, and a map with none of these findings may still be a
map of what everybody wishes were true, which is the failure no count can see.

So `--strict` promotes warnings and never readings, and the cross-document
checks in `bacm.bundle` are warnings at most: which of two documents is behind
is not something a validator can know.

Usage:

    from bacm import validate_file, validate_bundle

    result = validate_file("insurance.ddd")
    if not result.parses:
        ...
    for finding in result.findings:
        print(finding.format(result.path))
"""

from __future__ import annotations

from .api import (
    FORMATS,
    BundleResult,
    Format,
    Result,
    detect_format,
    hint_for,
    validate,
    validate_bundle,
    validate_file,
)
from .problems import (
    MAX_PROBLEMS,
    LexError,
    Problem,
    Severity,
    Span,
)

__all__ = [
    "FORMATS",
    "MAX_PROBLEMS",
    "BundleResult",
    "Format",
    "LexError",
    "Problem",
    "Result",
    "Severity",
    "Span",
    "detect_format",
    "hint_for",
    "validate",
    "validate_bundle",
    "validate_file",
]

__version__ = "0.1.0"
