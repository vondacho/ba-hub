"""The `.ddd` grammar, and the strategic doctrine over it."""

from __future__ import annotations

import unittest

from bacm.ddd import doctrine, parse
from bacm.problems import Severity

# A map that is correct in every way the parser and the doctrine check, so a
# test can add exactly one mistake to it and see exactly one finding.
CLEAN = """
map "Clean" {
  domain "Whole business" {
    owner "The board"
    subdomain core "Underwriting" {
      owner "Head of underwriting"
      context "Risk appetite" {
        owner     "Head of underwriting"
        language  "Submission" "Appetite rule"
        aggregate "Submission"
      }
    }
    subdomain supporting "Billing" {
      owner "Finance director"
      context "Ledger" {
        owner     "Finance director"
        language  "Instalment" "Premium due"
        aggregate "Invoice"
      }
    }
  }

  "Risk appetite" -> "Ledger" : customer-supplier {
    exchange "An accepted risk with its terms."
    because  "Both teams report to the same director, so a change can be asked for."
  }
}
"""


def codes(problems) -> list[str]:
    return [p.code for p in problems]


def read(source: str) -> list:
    result = parse(source)
    assert not [p for p in result.problems if p.is_error], codes(result.problems)
    return doctrine.read(result.document)


class TestTheFile(unittest.TestCase):
    def test_the_clean_map_parses_with_nothing_to_say(self):
        result = parse(CLEAN)
        self.assertTrue(result.ok)
        self.assertEqual(result.problems, [], codes(result.problems))

    def test_a_file_must_start_with_map(self):
        result = parse('domain "D" { }')
        self.assertFalse(result.ok)
        self.assertEqual(codes(result.problems), ["expected-map"])
        # Nothing readable comes back, so nothing is claimed about it.
        self.assertEqual(result.document.nodes, [])

    def test_the_maps_own_braces_are_required(self):
        """A file whose block never opened has nothing in it and is almost
        always a truncated paste rather than an empty map."""
        result = parse('map "A"')
        self.assertIn("expected-brace", codes(result.problems))

    def test_every_body_inside_the_map_is_optional(self):
        result = parse(
            'map "A" { domain "D" { owner "P" subdomain core "S" { owner "P" '
            'context "C" { owner "P" language "t" } } } }'
        )
        self.assertTrue(result.ok, codes(result.problems))
        self.assertEqual(len(result.document.nodes), 3)

    def test_a_bare_domain_is_legal(self):
        result = parse('map "A" { domain "D" }')
        self.assertTrue(result.ok, codes(result.problems))

    def test_a_lexical_failure_is_the_one_error(self):
        """An unterminated string makes every token after it meaningless."""
        result = parse('map "A" { domain "unclosed\n}')
        self.assertEqual(codes(result.problems), ["unterminated-string"])

    def test_an_unclosed_block_is_reported(self):
        result = parse('map "A" { domain "D" {')
        self.assertIn("unclosed-block", codes(result.problems))


class TestContainment(unittest.TestCase):
    def test_nesting_is_containment(self):
        document = parse(CLEAN).document
        context = next(c for c in document.contexts if c.name == "Risk appetite")
        self.assertEqual(
            [document.name_of(parent) for parent in context.serves], ["Underwriting"]
        )

    def test_a_context_may_sit_directly_inside_a_domain(self):
        """Legal, and usually a map that has not finished dividing the domain
        yet."""
        result = parse(
            'map "A" { domain "D" { owner "P" context "C" { owner "P" language "t" } } }'
        )
        self.assertTrue(result.ok, codes(result.problems))
        context = result.document.contexts[0]
        self.assertEqual(result.document.name_of(context.serves[0]), "D")

    def test_serves_is_the_straddle(self):
        result = parse(
            """
            map "A" {
              domain "D" {
                owner "P"
                subdomain core "One" { owner "P"
                  context "C" { owner "P" language "t" serves "Two" } }
                subdomain core "Two" { owner "P"
                  context "Other" { owner "P" language "u" } }
              }
            }
            """
        )
        context = next(c for c in result.document.contexts if c.name == "C")
        self.assertEqual(
            sorted(result.document.name_of(p) for p in context.serves), ["One", "Two"]
        )

    def test_serves_naming_nothing(self):
        result = parse(
            'map "A" { domain "D" { context "C" { serves "Nowhere" } } }'
        )
        self.assertIn("unknown-serves", codes(result.problems))

    def test_a_context_does_not_serve_a_context(self):
        result = parse(
            """
            map "A" {
              domain "D" {
                context "One" { }
                context "Two" { serves "One" }
              }
            }
            """
        )
        self.assertIn("serves-a-context", codes(result.problems))

    def test_a_subdomain_needs_a_classification(self):
        """The classification is a budget, not a label."""
        result = parse('map "A" { domain "D" { subdomain "S" { } } }')
        self.assertIn("expected-classification", codes(result.problems))

    def test_one_bad_subdomain_head_reports_once(self):
        """Without `skipDeclaration` this reports three errors - the
        classification, then the name, then the `{`."""
        result = parse('map "A" { domain "D" { subdomain wrong "S" { } } }')
        self.assertEqual(
            [c for c in codes(result.problems) if c == "expected-classification"],
            ["expected-classification"],
        )
        self.assertNotIn("unexpected-in-body", codes(result.problems))


