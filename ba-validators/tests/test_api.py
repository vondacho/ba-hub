"""The sidecars, the bundle checks, the one entry point, and the command line."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from bacm import Severity, detect_format, validate, validate_bundle, validate_file
from bacm.cli import main
from bacm.view import validate_view

SAMPLES = Path(__file__).resolve().parent.parent / "samples"

MAP = """
map "Insurance" {
  domain "Insurance" {
    owner "The board"
    subdomain core "Underwriting" {
      owner "Head of underwriting"
      context "Risk appetite" {
        owner     "Head of underwriting"
        language  "Submission"
        aggregate "Submission" "AppetiteRuleSet"
      }
    }
  }
}
"""

MODEL = """
context "Risk appetite" {
  aggregate "Submission" {
    invariant "A withdrawn submission cannot be referred."
    root entity "Submission" { id "SubmissionId" }
  }
  aggregate "AppetiteRuleSet" {
    invariant "One version is effective on any given date."
    root entity "AppetiteRuleSet" { id "AppetiteRuleSetId" }
  }
}
"""


def codes(problems) -> list[str]:
    return [p.code for p in problems]


class TestDetection(unittest.TestCase):
    def test_by_extension(self):
        """Filenames are the storage keys: the basename of a file is where it
        goes."""
        self.assertEqual(detect_format("a.ddd"), "ddd")
        self.assertEqual(detect_format("a.ddm"), "ddm")
        self.assertEqual(detect_format("a.dddview"), "dddview")
        self.assertEqual(detect_format("a.ddmview"), "ddmview")

    def test_by_opening_keyword(self):
        self.assertEqual(detect_format("x.txt", '// note\n\nmap "A" { }'), "ddd")
        self.assertEqual(detect_format("x.txt", 'context "A" { }'), "ddm")
        self.assertEqual(detect_format("x.txt", 'model "A" { }'), "ddm")

    def test_a_json_object_is_a_sidecar(self):
        self.assertEqual(detect_format("x.txt", '{"format":"ba-cm-view"}'), "dddview")
        self.assertEqual(
            detect_format("x.txt", '{"format":"ba-cm-model-view"}'), "ddmview"
        )

    def test_neither(self):
        self.assertIsNone(detect_format("x.txt", "hello"))
        self.assertIsNone(detect_format("x.txt"))


class TestSidecars(unittest.TestCase):
    def test_a_good_view(self):
        text = json.dumps(
            {
                "format": "ba-cm-view",
                "version": 1,
                "map": "Insurance",
                "positions": {"context:Claims": {"x": 1.5, "y": 2.5}},
                "curves": {"rel:a->b": {"dx": 3, "dy": 4}},
            }
        )
        result = validate_view(text, owner="Insurance")
        self.assertTrue(result.ok)
        self.assertEqual(result.view.positions["context:Claims"], (1.5, 2.5))
        self.assertEqual(result.view.curves["rel:a->b"], (3.0, 4.0))

    def test_not_json(self):
        result = validate_view('map "A" { }')
        self.assertEqual(codes(result.problems), ["view-not-json"])

    def test_a_renamed_file_has_no_format_field(self):
        result = validate_view('{"positions": {}}')
        self.assertEqual(codes(result.problems), ["view-wrong-format"])

    def test_a_map_view_is_not_a_model_view(self):
        result = validate_view('{"format":"ba-cm-view","version":1}', model=True)
        self.assertEqual(codes(result.problems), ["view-wrong-format"])

    def test_a_newer_version_is_refused(self):
        result = validate_view('{"format":"ba-cm-view","version":9}')
        self.assertEqual(codes(result.problems), ["view-too-new"])

    def test_every_number_is_checked_rather_than_trusted(self):
        """A single non-finite coordinate reaching an SVG transform blanks the
        whole diagram with no error anywhere."""
        text = json.dumps(
            {
                "format": "ba-cm-view",
                "version": 1,
                "map": "A",
                "positions": {
                    "good": {"x": 1, "y": 2},
                    "string": {"x": "1", "y": 2},
                    "missing": {"x": 1},
                    "boolean": {"x": True, "y": 2},
                },
            }
        )
        result = validate_view(text)
        self.assertEqual(list(result.view.positions), ["good"])
        warning = next(p for p in result.problems if p.code == "view-dropped-positions")
        self.assertIn("3 positions", warning.message)
        # Dropped, not refused: the rest of the arrangement still loads.
        self.assertTrue(result.ok)

    def test_infinity_is_not_finite(self):
        result = validate_view(
            '{"format":"ba-cm-view","version":1,"positions":{"a":{"x":1e999,"y":0}}}'
        )
        self.assertEqual(result.view.positions, {})

    def test_a_mismatch_is_a_warning_not_a_refusal(self):
        """Ids are derived from names, so a view from a renamed or forked map
        still lands on everything the two have in common."""
        text = '{"format":"ba-cm-view","version":1,"map":"Old","positions":{}}'
        result = validate_view(text, owner="New")
        self.assertIn("view-for-another-document", codes(result.problems))
        self.assertTrue(result.ok)

    def test_curves_on_a_model_view(self):
        text = (
            '{"format":"ba-cm-model-view","version":1,"model":"A",'
            '"positions":{},"curves":{"x":{"dx":1,"dy":1}}}'
        )
        result = validate_view(text, model=True)
        self.assertIn("view-curves-on-a-model", codes(result.problems))

    def test_the_real_sample_view(self):
        result = validate_file(SAMPLES / "insurance.dddview")
        self.assertTrue(result.parses, codes(result.errors))
        self.assertEqual(len(result.document.positions), 9)


class TestBundle(unittest.TestCase):
    def _bundle(self, map_text: str, model_text: str, *, context: str = "risk-appetite"):
        directory = tempfile.TemporaryDirectory()
        root = Path(directory.name)
        (root / "insurance.ddd").write_text(map_text, encoding="utf-8")
        inner = root / context
        inner.mkdir()
        (inner / f"{context}.ddm").write_text(model_text, encoding="utf-8")
        paths = [root / "insurance.ddd", inner / f"{context}.ddm"]
        return directory, validate_bundle(paths)

    def test_a_map_and_a_model_that_agree(self):
        """The seed model exists so the two documents can be checked against
        each other from the first day, and the check has something to find."""
        keep, bundle = self._bundle(MAP, MODEL)
        with keep:
            self.assertTrue(bundle.ok())
            self.assertIn("bundle-agrees", codes(bundle.crossings))

    def test_an_aggregate_the_map_promises_and_the_model_does_not_draw(self):
        keep, bundle = self._bundle(
            MAP.replace('"Submission" "AppetiteRuleSet"', '"Submission" "Referral"'),
            MODEL,
        )
        with keep:
            finding = next(
                p for p in bundle.crossings if p.code == "bundle-aggregate-not-modelled"
            )
            self.assertIn('"Referral"', finding.message)
            self.assertEqual(finding.severity, Severity.WARNING)

    def test_an_aggregate_the_model_draws_and_the_map_does_not_list(self):
        keep, bundle = self._bundle(
            MAP.replace(' "AppetiteRuleSet"', ""), MODEL
        )
        with keep:
            finding = next(
                p for p in bundle.crossings if p.code == "bundle-aggregate-not-in-map"
            )
            self.assertIn('"AppetiteRuleSet"', finding.message)

    def test_a_model_for_a_context_the_map_does_not_declare(self):
        keep, bundle = self._bundle(MAP, MODEL.replace("Risk appetite", "Rating"))
        with keep:
            self.assertIn("bundle-unknown-context", codes(bundle.crossings))

    def test_a_case_difference_is_pointed_out(self):
        keep, bundle = self._bundle(MAP, MODEL.replace("Risk appetite", "risk appetite"))
        with keep:
            finding = next(
                p for p in bundle.crossings if p.code == "bundle-unknown-context"
            )
            self.assertIn("differs only by case", finding.message)

    def test_a_disagreement_is_never_an_error(self):
        """Which of the two documents is behind is not something a validator
        can know, and halfway through a rename this is the normal state."""
        keep, bundle = self._bundle(MAP, MODEL.replace("Risk appetite", "Rating"))
        with keep:
            self.assertEqual(bundle.errors, [])
            self.assertTrue(bundle.ok())
            self.assertFalse(bundle.ok(strict=True))

    def test_coverage_is_a_reading(self):
        keep, bundle = self._bundle(MAP, MODEL)
        with keep:
            finding = next(p for p in bundle.crossings if p.code == "bundle-coverage")
            self.assertEqual(finding.severity, Severity.READING)
            self.assertIn("1 of 1 context has a model", finding.message)

    def test_a_position_for_a_node_the_document_no_longer_declares(self):
        """Renaming a context orphans its position - harmless and
        self-correcting, so a reading and never a problem."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "m.ddd").write_text(MAP, encoding="utf-8")
            (root / "m.dddview").write_text(
                json.dumps(
                    {
                        "format": "ba-cm-view",
                        "version": 1,
                        "map": "Insurance",
                        "positions": {
                            "context:Risk appetite": {"x": 1, "y": 2},
                            "context:Renamed away": {"x": 3, "y": 4},
                        },
                        "curves": {},
                    }
                ),
                encoding="utf-8",
            )
            bundle = validate_bundle([root / "m.ddd", root / "m.dddview"])
        view = next(r for r in bundle.results if r.format == "dddview")
        finding = next(
            f for f in view.findings if f.code == "view-orphaned-positions"
        )
        self.assertEqual(finding.severity, Severity.READING)
        self.assertIn('"context:Renamed away"', finding.message)
        self.assertTrue(bundle.ok(strict=True))

    def test_a_sidecar_on_its_own_has_nothing_to_be_stale_against(self):
        result = validate_file(SAMPLES / "insurance.dddview")
        self.assertNotIn("view-orphaned-positions", codes(result.findings))

    def test_a_duplicate_context_name_does_not_confuse_the_comparison(self):
        """The parser keeps the first declaration, so this must too - letting
        the last one win produces a warning about aggregates the map lists."""
        doubled = MAP.replace(
            "  }\n}", '    context "Risk appetite" { }\n    }\n  }\n}'
        )
        keep, bundle = self._bundle(doubled, MODEL)
        with keep:
            self.assertIn("duplicate-name", codes(bundle.errors))
            self.assertNotIn(
                "bundle-aggregate-not-in-map", codes(bundle.crossings)
            )
            self.assertIn("bundle-agrees", codes(bundle.crossings))

    def test_models_with_no_map(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "a.ddm"
            path.write_text(MODEL, encoding="utf-8")
            bundle = validate_bundle([path])
            self.assertIn("bundle-no-map", codes(bundle.crossings))

    def test_the_real_samples_agree(self):
        paths = [
            SAMPLES / "insurance.ddd",
            SAMPLES / "insurance.dddview",
            SAMPLES / "risk-appetite" / "risk-appetite.ddm",
        ]
        bundle = validate_bundle(paths)
        self.assertTrue(bundle.ok(), [p.message for p in bundle.errors])
        self.assertIn("bundle-agrees", codes(bundle.crossings))


class TestFiles(unittest.TestCase):
    def test_the_real_samples_parse(self):
        for name in ("insurance.ddd", "insurance.dddview"):
            result = validate_file(SAMPLES / name)
            self.assertTrue(result.parses, f"{name}: {[e.message for e in result.errors]}")
        result = validate_file(SAMPLES / "risk-appetite" / "risk-appetite.ddm")
        self.assertTrue(result.parses, [e.message for e in result.errors])

    def test_a_binary_file_is_refused_before_the_lexer_sees_it(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "photo.ddd"
            path.write_bytes(b"\xff\xd8\xff\xe0\x00JFIF")
            result = validate_file(path)
            self.assertEqual(codes(result.errors), ["not-text"])

    def test_a_byte_order_mark_is_stripped_and_said(self):
        """ba-cm's lexer reports it as an unexpected character, so the document
        will not open until it is removed."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bom.ddd"
            path.write_bytes(b"\xef\xbb\xbf" + MAP.encode("utf-8"))
            result = validate_file(path)
            self.assertIn("byte-order-mark", codes(result.warnings))
            self.assertTrue(result.parses)

    def test_a_file_that_is_not_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "latin.ddd"
            path.write_bytes(b'map "caf\xe9" { }')
            result = validate_file(path)
            self.assertEqual(codes(result.errors), ["not-utf8"])

    def test_an_unrecognisable_name(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notes.txt"
            path.write_text("hello", encoding="utf-8")
            result = validate_file(path)
            self.assertEqual(codes(result.errors), ["unknown-format"])


class TestResult(unittest.TestCase):
    def test_the_three_levels_are_kept_apart(self):
        result = validate('map "A" { domain "D" { context "C" { } } }', "ddd")
        self.assertTrue(result.parses)
        self.assertTrue(result.warnings)
        self.assertTrue(result.infos)
        self.assertNotIn(Severity.ERROR, [r.severity for r in result.readings])

    def test_the_doctrine_still_runs_on_a_file_that_did_not_parse_cleanly(self):
        result = validate(
            'map "A" { domain "D" { context "C" { status nearly } } }', "ddd"
        )
        self.assertFalse(result.parses)
        self.assertTrue(result.readings)

    def test_a_lexical_failure_leaves_nothing_to_read(self):
        result = validate('map "A" { domain "oops\n}', "ddd")
        self.assertFalse(result.parses)
        self.assertEqual(result.readings, [])

    def test_strict_promotes_warnings_and_never_readings(self):
        result = validate('map "A" { domain "D" { context "C" { } } }', "ddd")
        self.assertTrue(result.ok())
        self.assertFalse(result.ok(strict=True))

    def test_findings_are_worst_first(self):
        result = validate(
            'map "A" { domain "D" { context "C" { status nearly } } }', "ddd"
        )
        order = [f.severity for f in result.findings]
        rank = ["error", "warning", "reading"]
        self.assertEqual(order, sorted(order, key=lambda s: rank.index(s.value)))

    def test_summary_counts_in_the_singular(self):
        """A summary that says "1 warnings" reads as a tool that was not
        finished, and a reader who notices stops trusting the sentence."""
        result = validate('map "A" { domain "D" { } }', "ddd")
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("1 warning,", result.summary())
        self.assertNotIn("1 warnings", result.summary())

    def test_an_unknown_format_is_a_programming_error(self):
        with self.assertRaises(ValueError):
            validate("", "puml")  # type: ignore[arg-type]


class TestCli(unittest.TestCase):
    def run_cli(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_a_directory_is_walked_and_the_documents_compared(self):
        code, out, _ = self.run_cli(str(SAMPLES), "--no-color", "--quiet")
        self.assertEqual(code, 0)
        self.assertEqual(out.count("parses."), 3)

    def test_the_map_is_reported_before_its_models(self):
        _, out, _ = self.run_cli(str(SAMPLES), "--no-color", "--quiet")
        self.assertLess(out.index("insurance.ddd"), out.index("risk-appetite.ddm"))

    def test_strict_exits_two_when_only_warnings_stand(self):
        code, _, _ = self.run_cli(str(SAMPLES), "--no-color", "--strict")
        self.assertEqual(code, 2)

    def test_an_error_exits_one(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.ddd"
            path.write_text('map "A" { domain "D" { subdomain "S" { } } }', encoding="utf-8")
            code, out, _ = self.run_cli(str(path), "--no-color")
        self.assertEqual(code, 1)
        self.assertIn("does not parse", out)

    def test_a_missing_file_exits_three(self):
        code, _, err = self.run_cli("/nowhere/at/all.ddd")
        self.assertEqual(code, 3)
        self.assertIn("no such file", err)

    def test_grammar_only_drops_the_doctrine_and_the_crossings(self):
        code, out, _ = self.run_cli(str(SAMPLES), "--no-color", "--grammar-only")
        self.assertEqual(code, 0)
        self.assertNotIn("across the documents", out)
        self.assertNotIn("reading:", out)

    def test_json_is_one_object_per_file_plus_the_bundle(self):
        _, out, _ = self.run_cli(str(SAMPLES), "--json", "--no-color")
        objects = [json.loads(chunk) for chunk in _split_json(out)]
        self.assertEqual(len(objects), 4)
        self.assertEqual(objects[-1]["format"], "bundle")
        self.assertTrue(any(f["hint"] for f in objects[-1]["findings"]))

    def test_the_caret_is_the_width_of_the_offending_token(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.ddd"
            path.write_text(
                'map "A" {\n  domain "D" {\n    context "C" { status nearly }\n  }\n}\n',
                encoding="utf-8",
            )
            _, out, _ = self.run_cli(str(path), "--no-color", "--quiet")
        lines = out.splitlines()
        source = next(i for i, line in enumerate(lines) if "status nearly" in line)
        caret = lines[source + 1]
        self.assertEqual(caret.strip(), "^" * len("nearly"))
        self.assertEqual(caret.index("^"), lines[source].index("nearly"))

    def test_a_reading_prints_the_doctrine_under_it(self):
        _, out, _ = self.run_cli(
            str(SAMPLES / "insurance.ddd"), "--no-color"
        )
        self.assertIn("ddd-too-much-core", out)
        self.assertIn("a budget rather than a compliment", out)


def _split_json(text: str) -> list[str]:
    """Several pretty-printed objects, back to back."""
    chunks: list[str] = []
    depth = 0
    current: list[str] = []
    for line in text.splitlines(keepends=True):
        current.append(line)
        depth += line.count("{") - line.count("}")
        if depth == 0 and current and "".join(current).strip():
            chunks.append("".join(current))
            current = []
    return chunks


if __name__ == "__main__":
    unittest.main()
