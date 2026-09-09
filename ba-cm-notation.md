# Working with `.ddd` and `.ddm` files

You are being asked to read, write or change a domain-driven design model
kept as text. There are two notations and this document is the whole of both:

- **`.ddd`, a context map** — the shape of a business. Its domains, the
  subdomains they divide into, the bounded contexts that serve them, and the
  strategic relationships between those contexts.
- **`.ddm`, a domain model** — the inside of exactly one bounded context. Its
  aggregates, the entities and value objects in them, and the links between.

One map covers many contexts; one model is one context. They are separate files
with different lifetimes, and they travel together as one archive. Follow both
grammars exactly: a file that does not parse cannot be opened by the tools these
are kept for.

## The notation: `.ddd`, a context map

```
map "Title" {
  domain "Name" {
    intent  "Prose."
    owner   "Who decides."

    subdomain core "Name" {          // core | supporting | generic
      intent "Prose."
      owner  "Who decides."

      context "Name" {
        intent    "Prose."
        language  "Term" "Term"      // the ubiquitous language of this context
        aggregate "Name" "Name"      // names only; the .ddm says what they are
        owner     "Who decides."
        status    modelled           // modelled | drafted | unmodelled
        serves    "Other subdomain"  // a context straddling a second subdomain
      }
    }
  }

  "Context A" -> "Context B" : customer-supplier {
    exchange "What crosses."
    because  "Why this pattern and not another."
  }
  "Context C" <-> "Context D" : partnership { … }
}
```

Nesting is containment: a subdomain divides the domain it sits in, a context
serves the subdomain it sits in. `serves` is only for the straddle — a context
serving a *second* subdomain as well.

Relationships run context to context and are the only edges that carry a
pattern. Directed `->` runs downstream: the left names the upstream. Mutual
patterns take `<->`. A pattern may be a pair — `open-host-service /
conformist` — when the two ends are not the same thing.

Patterns: `partnership`, `shared-kernel`, `customer-supplier`,
`conformist`, `anticorruption-layer`, `open-host-service`,
`published-language`, `separate-ways`, `big-ball-of-mud`.

Comments are `//` to end of line. Strings may wrap across lines; a
continuation line is joined to the one above with a single space.

## The context map grammar, formally

EBNF. `,` is sequence, `|` is alternation, `{ x }` is zero or more, `[ x ]` is
optional, `? … ?` is prose, and a quoted literal stands for itself.

```ebnf
File         = Map , EOF ;
Map          = 'map' , String , '{' , { Domain | Relationship } , '}' ;

Domain       = 'domain' , String ,
               [ '{' , { Intent | Owner | Subdomain | Context } , '}' ] ;
Subdomain    = 'subdomain' , Classification , String ,
               [ '{' , { Intent | Owner | Context } , '}' ] ;
Context      = 'context' , String ,
               [ '{' , { Intent | Owner | Language | Aggregate | Status | Serves } , '}' ] ;

Intent       = 'intent' , String ;
Owner        = 'owner'  , String ;
Language     = 'language'  , String , { String } ;
Aggregate    = 'aggregate' , String , { String } ;
Status       = 'status' , ( 'modelled' | 'drafted' | 'unmodelled' ) ;
Serves       = 'serves' , String ;

Relationship = String , ( '->' | '<->' ) , String , ':' , Pattern , [ '/' , Pattern ] ,
               [ '{' , { Exchange | Because } , '}' ] ;
Exchange     = 'exchange' , String ;
Because      = 'because'  , String ;

Classification = 'core' | 'supporting' | 'generic' ;
Pattern      = 'partnership' | 'shared-kernel' | 'customer-supplier'
             | 'conformist' | 'anticorruption-layer' | 'open-host-service'
             | 'published-language' | 'separate-ways' | 'big-ball-of-mud' ;

String       = '"' , { ? any character except '"' ? } , '"' ;
Comment      = '//' , { ? any character except a line break ? } ;
```

Reading it:

- **Every body inside the map is optional.** `context "Claims"` with no braces
  is a legal context that nobody has said anything about yet, and so is a bare
  `domain`. The map's own braces are the exception: they are required, because
  a file whose block never opened has nothing in it and is almost always a
  truncated paste rather than an empty map.
