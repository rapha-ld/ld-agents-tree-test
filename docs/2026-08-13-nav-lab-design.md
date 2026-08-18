# nav-lab design

Date: 2026-08-13
Status: implemented. See "Changes during implementation" at the end for where the
build diverged from this design.

## Purpose

LaunchDarkly's navigation does not express what the product has become, and it does
not obviously support the personas and use cases that matter most. Choosing a better
scheme will take judgment and a lot of conversation. This tool exists to make those
conversations evidence-based rather than circular.

It does two things:

1. Holds a snapshot of every destination in the product, so any proposed nav scheme
   can be checked for coverage and scored for reachability.
2. Runs tree tests against many candidate schemes with real participants, and records
   what they clicked.

## Non-goals

- Not a durable tool. No CI, no drift detection, no long-term maintenance story.
- Makes no changes to the gonfalon repo. Route data is extracted from a local
  gonfalon checkout and committed here as a snapshot.
- No third-party research SaaS.
- Phase 1 ships no screenshots. Labels only.

## Core idea

Destinations are invariant. A nav scheme is a mapping over them.

The database holds stable IDs for places in the product where work happens:
`flag.targeting`, `events.telemetry`, `experiment.results`. Those identities do not
change when the nav is reorganized. A scheme is a separate small file describing a
tree of labels bound to those IDs, plus how each node is revealed.

This separation is what makes comparison valid across schemes that do not exist yet.
Today's product-line-first tree and a proposed observability-first tree with a
Code Control / Agent Control filter both have to reach the same destination set. The
cost of reaching each one differs; the set does not.

It also means importance weights attach to destinations rather than to nav items, so
a weight sourced once carries across every scheme evaluated afterward.

## Architecture

```
nav-lab/
  data/
    destinations.json           generated snapshot from gonfalon
    destinations.overlay.yaml   hand-curated non-route destinations
    weights.json                destination importance, empty in phase 1
  schemes/
    00-current.md               today's nav, the control
    01-*.md                     candidates
  scenarios/
    *.md                        one file per test scenario
  src/
    parse/                      markdown and yaml to typed trees
    score/                      cost model and shortest path
    study/                      participant-facing tree test
    report/                     scheme comparison
  scripts/
    extract.ts                  run once against a gonfalon checkout
  docs/
```

Static single-page app. Vite, React, TypeScript. Deploys to Vercel, and stays
compatible with GitHub Pages because there is no server code.

Results are always written to the browser's local storage first, and additionally
inserted into Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
That ordering means the tool is usable for moderated sessions before any database
exists, and a failed insert never costs a participant their answers.

## Data model

### destinations.json

One entry per destination. Generated for routes, merged with the hand-authored
overlay for everything else.

```json
{
  "id": "flag.targeting",
  "label": "Targeting",
  "routePattern": "/projects/:projectKey/flags/:flagKey/targeting",
  "kind": "route",
  "owner": "team-flag-delivery",
  "gated": false,
  "source": "generated"
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable dotted identifier. Derived from the route pattern for generated entries, hand-assigned in the overlay. |
| `label` | Human name as it appears in the product today. |
| `routePattern` | React Router pattern, or `null` for non-route destinations. |
| `kind` | `route`, `tab`, `drawer`, `switcher`, or `palette`. |
| `owner` | Squad from `appRouteOwnership.ts`. Useful for routing findings back to teams. |
| `gated` | True when the destination is behind an entitlement or a feature flag, so it is invisible to a subset of users. |
| `source` | `generated` or `overlay`. |

### destinations.overlay.yaml

The curated non-route destinations, roughly 40 to 80 entries. Places a user would
describe as somewhere they go, which happen not to change the URL: the create-flag
drawer, the environment switcher, the project switcher, the shortcut palette.

```yaml
- id: flag.create
  label: Create flag
  kind: drawer
  reachableFrom: flags.list
  gated: false
```

Confirmation dialogs and form steps are deliberately excluded. There are 835 files in
gonfalon containing dialog, drawer, or popover components, and the overwhelming
majority are not destinations in any sense a participant would recognize.

### Scheme files

Indentation carries hierarchy. `->` binds a label to a destination ID. Square
brackets mark how a node is revealed.

```md
---
id: observability-first
name: Observability first
notes: Collapses product lines into a filter on a shared telemetry view.
---

