# ba-ddd-mapper-mapper

The **DDD mapper**. A context map authored as text in one panel and drawn as a
graph in the other, where the two are the same document and neither is a copy.

Nodes are domains, subdomains and bounded contexts. Edges are the relationships
between contexts — tagged with the strategic patterns — and the containment
edges that attach each context to the part of the business it serves.

The practice it serves is written up in
[ba-portal](../ba-portal/) under `/doc/strategic/` and `/doc/landscapes/`; this
component is the tool that page has been describing as planned.

> **Status: built, and unexercised in a browser.** Lexer, parser, layout, the
> span-splice edits and the island are all here and the project type-checks and
> builds clean. The DSL layer is tested — see [Verification](#verification) —
> but nobody has yet loaded the page in a browser and clicked anything, so treat
> the interaction as unproven rather than working.

## The inversion

doc-es and this component look alike and are built the opposite way round, and
the difference is the first thing to understand about either.

In **doc-es the board is the source of truth** and the `.eventstorm` file is a
render of it. Its README says so outright: comments, blank lines and your
indentation are lost on a round trip. That is correct there. A wall is built in
a room, by hand, in ninety minutes, and nobody reviews the file.

In **ba-ddd-mapper-mapper the text is the source of truth** and the graph is a render of it.

| | doc-es | ba-ddd-mapper-mapper |
|---|---|---|
| Source of truth | the board | the text |
| The file is | an export | the artefact |
| Round trip loses | comments, formatting | nothing |
| Position | `@column` means a moment in time | computed, never stored |
| Made by | a room, live | a person, then a reviewer |

The reason is what happens to the artefact afterwards. A context map goes into
version control next to the code it describes, arrives in a pull request, and is
argued with. Two of its most valuable fields — `because`, which records why a
pattern was chosen including the politics, and the comments around a cluster of
contexts — are prose that a graph has nowhere to put and a diff reads perfectly.
A tool that reformatted the file every time somebody dragged a node would make
that review impossible, and the review is the point.

So the graph does not own the model. **The graph is a set of gestures that edit
text.**

## Two panels, one document

```
┌─────────────────────────────┬───────────────────────────────────────┐
│  map "Personal and comm…" { │            ┌──────────┐               │
│    domain "…" {             │            │  Domain  │               │
│      subdomain core "Und…"  │            └────┬─────┘               │
│        context "Risk app…"  │        ┌────────┼────────┐            │
│          language "Submi…"  │     ╭──┴──╮  ╭──┴──╮  ╭──┴──╮         │
│          owner "Head of …"  │     │core │  │supp.│  │gen. │         │
│      }                      │     ╰──┬──╯  ╰──┬──╯  ╰──┬──╯         │
│    }                        │        │        │        │            │
│    "Product cat" -> "Rat…"  │      ┌─▼─┐    ┌─▼─┐    ┌─▼─┐          │
│  }                          │      │ctx│───▶│ctx│───▶│ctx│          │
│                             │      └───┘ OHS└───┘ ACL└───┘          │
├─────────────────────────────┤                                        │
│ ⚠ 2 problems                │                                        │
└─────────────────────────────┴───────────────────────────────────────┘
```

**Left: the editor.** Plain text, monospaced, line-numbered, with the problems
panel beneath it. Not an IDE — no autocomplete on first cut, no language server.

**Right: the graph.** Computed layout, two visually distinct edge classes,
direct manipulation.

**Live in one direction, surgical in the other.** Typing re-renders the graph.
Dragging in the graph rewrites a span of text.

### Why the live direction needs a last-good render

A document is unparseable for most of the time somebody is typing in it — every
half-written string literal and unclosed brace is a parse failure. A graph that
went blank on each of those would strobe, and a graph that strobes is one nobody
looks at while typing, which removes the only reason for the two panels to be
side by side.

So: parse on a **250ms idle debounce**, and when the parse fails, **keep drawing
the last document that parsed**, dimmed, with the problems panel showing why.
The graph is stale and says so; it does not disappear. This is the single most
important interaction decision in the component and it is cheap to get wrong.

### Why the other direction is a text splice, not a serialise

Every node and edge in `model.ts` carries the `Span` it was parsed from, and
several carry a second, narrower span — `nameSpan`, `classificationSpan`,
`patternSpan`.

A gesture becomes: take the source string, replace the bytes in one span,
re-parse. Change a relationship's pattern and exactly the pattern token is
rewritten; everything else in the file, including the `because` prose and the
comment three lines above, is byte-identical.

The alternative — model in, serialiser out — is what doc-es does, and it is why
doc-es loses comments. Here it would rewrite the whole file on every drag.

The cost of this decision is that the parser must track spans accurately, which
is more work than a parser that only builds a tree. That cost is the price of
the artefact being reviewable, and it is worth paying.

## The graph

### Three node kinds

**Domain** — the business. One per file. Drawn largest, once, at the top.

**Subdomain** — a *problem*: a part of the business, classified `core`,
`supporting` or `generic`. Discovered, not designed. The classification is drawn
as the strongest visual signal on the graph, because it is a budget rather than
a label: core gets the deep model and the best people, generic gets bought.

**Bounded context** — a *solution*: a boundary inside which one model holds and
one word means one thing.

Keeping the problem and the solution visually distinct is the whole reason there
are three kinds rather than two. A reader who cannot tell at a glance which
boxes were given to them and which they chose will defend the wrong ones.

### Two edge kinds, drawn to look nothing alike

**Containment** — a context serves a subdomain; a subdomain divides a domain.
Structural, never carries a pattern, drawn quietly: a thin grey vertical S from
a child's top edge to its parent's bottom edge.

**Relationship** — a context relates to a context. Carries a
[pattern](#the-nine-patterns), drawn boldly and labelled: a cubic bowed
perpendicular to the line between the two boxes, anchored where that line
crosses each border.

Both are curves, and they curve differently on purpose. They must not share a
visual language — a context map where the structural edges compete with the
relationship edges reads as a hairball, and the relationships are the only part
anybody is trying to see.

The bow is flipped to the downward side and scales with how horizontal the chord
is: a row of contexts reads as an arc diagram, and boxes at different heights get
something close to a straight line. Both halves matter — a constant bow puts
every arc in one band below the row, which is exactly what makes a vertically
spread arrangement unreadable.

Arcs anchor on the side they are about to bow towards rather than where the
chord crosses the border. A chord between two boxes in a row leaves at
mid-height and travels horizontally before the curve pulls it down — straight
through whatever box sits between them. That alone accounted for four of the
seed map's eleven arcs passing behind a box.
A child dragged *above* its parent falls back from the vertical S to a bow,
because an S between inverted boxes loops back on itself and reads as a bug
rather than as a moved node.

### Creating and deleting

The gestures that change *what is on the map*, as opposed to
[what it looks like](#moving-things). All of them are span splices like every
other edit here — a new node is a fragment inserted, a deleted one is a region
cut — so the comments and formatting around them come back byte-identical.

**A node** is added from the canvas bar, into the selection: a subdomain needs
a domain selected, a context needs a domain or a subdomain, and the buttons say
so when they are off rather than picking a parent for you. The fragment that
lands is the smallest valid one, and its defaults are chosen to be honest
rather than convenient — a new subdomain is `supporting`, and a new context is
`status unmodelled`, because the parser reads an absent status as `modelled`
and a box drawn a second ago has not been modelled. It arrives with no owner
and no language, which the problems panel says out loud. That is the point: the
warnings are the to-do list for the box you just drew.

The name is the exception to "the fragment is enough". The name **is** the
identity in this format, so a new node is called `New context` and the
inspector opens with that text selected and the cursor in it. Emptying the
field puts the old name back, because a nameless node is not an incomplete
node — it is a file that no longer parses.

**An edge** is drawn by pointing. Take the connect tool, click the box the edge
starts from, and a dashed candidate follows the pointer until you click the box
it ends at. Click anywhere else and the candidate is lost; Escape cancels it,
and a second Escape puts the tool down. It is a mode rather than a drag because
dragging a box already means moving it, and overloading that would make every
nudge a possible accidental relationship.

What the edge *means* is decided by the two kinds it joins, because this format
has three edges and the gesture is one gesture:

| Drawn between | What is written |
|---|---|
| context → context | a relationship, at map level, with a pattern |
| context → subdomain, context → domain | a `serves` line: the straddle |
| subdomain → domain | nothing — the block moves |

The last row is the interesting one. A subdomain divides exactly one domain and
says so by *sitting inside it*, so that edge already exists and drawing it
re-points rather than adds: the subdomain's block is cut and re-inserted, and
re-indented on the way, because a block landing at its old depth inside a new
parent is the kind of diff that makes a reviewer distrust a tool that edits
their source.

Pointing the other way means the same thing rather than being refused. "From
the subdomain to the context" and "from the context to the subdomain" are the
same claim about the world and only one of them has a direction the file can
hold. Two domains have no edge at all, and saying so in the banner is more
useful than a silently ignored click.

**A relationship gets a pattern immediately**, and it has to: the grammar has
no untagged arrow, so a relationship *is* its pattern. The choice was between a
guess and a modal that interrupts the gesture to ask, and the guess wins —
`customer-supplier`, which is directed like the arrow just drawn and claims
nothing except that the two teams negotiate. The inspector then opens on the
new edge with all nine patterns listed, because the map is only honest once
somebody has looked at that list.

**Deleting** takes the references with it, and this is not politeness. A
relationship naming a context that no longer exists is a parse *error*, so a
delete that left one behind would blank the graph and hand the visitor an error
message instead of the map they were editing. Deleting a subdomain takes the
contexts nested inside it the same way. The inspector says how many of each
before the button is pressed — the count comes from the same analysis the
delete runs, so the sentence and the edit cannot drift apart — which is a
number you can read instead of a confirmation dialog you would learn to
dismiss.

The one containment that cannot be deleted is the one implied by nesting: there
is no line to remove, and taking it away would mean moving the node instead. So
those edges are drawn solid and do not answer a click, while a written `serves`
is dashed and does.

### Moving things

Both the boxes and the edges can be moved, and both moves are
[view state](#why-no-coordinates-reach-the-file) rather than document edits.

**A node** is dragged directly. Its edges re-route on every frame, which is why
routing is a pure function of box geometry rather than something ELK produces —
ELK runs once per document and a drag never goes near it.

**An edge** is bent by selecting it and dragging the handle at its midpoint.
The handle appears on the selected edge only, not on hover: a handle that
materialises under the pointer on a canvas with eleven overlapping arcs is a
handle you grab by accident, and clicking an edge is already how you inspect it.

The arithmetic is worth a line, because getting it wrong is the usual reason a
bend handle feels sticky. A cubic evaluated at its midpoint is
`(P0 + 3·C1 + 3·C2 + P3) / 8`, so shifting both control points by `v` moves the
midpoint by `0.75·v`. The drag divides through by that, and the handle then sits
exactly under the pointer instead of lagging it by a quarter — while the curve
keeps the tangents the default bow had.

What bending is *for* is legibility: two relationships between the same pair of
contexts, or an arc passing behind a box, are fixed by pulling the curve aside.
An edge's shape says nothing that its pattern and direction do not already say,
which is exactly why it belongs to the person looking rather than to the file.

### Keeping an arrangement: the `.dddview` sidecar

Positions and curvature can be written to a file and read back, from the widget
bar. It is a **sidecar**, not part of the map:

```
insurance.ddd       the model. Reviewed, diffed, argued about.
insurance.dddview   how one person likes to look at it. Optional.
```

"Never in the document" and "never anywhere" were always different rules, and
only the first one was the point. Coordinates in the `.ddd` file would fill
every diff with churn that hides the one line where a pattern changed; an
arrangement in which the relationships finally read clearly is worth keeping and
worth handing to a colleague. Losing the sidecar costs nothing — the map redraws
from the computed layout — and that asymmetry is what makes it safe to have.

The file records the map title, so loading a view built for a different map
warns instead of scattering boxes across coordinates computed for something
else. It is a warning rather than a refusal: node ids come from names, so a view
from a forked or partly renamed map still lands correctly on everything the two
have in common. Every number is validated on load, because this is a file a
person can hand to another person and edit by hand, and one `NaN` reaching an
SVG transform blanks the whole graph with no error anywhere.

### The canvas

- **A dot grid**, in graph coordinates rather than screen ones, so it pans and
  zooms with the content. That is what makes the canvas read as a surface things
  sit on rather than as a texture painted on the window.
- **A widget bar**: zoom out, zoom in, fit, reset layout, save layout, load
  layout, and full screen. Everything on it is about the view rather than the
  document, which is why saving an arrangement lives here and not on the bar
  above it — that one handles the map, this one handles how you are looking at
  it.
  Reset is disabled until something has actually been moved, and says how many.
- **Full screen** takes the whole mapper — editor, problems panel and graph —
  not the graph alone. Both panels are the tool, and a graph filling a large
  display with the text it is made of hidden behind it is the wrong half.

  The view refits on entering and leaving, because the panel roughly quadruples
  and keeping the old zoom would leave the map in a corner and make the button
  look like it did nothing. Getting that to actually happen needs two things
  that are easy to get wrong, and were:

  **The fit measures the element, not React state.** `fullscreenchange` fires,
  the component re-renders, and any effect keyed on it runs *before* the
  `ResizeObserver` has reported the new dimensions — so a fit computed from
  state at that moment silently uses the old panel size. `getBoundingClientRect`
  is the truth at the moment it is asked.

  **The fit is deferred to the resize, not the state change.** The browser
  resizes the element after the state lands, so the only moment a fit means
  anything is once the resize has been observed. A flag set on the full-screen
  transition and cleared by the next `ResizeObserver` callback is what connects
  the two.

  Plain window and splitter resizes deliberately do *not* refit: someone who
  zoomed in to read a label should not lose it to a drag of the divider.
- **A minimap**, because the two decisions that make this graph readable also
  make it wide — the seed map is about 2,500 units across, which at a readable
  zoom is several screens. Click it to centre. Deliberately not draggable: a
  minimap with its own viewport gesture is a second pan control, and the canvas
  already has one that works.

### Why containment is an edge and not a nested box

The obvious drawing is subdomains as regions with contexts inside them. It was
rejected for one reason: **a nested box can only express a tree, and the
interesting case is not a tree.**

ba-portal's catalog documentation makes the point directly — the mapping from
subdomains to contexts is deliberately not forced to be one to one, and where a
context straddles two subdomains, that is *"not a tidy-up job — it is the most
interesting sentence on this page, and it usually explains an argument that has
been running for years"*.

A region cannot draw a context in two places. An edge can draw two edges. So the
tool is built to render the finding rather than to hide it.

The consequence in the grammar is the `serves` clause: nesting implies one
containment edge, and an explicit `serves` adds another.

### Why no coordinates reach the file

doc-es stores `@column` on every card, and is right to: on that board horizontal
position *is* time, so two cards in one column are simultaneous and the position
carries meaning no other field holds.

On a context map, position carries nothing. Storing it in the document would add
a second source of truth the text cannot review, and every diff would fill with
coordinate churn that hides the one line where a pattern changed from
`customer-supplier` to `conformist`.

**But nodes can still be moved.** Auto-layout sometimes produces a graph a human
would have drawn better, and refusing to let anyone fix that is a worse answer
than the churn it avoids.

The resolution is that a move is a **view** operation, not a document edit:

| | Document | View |
|---|---|---|
| Lives in | the `.ddd` file | `localStorage`, this browser |
| Travels | to whoever opens the file | nowhere |
| Reviewed | in a pull request | never |
| Holds | names, patterns, rationale | node positions, edge curvature, theme, split |

Nudging a box for readability and changing what the map says are different acts,
and only one of them belongs in a pull request. So dragging a box does not dirty
the file, opening the same map elsewhere shows the computed arrangement, and a
moved box carries a small dot to say its position is local. **Reset layout** in
the widget bar drops every override at once.

The one wrinkle worth knowing: overrides are keyed by node id, which is derived
from the name. Renaming a context drops its override and the box returns to
where ELK puts it. The alternative — a second identifier that survives a rename
— is precisely the thing [the format refuses to have](#the-name-is-the-identity).

### Layout, in two passes

**Placement** is elkjs (`layered`), run over the *containment edges alone*.
Containment is a clean three-level DAG — domain, subdomains, contexts — so
layering it produces exactly the three tiers a reader needs to tell a problem
from a solution at a glance.

Feeding the relationships into the same pass does not work, and the reason is
instructive rather than a tooling limitation. Layering derives rank from *all*
edges, so a relationship between two contexts pushes one of them a rank below
the other; after eleven of them the graph is an eight-deep cascade with
subdomains and contexts interleaved. Pinning the contexts to the last layer
instead makes ELK refuse outright — a `LAST`-constrained node may not have
outgoing edges — which is the algorithm saying the same thing in a stack trace.

**Ordering** is a third pass, and it exists because ELK is only given the
containment edges — so the order *within* the context row is arbitrary as far
as the relationships are concerned. On the seed map that costs nine arc
crossings, and a crossing-free ordering exists. Nine crossings on eleven arcs is
the difference between a map you read and one you trace with a finger.

The pass permutes the row and moves nothing else: the domain and the subdomains
stay exactly where ELK put them, which is also what a person rearranging one of
these by hand does. Exhaustive up to eight contexts, deterministic local search
above it — 8! finishes in single-digit milliseconds and 12! is half a billion,
so the cliff is steep enough that the cutoff may as well be conservative.

Its cost function is three terms, strictly ranked, and the ranking was earned
rather than guessed. Scoring arc crossings alone found a crossing-free order
immediately — and scattered the subdomains so thoroughly that 23 containment
edges crossed. Adding containment as a second term, above span, picks from the
same set of relationship-optimal orders the one that also keeps the structure
legible:

| | arc crossings | containment crossings | arc span |
|---|---|---|---|
| ELK alone | 9 | 0 | 28 |
| arcs, then containment, then span | 0 | 5 | 28 |
| **shipped: arcs, then span, then containment** | **0** | 6 | **18** |

The middle row was shipped first and was wrong. Containment edges are drawn
light and are *read once* — a reader follows one to learn where a context sits
and never looks at it again. Ranking them above span buys tidier grey lines with
longer purple ones, which is backwards; correcting it took the seed map's arcs
from a span of 28 down to 18, and removed two geometric crossings that the row
metric had not been counting.

**Spreading** is a fourth pass, and it exists because a row has a hard ceiling:
a relationship graph can only be drawn along one line without crossings if it is
outerplanar, and plenty are not. The technique is somebody's, worked out by hand
— *move each bounded context down until no edges cross, counting only the edges
between bounded contexts* — and it generalises exactly.

It runs **only when the row has failed**, because a compact map reads better
than a tall one: the seed map never reaches it. Two refinements were needed to
make it work, and both came out of testing it against graphs the row cannot
handle:

**Single drops plateau.** On four contexts where every pair is related, no
single drop removes the one crossing, while dropping two by different amounts
removes it completely. There is a bounded pairwise pass over the most-tangled
handful, with a hard evaluation budget — it runs while somebody waits for a
graph, and a map with one crossing left beats an editor that stalls.

**The bow had to stop fighting it.** Bowing every arc to the same side is what
makes a row read as an arc diagram, and it is actively wrong once boxes sit at
different heights — every arc lands in the same band below the row, so moving a
box down separates nothing. The bow now scales with how horizontal the chord is:
side by side, the full arc; stacked, nearly a straight line.

**Routing** is ours, and is a pure function of box geometry. That is what lets a
dragged node take its edges with it: ELK runs once per document, and a drag
re-routes at 60fps without going near it.

Still **not** React Flow, dagre or cytoscape. The position override above might
look like the state React Flow would have managed — the difference is that it is
one flat map of view state with an explicit reset, sitting beside the theme and
the split, rather than a framework that owns the graph model and hands the
document a supporting role.

The graphs are small — tens of nodes, not thousands — so layout runs
synchronously on the main thread and no virtualisation is needed.

## The DSL

`.ddd`. Braces rather than indentation, so a file that has been through a chat
window or a different editor still parses — the same reasoning as
`.eventstorm`, and the same conclusion.

The extension names the discipline rather than the artefact, which breaks
doc-es's convention (`.eventstorm` names the wall). It is deliberate: the file
holds a catalog *and* a map, and `.contextmap` would undersell the half that
records what the business is.

`//` line comments. They survive every graph edit — see the splice argument
above — which is what makes them worth having.

```
map "Personal and commercial insurance" {

  domain "Personal and commercial insurance" {
    intent "Underwrite risk, price it, collect premium for it, and pay what is
            owed when it materialises."

    subdomain core "Underwriting" {
      intent "Deciding which risks to accept and on what terms."
      owner  "Head of underwriting"

      context "Risk appetite" {
        intent    "Where a submission is judged against current appetite."
        language  "Submission" "Risk" "Appetite rule"
        aggregate "Submission" "AppetiteRuleSet"
        owner     "Head of underwriting"
      }
    }
  }

  "Product catalogue" -> "Rating" : open-host-service {
    exchange "Versioned product definitions."
    because  "Five consumers, no two wanting the same shape."
  }

  "Risk appetite" <-> "Rating" : partnership
}
```

```ebnf
File        = Map , EOF ;
Map         = 'map' , String , '{' , { Domain | Relationship } , '}' ;

Domain      = 'domain' , String , [ '{' , { Intent | Owner | Subdomain
                                          | Context } , '}' ] ;
Subdomain   = 'subdomain' , Class , String ,
              [ '{' , { Intent | Owner | Context } , '}' ] ;
Context     = 'context' , String ,
              [ '{' , { Intent | Owner | Language | Aggregate
                      | Status | Serves } , '}' ] ;

Class       = 'core' | 'supporting' | 'generic' ;
Intent      = 'intent'    , String ;          (* at most one *)
Owner       = 'owner'     , String ;          (* at most one *)
Language    = 'language'  , String , { String } ;
Aggregate   = 'aggregate' , String , { String } ;
Status      = 'status'    , ( 'modelled' | 'drafted' | 'unmodelled' ) ;
Serves      = 'serves'    , String ;          (* the straddle; repeatable *)

Relationship = String , Arrow , String , ':' , Patterns ,
               [ '{' , { Exchange | Because } , '}' ] ;
Arrow        = '->' | '<->' ;
Patterns     = Pattern , [ '/' , Pattern ] ;
Exchange     = 'exchange' , String ;
Because      = 'because'  , String ;

Pattern      = 'partnership' | 'shared-kernel' | 'customer-supplier'
             | 'conformist' | 'anticorruption-layer' | 'open-host-service'
             | 'published-language' | 'separate-ways' | 'big-ball-of-mud' ;
```

### String literals

Double-quoted. `\"` and `\\` escape; nothing else does.

A literal **may span lines**, and the continuation lines are joined with a
single space after leading whitespace is stripped. That is what lets `intent`
and `because` hold a paragraph without the file growing lines that run to 300
columns, and it is why `samples/insurance.ddd` reads as prose rather than as
configuration.

The rule is deliberately dumb: no indentation-sensitive block strings, no
here-docs, no markdown. A `because` field is two or three sentences, and a
format that invited more would collect design documents in a field the graph
renders as a tooltip.

### The name is the identity

A context is referred to in a relationship by its name in quotes, not by a
separate identifier. Two nodes may not share a name.

The alternative — slugs or ids — was rejected because it puts a second name on
every node, and the whole discipline rests on the claim that *the words are the
model*. A file where the human name and the machine name can drift is a file
that teaches the wrong lesson on sight.

The cost: renaming a context has to rewrite its references too. The graph does
that in one gesture because it knows every span; a hand-editor gets a problem
reported naming the line that still points at the old one.

### Direction is about the model, not the network

`->` runs upstream to downstream, where **upstream is whoever's model the other
has to accommodate**. A downstream context frequently initiates the call, and
that is irrelevant here.

`<->` is mutual. The parser enforces the pairing: `partnership`, `shared-kernel`
and `separate-ways` may not be written with `->`, because an arrow asserts an
upstream the pattern denies. The directed patterns require one.
`big-ball-of-mud` is allowed either way — it is not a pattern anybody chooses,
and one with a discernible direction is still a ball of mud.

### Two patterns on one edge

```
"Policy lifecycle" -> "Claims" : open-host-service / anticorruption-layer
```

Upstream publishes; downstream defends. One relationship, two named positions.

This is Evans's own notation, which marks a role at each end rather than a label
in the middle, and a single-label design loses it. ba-portal's catalog currently
records one pattern per relationship and would have to say `anticorruption-layer`
here, which describes what claims does and says nothing about what policy
administration offers.

One pattern remains the common case and means both ends are described by it.

### The nine patterns

Evans's names, used exactly, because several describe the same arrow and differ
only in a political fact. `customer-supplier` and `conformist` are the same
integration; the difference is whether the downstream team can ask for a change
and get one.

The edge picker in the graph shows what each pattern *admits to* rather than
what it does — the strings are in `patternAdmits` in `model.ts`. That is
deliberate: the characteristic failure of context maps is aspiration, every
arrow labelled `customer-supplier` because `conformist` feels like a defeat. A
picker that says "Powerlessness, honestly" next to `conformist` makes the honest
choice slightly easier to click.

## Problems

The panel under the editor, capped at 50, in the shape doc-es already uses:
severity, line, column, message.

**Errors** stop the document parsing:

- a relationship naming a context that does not exist
- a duplicate node name
- `->` on a mutual pattern, or `<->` on a directed one
- an unknown pattern or classification keyword
- the usual syntax failures

**Warnings** parse fine and are worth saying anyway. These are ba-portal's
[curation checks](../ba-portal/) made continuous rather than quarterly:

- a context that `serves` nothing — it is in the file and in no part of the
  business
- a node with no `owner` — *an unowned boundary is a suggestion, and suggestions
  lose to deadlines*
- a `generic` subdomain whose context declares aggregates — modelling a bought
  package is core-domain effort spent on somebody else's solved problem
- a subdomain with no context at all
- a context with no `language` — the field that gives a boundary its edge
- a relationship with no `because` — the field that keeps the map honest

Warnings are never fatal and never block a render. A map that has to be perfect
before it draws is a map nobody starts.

## Page layout

The doc-es shape: `Layout.astro`, a header with kicker, `h1` and lead, the
island, a footer of links. One React island, `client:only`, for the same reason
doc-es has one — direct manipulation has no server round trip that expresses it.

| Route | Rendering | Why |
|---|---|---|
| `/` | server, island inside | the mapper |
| `/dsl` | prerendered | the format, readable with no scripting |
| `/healthz` | server | chart probes |
| `/404` | prerendered | asks the server for nothing |

`<noscript>` gets the same treatment doc-es gives it: the graph needs scripting
and says so, and points at `/dsl`, which does not.

The split is resizable and remembers its position in `localStorage`. On narrow
viewports the panels stack, editor first — because on a phone this is a thing
you read, and the text is the source of truth.

Theme follows the OS, with a board-scoped override on the graph panel alone,
using the `@custom-variant dark` driven by `data-theme` that doc-es settled on.
A graph on a projector in a lit room wants to be white while the rest of the
screen stays as it was set. Every themed root restates its own foreground and
background — doc-es learned that the hard way and the note in its README is the
reason this one will not.

## Persistence

`localStorage`, a second after you stop typing, keyed by title. Import and
export `.ddd`. Nothing on the server.

Same position as the three doc-hub boards: it is insurance rather than an
artefact, and **the file is the map**. The difference here is that the file is
meant to end up in a repository rather than in a downloads folder, which is why
the export filename is the slug and why the format is diff-shaped.

## Configuration

| Variable | Default | Used by |
|---|---|---|
| `BA_PORTAL_URL` | `http://ba-portal.localhost` | the footer — the practice this serves |
| `EVENT_STORMER_URL` | `http://doc-es.localhost` | the footer — where the contexts were found |
| `ARCH_PORTAL_URL` | `http://arch-portal.localhost` | the footer — where they get realised |
| `HOST` / `PORT` | `0.0.0.0` / `4321` | the standalone `@astrojs/node` server |

Read at call time through `src/lib/links.ts`, matching every other component in
the family. All three are browser-facing and resolved by the visitor.

## Dependencies

| Package | For | Note |
|---|---|---|
| `astro`, `@astrojs/node` | the shell | server output, standalone adapter |
| `@astrojs/react`, `react` | one island | the mapper. The day a second island appears, ask whether this is still a documentation site |
| `elkjs` | layout | layered algorithm; coordinates computed per render, never stored |
| `tailwindcss` | styling | v4, as a Vite plugin |

Deliberately **not** React Flow, dagre-d3 or cytoscape. Each owns node positions
as its own state, which is the second source of truth this design refuses.

## Verification

What has actually been checked, and how.

| | |
|---|---|
| **Parser, happy path** | `samples/insurance.ddd` produces 1 domain, 9 subdomains, 9 contexts, 11 relationships and 18 containment edges — the same model ba-portal holds as hand-written TypeScript. Two warnings, both deliberate in the sample. |
| **Parser, error paths** | Unknown classification, unknown pattern, undeclared endpoint, self-relation, duplicate name, unterminated string, empty file. One error per mistake — recovery was fixed twice to stop a single bad token cascading into three reports. |
| **Pairing rules** | `->` on a mutual pattern, `<->` on a directed one, and two patterns on a mutual arrow all rejected; `big-ball-of-mud` accepted either way. |
| **Span splices** | Changing a pattern rewrites one line and leaves the file's comments byte-identical. Renaming a context rewrites its declaration and both relationships that name it — and nothing inside `intent` or `because` prose. |
| **The round-trip property** | Add a relationship, then remove it, and the file is byte-identical to where it started. Also holds for a context added into a subdomain and for a domain added at map level, and for a `serves` line added and removed. This is the property the last section of this README names as the first thing a suite should assert. |
| **Creation fragments** | A context, a subdomain and a domain each parse on the first re-parse after insertion, land in the intended parent, and take the intended defaults — `supporting`, `status unmodelled`. A new relationship parses, is directed with the origin upstream, and carries its pattern; a second one between the same pair gets a distinct id rather than colliding. |
| **Deletion** | Removing a context takes the 2 relationships that name it; removing a subdomain takes the 2 contexts nested inside it and the `serves` lines pointing at it from contexts that survive. The count the inspector shows comes from the same function the delete calls. |
| **The block scanner** | A brace inside a quoted `intent` — `"the {invoice} aggregate"` — no longer ends a block early. That counter was string-blind, which was harmless while it only bounded a search and would have cut the wrong half of a file once it was used to delete a node. |
| **Re-parenting** | A subdomain moved to another domain parses, reports the new parent, keeps every other node, and arrives re-indented to its new depth with no trailing whitespace on blank lines. |
| **Layout** | Three tiers — domain, 9 subdomains, 9 contexts — with all 11 relationship labels placed. |
| **Edge geometry** | All 29 edges emit cubics with no `NaN`. Dragging a node re-routes exactly the 3 edges touching it and leaves the other 26 byte-identical. A child dragged above its parent falls back without looping. |
| **Layout quality** | Measured on the rendered curves, not on a proxy. Seed map: **0 crossings, 0 arcs hidden behind a box**, one row, 508 tall, ~180ms. K4 and K5 — complete relationship graphs no row can draw cleanly — both reach 0 crossings via the spreading pass, in 30ms and 66ms. Deterministic: three runs give byte-identical coordinates. |
| **Against a human arrangement** | A hand-made layout of the seed map scores 0 crossings and 0 occlusions. The shipped layout matches it on both, in **half the edge length** (3558 vs 6402) and **half the height** (508 vs 1132). |
| **View files** | Round-trip field-wise; a mismatched map title warns; a `.ddd` file, unrelated JSON and a future version number are all rejected with a message; non-finite coordinates are dropped rather than loaded. |
| **Fit arithmetic** | Against the seed map's 2681×748 extent: 0.283 windowed, 0.955 at 1440p full screen — 3.4× larger, with the whole map inside the viewport and the tight dimension flush at every size tried. The 1.4 ceiling does not bind. |
| **Edge bending** | A handle dragged by `(90, −55)` moves the midpoint by exactly `(90.00, −55.00)`, the label tracks it, every other edge stays byte-identical, and a deliberately absurd drag still emits a valid path. Handles exist on relationships and not on containment. |
| **Types and build** | `astro check` reports 0 errors across 24 files; `npm run build` prerenders `/404` and `/dsl` and emits the island. |
| **Routes** | `/`, `/dsl`, `/healthz` all 200. The island is wired into the page as `client:only`. |

**Not checked: anything that needs a browser.** The Chrome extension was not
connected, so no part of the interaction — typing, the debounce, the staleness
banner, node dragging, edge bending, pan and zoom, the minimap, the widget bar,
full screen, the inspector's pickers, the theme pin, and everything the connect
tool does — has been exercised against a real DOM. The edits underneath the
gestures are tested; the gestures themselves are not. The first person to open
the page should expect to find something.

There is still no test runner. The checks above were one-off harnesses, which
is worse than a suite and much better than the nothing the rest of the family
has.

## What is not built

What is out of scope even now:

- **No conformance.** ba-portal describes the DDD mapper as also ingesting
  observed integrations and computing whether the estate implements the map.
  That is the second half and it needs the landscape collector, which does not
  exist either. This component authors the map; it does not check it. The
  `.ddd` format has room for the verdict and does not carry one.
- **No round trip to ba-portal.** ba-portal's `src/lib/catalog.ts` and
  `src/lib/landscapes.ts` are hand-written TypeScript holding exactly this
  model. They should be generated from a `.ddd` file, and
  `samples/insurance.ddd` is that file for the seed catalog, byte-for-byte the
  same content. Wiring it up is a build step nobody has written.
- **No import from `.eventstorm`.** A big-picture storm produces `context` cards,
  which are candidate bounded contexts, and turning those into a `.ddd` skeleton
  is the obvious next thing. It is a contract between two components in two
  repositories, so it is a conversation rather than a button.
- **No language collision detection.** Contexts declare their `language`, so the
  data to find one word meaning two things is present in the file. The check is
  ba-portal's language workbench and it is not built either.
- **No chart.** `helm/ba-ddd-mapper-mapper/` does not exist, and neither does
  `helm/ba-portal/`. The ingress host is `ddd-mapper.localhost` — the component
  is named for the repository it lives in and the host for the tool it serves,
  which is already what ba-portal's `dddMapperUrl` points at.
- **No undo for a gesture made with the source panel hidden.** Every graph
  gesture writes through the textarea so that the browser's own history records
  it and ⌘Z undoes a pattern change exactly as it undoes a keystroke. In
  map-only layout there is no textarea, so the edit still applies and simply
  does not land in the undo stack. Keeping the editor mounted but hidden does
  not fix it — `execCommand` needs a focusable element — so the fix is a real
  history stack, which is a bigger change than the one that exposed it.
- **Gestures are refused while the text does not parse.** The spans a gesture
  splices were measured in the last document that parsed, so applying one to
  text that has moved on would write at an offset that is no longer the thing
  it names. The add buttons, the connect tool and the map's name field all go
  quiet until the errors are fixed. The graph's older gestures — the pattern
  picker, the classification buttons, node dragging — predate that rule and do
  not yet follow it.
- **No test runner.** The verification above was one-off harnesses.
