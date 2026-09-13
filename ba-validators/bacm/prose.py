"""
The few text heuristics the doctrine readings need.

Everything here is a **heuristic**, and that word is load-bearing. The rules in
the two parsers are decidable: a `value` carrying an `id` is wrong, an arrow
under `partnership` is wrong, and there is nothing to argue about. Whether a
`because` has been softened into something diplomatic is a judgement about
English, and a judgement about English made by a word list is going to be wrong
sometimes.

So anything built on this module is a **reading** - never an error, never a
warning - and it is phrased so that being wrong costs nothing. "This `because`
restates the pattern name" invites a look; "this `because` is dishonest" would
be a claim this module cannot support, about the one field the doctrine says is
hardest to write.
"""

from __future__ import annotations

import re
from typing import Final, Iterable

#: Words that carry no content for an overlap comparison.
STOPWORDS: Final[frozenset[str]] = frozenset(
    """
    a an and any are as at be because been being but by can cannot could did
    do does for from had has have if in into is it its not of on one only or
    our so than that the their them then there these they this those to us was
    we were what when which while who whom will with would
    """.split()
)

_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*")


def words(text: str) -> list[str]:
    return [match.group(0).lower() for match in _WORD.finditer(text)]


def content_words(text: str) -> list[str]:
    return [word for word in words(text) if word not in STOPWORDS]


def adds_nothing_to(text: str, label: str) -> bool:
    """Does `text` say anything its own label does not already say?

    True when every content word in `text` already appears in `label`. So a
    `because` reading "they are our supplier" under `customer-supplier` adds
    nothing, and one reading "both teams sit under the same director, so
    quotation can ask for a change upstream and get it - that is what makes
    this customer/supplier rather than conformist" adds a great deal, even
    though it *mentions* the pattern twice.

    The direction matters, and getting it backwards is the obvious mistake:
    scoring how much of the label is in the text flags every rationale that
    names its own pattern for contrast, which is exactly what the two
    best-written `because` fields in ba-cm's own sample do.
    """
    said = set(content_words(text))
    if not said:
        return True
    return said <= set(content_words(label))


def count(n: int, singular: str, plural: str | None = None) -> str:
    """`3 contexts`, `1 context`, `1 subdomain`.

    A finding that says "1 contexts" reads as a tool that was not finished, and
    a reader who notices that stops trusting the sentence around it.
    """
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"


def verb(n: int, singular: str, plural: str) -> str:
    """`has` against `have` - the agreement `count` cannot do."""
    return singular if n == 1 else plural


def listed(names: Iterable[str]) -> str:
    """`a`, `a and b`, `a, b and c` - `outline.ts`'s own helper, and its
    reason: a list a person reads rather than a JSON array."""
    items = list(names)
    if len(items) <= 1:
        return items[0] if items else ""
    return f"{', '.join(items[:-1])} and {items[-1]}"


def quoted(names: Iterable[str]) -> str:
    return listed(f'"{name}"' for name in names)