# Deliver
- Flags -> flags.list
  - Targeting [tab] -> flag.targeting
  - Workflows [tab] -> flag.workflows
- Segments -> segments.list

# Observe [collapsed]
- Events insight -> events.telemetry
  - Code Control [filter] -> events.telemetry.code
  - Agent Control [filter] -> events.telemetry.agent
```

Grammar:

- YAML frontmatter requires `id` and `name`. `notes` is optional.
- `#` starts a top-level nav group.
- Nested `-` bullets, two spaces per level, carry the rest of the tree.
- `-> id` is optional. A node without a binding is a container and cannot be
  submitted as an answer.
- `[modifier]` is optional and appears before the arrow. One of `tab`, `collapsed`,
  `flyout`, `overflow`, `filter`. Absent means the node is directly visible.
- Modifiers are legal on `#` headings, which is how a collapsed section is expressed.
- A destination ID may appear more than once. Duplication is legal and measured.
- A `#` heading may itself be bound with `->`. A bound heading costs a click, since
  selecting it navigates. This is what makes a flat scheme with no groups expressible.
- A scheme may bind to an ID absent from `destinations.json`. Candidate schemes are
  expected to invent destinations, such as a unified observability landing page or a
  telemetry view split by a Code Control / Agent Control filter. These are reported as
  proposed destinations rather than treated as errors, and carry weight 0 until
  someone assigns one in `weights.json`.

### Scenario files

An intro paragraph sets the situation once. Each `##` is a task with its own targets.

```md
---
id: new-hire-first-flag
weight: 3
persona: New employee joining an existing enterprise account
---

You have just joined a company that already uses LaunchDarkly. Your team has asked
you to ship a change behind a flag and measure whether it works.

## Create your first feature flag
targets: flag.create
accept: flags.list

## Attach an experiment to that flag
targets: experiment.create
```

Grammar:

- Frontmatter requires `id` and `persona`. `weight` defaults to 1.
- Prose between the frontmatter and the first `##` is scenario context, shown once at
  the start.
- Each `##` heading is one task. Its heading text is the prompt.
- `targets` lists destination IDs that count as fully correct.
- `accept` is optional and lists destinations counted as partial success, for cases
  where landing on a parent is a reasonable answer.

### weights.json

Destination importance, keyed by destination ID. Ships empty in phase 1. Candidate
sources for later hydration are Datadog RUM (`pathTemplate` is already stamped on
every view by `packages/telemetry/src/setRouteContext.ts`), Hex, and Mixpanel.

```json
{ "flag.targeting": 4210, "flag.cleanup": 38 }
```

When the file is empty, traffic-weighted scores are omitted from the report and the
report states that coverage is zero percent. Scenario scores are unaffected.

## Extraction

`scripts/extract.ts` runs once against a local gonfalon checkout, path passed as an
argument. It reads:

| Source | What it contributes |
| --- | --- |
| `static/ld/routes/appRouteOwnership.ts` | 320 route patterns and the owning squad for each |
| `static/ld/routes/appRoutes.tsx` | Nesting structure and lazy chunk names |
| `packages/navigator/src/navigators.ts` | 296 typed URL builders, the canonical destination vocabulary and naming |
| `packages/chrome/src/internal/useNavigationSections.ts` | Current nav labels, icons, destinations, and gating conditions |
| `packages/chrome/src/internal/NewNavigation/NewNavigation.tsx` | The in-flight hierarchical grouping already behind `enableNewNavigation` |

Output is `data/destinations.json`. The script never writes to gonfalon.

The last two sources also seed `schemes/00-current.md`, which is the control. Without
a faithful baseline there is nothing to compare candidates against.

## Cost model

The tree test measures whether a participant can guess the right branch from a label.
The cost model handles structure only, and deliberately makes no attempt to predict
semantics.

For a path through nodes `n₁..nₖ`:

```
cost = Σᵢ [ click(nᵢ) + α · log₂(siblingsᵢ + 1) + overflow(siblingsᵢ) + reveal(typeᵢ) ] + gate
```