class TestNamesAreIdentities(unittest.TestCase):
    def test_two_nodes_may_not_share_a_name(self):
        result = parse(
            'map "A" { domain "D" { context "Same" { } context "Same" { } } }'
        )
        self.assertIn("duplicate-name", codes(result.problems))
        error = next(p for p in result.problems if p.code == "duplicate-name")
        self.assertIn("already declared as a context on line 1", error.message)

    def test_a_relationship_resolves_by_name_after_the_whole_file_is_read(self):
        """The sample file puts the whole map after the whole domain."""
        result = parse(
            """
            map "A" {
              "Early" <-> "Late" : partnership { because "They ship together." }
              domain "D" {
                owner "P"
                subdomain core "S" { owner "P"
                  context "Early" { owner "P" language "a" }
                  context "Late"  { owner "P" language "b" } }
              }
            }
            """
        )
        self.assertTrue(result.ok, codes(result.problems))
        self.assertEqual(len(result.document.relationships), 1)

    def test_an_undeclared_endpoint(self):
        result = parse(
            'map "A" { domain "D" { context "One" { } } '
            '"One" -> "Ghost" : conformist { because "x" } }'
        )
        self.assertIn("unknown-context", codes(result.problems))


class TestRelationships(unittest.TestCase):
    def test_relationships_run_between_contexts(self):
        result = parse(
            """
            map "A" {
              domain "D" { subdomain core "S" { context "C" { } } }
              "C" -> "S" : conformist { because "x" }
            }
            """
        )
        self.assertIn("relationship-end-not-a-context", codes(result.problems))

    def test_a_context_cannot_relate_to_itself(self):
        result = parse(
            'map "A" { domain "D" { context "C" { } } '
            '"C" -> "C" : conformist { because "x" } }'
        )
        self.assertIn("self-relationship", codes(result.problems))

    def test_a_mutual_pattern_may_not_be_written_with_an_arrow(self):
        """An arrow asserts an upstream the pattern denies."""
        for pattern in ("partnership", "shared-kernel", "separate-ways"):
            result = parse(
                'map "A" { domain "D" { context "X" { } context "Y" { } } '
                f'"X" -> "Y" : {pattern} {{ because "x" }} }}'
            )
            self.assertIn("mutual-pattern-with-arrow", codes(result.problems), pattern)

    def test_a_directed_pattern_requires_one(self):
        for pattern in (
            "customer-supplier",
            "conformist",
            "anticorruption-layer",
            "open-host-service",
            "published-language",
        ):
            result = parse(
                'map "A" { domain "D" { context "X" { } context "Y" { } } '
                f'"X" <-> "Y" : {pattern} {{ because "x" }} }}'
            )
            self.assertIn(
                "directed-pattern-without-arrow", codes(result.problems), pattern
            )

    def test_big_ball_of_mud_takes_either(self):
        """It is not a pattern anybody chooses, and a ball of mud with a
        discernible direction is still a ball of mud."""
        for arrow in ("->", "<->"):
            result = parse(
                'map "A" { domain "D" { owner "P" context "X" { owner "P" language "a" } '
                'context "Y" { owner "P" language "b" } } '
                f'"X" {arrow} "Y" : big-ball-of-mud {{ because "Nobody owns it." }} }}'
            )
            self.assertTrue(result.ok, codes(result.problems))

    def test_a_pattern_pair_is_one_relationship_with_two_positions(self):
        result = parse(
            'map "A" { domain "D" { owner "P" context "X" { owner "P" language "a" } '
            'context "Y" { owner "P" language "b" } } '
            '"X" -> "Y" : open-host-service / anticorruption-layer '
            '{ because "Their model is unsuitable." } }'
        )
        self.assertTrue(result.ok, codes(result.problems))
        edge = result.document.relationships[0]
        self.assertEqual(edge.pattern, ("open-host-service", "anticorruption-layer"))

    def test_a_pattern_pair_needs_an_arrow(self):
        """Two patterns describe an upstream role and a downstream one."""
        result = parse(
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" <-> "Y" : open-host-service / conformist { because "x" } }'
        )
        self.assertIn("dual-pattern-without-arrow", codes(result.problems))

    def test_the_dual_check_reports_one_mistake_once(self):
        """`<->` with two roles is one mistake and reporting it three times
        reads as three."""
        result = parse(
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" <-> "Y" : open-host-service / conformist { because "x" } }'
        )
        self.assertNotIn("directed-pattern-without-arrow", codes(result.problems))

    def test_only_the_nine_patterns(self):
        result = parse(
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" -> "Y" : depends-on { because "x" } }'
        )
        self.assertIn("expected-pattern", codes(result.problems))

    def test_on_a_directed_edge_the_left_name_is_upstream(self):
        edge = parse(CLEAN).document.relationships[0]
        document = parse(CLEAN).document
        self.assertTrue(edge.directed)
        self.assertEqual(document.name_of(edge.from_), "Risk appetite")


