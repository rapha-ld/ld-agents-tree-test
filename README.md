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

### Mode switchers

Some menus put a segmented control above everything that swaps which sections are shown.
Gonfalon has one today: Code and Agents. Declare the modes in the frontmatter and tag the
sections that belong to only one of them.

```md
---
id: current
name: Current (compact)
modes:
  - id: code
    label: Code
  - id: agent
    label: Agents
---

# Features [collapsed] [mode=code]
- Flags -> flags

# Agents [collapsed] [mode=agent]
- Configs -> ai-config

# Telemetry [collapsed]
- Errors -> errors
```

The first mode listed is the default, so its sections cost nothing extra to reach. Any
other mode costs a click on the control plus a glance at it. A section with no `[mode=]`
is present whichever mode is active.

This matters because it is not the same as making Code and Agents two ordinary top-level
items. With a switcher, someone in the default mode sees the code sections already opened
out beneath the control; the agent sections only appear once they realise the control is
there and use it. Bracket groups can be combined and appear in any order, so a section can
be both collapsible and mode-scoped.

**Individual items can be mode-scoped too**, which matters more for realism than for the
score. Today's Telemetry section is in both modes but drops Sessions, Errors and Logs in
agent mode:

```md
# Telemetry [collapsed]
- Sessions [mode=code] -> sessions
- Errors [mode=code] -> errors
- Logs [mode=code] -> logs
- Traces -> traces
- Alerts -> alerts
```

A participant in agent mode who opens Telemetry looking for Sessions now genuinely will not
find it, which is the confusion worth capturing. It changes no cost, because those pages
stay reachable from the default mode for free, but it changes what people see and therefore
what they do. Tagging an item with a mode that contradicts its section is an error, since
nothing could ever see it.
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

## The effort score

Every number in the report's top table is an effort score. **One point is roughly one
click.** Fractions get added for the things that make a click harder than a click:

- a long menu is more to read than a short one
- an item inside a collapsed section, a fly-out, or an overflow menu needs an extra action
  to reveal
- a feature only some accounts can see is invisible to everyone else

Three clicks through short menus scores a little over three. The same three clicks through
long menus with a collapsed section on the way scores five or six. Lower is better.

`pnpm score` prints the same numbers in the terminal. `--scheme=<id>` adds the click-by-click
route for each task, `--sweep` shows whether the winner survives changing the assumptions.

### The formula

For a path through nodes n₁..nₖ:

```
cost = Σᵢ [ click(nᵢ) + α·log₂(siblingsᵢ + 1) + overflow(siblingsᵢ) + reveal(typeᵢ) ] + gate
```

- `click` is 1, except for an unbound group heading whose children are already on screen.
- `α` defaults to 0.5. It sets how much reading a menu costs.
- `overflow` charges 0.15 per item past 12 in one list.
- `reveal`: visible 0, tab 0.25, collapsed 0.5, filter and switcher 0.75, fly-out 1.0,
  overflow menu 1.5. Moving a mode switcher off its default adds 0.25 plus a click.
- `gate` adds 0.5 once when only some accounts can see the destination.

Duplicated destinations take the cheapest route, and the duplication count is reported
separately rather than folded into the score.

### Two limits worth knowing

**It only measures getting there, not finding it.** The score assumes you already know
which item to click. It says nothing about whether the label would lead you to the right
place, which is usually the bigger problem. That is what the study measures.

**A single long list can look deceptively good.** Grouping a list means reading twice, once
to pick the group and once inside it, plus an extra click. Add that up and one long list of
everything beats a tidy set of groups — which is not how people behave once a list runs off
the bottom of the screen. The overflow charge is what corrects for that. Set it to zero in
the report and the flat menu takes first place.

So use the score to catch things buried too deep, to compare menus of similar shape, and to
check that a menu reaches everything. Do not use it to settle whether grouping is worth it.
Run `pnpm score --sweep` and trust only a winner that leads every row.

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

**Nothing is connected to a database today.** Results are written to `localStorage` in
whichever browser took the study, and the report page can export them as JSON. That is
genuinely fine for moderated sessions where you are sitting next to the participant, and
it is why the report shows a warning rather than pretending otherwise.

The limitation is worth being clear about before you run anything unmoderated: if you
send a link to someone on their own machine, their answers stay on their machine. You
would have to ask them to open the report page and send you the file.

Whatever the mode, a failed write is surfaced in the participant's UI rather than logged
to the console. If the database cannot be reached, the final screen stops saying
"your answers are recorded" and asks them to tell you instead. Do not silently trust a
collection run you have not checked.

### Connecting Supabase, when you are ready

1. Create a Supabase project. The free tier is more than enough; this stores a few
   thousand short rows.
2. In the SQL editor, run `supabase/schema.sql`. It creates the `sessions` and `events`
   tables, an index, and row-level security policies granting the `anon` role insert
   only, plus update on `sessions` so a run can be marked finished. Participants cannot
   read anyone's answers, including their own.
3. From **Project Settings → API**, copy the project URL and the `anon` public key.
4. Create `.env.local` in the repo root:

   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```

   It is already gitignored. The `anon` key is designed to ship in a browser bundle and
   the policies are what protect the data, so this is not a secret you need to guard.
5. Restart the dev server. Vite reads `.env` files only at startup, so a running server
   will not pick them up.
6. Confirm it worked: the report page should replace the warning with "Connected to the
   study database", and the study start screen should say results are saved to the
   database. **Take one throwaway run end to end and check a row appears in `sessions`
   before you send the link to anyone.**

For hosting, set the same two variables in your Vercel project settings. Vite inlines
them at build time rather than reading them at runtime, so a build that ran without them
will stay in local-only mode no matter what the host is configured with afterwards.
Rebuild after changing them.

### Time

Participants are never shown a timer, but every task is timed and the report has a
**How long it took** section. This is a separate question from effort: a flat list can score
well on effort and still be slower, because a long list takes longer to read even when it
takes fewer clicks. If a menu wins on clicks and loses on time, that is worth knowing before
picking it.

Everything is reported as a median rather than a mean, so one participant who wandered off
mid-task cannot drag a column. Per-task times also appear beside the predicted effort in
**How someone would get there**, which is the most direct check on whether the effort score
matches reality.

### Reading the results

Export `sessions` and `events` from Supabase as a single JSON object shaped
`{ "sessions": [...], "events": [...] }` and load it on the report page, which is the
same path locally-collected results take. Only runs with a `finished_at` are counted, so
abandoned and restarted runs are ignored automatically.

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
