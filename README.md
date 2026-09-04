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
pnpm test           # cost model, parser, analysis, and paging tests
pnpm pull           # download collected results, needs .env.local
```

The report exists only when you run the project yourself. Published builds ship the
study and nothing else, so aggregate results never appear on a public URL. See
[Where results go](#where-results-go) for why it works that way.

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

### Adding a scheme

Drop a new `.md` file in `schemes/`. It is picked up automatically; there is no registry
to update. The filename does not matter, the `id` in the frontmatter does, and it has to
be unique because results are keyed on it.

Then, in order:

1. `pnpm score`. Check `destinations placed` matches the other schemes. A scheme that
   places fewer destinations will look artificially cheap, because the pages it left out
   are the expensive ones you did not have to find a home for.
2. `pnpm dev` and click through your own scheme end to end. Reading a scheme file is a
   poor substitute; the depth you actually feel while clicking is the thing being tested.
3. Rename `name` to something neutral before a real study. Participants see it, and
   "Current navigation" tells them which answer you are hoping for.

Two gotchas worth knowing before you spend an afternoon on it:

- Changing an existing scheme's `id` orphans every result already collected against it.
  Rename the `name`, never the `id`, once a study has run.
- Tagging an item with a mode that contradicts its section makes it unreachable, and
  nothing will tell you. If an item never appears while you click through, check its
  mode tag first.

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

### Adding a scenario or a task

Drop a new `.md` file in `scenarios/`, or add a `##` block to an existing one. Both are
picked up automatically. The numeric filename prefix is for your own ordering only;
scenario order is randomised per participant, so it has no effect on a run.

What makes one worth adding:

- **A job, not a page.** "Turn off the feature that broke checkout" is a scenario.
  "Find the flag targeting tab" is a scavenger hunt, and it tests whether someone can
  read a label you already told them.
- **Wording that does not leak the answer.** If the task says "guarded rollout" and the
  menu says "Guarded rollouts", you have measured reading, not navigation. Describe the
  situation in the words a person would arrive with.
- **Three or four tasks.** The whole run is 31 tasks across nine scenarios and people
  tire. Every task you add costs attention on the ones already there.
- **`weight` reflects how often this actually happens.** It scales the scenario's
  contribution to the overall score. An incident response deserves more than a
  once-a-quarter admin chore.

Gotchas:

- Set `accept` generously. Anything you would nod at in a real session belongs there, or
  you will spend your analysis arguing with your own scoring. Success is derived at
  analysis time, so you can widen `accept` after a study and re-read the same results.
- A `targets` id that is not in the snapshot silently never matches, so that task can
  never be answered correctly. Check the id against `data/destinations.json`, or against
  `data/destinations.overlay.yaml` for non-route destinations.
- Changing a scenario `id`, or reordering the `##` blocks inside one, breaks the link to
  results already collected: events are keyed on scenario id and task index. Add to the
  end rather than inserting in the middle, once a study has run.
- The scenario context now stays on screen for the whole scenario, so it can carry the
  situation rather than cramming it into each task prompt. Keep it to a couple of
  sentences; it is standing context, not the question.

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

### Sending it to someone

The menu is decided by the link, not by the participant. Send one link per menu.

Run `pnpm dev` and open **#/send** for the moderator screen: it lists every menu with its
top-level shape and a copy-ready link, and lets you point the links at a different
deployment. Like the report, it is a dev-only view, because it names the menus and a
participant must not see that there are others.

The link looks like this:

```
https://launchdarkly-labs.github.io/ld-nav-lab/?scheme=scheme-a
```

The id is the `id` from the scheme file's frontmatter, and `pnpm score` lists them. Three
things can happen:

| The link says | What the participant gets |
| --- | --- |
| a known id | that menu |
| no `?scheme=` at all | one at random, so a bare link still works |
| an id that does not exist | a "this link is not quite right" screen, and no run starts |

That last row is deliberate. Falling back to random would file the run against a menu
nobody meant to test, and a typo in a link sent to twenty people is worth catching
loudly.

