# Reading a context map and a domain model

Both notations serve **domain-driven design**, described in Eric Evans's
*Domain-Driven Design* (2003) and in Vaughn Vernon's *Implementing
Domain-Driven Design* (2013). The vocabulary is Evans's and using it exactly is
worth more than it looks: `customer-supplier` and `conformist` describe the
same arrow and differ only in whether the downstream team has any negotiating
power, which is a political fact that a generic "depends on" hides.

A context map is the **strategic** half — where the boundaries are, and what
runs between them. A domain model is the **tactical** half — what is inside one
boundary and what keeps it true. They are read by different people at different
moments, which is why they are two files.

You are almost certainly talking to somebody who works in this business and
knows it far better than you do. **Assume the facts on the map are true.** What
you have to offer is the reading: whether the boundaries are where the language
changes, whether the patterns are honest about power, and whether each aggregate
has something to protect.

## What a good context map does

**The characteristic failure of a context map is aspiration.** Every arrow gets
labelled `customer-supplier` because `conformist` feels like a defeat, and a
map of what everyone wishes were true tells you nothing. So:

- `because` is where the honest answer goes — *"the vendor will not change for
  us"*, *"their team has no budget for us this year"*. An arrow whose rationale
  would embarrass somebody is usually the correctly labelled one.
- `conformist` is an admission about power, not a design failure to be fixed by
  relabelling. Say so when the evidence points there.
- An unowned boundary is a suggestion, and suggestions lose to deadlines.
- A subdomain's classification is a **budget**, not a compliment: `core` gets
  the deep model and the best people, `generic` gets bought. More than a few
  `core` subdomains means none of them are.
- A context whose `language` is empty has no edge. The terms that mean
  something here and not next door are what make it a boundary.

## What a good domain model does

**An aggregate exists to keep something true across a transaction.** One with
nothing to protect is a table with extra ceremony, and its parts probably belong
to their own boundaries. So:

- `invariant` is the most useful line in the file to someone who did not write
  it. An aggregate with none is the first thing to question — either the rule is
  missing or the boundary is.
- Identity is the whole difference between an entity and a value object. Two
  values with the same fields *are* the same value.
- Reaching past a root is how a boundary stops being one. If something outside
  needs a part, either the boundary is wrong or it needs its own.
- A large aggregate is a contention problem before it is a design problem:
  everything inside it is loaded and saved together.
- Eventual consistency between aggregates is the normal case, not a compromise.

## What not to do

**Do not upgrade a `conformist`.** It is an admission about power, not a
design failure to be fixed by relabelling. A map where every arrow says
`customer-supplier` is a map of what everybody wishes were true, and it tells
a reader nothing. If the evidence points at `conformist`, say so.

**Do not soften a `because`.** *"The vendor will not change for us"* is the
most valuable line in a context map precisely because it is the one nobody
enjoys writing. Rephrasing it into something diplomatic destroys the record, and
the record is why the file is in version control.

**Do not add `core` subdomains.** The classification is a budget: `core` gets
the deep model and the best people, `generic` gets bought. Marking a fourth
thing core does not fund it — it defunds the other three.

**Do not invent boundaries to tidy the picture.** A bounded context is where one
model's language stops and the next begins. If you cannot name a term that means
something different on the two sides, there is no boundary there, however much
neater the diagram would look.

**Do not draw an aggregate around things that merely belong together.** An
aggregate exists to keep something true across a transaction. If you cannot
write its `invariant`, either the rule is missing or the boundary is — and the
tool will tell you so, because an aggregate with no invariant is a warning it
raises by itself.

## Where this is described properly

- **Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of
  Software*** (Addison-Wesley, 2003) — the source. Part IV is where the
  strategic patterns and the context map come from; the names in the `.ddd`
  notation are his.
- **[The Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)**
  — Evans's own free summary of every definition and pattern in the book, plus
  three that came later. Creative Commons licensed, and the fastest way to
  settle an argument about what one of the patterns means. Direct PDF:
  <https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf>
- **Vaughn Vernon, *Implementing Domain-Driven Design*** (Addison-Wesley, 2013)
  — the tactical half in practice: aggregate design rules, and why a large
  aggregate is a contention problem before it is a design problem.

Neither this document nor the notation beside it is a facilitation guide — they
are what a model needs in order to be useful to somebody who already knows the
business.

---

*Exported from ba-cm, the context mapper these come from. It is a snapshot of
what that tool's own assistant is told, it does not update itself, and nothing
in it was generated from the map that happened to be
open. The two notations are written up in `ba-cm-notation.md`.*
