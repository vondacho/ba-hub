"""The scanner, which both notations share."""

from __future__ import annotations

import unittest

from bacm.lexer import ARROW, BIARROW, EOF, SLASH, STRING, tokenize
from bacm.problems import LexError


def kinds(source: str) -> list[str]:
    return [token.type for token in tokenize(source)]


def values(source: str) -> list[str]:
    return [token.value for token in tokenize(source)]


class TestTrivia(unittest.TestCase):
    def test_whitespace_is_never_syntax(self):
        """The language is brace-delimited: indentation is a formatting choice."""
        tight = values('map "A"{domain "B"{}}')
        loose = values('map   "A"\n\t{\r\n  domain "B" {\n}\n}\n')
        self.assertEqual(tight, loose)

    def test_comments_are_not_emitted(self):
        self.assertEqual(values('// a note\nmap "A"'), ["map", "A", ""])

    def test_a_comment_runs_to_end_of_line_only(self):
        self.assertEqual(values('map // here\n"A"'), ["map", "A", ""])

    def test_lines_and_columns(self):
        tokens = tokenize('map "A" {\n  domain "B"\n}')
        domain = tokens[3]
        self.assertEqual((domain.span.line, domain.span.column), (2, 3))


class TestPunctuation(unittest.TestCase):
    def test_longest_match_first(self):
        """`<->` before `->` before `/`."""
        self.assertEqual(kinds("<-> -> /")[:3], [BIARROW, ARROW, SLASH])

    def test_a_pattern_pair(self):
        """The `/` is its own token: one relationship with two named positions,
        not two relationships."""
        self.assertEqual(
            values('"A" -> "B" : open-host-service / conformist')[:7],
            ["A", "->", "B", ":", "open-host-service", "/", "conformist"],
        )


class TestWords(unittest.TestCase):
    def test_hyphens_are_word_characters(self):
        """So `open-host-service` and `big-ball-of-mud` lex as one token rather
        than three and two subtractions."""
        self.assertEqual(values("big-ball-of-mud")[0], "big-ball-of-mud")

    def test_a_word_may_not_start_with_a_digit(self):
        """Nothing in either notation is numeric, so a digit at the start is an
        unexpected character rather than an identifier."""
        with self.assertRaises(LexError):
            tokenize("2fast")

    def test_underscores_start_and_continue(self):
        self.assertEqual(values("_a_b1")[0], "_a_b1")


class TestStrings(unittest.TestCase):
    def test_two_escapes_and_nothing_else(self):
        self.assertEqual(values(r'"a\"b\\c"')[0], 'a"b\\c')

    def test_a_lone_backslash_is_a_backslash(self):
        """Inventing more escapes would mean a Windows path in a note needed
        doubling."""
        self.assertEqual(values(r'"C:\temp\n"')[0], "C:\\temp\\n")

    def test_a_string_may_span_lines(self):
        """A continuation is joined to the line above with a single space after
        its indentation is stripped - which is what lets `intent` and `because`
        hold a paragraph without 300-column lines."""
        source = '"Underwrite risk, price it,\n            and pay what is owed."'
        self.assertEqual(
            values(source)[0], "Underwrite risk, price it, and pay what is owed."
        )

    def test_a_blank_continuation_line_is_dropped(self):
        self.assertEqual(values('"one\n\n   two"')[0], "one two")

    def test_a_single_line_string_keeps_its_spaces(self):
        self.assertEqual(values('"  padded  "')[0], "  padded  ")

    def test_unterminated_raises_and_points_at_the_opening_quote(self):
        """A broken string literal makes every token after it meaningless -
        there is no useful recovery and pretending otherwise produces a cascade
        of nonsense."""
        with self.assertRaises(LexError) as caught:
            tokenize('map "A" {\n  domain "unclosed\n}')
        self.assertEqual(caught.exception.code, "unterminated-string")
        self.assertEqual((caught.exception.span.line, caught.exception.span.column), (2, 10))

    def test_a_title_can_never_collide_with_a_keyword(self):
        tokens = tokenize('map "domain"')
        self.assertEqual((tokens[1].type, tokens[1].value), (STRING, "domain"))


class TestRefusals(unittest.TestCase):
    def test_an_unexpected_character_raises(self):
        with self.assertRaises(LexError) as caught:
            tokenize('map "A" @ {}')
        self.assertEqual(caught.exception.code, "unexpected-character")
        self.assertIn("'@'", caught.exception.message)

    def test_the_stream_always_ends_with_eof(self):
        self.assertEqual(kinds("")[-1], EOF)
        self.assertEqual(kinds('map "A"')[-1], EOF)


if __name__ == "__main__":
    unittest.main()