Participants never see which menu they got, or that there are others. Renaming a scheme's
`name` to something neutral is still worth doing if the report is ever on screen near
them, but the study itself no longer shows it.

The start screen asks for a name and requires it.

**Start over** sits at the top of every screen during a run. It asks for confirmation,
then returns to the start screen with a fresh session. The abandoned run is left
unfinished, and only finished runs are counted, so restarting never pollutes results.
If you are exporting from Supabase by hand, filter to `finished_at is not null` for the
same reason.

### What each task asks first

Every task runs in two steps. Step one shows the task and asks **"What would you call the
section you would look in?"** as free text, and requires an answer. No menu is on screen.
Step two shows the menu and they click through it.

Asked per task rather than per scenario: a scenario covers several different jobs, and the
word someone reaches for when turning a flag off is not the word they reach for when
checking whether it worked.

The answers show up in the report under **What people expected to look for**, grouped by
task, with the menu that person was on shown beside each answer so a word that only
appears in one arm is visible as such. The question's wording is stored with every answer,
so rewording it later does not silently change what old answers mean.

Other behaviour:

- Scenario order is randomised per participant.
- Labels only. No content, no correctness feedback, and an explicit
  "I would not know where to look" on every task.

Recorded per task: every click with its path and depth, backtracks, time to first
click, the final answer, and abandonment. Success is derived at analysis time from
`targets` and `accept`, so the rules can change without re-running a study.

### Where results go

There are two modes, decided by whether `.env.local` exists.

**Connected**, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Every run
is written to Supabase as it happens: a `sessions` row when a participant starts, and
`events` flushed after every task. Someone who abandons halfway still leaves their trail,
which is deliberate, because where people quit is a result. A copy also goes to
`localStorage`, so a network blip does not lose the run.

**Local only**, when they are not set. Results live in the browser that took the study.
Fine when you are sitting beside the participant, useless for anything unmoderated: send
a link to someone on their own machine and their answers stay on their machine.

The UI tells you which mode you are in by exception. In local mode the study and the
report both say "Database not connected". In connected mode they say nothing, so an
absence of that notice is the confirmation.

A failed write is surfaced to the participant rather than logged to a console they will
never open. If the database cannot be reached, the final screen stops saying "your
answers are recorded" and asks them to tell you. **Take one throwaway run end to end and
confirm a row lands before you send the link to anyone.** A collection run you have not
checked is not a collection run.

Nothing in a browser can read results back. The `anon` key shipped in the published
bundle is granted insert and nothing else, so no participant, and no stranger who finds
the URL, can read anyone's answers, including their own. That is also why the report is
a local tool instead of a page behind a login: there is no credential to steal and no
login to get wrong, because the data was never reachable from the internet in the first
place.

### Connecting Supabase

1. Create a Supabase project. The free tier is more than enough; this stores a few
   thousand short rows. Note that free projects **pause after seven days without
   activity**, so check the project is awake before each round of recruiting.
2. In the SQL editor, run `supabase/schema.sql`. It creates the `sessions` and `events`
   tables, an index, the row level security policies, and the table grants. It is
   idempotent, so re-running it after an edit is safe.

   The grants are the part that is easy to miss. A policy narrows a privilege; it does
   not create one. A schema with perfect policies and no `grant` fails every write with
   `permission denied for table sessions` (SQLSTATE 42501), which the API reports as a
   `401`, so it reads like a bad key rather than a missing privilege. If you see a 401,
   check the grants before you check the key.
3. From **Project settings, then API keys**, copy three values: the project URL, the
   publishable (`anon`) key, and the secret (`service_role`) key.
