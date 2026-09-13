"""
The sidecars: `.dddview` and `.ddmview`.

Positions and edge curvature, as a file you can keep. **JSON, not a notation.**

They exist because "never in the document" and "never anywhere" are different
rules, and only the first one was ever the point. Coordinates must stay out of
the `.ddd` file - otherwise every diff fills with position churn that hides the
one line where a pattern changed. But an arrangement somebody worked out, in
which the relationships finally read clearly, is worth keeping and worth handing
to a colleague.

    insurance.ddd        the model. Reviewed, diffed, argued about.
    insurance.dddview    how one person likes to look at it. Optional.

**Losing the sidecar costs nothing** - the map redraws from the computed layout.
That asymmetry is what makes it safe to have at all, and it is why an archive
missing one is not a broken archive. So a missing sidecar is never a finding
here; only a present-and-wrong one is.

## Every number is checked rather than trusted

This is ba-cm's rule and the reason this module is not three lines of
`json.load`. A sidecar is a file a person can hand to another person and can
edit by hand, and a single `NaN` reaching an SVG transform blanks the entire
graph with no error anywhere - a failure mode far more confusing than a
rejected file. So a non-finite coordinate is **dropped**, exactly as ba-cm
drops it, and this validator says which ones were dropped rather than staying
silent about it: ba-cm's user can see their boxes move, and a validator's user
cannot.

## What a mismatch is

A view whose `map` names a different document is a **warning**, not a refusal.
Node ids are derived from names, so a view from a renamed or forked map still
lands correctly on everything the two have in common - which is usually most of
it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Final

from .problems import Problem, Severity, Span, error_at, reading_at, warning_at
from .prose import count, quoted

MAP_FORMAT: Final[str] = "ba-cm-view"
MODEL_FORMAT: Final[str] = "ba-cm-model-view"
VERSION: Final[int] = 1

#: Where a whole-file problem points. A JSON file has no interesting spans and
#: inventing them from a parse error's character offset would be precision the
#: message does not have.
_TOP = Span(0, 0, 1, 1)


@dataclass
class View:
    """One arrangement: where the boxes are, and how far each edge was bent."""

    #: Node id -> position. Ids look like `context:Claims`, derived from names.
    positions: dict[str, tuple[float, float]] = field(default_factory=dict)
    #: Edge id -> curvature offset. Empty for a model view: a class diagram's
    #: links are routed, not dragged.
    curves: dict[str, tuple[float, float]] = field(default_factory=dict)
    #: The title of the map, or the name of the context, this was made for.
    owner: str = ""
    #: Which of the two shapes this is.
    kind: str = "map"


@dataclass
class ViewResult:
    view: View | None
    problems: list[Problem]

    @property
    def ok(self) -> bool:
        return not any(problem.severity is Severity.ERROR for problem in self.problems)


def validate_view(text: str, *, model: bool = False, owner: str | None = None) -> ViewResult:
    """Check one sidecar.

    `owner` is the title of the open map, or the name of the open context, when
    there is one to compare against. Without it the ownership check is skipped
    rather than guessed at.
    """
    expected = MODEL_FORMAT if model else MAP_FORMAT
    noun = "model view" if model else "view"
    extension = ".ddmview" if model else ".dddview"
    problems: list[Problem] = []

    try:
        raw = json.loads(text)
    except json.JSONDecodeError as error:
        return ViewResult(
            None,
            [
                error_at(
                    Span(0, 0, error.lineno, error.colno),
                    f"Not valid JSON: {error.msg}. A {extension} is JSON; this file is "
                    "named like one and is not.",
                    "view-not-json",
                )
            ],
        )

    if not isinstance(raw, dict):
        return ViewResult(
            None,
            [error_at(_TOP, f"Not a {noun} file.", "view-not-an-object")],
        )

    if raw.get("format") != expected:
        return ViewResult(
            None,
            [
                error_at(
                    _TOP,
                    f'Not a {noun} file - it has no `"format": "{expected}"`. '
                    "Something has renamed a different file to "
                    f"{extension}.",
                    "view-wrong-format",
                )
            ],
        )

    version = raw.get("version")
    if not isinstance(version, (int, float)) or isinstance(version, bool):
        return ViewResult(
            None,
            [error_at(_TOP, "The view has no numeric `version`.", "view-no-version")],
        )
    if version > VERSION:
        return ViewResult(
            None,
            [
                error_at(
                    _TOP,
                    f"View format version {version} is newer than this build "
                    "understands.",
                    "view-too-new",
                )
            ],
        )

    view = View(kind="model" if model else "map")

    positions, dropped_positions = _points(raw.get("positions"), ("x", "y"))
    view.positions = positions
    if dropped_positions:
        problems.append(
            warning_at(
                _TOP,
                f"{count(len(dropped_positions), 'position')} could not be read and "
                f"{'was' if len(dropped_positions) == 1 else 'were'} dropped: "
                f"{quoted(dropped_positions)}.",
                "view-dropped-positions",
            )
        )

    if model:
        if raw.get("curves"):
            problems.append(
                warning_at(
                    _TOP,
                    "A model view carries `curves`. A class diagram's links are routed "
                    "rather than dragged, so nothing reads them.",
                    "view-curves-on-a-model",
                )
            )
    else:
        curves, dropped_curves = _points(raw.get("curves"), ("dx", "dy"))
        view.curves = curves
        if dropped_curves:
            problems.append(
                warning_at(
                    _TOP,
                    f"{count(len(dropped_curves), 'curve')} could not be read and "
                    f"{'was' if len(dropped_curves) == 1 else 'were'} dropped: "
                    f"{quoted(dropped_curves)}.",
                    "view-dropped-curves",
                )
            )

    key = "model" if model else "map"
    declared = raw.get(key)
    view.owner = declared if isinstance(declared, str) else ""

    if owner is not None and view.owner and view.owner != owner:
        problems.append(
            warning_at(
                _TOP,
                f'This view was made for "{view.owner}", and the document is '
                f'"{owner}". Boxes whose names match have moved; the rest are where '
                "they were.",
                "view-for-another-document",
            )
        )

    problems.append(
        reading_at(
            _TOP,
            f"{count(len(view.positions), 'position')}"
            + (f", {count(len(view.curves), 'curve')}" if not model else "")
            + (f', made for "{view.owner}"' if view.owner else "")
            + ".",
            "view-shape",
        )
    )
    return ViewResult(view, problems)


def _points(
    raw: object, keys: tuple[str, str]
) -> tuple[dict[str, tuple[float, float]], list[str]]:
    """Read a mapping of id to point, dropping anything that is not two finite
    numbers - and saying which."""
    out: dict[str, tuple[float, float]] = {}
    dropped: list[str] = []
    if not isinstance(raw, dict):
        return out, dropped
    for id_, value in raw.items():
        if not isinstance(value, dict):
            dropped.append(str(id_))
            continue
        first, second = value.get(keys[0]), value.get(keys[1])
        if _finite(first) and _finite(second):
            out[str(id_)] = (float(first), float(second))  # type: ignore[arg-type]
        else:
            dropped.append(str(id_))
    return out, dropped


def _finite(value: object) -> bool:
    """`Number.isFinite`, and a bool is not a number.

    JSON has no NaN literal, so the shapes that reach here are a string, a
    null, a missing key, or `1e999` - which `json` decodes to `inf`.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return value == value and value not in (float("inf"), float("-inf"))


