# `bacm` — validators for ba-cm's notations

Python validators for the four kinds of file ba-cm reads and writes, built from
the doctrine and the BNF grammars that tool ships:

| File | What it is | Grammar | Doctrine |
|---|---|---|---|
| `.ddd` | a **context map** — the shape of a business | `ba-cm-notation.md` §2, `src/lib/ddd/` | `ba-cm-doctrine.md` |
| `.ddm` | a **domain model** — the inside of one bounded context | `ba-cm-notation.md` §4, `src/lib/ddm/` | `ba-cm-doctrine.md` |
| `.dddview` | where somebody dragged the boxes on a map (JSON) | `src/lib/view-file.ts` | — |
| `.ddmview` | the same, one zoom level down (JSON) | `src/lib/view-file.ts` | — |

Both notations serve domain-driven design, described in Eric Evans's
*Domain-Driven Design* (2003) and Vaughn Vernon's *Implementing Domain-Driven
Design* (2013). A context map is the **strategic** half — where the boundaries
are, and what runs between them. A domain model is the **tactical** half — what
is inside one boundary and what keeps it true.

No dependencies, standard library only.

```
python3 -m bacm.cli insurance.ddd
python3 -m bacm.cli .                      # walk a tree, then compare the documents
python3 -m bacm.cli . --strict --quiet     # CI: fail on warnings too
python3 -m bacm.cli . --json               # one object per file, plus the bundle
```

---

## Three levels, kept apart

**Errors** are decidable and come from the grammars: a `value` carrying an
`id`, an arrow under `partnership`, a `contains` reaching into another
aggregate, an aggregate with no `root`, two nodes sharing a name. These are
ba-cm's own messages — a document carrying one cannot be opened by the tool
these files are kept for.

**Warnings** are the formats' own second thoughts, and they are ba-cm's too: an
unowned boundary, a relationship with no `because`, an aggregate protecting no
invariant, a root with no `id`. The document parses and draws. *"Warnings never
block a render. A map that has to be perfect before it draws is a map nobody
starts."*

**Readings** are the doctrine's countable half, which ba-cm puts in
`outline.ts` rather than in its problems panel: three `core` subdomains, four
of six relationships with no rationale, an aggregate holding more than seven
members. *"Stated as findings, never as verdicts. Each one names what it saw so
a reader can disagree with it."*

```
exit 0   every file parses (and under --strict carries no warnings)
exit 1   at least one file has an error
exit 2   --strict, everything parses, and a warning stands
exit 3   the invocation was wrong — no such file, unrecognisable format
```

`--strict` promotes warnings and never readings. A map with three `core`
subdomains may be right, and a map with none of these findings may still be a
map of what everybody wishes were true — which is the failure no count can see.

---

## The cross-document check

This is the part neither ba-cm file does on its own, and the reason a validator
earns its place beside them. Point it at a directory and it reads the map, the
models beside it, and then the two against each other:

```
$ python3 -m bacm.cli samples/ --quiet
samples/insurance.ddd: parses. 2 warnings, 6 readings.
samples/insurance.dddview: parses. 0 warnings, 1 reading.
samples/risk-appetite/risk-appetite.ddm: parses. 0 warnings, 4 readings.

-- across the documents ----------------------------------------
reading: The map and this model agree on all 3 aggregates.  [bundle-agrees]
reading: 4 contexts are `modelled` with no `.ddm` in this bundle
         — Rating, Quotation, Claims and Product catalogue.  [bundle-missing-models]
reading: 1 of 9 contexts has a model in this bundle.  [bundle-coverage]
```

The seam between the two documents is name-based on purpose — *"a name,
matching the map's, because the name is the identity in both formats. It is
what lets the two documents be checked against each other without either one
holding a pointer into the other"* — and ba-cm's own seed model was chosen so
that the check would have something to find.

Every cross-document finding is a **warning at most**, never an error: each
document is valid on its own, and which of the two is behind is not something a
validator can know. A context renamed in the map and not yet in its model is a
normal state halfway through a rename.

