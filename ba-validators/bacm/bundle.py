"""
A map and the models of the contexts it names, checked against each other.

The two documents have different lifetimes and are deliberately separate files -
a `.ddd` covers many contexts, a `.ddm` is the inside of exactly one - but they
are one *body of work*, and ba-cm exports them as one archive:

    insurance/
      insurance.ddd
      insurance.dddview
      risk-appetite/
        risk-appetite.ddm
        risk-appetite.ddmview

**Filenames are the storage keys.** An import needs no manifest and no
directory walking: the basename of every file *is* where it goes, which is also
why a rearranged archive still imports. Somebody who renames the folders has
renamed folders, not documents.

## Why there is anything to check here

Neither parser can see the other document, and the seam between them is
name-based on purpose - `ddm/model.ts`: "A name, matching the map's, because
the name is the identity in both formats. It is what lets the two documents be
checked against each other without either one holding a pointer into the
other."

ba-cm's own sample says the same thing out loud: `Risk appetite` was chosen as
the seed model "because the map already says what its aggregates are -
`Submission`, `AppetiteRuleSet`, `Referral` - so the two documents can be
checked against each other from the first day, and the check has something to
find rather than being a feature with no data."

This module is that check. Everything in it is a **warning or a reading**, and
never an error, for a reason worth stating: each document is valid on its own,
and which of the two is behind is not something a validator can know. A context
renamed in the map and not yet in its model is a normal state halfway through a
rename, and refusing the archive over it would make renaming impossible in the
tool that exists to do it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .ddd.model import ContextMap, ContextNode
from .ddm.model import DomainModel
from .problems import Problem, Severity, reading_at, warning_at
from .prose import count, listed, quoted, verb


@dataclass
class Bundle:
    """One map and whichever of its models are present."""

    map: ContextMap | None = None
    models: list[DomainModel] = field(default_factory=list)
    #: Paths, for messages. Parallel to `models`.
    model_paths: list[str] = field(default_factory=list)
    map_path: str | None = None


def check(bundle: Bundle) -> list[Problem]:
    """Every cross-document finding."""
    if bundle.map is None:
        return _models_without_a_map(bundle)

    findings: list[Problem] = []
    findings += _context_names(bundle)
    findings += _aggregate_names(bundle)
    findings += _coverage(bundle)
    return findings


def _models_without_a_map(bundle: Bundle) -> list[Problem]:
    """Models and no map is not an error - a `.ddm` is a document in its own
    right and a context map is not its parent. It is worth one line, because an
    archive is usually meant to hold both."""
    if not bundle.models:
        return []
    return [
        reading_at(
            bundle.models[0].context_span,
            f"{count(len(bundle.models), 'domain model')} and no context map to check "
            "against.",
            "bundle-no-map",
        )
    ]


def _context_names(bundle: Bundle) -> list[Problem]:
    """A `.ddm` names the bounded context it is the inside of.

    A model whose context the map does not declare is either a context that has
    been renamed in the map and not in the model, or a model for a different
    map. Both are worth saying and neither is this tool's to resolve.
    """
    assert bundle.map is not None
    declared = {context.name for context in bundle.map.contexts}

    findings: list[Problem] = []

    for model in bundle.models:
        if model.context in declared:
            continue
        near = next(
            (
                name
                for name in sorted(declared)
                if name.lower() == model.context.lower()
            ),
            None,
        )
        message = (
            f'The map declares no context called "{model.context}".'
            if near is None
            else f'The map declares no context called "{model.context}" - it has '
            f'"{near}", which differs only by case.'
        )
        findings.append(
            warning_at(model.context_span, message, "bundle-unknown-context")
        )
    return findings


def _aggregate_names(bundle: Bundle) -> list[Problem]:
    """The map lists a context's aggregates by name; the model says what they are.

    Two ways for that to disagree, and they mean different things:

      - **in the map, not in the model** - the map has promised a boundary the
        model has not drawn. Usually the model is behind.
      - **in the model, not in the map** - the model has a boundary the
        catalogue does not know about, which is the one a reader of the map
        will miss.
    """
    assert bundle.map is not None
    findings: list[Problem] = []
    # **First declaration wins**, which is what the parser does: a duplicate
    # name is an error there and is left out of its own name table, so the
    # first `context "Rating"` is the one every reference resolves to. A dict
    # comprehension over the list would silently let the *last* one win, and on
    # a map with a duplicate that produces a cross-document warning about
    # aggregates the map does in fact list.
    by_name: dict[str, ContextNode] = {}
    for context in bundle.map.contexts:
        by_name.setdefault(context.name, context)

    for model in bundle.models:
        context = by_name.get(model.context)
        if context is None:
            continue
        promised = list(context.aggregates)
        drawn = [aggregate.name for aggregate in model.aggregates]

        missing = [name for name in promised if name not in drawn]
        if missing:
            findings.append(
                warning_at(
                    model.context_span,
                    f'The map says "{model.context}" has '
                    f"{count(len(missing), 'aggregate')} this model does not draw - "
                    f"{quoted(missing)}.",
                    "bundle-aggregate-not-modelled",
                )
            )

        extra = [name for name in drawn if name not in promised]
        if extra:
            findings.append(
                warning_at(
                    model.context_span,
                    f"This model draws {count(len(extra), 'aggregate')} the map does "
                    f"not list - {quoted(extra)}.",
                    "bundle-aggregate-not-in-map",
                )
            )

        if promised and not missing and not extra:
            findings.append(
                reading_at(
                    model.context_span,
                    f'The map and this model agree on all '
                    f"{count(len(promised), 'aggregate')}.",
                    "bundle-agrees",
                )
            )
    return findings


def _coverage(bundle: Bundle) -> list[Problem]:
    """Which contexts the archive has a model for.

    A context with no model is **not** a defect and not an empty folder: the
    map already says it exists, and `status` is where the map records whether
    that is a decision or an omission. So this is a reading, and it uses the
    status to decide whether to say anything at all - a context marked
    `unmodelled` with no model is the archive agreeing with itself.
    """
    assert bundle.map is not None
    modelled = {model.context for model in bundle.models}
    contexts = bundle.map.contexts
    if not contexts:
        return []

    findings: list[Problem] = []
    claimed = [
        context
        for context in contexts
        if context.status == "modelled" and context.name not in modelled
    ]
    if claimed:
        findings.append(
            reading_at(
                bundle.map.title_span,
                f"{count(len(claimed), 'context')} "
                f"{verb(len(claimed), 'is', 'are')} `modelled` with no `.ddm` in this "
                f"bundle - {listed([c.name for c in claimed])}.",
                "bundle-missing-models",
            )
        )

    present = len(modelled & {c.name for c in contexts})
    findings.append(
        reading_at(
            bundle.map.title_span,
            f"{present} of {count(len(contexts), 'context')} "
            f"{verb(present, 'has', 'have')} a model in this bundle.",
            "bundle-coverage",
        )
    )
    return findings


def hints() -> dict[str, str]:
    return {
        "bundle-no-map": "A `.ddm` is a document in its own right. The map is what "
        "says which contexts exist and what each one's aggregates are called.",
        "bundle-unknown-context": "The name is the identity in both formats, and it is "
        "the whole of the seam between them. Halfway through a rename this is the "
        "normal state, which is why it is not an error.",
        "bundle-aggregate-not-modelled": "The map lists a context's consistency "
        "boundaries; the model says what they are. Usually the model is the one that is "
        "behind.",
        "bundle-aggregate-not-in-map": "A boundary the catalogue does not know about is "
        "the one a reader of the map will miss.",
        "bundle-agrees": "The two documents are checked against each other by name, "
        "and here they match.",
        "bundle-missing-models": "`status` is how the map distinguishes a decision from "
        "an omission. A context marked `modelled` is claiming there is a model.",
        "bundle-coverage": "A context with no model is not an empty folder and not a "
        "stub - the map already says it exists.",
    }


def ok(problems: list[Problem]) -> bool:
    return not any(problem.severity is Severity.ERROR for problem in problems)