- **Nesting is containment**, and it is the only way a context is attached.
  `serves` is *additional*: it exists for the straddle, a context serving a
  second subdomain as well as the one it is written inside. A context with no
  enclosing declaration is a problem the parser reports.
- **A `context` may sit directly inside a `domain`**, without a subdomain
  between them. It is legal and it is usually a map that has not finished
  dividing the domain yet.
- **`language` and `aggregate` take one or more names on a line**, and either
  may be written more than once; the names accumulate.
- **Only a `Relationship` carries a `Pattern`**, and it runs context to
  context. Containment never carries one.
- **Direction is enforced against the pattern.** `partnership`,
  `shared-kernel` and `separate-ways` are mutual and may not be written with
  `->`, because an arrow asserts an upstream the pattern denies;
  `customer-supplier`, `conformist`, `anticorruption-layer`,
  `open-host-service` and `published-language` require one.
  `big-ball-of-mud` takes either, deliberately: it is not a pattern anybody
  chooses, and a ball of mud with a discernible direction is still a ball of
  mud.
- **A pattern may be a pair** — `open-host-service / anticorruption-layer` —
  when the two ends play different roles. That is one relationship with two
  named positions, not two relationships.
- **On a directed edge the left name is upstream**: whoever's model the other
  has to accommodate.
- **Names are identities.** Two nodes may not share one, and a relationship
  refers to a context by its name, so the names are resolved after the whole
  file is read.
- **`Comment` and whitespace are trivia.** The language is brace-delimited:
  indentation is a formatting choice and never syntax. A quoted string may wrap
  across lines, and a continuation is joined to the line above with one space.

## The notation: `.ddm`, the inside of one bounded context

```
context "Bounded context name" {

  value "Money" {                    // declared at model level: shared
    attribute "amount"   : "Decimal"
    attribute "currency" : "CurrencyCode"
  }

  enum "SubmissionState" {
    "Draft" "Submitted" "Referred"
  }

  aggregate "Submission" {
    intent    "What this boundary is for."
    invariant "What must stay true across a transaction."
    invariant "Repeatable — usually more than one."

    root entity "Submission" {       // exactly one root per aggregate
      id         "SubmissionId"
      attribute  "receivedAt" : "Instant"
      embeds     "SubmissionState" one
      contains   "RiskItem" at-least-one
      references "AppetiteRuleSet" one
    }

    entity "RiskItem" { id "RiskItemId" }
    value  "Address" { attribute "line" : "String" }
  }
}
```

Multiplicity: `one` (the default), `optional`, `many`, `at-least-one`.

The three links are the argument of the format:

- `contains` — composition inside one boundary. The part is created, saved and
  deleted with the root. Entities only, same aggregate only.
- `embeds` — a value object or an enumeration. No identity, so copied rather
  than shared. Same aggregate, or declared at model level and shared.
- `references` — **across a boundary, by identity**. You name another
  *aggregate*, never something inside one, and you hold its id rather than the
  thing itself.

An aggregate is named after its root; the two sharing a name is the idiom, not a
collision. Names are identities and must be unique within the model — two things
called `Line` in one bounded context is the ubiquitous language failing.

## The domain model grammar, formally

```ebnf
File         = Model , EOF ;
Model        = ( 'context' | 'model' ) , String ,
               '{' , { Aggregate | Value | Enum } , '}' ;

Aggregate    = 'aggregate' , String ,
               [ '{' , { Intent | Invariant | Root | Entity | Value | Enum } , '}' ] ;
Root         = 'root' , Entity ;
Entity       = 'entity' , String , [ '{' , { Id | Attribute | Link } , '}' ] ;
Value        = 'value'  , String , [ '{' , { Attribute | Link } , '}' ] ;
Enum         = 'enum'   , String , [ '{' , { String } , '}' ] ;

Intent       = 'intent'    , String ;
Invariant    = 'invariant' , String ;
Id           = 'id'        , String ;
Attribute    = 'attribute' , String , ':' , String ;
Link         = ( 'contains' | 'embeds' | 'references' ) , String , [ Multiplicity ] ;
Multiplicity = 'one' | 'optional' | 'many' | 'at-least-one' ;
```

Reading it, and each of these is a rule the parser enforces rather than a
convention:

- **The model's own braces are required**, where every body inside it is
  optional *to the grammar*. That is not the same as legal: `aggregate "A"`
  with no body parses and is then refused, because an aggregate is reached
  through exactly one `root` and without one there is no boundary, only a
  group of classes. Several rules work that way — they are checked once the
  whole model has been read, and they are listed at the end.

