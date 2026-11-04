-- Agents IA tree test tables.
--
-- These live in the same Supabase project as ld-nav-lab, beside its sessions,
-- events and responses tables, and never touch them. Paste the whole file into
-- the Supabase SQL editor and run it. It is safe to re-run.
--
-- The anon role (the key in the published site) can insert and nothing else,
-- so no participant can read anyone's answers. Export results with
-- `pnpm pull`, which uses the service role.

create table if not exists agents_sessions (
  id                uuid primary key,
  participant_label text,
  scheme_id         text        not null,
  started_at        timestamptz not null,
  finished_at       timestamptz,
  user_agent        text,
  -- 'regularly' | 'a-few-times' | 'never', asked on the intro screen.
  ld_usage          text,
  -- Authored task indexes in the order this participant saw them.
  task_order        jsonb,
  -- Post-test grid: { "<capability id>": "yes" | "not-sure" | "no" }.
  survey            jsonb,
  survey_confusing  text
);

-- Every click, back, submit and skip ('giveup'), in order. The source of truth
-- for path analysis; agents_tasks is the same data scored per task.
create table if not exists agents_events (
  id             bigserial primary key,
  session_id     uuid        not null references agents_sessions (id) on delete cascade,
  scenario_id    text        not null,
  task_index     int         not null,
  seq            int         not null,
  kind           text        not null check (kind in ('start', 'click', 'back', 'submit', 'giveup', 'mode', 'stepback')),
  node_path      text        not null,
  destination_id text,
  depth          int         not null,
  ts             timestamptz not null
);

create index if not exists agents_events_session_idx on agents_events (session_id, scenario_id, task_index, seq);

-- One row per task, written after the confidence question or a skip.
create table if not exists agents_tasks (
  id                 bigserial primary key,
  session_id         uuid        not null references agents_sessions (id) on delete cascade,
  scenario_id        text        not null,
  task_index         int         not null,
  position           int         not null,
  prompt             text        not null,
  outcome            text        not null check (outcome in ('direct', 'indirect', 'fail', 'skip')),
  answer_path        text,
  answer_destination text,
  first_click        text,
  time_on_task_ms    int,
  confidence         smallint    check (confidence between 1 and 7),
  unsure_reason      text,
  ts                 timestamptz not null
);

create index if not exists agents_tasks_session_idx on agents_tasks (session_id, task_index);

alter table agents_sessions enable row level security;
alter table agents_events   enable row level security;
alter table agents_tasks    enable row level security;

drop policy if exists agents_sessions_insert on agents_sessions;
drop policy if exists agents_sessions_update on agents_sessions;
drop policy if exists agents_events_insert   on agents_events;
drop policy if exists agents_tasks_insert    on agents_tasks;

create policy agents_sessions_insert on agents_sessions for insert to anon with check (true);
create policy agents_sessions_update on agents_sessions for update to anon using (true) with check (true);
create policy agents_events_insert   on agents_events   for insert to anon with check (true);
create policy agents_tasks_insert    on agents_tasks    for insert to anon with check (true);

-- Policies narrow privileges; they don't grant them. Without these grants every
-- write fails with "permission denied" (SQLSTATE 42501).
grant insert, update on table agents_sessions to anon;
grant insert         on table agents_events   to anon;
grant insert         on table agents_tasks    to anon;

grant usage on sequence agents_events_id_seq to anon;
grant usage on sequence agents_tasks_id_seq  to anon;

-- The end-of-run update filters on id, which needs select on that column only.
-- There is no select policy, so anon still reads zero rows.
grant select (id) on table agents_sessions to anon;

-- For pnpm pull and pnpm discard.
grant select, delete on table agents_sessions, agents_events, agents_tasks to service_role;
grant update         on table agents_sessions to service_role;