- `click(nᵢ)` is 1, except for an unbound directly-visible container, whose children
  are already on screen, where it is 0. The scan term still applies to such a node,
  because the participant still has to read the group labels to choose a branch.
- `siblingsᵢ` is the number of options presented at the level where that choice is
  made, including the chosen node. At the first level this is the number of `#`
  sections. Below that it is the number of children of the chosen node's parent.
- `α` defaults to 0.5. This is the breadth-versus-depth dial and is the single most
  important parameter to sensitivity-test.
- `overflow(n)` charges `0.15` for each peer beyond a visible budget of 12. Hick's law
  assumes every choice is on screen at once; past the fold the participant scrolls,
  loses their place, and re-scans. Setting the penalty to 0 recovers the pure
  logarithmic model exactly.
- `reveal` defaults: visible 0, `tab` 0.25, `collapsed` 0.5, `filter` and `switcher`
  0.75, `flyout` 1.0, `overflow` 1.5.
- `gate` defaults to 0.5 and applies once when the destination is gated.

Plain hop count was rejected because it cannot express the breadth-versus-depth
tradeoff. Under hop count a flat sidebar of 25 items beats every grouped alternative,
which makes it useless for the decision at hand.

The overflow term exists because the scan term alone does not fix that. Under a pure
logarithmic scan, a flat menu still wins at every value of α, for a reason that is
arithmetic rather than empirical: splitting one scan into two stages costs more total
scanning than one large scan, since log₂9 + log₂7 > log₂36, and grouping adds a
traversal step on top. This was confirmed against the five shipped schemes, where
`flat` led the whole α sweep from 0 to 2 until the overflow term was added.

The consequence is a real limit on what the model can settle, recorded under accepted
limitations below.

When a destination appears in several places the model takes the minimum cost, and
reports the duplication count separately. Duplication helps findability and hurts
coherence, so collapsing it into a single number would hide the tradeoff.

### Reported metrics

| Metric | What it catches |
| --- | --- |
| Scenario cost | Sum of task costs per scenario, multiplied by scenario weight. The headline number in phase 1. |
| Weighted mean cost | `Σ w·cost / Σ w` over destinations with weights. Omitted while `weights.json` is empty. |
| Worst-case cost | Maximum over all destinations. Catches anything buried catastrophically. |
| Unreachable set | Destinations absent from the scheme. A safety check, reported as a list. |
| Breadth profile | Sibling-count distribution per level. Diagnostic, not a score. |
| Duplication count | Destinations bound at more than one place. |

Scenario and weighted scores are reported side by side and never blended. Traffic
reflects demand under today's nav and is biased toward the status quo, while scenarios
encode intent. A scheme that wins on both is better. A scheme that splits them is the
useful argument.

## Study harness

Between-subjects by default. One participant sees one scheme, which removes learning
effects. Assignment is uniform random in the browser, because the insert-only table
gives the client no way to read existing counts and balance them. `?scheme=<id>`
forces a specific scheme for internal dry runs, and `?within=1` presents every scheme
to one participant for pilot testing.

Established tree-test practice, all of which the harness follows:

- Scenario order randomized per participant.
- Labels only. No content, no icons in phase 1, no correctness feedback at any point.
- Any node is submittable as an answer, including containers, matching how a real
  participant would say "I would look here."
- Back navigation always available, and every backtrack is recorded.
- An explicit "I would not know where to look" option on every task.
- No time limit shown to the participant. Elapsed time recorded regardless.

Recorded per task: every click with node path, depth, and timestamp; backtrack count;
time to first click; final submission; abandonment.

### Persistence

Supabase, two tables, insert-only policy for the anon role.

`sessions`

| Column | Type |
| --- | --- |
| `id` | uuid, primary key |
| `participant_label` | text, nullable |
| `scheme_id` | text |
| `started_at` | timestamptz |
| `finished_at` | timestamptz, nullable |
| `user_agent` | text |

`events`