- **`id` belongs to an entity.** A `value` carrying one is refused, because
  identity is the whole difference between the two: two values with the same
  fields *are* the same value.
- **An aggregate has exactly one `root`**, and it is an entity.
- **`contains` is composition inside one boundary** — entities only, same
  aggregate only. The part is created, saved and deleted with the root.
- **`embeds` is a value object or an enumeration** — no identity, so copied
  rather than shared. Same aggregate, or declared at model level and shared.
- **`references` crosses a boundary by identity.** It names another
  *aggregate*, never something inside one, and holds its id rather than the
  thing itself. Reaching past a root is how a boundary stops being one.
- **Multiplicity defaults to `one`** when it is left off.
- **Names are identities and must be unique within the model.** An aggregate is
  named after its root, and the two sharing a name is the idiom rather than a
  collision — but two different things called `Line` in one bounded context is
  the ubiquitous language failing.
- **`model` is accepted as a synonym for `context`** at the top. Write
  `context`: it is what the file is about.

Checked after the whole model is read, and refused rather than warned about:
every aggregate has exactly one `root`, and it is an entity; every name is
unique within the model; `contains` points at an entity in the same aggregate;
`embeds` points at a value or an enumeration, in the same aggregate or shared
at model level; and `references` points at an aggregate rather than at
something inside one.

An aggregate with no `invariant`, and a shared `value` nothing embeds, are
**warnings** rather than errors — the file still opens. They are the two things
the doctrine tells you to look at first, so the tool says them out loud without
refusing to show you the model.

## The sidecars: `.dddview` and `.ddmview`

An archive from ba-cm holds up to four kinds of file:

    insurance/
      insurance.ddd
      insurance.dddview
      risk-appetite/
        risk-appetite.ddm
        risk-appetite.ddmview

The `*view` files are **JSON**, not a notation, and they hold one thing:
where somebody dragged the boxes, plus how far each edge was bent. They exist
because "never in the document" and "never anywhere" are different rules, and
only the first was ever the point — coordinates in a `.ddd` would fill every
diff with position churn and hide the one line where a pattern changed.

Three consequences, and they are the whole of what you need to know:

- **Do not write coordinates into a `.ddd` or a `.ddm`.** There is no syntax
  for them and there is not going to be.
- **Do not hand-edit a sidecar** unless that is specifically what was asked. It
  is generated, and it is keyed by node name — renaming a context in the
  document orphans its position, which is harmless and self-correcting.
- **Losing a sidecar costs nothing.** The map redraws from a computed layout.
  That asymmetry is what makes it safe to have at all, and it is why an archive
  missing one is not a broken archive.

## Changing somebody's map

A context map is a description a room argued its way to, and you are editing it
in their absence. Every rule below follows from that.

- **The whole document**, not a fragment, not a diff, not the changed
  aggregate. It replaces the file.
- **Change only what was asked for.** Everything else comes back byte-identical
  — comments, blank lines, wrapping, the order of declarations. The result is
  read as a diff, and a diff full of reformatting is a diff nobody reads.
- **Keep the comments.** They are the author's reasoning and are not yours to
  tidy.
- **Never soften a `because`.** It is where the politics are written down —
  *"the vendor will not change for us"* — and it is the most valuable line in a
  context map precisely because it is the one nobody enjoys writing. Rephrasing
  it into something diplomatic destroys the record.
- **Never move a node's coordinates.** They are not in these files at all: an
  arrangement lives in the `.dddview` or `.ddmview` sidecar beside the
  document, and it is regenerated from a computed layout when it is missing.
  Nothing you write in a `.ddd` should be about where anything sits.
- **It must parse.** A document that does not is not a smaller version of one
  that does; it is a file nobody can open.

Read `ba-cm-doctrine.md` before adding or relabelling anything. These
notations will happily let you write a map that parses perfectly and flatters
everybody.

---

*Exported from ba-cm, the context mapper these come from. It is a snapshot of
what that tool's own assistant is told, it does not update itself, and nothing
in it was generated from the map that happened to be
open. The grammars themselves are defined by `src/lib/ddd/` and `src/lib/ddm/` in ba-cm: where a document and these rules disagree, the parser is right and this file is old.*