class TestFields(unittest.TestCase):
    def test_language_and_aggregate_take_one_or_more_and_accumulate(self):
        result = parse(
            'map "A" { domain "D" { context "C" { '
            'language "a" "b" language "c" aggregate "X" aggregate "Y" "Z" } } }'
        )
        context = result.document.contexts[0]
        self.assertEqual(context.language, ["a", "b", "c"])
        self.assertEqual(context.aggregates, ["X", "Y", "Z"])

    def test_language_needs_at_least_one_term(self):
        result = parse('map "A" { domain "D" { context "C" { language } } }')
        self.assertIn("expected-language", codes(result.problems))

    def test_the_three_statuses(self):
        for status in ("modelled", "drafted", "unmodelled"):
            result = parse(
                f'map "A" {{ domain "D" {{ context "C" {{ status {status} }} }} }}'
            )
            self.assertEqual(result.document.contexts[0].status, status)

    def test_any_other_status_is_refused(self):
        result = parse('map "A" { domain "D" { context "C" { status nearly } } }')
        self.assertIn("expected-status", codes(result.problems))

    def test_a_second_intent_warns_and_the_later_one_wins(self):
        result = parse(
            'map "A" { domain "D" { intent "first" intent "second" } }'
        )
        self.assertIn("second-intent", codes(result.problems))
        self.assertEqual(result.document.domains[0].intent, "second")
        self.assertTrue(result.ok)


class TestParserWarnings(unittest.TestCase):
    def test_no_because(self):
        result = parse(
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" -> "Y" : conformist }'
        )
        warning = next(p for p in result.problems if p.code == "no-because")
        self.assertEqual(warning.severity, Severity.WARNING)
        self.assertIn("the vendor will not change for us", warning.message)
        self.assertTrue(result.ok)

    def test_no_owner(self):
        result = parse('map "A" { domain "D" { } }')
        self.assertIn("no-owner", codes(result.problems))

    def test_no_language(self):
        result = parse('map "A" { domain "D" { context "C" { } } }')
        self.assertIn("no-language", codes(result.problems))

    def test_a_generic_subdomain_declaring_aggregates(self):
        """Modelling a bought package is core-domain effort spent on somebody
        else's solved problem."""
        result = parse(
            'map "A" { domain "D" { subdomain generic "Buy it" { '
            'context "C" { aggregate "Thing" } } } }'
        )
        self.assertIn("generic-with-aggregates", codes(result.problems))

    def test_a_subdomain_with_no_context(self):
        result = parse('map "A" { domain "D" { subdomain core "S" { } } }')
        self.assertIn("subdomain-without-context", codes(result.problems))

    def test_warnings_never_make_a_document_fail(self):
        """A map that has to be perfect before it draws is a map nobody starts."""
        result = parse('map "A" { domain "D" { context "C" { } } }')
        self.assertTrue(result.ok)
        self.assertTrue(result.problems)


