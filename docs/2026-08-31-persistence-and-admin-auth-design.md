# Persistence, and keeping results off the public site

Design for storing every study run in Supabase while the study itself stays open
to anyone with the link, and aggregate results stay off the internet entirely.

Status: approved, not yet implemented.
Supersedes an earlier revision of this file that used Google sign-in and row
level security to gate a published report. See "Why there is no login wall".

## Goal

1. A participant's answers survive their browser. Today they do not, so results
   from anyone outside this laptop are effectively lost.
2. Aggregate results are visible only to the people running the study.
   Participants may be outside the company and the study URL is public.

## What already exists

Most of the write path is built. Read this before writing code.

`supabase/schema.sql` defines `sessions` and `events`, both with row level
security on and the `anon` role granted insert only. There is no select policy,
so the anon key cannot read anything back.

`src/session.ts` writes to both tables and degrades to `localStorage` when the
two environment variables are absent, reporting which write succeeded through
its `SaveResult` type. `Study.tsx` writes a `sessions` row when a participant
starts and flushes buffered events after every task, so partial runs already
reach the database once one is configured.

`Report.tsx` already reads a `{ sessions, events }` JSON file through
`loadResults()` and renders the full analysis from it. That existing path is
what this design feeds.

The gap is that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are never set
in the Pages build, so production has always run in local mode.

## Decisions

| Question | Decision |
| --- | --- |
| Aggregate results | Assembled by a script on the operator's machine, never in a browser |
| Report in production | Excluded from the build. Not a security control; see below |
| Browser read access | None. `anon` keeps insert only |
| Participant identity | Unchanged: optional free-text label, no new columns |
| Pages visibility | Public, so participants outside LaunchDarkly can take the study |

Participants are not asked for a name or email. That keeps the study clear of
collecting personal data from people outside the company, and a tree test cares
about aggregate label comprehension rather than who got which task wrong.

## Why there is no login wall

An earlier revision of this design put the report behind Google sign-in and
granted select to LaunchDarkly addresses through a row level security policy.
That was the right shape for a report that reads the database from the browser.

This design removes the browser read entirely, which removes the thing the wall
was protecting. No credential capable of reading results is ever served to a
visitor, so there is no auth code, no OAuth client, and no select policy. The
strongest available posture also turns out to be the smallest: nothing anywhere
on the public internet can read a result.

The residual cost is that seeing aggregate results requires a repo checkout and
a terminal. For a tool with one or two operators, that is a fair trade against
building and maintaining an auth layer.

## Architecture

### Capture

No change to the write logic in `session.ts`. The Pages workflow gains the two
variables on the build step, which flips `persistenceMode` to `supabase` in
production.

The anon key is compiled into the published bundle. That is what the key is for:
it identifies the project, and row level security decides what it may do. Its
only granted capability is inserting rows.

One real gap to close. `flush()` runs when a participant advances a task, so
closing the tab mid-task loses that task's buffered clicks. Add a listener that
flushes on `pagehide`, and on `visibilitychange` when the document becomes
hidden, so mid-task abandonment survives. Safari does not reliably fire
`beforeunload`, which is why those two events rather than that one.

### Pulling results

A new `scripts/pull-results.ts`, run with tsx like the existing scripts. It
reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment,
selects every row from both tables, and writes `nav-lab-results.json` in the
`{ sessions, events }` shape `Report.tsx` already loads.

The variable is deliberately not `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite inlines
any `VITE_`-prefixed variable into the bundle it builds. The service role key
bypasses row level security completely, so the prefix would turn a local
convenience into a full public read of the database. The script runs in Node and
the browser never sees the value.

It pages explicitly with `.range()`. Supabase caps a response at 1000 rows, and
events will pass that after roughly six participants. A run is 31 tasks, each
producing a start event, a submit, and a click per level descended, so a single
completed run lands on the order of 150 rows. An unpaged select would silently
truncate, and every figure in the report would be quietly wrong.

The output file holds participant data, so it goes in `.gitignore`.

### Report

`#/report` exists under the dev server and in no build, gated on
`import.meta.env.DEV`.