def orphans(view: View, known_ids: set[str]) -> list[str]:
    """Positions for nodes the document no longer declares.

    Renaming a context in the document orphans its position, "which is harmless
    and self-correcting" - so this is a list for a reading, never a problem.
    """
    return sorted(id_ for id_ in view.positions if id_ not in known_ids)


def hints() -> dict[str, str]:
    return {
        "view-shape": "A sidecar holds where somebody dragged the boxes, plus how far "
        "each edge was bent. Do not hand-edit one unless that is specifically what "
        "was asked: it is generated, and it is keyed by node name.",
        "view-not-json": "The `.ddd` and `.ddm` documents are notations; the two "
        "`*view` files are JSON.",
        "view-wrong-format": "The format field is what tells a renamed file from a "
        "real one.",
        "view-too-new": "A newer build wrote this. Nothing is lost - losing a sidecar "
        "costs nothing, because the diagram redraws from a computed layout.",
        "view-dropped-positions": "Every number is checked rather than trusted: a "
        "single non-finite coordinate reaching an SVG transform blanks the whole "
        "diagram with no error anywhere.",
        "view-dropped-curves": "As above. The bad entries are ignored and the rest of "
        "the arrangement still loads.",
        "view-curves-on-a-model": "Only the map's edges are draggable.",
        "view-for-another-document": "A mismatch is not a refusal. Ids are derived "
        "from names, so a view from a renamed or forked document still lands on "
        "everything the two have in common.",
        "view-orphaned-positions": "Harmless and self-correcting: a renamed node gets "
        "a computed position and the stale entry is ignored.",
    }
