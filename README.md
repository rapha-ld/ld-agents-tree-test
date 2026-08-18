# nav-lab

A throwaway tool for comparing candidate navigation schemes for LaunchDarkly.

It holds a snapshot of every destination in the product, lets you describe any number
of navigation schemes as markdown files, scores each scheme for how far it puts things
from the user, and runs tree tests with real participants to find out whether the
labels actually tell anyone where to look.

Nothing here writes to gonfalon. The route data is extracted once and committed as a
snapshot.

## Quick start

```bash
pnpm install
pnpm score          # scheme comparison in the terminal
pnpm dev            # study at /, report at /#/report
pnpm test           # cost model and parser tests
```

## What is in here

| Path | What it is |
| --- | --- |
| `data/destinations.json` | 319 route destinations extracted from gonfalon. Generated, do not hand-edit. |
| `data/destinations.overlay.yaml` | 43 hand-curated non-route destinations. Edit this one. |
| `data/weights.json` | Destination importance. Empty until someone hydrates it. |
| `schemes/*.md` | One file per navigation scheme. |
| `scenarios/*.md` | One file per test scenario. |
| `scripts/extract.ts` | Re-runs the snapshot against a gonfalon checkout. |
| `scripts/score.ts` | The terminal report. |

## The central idea

Destinations are invariant. A scheme is a mapping over them.

`flag.targeting` is the same place whether it sits under Features, under a lifecycle
stage called Build, or behind a filter. Because destination identity does not move,
importance weights and test scenarios written once stay valid for every scheme you
try afterwards, including schemes that do not exist yet.

## Authoring a scheme

Indentation is hierarchy. `->` binds a label to a destination. Square brackets say how
the node is revealed.

```md
---
id: observability-first
name: Observability first
---

# Deliver
- Flags -> flags
  - Targeting [tab] -> flag.targeting

# Observability [collapsed]
- Events insight -> observe
  - Code Control [filter] -> observe
  - Agent Control [filter] -> ai-monitoring
```

- `#` starts a top-level group. Bullets nest two spaces per level.
- A node with no `->` is a container and cannot be submitted as an answer.
- A `#` heading may be bound, which is how a flat scheme with no groups is written.
- Reveal modifiers: `tab`, `collapsed`, `flyout`, `overflow`, `filter`, `switcher`.
  Omit for a directly visible item.
- `name` is what the study and report display, so it is the one place to change if you
  want to obscure which scheme is which.
- Binding the same destination twice is legal. Duplication is counted and reported.
- Binding an id that is not in the snapshot is legal too. Candidate schemes are
  expected to invent destinations; they are reported as proposed rather than as errors.

To keep comparisons honest, every scheme should place the same set of destinations.
`pnpm score` prints `destinations placed` per scheme so a mismatch is visible.

## Authoring a scenario

An intro paragraph sets the situation once. Each `##` is one task.

```md
---
id: new-hire-first-flag
weight: 3
persona: New engineer joining a company that already uses LaunchDarkly
---

You started this week. Your first ticket is to ship a change behind a flag.

## Create your first feature flag
targets: flags.new
accept: flags

## Set up an experiment on that flag
targets: experiments.new
```

`targets` are fully correct answers. `accept` are answers you would also count, which
is how you avoid punishing someone for stopping at a sensible parent.

## The cost model

For a path through nodes n₁..nₖ:

```
cost = Σᵢ [ click(nᵢ) + α·log₂(siblingsᵢ + 1) + overflow(siblingsᵢ) + reveal(typeᵢ) ] + gate
```

- `click` is 1, except for an unbound directly-visible container, whose children are
  already on screen, where it is 0.
- `α` defaults to 0.5. This is the breadth-versus-depth dial.
- `overflow` charges `0.15` per peer beyond 12, because Hick's law assumes every choice
  is visible at once and that stops being true past the fold.
- `reveal`: visible 0, tab 0.25, collapsed 0.5, filter and switcher 0.75, flyout 1.0,
  overflow menu 1.5.
- `gate` adds 0.5 once when the destination is behind an entitlement or a flag.

Duplicated destinations take the cheapest path, and the duplication count is reported
separately rather than folded into the score.

### What the model cannot tell you

It measures structural effort to reach a destination **once you already know where it
is**. It says nothing about whether a label helps you guess. That is the larger part of
whether navigation works, and it is what the tree test measures.

One consequence is worth understanding before quoting any number. Under a pure
logarithmic scan term a completely flat menu always wins, because splitting one scan
into two stages costs more total scanning than one large scan
(log₂9 + log₂7 > log₂36) while also adding a traversal step. The overflow term is what
stops that. Set `overflowPenalty` to 0 in the report and watch `flat` take the lead.

So: use the model to catch things buried too deep, to compare schemes of similar shape,
and to check coverage. Do not use it to settle breadth versus depth. Run
`pnpm score --sweep` and trust only rankings that hold across the whole range of α.

## Running a study

`pnpm dev` serves the app. A nav bar across the top switches between the two views,
so nothing is hidden behind a URL you have to know:

- **Study** is what a participant takes.
- **Report** compares the schemes and shows results.

On the start screen, **Which menu to test** picks the scheme. It lists the `name` from
each scheme's frontmatter, so renaming a scheme to something neutral like `Menu A` is a
one-line edit and participants never see which one is today's navigation. Leave it on
*Pick one at random* for real studies: random assignment is what keeps schemes
comparable, and the hint under the dropdown says so.

**Start over** sits at the top of every screen during a run. It asks for confirmation,
then returns to the start screen with a fresh session. The abandoned run is left
unfinished, and only finished runs are counted, so restarting never pollutes results.
If you are exporting from Supabase by hand, filter to `finished_at is not null` for the
same reason.

Other behaviour:

- `?scheme=<id>` preselects a scheme, which is handy for a link you hand to someone.
- Scenario order is randomised per participant.
- Labels only. No content, no correctness feedback, and an explicit
  "I would not know where to look" on every task.

Recorded per task: every click with its path and depth, backtracks, time to first
click, the final answer, and abandonment. Success is derived at analysis time from
`targets` and `accept`, so the rules can change without re-running a study.

### Where results go

With no configuration, results are kept in the participant's browser and the report
page can export them as JSON. That is enough for moderated sessions.

For unmoderated studies, set two variables and rows insert straight into Supabase:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Create the tables with `supabase/schema.sql`. The anon role gets insert only, so a
participant cannot read anyone else's answers. Export from Supabase and load the JSON
into the report page to see measured success, directness, and first-click rates
alongside the predicted costs.

Directness is the metric the model predicts and the study measures. Regressing one
against the other is what turns α and the reveal penalties from guesses into
calibrated numbers.

## Re-running the extraction

```bash
pnpm extract ~/code/launchdarkly/gonfalon
```

Reads `appRouteOwnership.ts`, `appRoutes.tsx`, `navigators.ts`, and
`useNavigationSections.ts`. Writes `data/destinations.json` and
`data/current-nav-items.json`. The snapshot is accurate the day it is taken and decays
from then on, which is fine for a throwaway tool. Re-run it if a study happens months
later.

## Deploying

Static build, no server code.

```bash
pnpm build          # outputs dist/
```

Vercel or GitHub Pages both work. `vite.config.ts` uses a relative base so a project
subpath needs no configuration.