The first attempt used a `VITE_REPORT_ENABLED` variable set in `.env.local` and
absent in CI. That was wrong: Vite reads `.env.local` during `vite build` as
well as `vite dev`, so `pnpm build` on a machine with the file produced a bundle
containing the report. Verified by building and grepping the output. Tying
inclusion to `DEV` means no build can carry the report whatever is set where.
The cost is that `pnpm preview` shows the study only.

This is not a security boundary and should not be described as one. The report
code contains no credentials, and in production it could only ever show the
visitor their own `localStorage` run. The reason to exclude it is that it
contains LaunchDarkly's internal scheme comparison, the cost model, and which
scheme we currently believe wins. None of that belongs in front of an external
participant, and seeing it could bias someone who takes the study twice.

Consequences: the Report link comes out of `GlobalNav`, and the "See the report"
link comes off the study's done screen, in production builds. Locally both stay.

No other change to `Report.tsx`. It renders from the uploaded file exactly as it
does today.

### Partial runs in the report

`analyze()` skips any session without a `finished_at` (`analyze.ts:109`).
Unfinished sessions stay out of the accuracy and timing figures, because a run
that stopped after two tasks would distort both.

The report gains a dropout line per scheme: sessions started, sessions finished,
and the task index where unfinished runs stopped. Where people quit is often the
most useful signal a tree test produces, and today it is discarded.

### Every task page stands on its own

A participant currently sees the persona and context once, on an interstitial,
then every task page shows only `task.prompt`. A prompt like "Turn off the
feature that shipped this morning" means little without the incident it belongs
to, and anyone who leaves and comes back, or who clicks through the interstitial
quickly, never sees the context again.

The task screen gains a persistent block holding the scenario persona and its
context, shown in full. Context runs 20 to 30 words across all nine scenarios and
no scenario has more than four tasks, so there is no need for a disclosure
control: it always fits.

Progress changes from one bar across all 31 tasks to two figures that a
participant can act on. "Scenario 2 of 9" gives overall position. A segmented bar
with one segment per task in the current scenario, alongside "Task 2 of 3", shows
how much of this scenario is left. The single 31-task bar is removed rather than
kept alongside, because two progress indicators compete and the global one told
a participant almost nothing.

The interstitial stays, and states how many tasks the scenario contains. Its job
shifts from "remember this" to "here is what is coming".

Semantics matter here as much as layout. The segmented bar is one element with
`role="progressbar"` and `aria-valuenow` and `aria-valuemax`, not four
decorative divs. The persona and context are associated with the task prompt, so
someone reaching the prompt with a screen reader has the context in scope.
Without that, the page is standalone only if you can see it.

### README

Written for two readers at once: designers on the team who may add a scheme or a
scenario, and the author six months from now who has forgotten how any of it
works. It covers why destinations are invariant and what that buys, how to author
a scheme file, how to author a scenario and its tasks, what makes a scenario
worth adding, how to run the project locally, and how to pull and read results.
Gotchas are called out where they exist rather than left to be rediscovered.

## Files touched

| File | Change |
| --- | --- |
| `scripts/pull-results.ts` | New. Paged select of both tables to a JSON file. |
| `src/study/Study.tsx` | Persistent scenario block, segmented progress, interstitial task count. Flush on `pagehide` and hidden `visibilitychange`. Gate the report link. |
| `src/app.css` | Styles for the scenario block and the segmented bar. |
| `src/main.tsx` | Gate the report route and nav link on `import.meta.env.DEV`. |
| `src/report/analyze.ts` | Return started, finished, and dropout task per scheme. |
| `src/report/Report.tsx` | Render the dropout figures. |
| `.github/workflows/*.yml` | Pass the two `VITE_` variables to the build step. |
| `.gitignore` | Add `nav-lab-results.json`. |
| `package.json` | Add a `pull` script pointing at `scripts/pull-results.ts`. |
| `README.md` | Document the two modes and the pull script. |

