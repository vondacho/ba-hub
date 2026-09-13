"""
The command line: `bacm-validate insurance.ddd`.

Two output shapes, because there are two consumers. The default is a caret
report meant to be read in a terminal next to the file, in the same
expected-vs-found style ba-cm's problems panel uses. `--json` is one object per
file, for a CI job that wants to count things or annotate a diff.

Pointed at a directory it walks for all four extensions and then runs the
cross-document checks, which is the interesting case: a `.ddd` and the `.ddm`
files beside it are one body of work, and whether they agree about a context's
aggregates is a question neither file can answer alone.

Exit codes:

    0  every file parses (and, under --strict, carries no warnings)
    1  at least one file has an error
    2  --strict, everything parses, and at least one warning stands
    3  the invocation itself was wrong - no such file, unknown format

`2` is separate from `1` on purpose, and it is ba-cm's own distinction: "an
error means the document does not parse, or parses into something
self-contradictory" while "warnings never block a render. A map that has to be
perfect before it draws is a map nobody starts."
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .api import FORMATS, BundleResult, Result, hint_for, validate_bundle
from .problems import Problem, Severity

_COLOUR = {
    Severity.ERROR: "\033[31m",
    Severity.WARNING: "\033[33m",
    Severity.READING: "\033[36m",
}
_RESET = "\033[0m"
_DIM = "\033[2m"

_EXTENSIONS = (".ddd", ".ddm", ".dddview", ".ddmview")


def _paint(text: str, code: str, colour: bool) -> str:
    return f"{code}{text}{_RESET}" if colour else text


def _stanza(
    finding: Problem,
    lines: list[str],
    path: str | None,
    *,
    colour: bool,
) -> list[str]:
    """One finding: the position, the message, the offending line with a caret
    under it, and the doctrine's argument when there is one.

    The caret is the reason every node carries the span it was parsed from -
    reconstructing the width later means re-lexing.
    """
    out: list[str] = []
    head = _paint(finding.severity.value, _COLOUR[finding.severity], colour)
    where = f"{path}:{finding.line}:{finding.column}" if path else f"{finding.line}:{finding.column}"
    tail = _paint(f" [{finding.code}]", _DIM, colour) if finding.code else ""
    out.append(f"{where} {head}: {finding.message}{tail}")

    if 1 <= finding.line <= len(lines):
        text = lines[finding.line - 1]
        if text.strip():
            out.append(f"  {_paint(text.rstrip(), _DIM, colour)}")
            width = finding.span.length if finding.span else 0
            out.append(
                f"  {' ' * (finding.column - 1)}"
                f"{_paint('^' * max(1, width), _COLOUR[finding.severity], colour)}"
            )

    hint = hint_for(finding.code)
    if hint:
        out.append(f"  {_paint(hint, _DIM, colour)}")
    out.append("")
    return out


def _report(result: Result, *, colour: bool, quiet: bool) -> str:
    try:
        lines = Path(result.path).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError, TypeError):
        lines = []
    out: list[str] = []
    for finding in result.findings:
        if quiet and finding.severity is Severity.READING:
            continue
        out += _stanza(finding, lines, result.path, colour=colour)
    return "\n".join(out)


def _crossings(bundle: BundleResult, *, colour: bool, quiet: bool) -> str:
    if not bundle.crossings:
        return ""
    out = ["-- across the documents " + "-" * 40, ""]
    for finding in bundle.crossings:
        if quiet and finding.severity is Severity.READING:
            continue
        out += _stanza(finding, [], None, colour=colour)
    return "\n".join(out) if len(out) > 2 else ""


def _as_json(result: Result) -> dict:
    return {
        "path": result.path,
        "format": result.format,
        "parses": result.parses,
        "counts": {
            "errors": len(result.errors),
            "warnings": len(result.warnings),
            "readings": len(result.infos),
        },
        "findings": [
            {
                "severity": finding.severity.value,
                "code": finding.code,
                "line": finding.line,
                "column": finding.column,
                "length": finding.span.length if finding.span else 0,
                "message": finding.message,
                "hint": hint_for(finding.code),
            }
            for finding in result.findings
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bacm-validate",
        description=(
            "Validate ba-cm's context maps and domain models against their BNF "
            "grammars, read their doctrine over them, and check a map and its models "
            "against each other."
        ),
        epilog=(
            "Errors and warnings are the formats' own rules, from ba-cm-notation.md "
            "and src/lib/{ddd,ddm}/. Readings are the doctrine's countable half, from "
            "ba-cm-doctrine.md and outline.ts; they never fail a run, and warnings "
            "only do under --strict."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="+",
        metavar="FILE",
        help="files to validate, or directories to walk for .ddd/.ddm/.dddview/.ddmview",
    )
    parser.add_argument(
        "--format",
        choices=FORMATS,
        help="read every file as this format instead of detecting it",
    )
    parser.add_argument(
        "--strict", action="store_true", help="fail (exit 2) when a warning stands"
    )
    parser.add_argument(
        "--grammar-only",
        action="store_true",
        help="skip the doctrine and the cross-document checks entirely",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress the readings; show errors and warnings only",
    )
    parser.add_argument("--json", action="store_true", help="one JSON object per file")
    parser.add_argument(
        "--no-color", action="store_true", help="never colourise, even on a terminal"
    )
    return parser


def _collect(paths: list[str]) -> tuple[list[Path], list[str]]:
    files: list[Path] = []
    missing: list[str] = []
    for raw in paths:
        location = Path(raw)
        if location.is_dir():
            for suffix in _EXTENSIONS:
                files.extend(sorted(location.rglob(f"*{suffix}")))
        elif location.exists():
            files.append(location)
        else:
            missing.append(raw)
    # The map first, so its readings are read before its models'. The bundle
    # check needs it first anyway - `validate_bundle` takes the first `.ddd` it
    # is given.
    order = {".ddd": 0, ".dddview": 1, ".ddm": 2, ".ddmview": 3}
    files.sort(key=lambda path: (order.get(path.suffix.lower(), 9), str(path)))
    return files, missing


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    colour = not args.no_color and sys.stdout.isatty()

    files, missing = _collect(args.paths)
    for raw in missing:
        print(f"bacm-validate: no such file or directory: {raw}", file=sys.stderr)
    if missing:
        return 3
    if not files:
        print("bacm-validate: nothing to validate", file=sys.stderr)
        return 3

    bundle = validate_bundle(files, fmt=args.format)
    if args.grammar_only:
        bundle.crossings = []
        for result in bundle.results:
            result.readings = []

    if args.json:
        for result in bundle.results:
            print(json.dumps(_as_json(result), indent=2))
        if bundle.crossings:
            print(
                json.dumps(
                    {
                        "path": None,
                        "format": "bundle",
                        "parses": True,
                        "counts": {
                            "errors": 0,
                            "warnings": sum(
                                1
                                for p in bundle.crossings
                                if p.severity is Severity.WARNING
                            ),
                            "readings": sum(
                                1
                                for p in bundle.crossings
                                if p.severity is Severity.READING
                            ),
                        },
                        "findings": [
                            {
                                "severity": p.severity.value,
                                "code": p.code,
                                "line": p.line,
                                "column": p.column,
                                "length": p.span.length if p.span else 0,
                                "message": p.message,
                                "hint": hint_for(p.code),
                            }
                            for p in bundle.crossings
                        ],
                    },
                    indent=2,
                )
            )
    else:
        for result in bundle.results:
            report = _report(result, colour=colour, quiet=args.quiet)
            if report.strip():
                print(report, end="")
            print(result.summary())
        crossings = _crossings(bundle, colour=colour, quiet=args.quiet)
        if crossings.strip():
            print()
            print(crossings, end="")

    if bundle.errors:
        return 1
    if args.strict and bundle.warnings:
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