class TestDoctrine(unittest.TestCase):
    def test_nothing_is_ever_an_error(self):
        findings = read('map "A" { domain "D" { context "C" { } } }')
        self.assertTrue(findings)
        self.assertNotIn(Severity.ERROR, [f.severity for f in findings])

    def test_the_core_budget(self):
        source = 'map "A" { domain "D" { ' + " ".join(
            f'subdomain core "S{n}" {{ context "C{n}" {{ }} }}' for n in range(3)
        ) + " } }"
        finding = next(f for f in read(source) if f.code == "ddd-too-much-core")
        self.assertIn("3 subdomains are `core`", finding.message)

    def test_two_core_subdomains_is_not_a_finding(self):
        source = 'map "A" { domain "D" { ' + " ".join(
            f'subdomain core "S{n}" {{ context "C{n}" {{ }} }}' for n in range(2)
        ) + " } }"
        self.assertNotIn("ddd-too-much-core", [f.code for f in read(source)])

    def test_the_unowned_total(self):
        finding = next(f for f in read(CLEAN.replace('owner "The board"', "")) if f.code == "ddd-unowned")
        self.assertIn("1 boundary of 5 has no owner", finding.message)

    def test_a_term_in_two_contexts_language(self):
        source = """
        map "A" {
          domain "D" {
            context "One" { language "Policy" "Cover" }
            context "Two" { language "policy" "Claim" }
          }
        }
        """
        finding = next(f for f in read(source) if f.code == "ddd-shared-term")
        self.assertIn('"policy" is in the language of 2 contexts', finding.message)
        self.assertIn("One and Two", finding.message)

    def test_a_language_that_is_a_dictionary(self):
        terms = " ".join(f'"term{n}"' for n in range(16))
        source = f'map "A" {{ domain "D" {{ context "C" {{ language {terms} }} }} }}'
        self.assertIn(
            "ddd-language-is-a-dictionary", [f.code for f in read(source)]
        )

    def test_the_unjustified_total(self):
        source = """
        map "A" {
          domain "D" { context "X" { } context "Y" { } context "Z" { } }
          "X" -> "Y" : conformist
          "Y" -> "Z" : conformist { because "They will not change for us." }
        }
        """
        finding = next(f for f in read(source) if f.code == "ddd-unjustified")
        self.assertIn("1 of 2 relationships has no `because`", finding.message)

    def test_a_because_that_only_restates_the_pattern(self):
        source = (
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" -> "Y" : customer-supplier { because "They are our supplier." } }'
        )
        self.assertIn(
            "ddd-because-restates-pattern", [f.code for f in read(source)]
        )

    def test_a_because_that_names_its_pattern_for_contrast_is_not_flagged(self):
        """The two best-written `because` fields in ba-cm's own sample do
        exactly this, and an earlier version of the heuristic flagged both."""
        source = (
            'map "A" { domain "D" { context "X" { } context "Y" { } } '
            '"X" -> "Y" : customer-supplier { because "Both teams sit under the same '
            'director, so Y can ask for a change upstream and get it. That is what '
            'makes this customer/supplier rather than conformist." } }'
        )
        self.assertNotIn(
            "ddd-because-restates-pattern", [f.code for f in read(source)]
        )

    def test_a_map_with_no_uncomfortable_pattern_anywhere(self):
        """The characteristic failure of a context map is aspiration."""
        source = """
        map "A" {
          domain "D" { context "W" { } context "X" { } context "Y" { } context "Z" { } }
          "W" -> "X" : customer-supplier { because "a" }
          "X" -> "Y" : customer-supplier { because "b" }
          "Y" -> "Z" : open-host-service { because "c" }
        }
        """
        finding = next(f for f in read(source) if f.code == "ddd-reads-as-aspiration")
        self.assertIn("no `conformist`", finding.message)
        # And it never names an arrow or proposes a relabelling.
        self.assertNotIn("->", finding.message)

    def test_one_conformist_answers_it(self):
        source = """
        map "A" {
          domain "D" { context "W" { } context "X" { } context "Y" { } context "Z" { } }
          "W" -> "X" : customer-supplier { because "a" }
          "X" -> "Y" : customer-supplier { because "b" }
          "Y" -> "Z" : conformist { because "c" }
        }
        """
        self.assertNotIn(
            "ddd-reads-as-aspiration", [f.code for f in read(source)]
        )

    def test_two_relationships_are_too_few_to_ask(self):
        source = """
        map "A" {
          domain "D" { context "X" { } context "Y" { } }
          "X" -> "Y" : customer-supplier { because "a" }
        }
        """
        self.assertNotIn(
            "ddd-reads-as-aspiration", [f.code for f in read(source)]
        )

    def test_status_against_aggregates(self):
        source = """
        map "A" {
          domain "D" {
            context "One" { status modelled }
            context "Two" { status unmodelled aggregate "Thing" }
          }
        }
        """
        found = [f.code for f in read(source)]
        self.assertIn("ddd-modelled-without-aggregates", found)
        self.assertIn("ddd-unmodelled-with-aggregates", found)

    def test_the_straddle_is_named_where_it_happens(self):
        source = """
        map "A" {
          domain "D" {
            subdomain core "One" { context "C" { serves "Two" } }
            subdomain core "Two" { context "Other" { } }
          }
        }
        """
        finding = next(f for f in read(source) if f.code == "ddd-straddle")
        self.assertIn("One and Two", finding.message)

    def test_every_reading_has_the_doctrine_behind_it(self):
        from bacm import hint_for

        for code in doctrine.hints():
            self.assertTrue(hint_for(code), code)


if __name__ == "__main__":
    unittest.main()