No new dependency. No change to `supabase/schema.sql`. No auth module.

## Testing

Automated, in vitest:

- The paging helper in `pull-results`, against a fake client: 2500 rows assemble
  into 2500 across three requests, and a mid-page error surfaces rather than
  returning a short list silently. This is the failure mode that would corrupt
  every number in the report while looking like it worked.
- `analyze` dropout counting: a session with no `finished_at` is excluded from
  accuracy but counted as a dropout at the right task index.

Manual:

1. Take the study to completion on the deployed URL. Run the pull script and
   confirm the run is present.
2. Abandon a run mid-task by closing the tab. Confirm the partial session and
   its events are present.
3. In devtools on the deployed site, call select against `sessions` with the
   anon client. Confirm zero rows. This is the step that verifies the claim that
   nothing public can read results.
4. Confirm `dist/` after a CI build contains no report markup and no service
   role key. `grep -r` for both.

Steps 3 and 4 are the ones that verify the security posture. Skipping them means
shipping on an assumption.

## Risks

Supabase pauses free-tier projects after seven days without activity. A study
that runs over several weeks with quiet stretches can find the database asleep
when a participant arrives. The write failure surfaces to the participant
through the existing `saveIssue` notice, but that run is still lost. Worth
checking the project state before each round of recruiting.

`data/destinations.json` becomes public when Pages does. It holds 319 internal
gonfalon route patterns, the owning team per route, 64 destinations marked as
gated, the absolute path of a local checkout, and the internal source file paths
it was extracted from. The gated set is publicly known LaunchDarkly capability
and no flag keys are included, so the exposure is low. The local path and the
source paths serve no purpose in a published bundle and should be scrubbed.
Whether to also drop `owner` is the operator's call.

The service role key is the one genuinely sensitive value in this design. It
lives only in `.env.local`, which `.gitignore` already covers. If it leaks,
rotate it in the Supabase dashboard.

## Setup runbook

### 1. Supabase project

1. At supabase.com, create a project. Pick a region near most participants.
2. Save the database password somewhere durable. This app never uses it, but
   recovering it later is unpleasant.
3. Open the SQL editor and run the contents of `supabase/schema.sql`.
4. Under Settings, then API, copy three values: the project URL, the `anon`
   public key, and the `service_role` secret key.

`schema.sql` is idempotent, so re-running it is safe. There is no second SQL
file to run.

### 2. Repository variables

On `launchdarkly-labs/ld-nav-lab`, under Settings, then Secrets and variables, then
Actions, open the Variables tab and add two repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Variables rather than secrets, deliberately. Both values are compiled into a
published bundle, so filing them as secrets would imply a confidentiality the
deployment cannot provide. A masked build log beside a publicly served copy of
the same string is false comfort.

Do not add the service role key here. It has no use in a build and would be
inlined into the bundle if it were ever given a `VITE_` prefix.

### 3. Pages visibility

Set the Pages site to public, under Settings, then Pages. This does not change
repository visibility; the two are separate settings and the source stays
private. Private Pages restricts the site to accounts with repo read access,
which excludes every external participant.

Scrub `extractedFrom` and `sources` from `data/destinations.json` before this
step.

### 4. Local environment

Create `.env.local`, already covered by `.gitignore`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The URL appears twice on purpose. The `VITE_` copy is for the browser, the
unprefixed copy is for the Node script, and Vite only exposes the prefixed form.

Without this file the app runs in local mode with no report route, which is
still a usable way to work on the study screens.

### 5. Reading results

```
pnpm pull        # writes nav-lab-results.json
pnpm dev         # open the report, load that file
```
