"""The `.ddm` grammar, and the tactical doctrine over it."""

from __future__ import annotations

import unittest

from bacm.ddm import doctrine, parse
from bacm.problems import Severity

# The shape the notation document uses as its worked example, trimmed to what
# a test needs and correct in every way the parser checks.
CLEAN = """
context "Risk appetite" {

  value "Money" {
    attribute "amount"   : "Decimal"
    attribute "currency" : "CurrencyCode"
  }

  enum "SubmissionState" {
    "Draft" "Submitted" "Referred"
  }

  aggregate "Submission" {
    intent    "A request to write a risk."
    invariant "A withdrawn submission cannot be referred."

    root entity "Submission" {
      id         "SubmissionId"
      attribute  "receivedAt" : "Instant"
      embeds     "SubmissionState" one
      contains   "RiskItem" at-least-one
      references "AppetiteRuleSet" one
    }

    entity "RiskItem" {
      id     "RiskItemId"
      embeds "Money" one
    }
  }

  aggregate "AppetiteRuleSet" {
    invariant "Exactly one version is effective on any given date."
    root entity "AppetiteRuleSet" { id "AppetiteRuleSetId" }
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
    def test_the_clean_model_parses_with_nothing_to_say(self):
        result = parse(CLEAN)
        self.assertTrue(result.ok, codes(result.problems))
        self.assertEqual(result.problems, [], codes(result.problems))

    def test_a_file_starts_with_context(self):
        result = parse('aggregate "A" { }')
        self.assertFalse(result.ok)
        self.assertEqual(codes(result.problems), ["expected-context"])

    def test_model_is_accepted_as_a_synonym(self):
        """It is sitting in browsers and in repositories, and a format that
        stops reading its own older files is a format nobody trusts."""
        result = parse('model "Rating" { }')
        self.assertTrue(result.ok, codes(result.problems))
        self.assertEqual(result.document.context, "Rating")

    def test_the_models_own_braces_are_required(self):
        result = parse('context "Rating"')
        self.assertIn("expected-brace", codes(result.problems))

    def test_a_lexical_failure_is_the_one_error(self):
        result = parse('context "Rating" {\n  aggregate "unclosed\n}')
        self.assertEqual(codes(result.problems), ["unterminated-string"])


class TestAggregates(unittest.TestCase):
    def test_an_aggregate_needs_exactly_one_root(self):
        """Without one there is no boundary, only a group of classes."""
        result = parse('context "C" { aggregate "A" }')
        self.assertIn("no-root", codes(result.problems))
        self.assertFalse(result.ok)

    def test_a_second_root_is_two_aggregates_in_one_box(self):
        result = parse(
            'context "C" { aggregate "A" { root entity "One" { id "x" } '
            'root entity "Two" { id "y" } } }'
        )
        self.assertIn("second-root", codes(result.problems))

    def test_root_is_followed_by_an_entity(self):
        result = parse('context "C" { aggregate "A" { root value "V" { } } }')
        self.assertIn("root-without-entity", codes(result.problems))

    def test_an_aggregate_is_named_after_its_root(self):
        """The two sharing a name is the idiom, not a collision."""
        result = parse(
            'context "C" { aggregate "Submission" { invariant "x" '
            'root entity "Submission" { id "SubmissionId" } } }'
        )
        self.assertTrue(result.ok, codes(result.problems))

    def test_anything_else_sharing_that_name_is_two_ideas_in_one_word(self):
        result = parse(
            'context "C" { aggregate "Line" { invariant "x" '
            'root entity "Root" { id "i" contains "Line" one } } '
            'value "Line" { attribute "a" : "T" } }'
        )
        self.assertIn("name-collides-with-aggregate", codes(result.problems))

    def test_no_invariant_is_a_warning_not_an_error(self):
        """The file still opens - it is one of the two things the doctrine tells
        you to look at first, so the tool says it out loud without refusing to
        show you the model."""
        result = parse(
            'context "C" { aggregate "A" { root entity "A" { id "i" } } }'
        )
        self.assertTrue(result.ok, codes(result.problems))
        warning = next(p for p in result.problems if p.code == "no-invariant")
        self.assertEqual(warning.severity, Severity.WARNING)


class TestIdentity(unittest.TestCase):
    def test_a_value_object_cannot_have_an_id(self):
        """Identity is the whole difference between the two: two values with
        the same fields *are* the same value. So it is refused rather than
        warned about."""
        result = parse('context "C" { value "V" { id "VId" } }')
        self.assertIn("value-with-id", codes(result.problems))
        self.assertFalse(result.ok)

    def test_a_root_with_no_id_is_a_warning(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" root entity "A" { } } }'
        )
        self.assertIn("root-without-id", codes(result.problems))
        self.assertTrue(result.ok, codes(result.problems))


class TestNames(unittest.TestCase):
    def test_names_are_identities_within_one_model(self):
        """Two things called `Line` in one bounded context is the ubiquitous
        language failing, not a namespacing problem to be solved with dots."""
        result = parse(
            'context "C" { value "Line" { attribute "a" : "T" } '
            'value "Line" { attribute "b" : "T" } }'
        )
        self.assertIn("duplicate-name", codes(result.problems))

    def test_a_member_may_be_declared_after_the_link_that_names_it(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "Later" one } '
            'entity "Later" { id "j" } } }'
        )
        self.assertTrue(result.ok, codes(result.problems))
        self.assertEqual(len(result.document.links), 1)

    def test_an_undeclared_target(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "Ghost" one } } }'
        )
        self.assertIn("unknown-target", codes(result.problems))


class TestTheThreeLinks(unittest.TestCase):
    def test_contains_is_for_entities_in_the_same_aggregate(self):
        result = parse(CLEAN)
        contains = [link for link in result.document.links if link.kind == "contains"]
        self.assertEqual(len(contains), 1)

    def test_contains_never_points_at_an_aggregate(self):
        """What you can hold across a boundary is its identity.

        The aggregate here is deliberately *not* named after its root: with the
        idiomatic naming, `contains "B"` resolves in the member namespace to
        the root entity called `B` and gets the across-a-boundary message
        instead. Both are refusals and the second is arguably the better
        sentence - see the namespace test below.
        """
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "Basket" one } } '
            'aggregate "Basket" { invariant "y" root entity "Line" { id "j" } } }'
        )
        self.assertIn("contains-an-aggregate", codes(result.problems))

    def test_contains_never_points_at_a_value(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "V" one } '
            'value "V" { attribute "a" : "T" } } }'
        )
        self.assertIn("contains-a-value", codes(result.problems))

    def test_contains_never_crosses_a_boundary(self):
        """Across a boundary you hold an identity and load the other aggregate
        separately, which is the rule that makes a boundary worth having."""
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "Theirs" one } } '
            'aggregate "B" { invariant "y" root entity "B" { id "j" } '
            'entity "Theirs" { id "k" } } }'
        )
        self.assertIn("contains-across-a-boundary", codes(result.problems))

    def test_embeds_never_points_at_an_entity(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" embeds "Part" one } '
            'entity "Part" { id "j" } } }'
        )
        self.assertIn("embeds-an-entity", codes(result.problems))

    def test_embeds_reaches_a_shared_value(self):
        """Same aggregate, or declared at model level and shared."""
        result = parse(CLEAN)
        embeds = [link for link in result.document.links if link.kind == "embeds"]
        self.assertEqual(len(embeds), 2)

    def test_embeds_never_reaches_into_another_aggregate(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" embeds "Theirs" one } } '
            'aggregate "B" { invariant "y" root entity "B" { id "j" } '
            'value "Theirs" { attribute "a" : "T" } } }'
        )
        self.assertIn("embeds-another-aggregates-value", codes(result.problems))

    def test_references_names_an_aggregate_and_never_its_parts(self):
        """Reaching past a root is how a boundary stops being one."""
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" references "Part" one } } '
            'aggregate "B" { invariant "y" root entity "B" { id "j" } '
            'entity "Part" { id "k" } } }'
        )
        self.assertIn("references-past-a-root", codes(result.problems))

    def test_a_member_does_not_reference_its_own_aggregate(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "Root" { id "i" references "A" one } } }'
        )
        self.assertIn("references-own-aggregate", codes(result.problems))

    def test_the_link_kind_chooses_the_namespace(self):
        """Two namespaces, and each falls back to the other.

        `references` looks for an aggregate first and `contains`/`embeds` look
        for a member first, so a link that names the wrong kind of thing is
        told *what it found* rather than that the name does not exist. Neither
        ever reports "unknown", which is the point of the fallback.
        """
        # `contains` naming an aggregate: found in the member namespace as that
        # aggregate's root, and refused for crossing a boundary.
        contains = parse(
            'context "C" { aggregate "Submission" { invariant "x" '
            'root entity "Submission" { id "i" } } '
            'aggregate "Other" { invariant "y" '
            'root entity "Other" { id "j" contains "Submission" one } } }'
        )
        self.assertIn("contains-across-a-boundary", codes(contains.problems))
        self.assertNotIn("unknown-target", codes(contains.problems))

        # `references` naming a member: found in the aggregate namespace? No -
        # it falls back to the member namespace and is told it is reaching past
        # a root.
        references = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" references "Part" one } } '
            'aggregate "B" { invariant "y" root entity "B" { id "j" } '
            'entity "Part" { id "k" } } }'
        )
        self.assertIn("references-past-a-root", codes(references.problems))
        self.assertNotIn("unknown-target", codes(references.problems))


class TestMultiplicity(unittest.TestCase):
    def test_the_four_words(self):
        for word in ("one", "optional", "many", "at-least-one"):
            result = parse(
                'context "C" { aggregate "A" { invariant "x" '
                f'root entity "A" {{ id "i" contains "P" {word} }} '
                'entity "P" { id "j" } } }'
            )
            self.assertTrue(result.ok, f"{word}: {codes(result.problems)}")
            self.assertEqual(result.document.links[0].multiplicity, word)

    def test_it_defaults_to_one(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "P" } entity "P" { id "j" } } }'
        )
        self.assertEqual(result.document.links[0].multiplicity, "one")

    def test_a_misspelled_multiplicity_says_how_many(self):
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "P" lots } entity "P" { id "j" } } }'
        )
        self.assertIn("expected-multiplicity", codes(result.problems))


class TestBodies(unittest.TestCase):
    def test_an_attribute_is_a_name_a_colon_and_a_type(self):
        result = parse(
            'context "C" { value "V" { attribute "amount" : "Decimal" } }'
        )
        attribute = result.document.values[0].attributes[0]
        self.assertEqual((attribute.name, attribute.type), ("amount", "Decimal"))

    def test_an_attribute_needs_its_colon(self):
        result = parse('context "C" { value "V" { attribute "a" "T" } }')
        self.assertIn("expected-colon", codes(result.problems))

    def test_an_enum_holds_bare_strings(self):
        result = parse('context "C" { enum "E" { "One" "Two" } }')
        self.assertEqual(result.document.enums[0].literals, ["One", "Two"])

    def test_an_empty_enum_warns(self):
        result = parse('context "C" { enum "E" { } }')
        self.assertIn("enum-without-values", codes(result.problems))
        self.assertTrue(result.ok, codes(result.problems))

    def test_a_member_the_root_cannot_reach(self):
        """Everything in an aggregate is loaded and saved through the root."""
        result = parse(
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" } entity "Orphan" { id "j" } } }'
        )
        self.assertIn("unreachable-member", codes(result.problems))

    def test_a_shared_value_nothing_embeds(self):
        result = parse('context "C" { value "V" { attribute "a" : "T" } }')
        self.assertIn("shared-with-nothing", codes(result.problems))
        self.assertTrue(result.ok, codes(result.problems))


class TestDoctrine(unittest.TestCase):
    def test_nothing_is_ever_an_error(self):
        findings = read(
            'context "C" { aggregate "A" { root entity "A" { id "i" } } }'
        )
        self.assertTrue(findings)
        self.assertNotIn(Severity.ERROR, [f.severity for f in findings])

    def test_the_unprotected_total(self):
        source = (
            'context "C" { aggregate "A" { root entity "A" { id "i" } } '
            'aggregate "B" { invariant "x" root entity "B" { id "j" } } }'
        )
        finding = next(f for f in read(source) if f.code == "ddm-unprotected")
        self.assertIn("1 aggregate of 2 protects no invariant", finding.message)

    def test_the_anonymous_entity_total(self):
        source = (
            'context "C" { aggregate "A" { invariant "x" '
            'root entity "A" { id "i" contains "P" one } entity "P" { } } }'
        )
        finding = next(f for f in read(source) if f.code == "ddm-anonymous-entities")
        self.assertIn("1 entity has no `id`", finding.message)

    def test_a_crowded_aggregate(self):
        members = " ".join(
            f'entity "P{n}" {{ id "i{n}" }}' for n in range(8)
        )
        holds = " ".join(f'contains "P{n}" one' for n in range(8))
        source = (
            f'context "C" {{ aggregate "A" {{ invariant "x" '
            f'root entity "A" {{ id "i" {holds} }} {members} }} }}'
        )
        finding = next(f for f in read(source) if f.code == "ddm-crowded")
        self.assertIn("more than 7 members", finding.message)

    def test_the_threshold_is_not_tunable(self):
        """A number somebody can raise until the warning stops is a number that
        will be raised until the warning stops."""
        self.assertEqual(doctrine.CROWDED, 7)

    def test_two_values_with_the_same_fields_are_the_same_value(self):
        source = (
            'context "C" { value "Money" { attribute "amount" : "Decimal" '
            'attribute "currency" : "CurrencyCode" } '
            'value "Amount" { attribute "currency" : "CurrencyCode" '
            'attribute "amount" : "Decimal" } }'
        )
        finding = next(f for f in read(source) if f.code == "ddm-identical-values")
        self.assertIn("Money and Amount", finding.message)

    def test_different_fields_are_different_values(self):
        source = (
            'context "C" { value "Money" { attribute "amount" : "Decimal" } '
            'value "Weight" { attribute "amount" : "Grams" } }'
        )
        self.assertNotIn("ddm-identical-values", [f.code for f in read(source)])

    def test_a_value_with_no_fields(self):
        source = 'context "C" { value "Marker" { } }'
        self.assertIn("ddm-value-without-fields", [f.code for f in read(source)])

    def test_the_crossings_are_named(self):
        findings = read(CLEAN)
        crossings = [f for f in findings if f.code == "ddm-crossing"]
        self.assertEqual(len(crossings), 1)
        self.assertIn(
            'holds the identity of "AppetiteRuleSet"', crossings[0].message
        )

    def test_several_boundaries_and_no_crossings(self):
        source = (
            'context "C" { aggregate "A" { invariant "x" root entity "A" { id "i" } } '
            'aggregate "B" { invariant "y" root entity "B" { id "j" } } }'
        )
        self.assertIn("ddm-no-crossings", [f.code for f in read(source)])

    def test_every_reading_has_the_doctrine_behind_it(self):
        from bacm import hint_for

        for code in doctrine.hints():
            self.assertTrue(hint_for(code), code)


if __name__ == "__main__":
    unittest.main()