4. Create `.env.local` in the repo root:

   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_KEY
   ```

   Already gitignored. The URL appears twice on purpose: Vite exposes only
   `VITE_`-prefixed variables to the browser, and `pnpm pull` runs in Node, so each needs
   its own copy.

   **Never give the secret key a `VITE_` prefix.** It bypasses row level security
   entirely, and Vite inlines every `VITE_` variable into the bundle it builds. The
   prefix would turn a local convenience into a public read of the whole database.

5. Restart the dev server. Vite reads `.env` files only at startup, so a running server
   will not pick them up.
6. Take one throwaway run end to end. Give it a recognisable name so you can delete the
   row afterwards, then confirm it appears in `sessions`.

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

```bash
pnpm pull           # writes nav-lab-results.json
pnpm dev            # open #/report and load that file
```

The report leads with what people actually managed, because that is the part worth acting
on; the predicted effort score sits below it as a sanity check. Every chart has a
**Show numbers** toggle if you want the table behind it. The first chart is the whole
summary: predicted effort across, measured success up, so up and to the left wins and a
menu the model and the people disagree about is immediately visible.

`pnpm pull` is the only thing that reads the study tables. It uses the secret key from
`.env.local`, pages through both tables, and writes the `{ sessions, events }` shape the
report already loads. It prints how many sessions it found and how many were abandoned.

Paging matters more than it looks. Supabase caps any response at 1000 rows and returns a
truncated list with no error, and a completed run is about 150 rows, so an unpaged read
starts silently under-reporting at roughly the sixth participant. That is what
`src/pull/paged.ts` and its tests exist for.

Only runs with a `finished_at` feed the accuracy and timing figures, so a half-finished
run cannot skew them. **Who took it** lists everyone who started, finished or not, with
when they took it, how long they took, how far they got, and how many they got right.

### Leaving someone out

Turn **Counted** off in that table and every chart recomputes without them. Nothing is
deleted, the choice is remembered in this browser, and it is keyed by session id so it
survives a `pnpm pull`. Use it for a pilot run, a colleague clicking around, or anyone
who clearly disengaged.

To remove a run for good:

```bash
pnpm discard <session-id>
```

The table shows the first eight characters of each id; hover the row for the whole thing,
which is what the script wants. It refuses a prefix on purpose, since a prefix that
matches the wrong row deletes someone else's answers. Events go before the session, so a
half-failed delete leaves a session with no answers rather than orphaned events.

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

Static build, no server code. `vite.config.ts` uses a relative base, so the output works
at any subpath without configuration, and the app uses hash routing, so no host needs SPA
rewrite rules.

```bash
pnpm build          # outputs dist/
```

**GitHub Pages** is wired up in `.github/workflows/pages.yml`, which tests, builds and
publishes `dist/` on every push to `main`. Three settings it depends on:

- Pages source set to **GitHub Actions**, under Settings then Pages. Pointing Pages at a
  branch instead serves a blank page: a branch deploy runs no build, so it hands the
  browser the dev `index.html` and its reference to `/src/main.tsx`, which no browser can
  execute.
- Pages visibility set to **public**, if the repository is private. Private Pages limits
  the site to accounts with repo read access, which excludes every external participant.
  This does not make the repository public; the two settings are separate.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` added under Settings, then Secrets and
  variables, then Actions, on the **Variables** tab.

Variables rather than secrets, deliberately. Both values are compiled into a bundle
served to every visitor, so filing them as secrets would imply a confidentiality the
deployment cannot provide. Do not add the secret key: it has no use in a build.

The report is not in the published bundle at all. It is gated on `import.meta.env.DEV`,
so it exists under `pnpm dev` and in no build, on any host, whatever is configured. That
is not a security control and should not be described as one; the report holds no
credentials and could only ever show a visitor their own browser's run. It is excluded
because the cost model and which scheme currently wins do not belong in front of an
external participant, and seeing them could bias someone who takes the study twice.

The practical consequence is that `pnpm preview` shows the study only. To look at the
report, use `pnpm dev`.

Remember that Vite inlines these at build time rather than reading them at runtime, so a
build that ran without them stays in local-only mode no matter what the host is
configured with afterwards. Rebuild after changing them.

**Vercel** works the same way: set the two `VITE_SUPABASE_*` variables.