| Code | | |
|---|---|---|
| `bundle-unknown-context` | warning | A `.ddm` naming a context the map does not declare (a case-only difference is pointed out). |
| `bundle-aggregate-not-modelled` | warning | The map promises a boundary the model has not drawn. |
| `bundle-aggregate-not-in-map` | warning | The model draws one the catalogue does not list. |
| `bundle-agrees`, `bundle-coverage`, `bundle-missing-models`, `bundle-no-map` | reading | What the archive holds. |

---

## What the doctrine reads

Every finding carries a stable kebab-case `code`, so a team can grep for one,
count it across a repository, or decide it disagrees with one. Readings also
carry the doctrine's own argument, printed under the message (`--quiet` drops
both).

### The context map — `ddd-*`

| Code | Reading |
|---|---|
| `ddd-too-much-core` | A classification is a **budget**, not a compliment. More than a couple of `core` subdomains and none of them are getting the deep model and the best people. |
| `ddd-reads-as-aspiration` | No pattern on the map admits to anything uncomfortable — no `conformist`, `anticorruption-layer`, `separate-ways` or `big-ball-of-mud` anywhere. |
| `ddd-unjustified` | How many relationships have no `because`, out of how many. |
| `ddd-because-restates-pattern` | A `because` whose every word is already in the pattern's own name. |
| `ddd-unowned` | How many boundaries have no owner, out of how many. |
| `ddd-no-language` | How many contexts have no `language`. A context with none has no edge. |
| `ddd-language-is-a-dictionary` | A context listing more than fifteen terms has recorded a data dictionary. |
| `ddd-shared-term` | A term in two contexts' `language`. Either the boundary is working, or the doctrine says there is none there. |
| `ddd-straddle` | A context serving two subdomains, named where it happens. |
| `ddd-modelled-without-aggregates`, `ddd-unmodelled-with-aggregates` | `status` and `aggregate` disagreeing about whether the emptiness is a decision. |
| `ddd-shape`, `ddd-patterns`, `ddd-no-relationships`, `ddd-empty-map` | What is on the map, counted once. |

### The domain model — `ddm-*`

| Code | Reading |
|---|---|
| `ddm-unprotected` | How many aggregates protect no invariant. An aggregate with nothing to protect is a table with extra ceremony. |
| `ddm-anonymous-entities` | How many entities have no `id`. Identity is the whole difference between an entity and a value object. |
| `ddm-crowded` | An aggregate holding more than seven members. A large aggregate is a contention problem before it is a design problem. |
| `ddm-identical-values` | Two value objects with the same fields. *Two values with the same fields are the same value* — read forwards, that definition is a check. |
| `ddm-value-without-fields` | A value object is its fields. |
| `ddm-crossing`, `ddm-no-crossings` | What `references` crosses between the boundaries. |
| `ddm-shape`, `ddm-shared`, `ddm-empty-model` | What the model holds. |

### The sidecars — `view-*`

A sidecar is generated and keyed by node name, and **losing one costs nothing**
— the diagram redraws from a computed layout. So a *missing* sidecar is never a
finding; only a present-and-wrong one is.

| Code | | |
|---|---|---|
| `view-not-json`, `view-not-an-object`, `view-wrong-format` | error | Something has renamed a different file to `.dddview`. |
| `view-no-version`, `view-too-new` | error | Written by a newer build. Nothing is lost. |
| `view-dropped-positions`, `view-dropped-curves` | warning | Every number is checked rather than trusted: a single non-finite coordinate reaching an SVG transform blanks the whole diagram with no error anywhere. The bad entries are dropped, as ba-cm drops them, and named here — ba-cm's user can see their boxes move, and a validator's user cannot. |
| `view-curves-on-a-model` | warning | Only the map's edges are draggable. |
| `view-for-another-document` | warning | Never a refusal: ids come from names, so a view from a renamed or forked document still lands on everything the two have in common. |
| `view-shape`, `view-orphaned-positions` | reading | What the arrangement holds, and which entries name something the document no longer declares. |