| Column | Type |
| --- | --- |
| `id` | bigserial, primary key |
| `session_id` | uuid |
| `scenario_id` | text |
| `task_index` | int |
| `seq` | int |
| `kind` | text: `start`, `click`, `back`, `submit`, `giveup` |
| `node_path` | text, slash-joined labels |
| `destination_id` | text, nullable |
| `depth` | int |
| `ts` | timestamptz |

Success is derived at analysis time by comparing the `submit` event's
`destination_id` against the task's `targets` and `accept` lists, so scoring rules can
change without re-running studies.

## Reporting

One page. Schemes as columns, metrics as rows. Predicted costs from the model on top,
measured study results underneath.

Measured metrics per scheme and task: success rate, directness (reached the answer
with no backtracking), first-click correctness, median time, abandonment rate.

Directness is the metric the model predicts and the study measures. Regressing
measured directness against predicted cost calibrates `α` and the reveal penalties,
which is what stops the parameters from being arbitrary after the first study runs.

## Testing

Vitest covering the cost model and both markdown parsers. The math has to be right or
every number in the report is decoration. Nothing else is tested.

## Phase 2

Screenshot mode. A Playwright script against a local or staging gonfalon captures one
PNG per route pattern with seeded data, and the harness swaps label-only panes for
images. Playwright is already used in gonfalon at `apps/vitalstatistix` and
`packages/flag-targeting`, so the capture approach is known to work there.

Nothing in phase 1 blocks this. The scheme files, destination IDs, and study
plumbing are all reused unchanged.

## Accepted limitations

- The destination snapshot is accurate on the day it is extracted and degrades from
  then on. Acceptable for a throwaway tool. Re-run `extract.ts` if a study runs
  months later.
- Curating the non-route overlay is a judgment call, and someone can reasonably
  disagree with any given inclusion. The overlay is a small readable file so that
  disagreement is cheap to settle.
- Employee participants will outperform customers on findability. Relative comparison
  between schemes survives this. Absolute success rates do not.
- Phase 1 tests information architecture, not visual pattern. A scheme can win the
  tree test and still fail as a rail, sidebar, or flyout.
- The cost model cannot settle breadth versus depth. It measures effort to reach a
  destination once you know where it is, and grouping earns its keep by narrowing the
  search space semantically, which the model deliberately does not represent. Treat
  its output as a check for burial, coverage, and comparison between schemes of
  similar shape. Only the tree test can answer whether grouping helps.


## Changes during implementation

Recorded so the design and the code do not silently disagree.

**The cost model gained an overflow term.** The scan term alone could not make grouping
worthwhile at any α, for the arithmetic reason described above. The overflow term
corrects a violated assumption in Hick's law rather than tuning the result, and it is
exposed as a slider in the report so anyone can see what it is doing.

**The zero-click rule was generalised.** The design limited it to unmodified `#`
sections. The implementation applies it to any unbound directly-visible container,
which is the same rule stated without reference to markdown syntax.

**Bound `#` headings and a `switcher` modifier were added to the grammar.** Both were
needed to express real schemes: a flat nav has no unbound groups, and environment and
project switchers are neither flyouts nor filters.

**Persistence is local-first.** The design had results inserting straight into
Supabase. The implementation always keeps a local copy and treats Supabase as an
additional sink, so the tool works with no configuration and a network failure cannot
lose a session.

**The report reads measured results from a JSON file.** The anon role has insert-only
access and therefore cannot read the results table, so the report takes an exported
JSON file rather than querying. This also means locally-collected results and
Supabase-collected results go through exactly the same analysis path.

**Destination counts.** 320 route patterns yielded 319 destinations, the dropped one
being the `/*` catch-all. The curated overlay added 43, for 362 total. Deriving stable
IDs needed three rules the design did not anticipate: account settings under
`/settings/*` take an `account.` prefix so they do not collide with a project's own
settings tree; consecutive route params are named by the param rather than by
singularising the collection; and a param following an already-singular segment opens a
`detail` node.

**A CLI report was added.** `pnpm score` prints the comparison, with `--scheme=<id>` for
per-scenario shortest paths, `--alpha=` to override the scan weight, and `--sweep` to
show ranking stability. The design assumed the browser report would be the only view,
but the terminal is where scheme authoring actually happens.