### What is deliberately *not* checked

Each doctrine has a "what not to do" section addressed to somebody editing a
document, and those are honoured by omission rather than by a check. No finding
in this package:

- **upgrades a `conformist`**, or says which arrow is mislabelled. The one
  reading that comes near it, `ddd-reads-as-aspiration`, says only that no
  pattern on the map admits to anything, and asks;
- **softens a `because`**, or rewrites one;
- **adds a `core` subdomain**, or invents any boundary;
- **draws an aggregate** around things that merely belong together, or writes
  an `invariant`;
- invents an `intent`, an `owner`, or a `language` term.

---

## Library use

```python
from bacm import validate_file, validate_bundle
from pathlib import Path

result = validate_file("insurance.ddd")
result.parses                  # no errors
result.errors                  # the grammar
result.warnings                # the format's second thoughts
result.infos                   # the doctrine's readings
result.findings                # everything, worst first then in file order
result.ok(strict=True)
print(result.summary())

result.document.contexts       # the parsed model
result.document.relationships[0].because
result.document.strongest(context)     # core beats supporting beats generic

bundle = validate_bundle(sorted(Path("archive").rglob("*.dd*")))
bundle.crossings               # what the map and its models say about each other
```

Each notation also exposes its own parser and doctrine:

```python
from bacm.ddd import parse, doctrine

result = parse(source)          # never raises; .document, .problems, .ok
readings = doctrine.read(result.document)
```

Neither parser raises for a recoverable error — ba-cm calls them on every
keystroke, and a parser that gave up on the first bad token would make a
half-written file feel hostile. The one exception is a lexical failure, which
the **lexer** raises and the parser catches as its single error: an unterminated
string makes every token after it meaningless, and pretending otherwise
produces a cascade of nonsense.

---

## Layout

```
bacm/
  problems.py    spans, three severities, the fifty-problem cap, deduplication
  lexer.py       one scanner for both notations; it raises rather than recovers
  parsing.py     the recursive-descent scaffolding both parsers share
  prose.py       the one text heuristic a reading needs
  view.py        the two JSON sidecars
  bundle.py      the map and its models, checked against each other
  api.py         validate() / validate_file() / validate_bundle()
  cli.py         bacm-validate
  ddd/           model.py  parser.py  doctrine.py
  ddm/           model.py  parser.py  doctrine.py
samples/         ba-cm's own insurance map, its sidecar, and the risk-appetite model
tests/           164 tests, stdlib unittest, no pytest needed
```

```
python3 -m unittest discover -s tests -t .
```

`lexer.py` and `problems.py` are shared between the two notations here exactly
as they are in ba-cm, and for the reason `ddm/parser.ts` gives: *"they are not
`.ddd`'s — they are this family's: braces, quoted strings that may span lines,
bare hyphenated words and `//` comments describe both languages exactly."* What
is not shared is the checking, because that is the whole point of having a
second language.

---

## Three places this diverges from ba-cm, and why

**A NUL byte or a file over 2 MiB is refused before the lexer sees it.** ba-cm
has no such guard: its input arrives through its own editor, already known to be
text. A validator is pointed at whatever is on disk, and a JPEG scanned byte by
byte produces fifty "unexpected character" problems after a long pause. The
guards live in `validate_file`, at the file boundary, so the lexer itself stays
faithful.

**A leading byte-order mark is stripped, with a warning.** This one is a real
behavioural difference rather than a guard: ba-cm's lexer would report the BOM
as an unexpected character and the document would not open. Stripping it
silently would mean this package said a file was fine when the tool refuses it,
so it strips and says so — a BOM is invisible in every editor, which is exactly
why it needs saying.

**Findings carry a `code`.** ba-cm's problems have a message, a position and a
span, and no identifier — its panel is read by a person looking at the document.
A validator run in CI needs something greppable, so every finding here has a
stable kebab-case code. Nothing else about the findings is added or reworded.
