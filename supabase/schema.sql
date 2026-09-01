-- nav-lab study tables.
--
-- The anon role can insert and nothing else, so a participant cannot read or
-- change anyone else's answers. Export results with the service role or from the
-- Supabase dashboard.

create table if not exists sessions (
  id                uuid primary key,
  participant_label text,
  scheme_id         text        not null,
  started_at        timestamptz not null,
  finished_at       timestamptz,
  user_agent        text
);

create table if not exists events (
  id             bigserial primary key,
  session_id     uuid        not null,
  scenario_id    text        not null,
  task_index     int         not null,
  seq            int         not null,
  kind           text        not null check (kind in ('start', 'click', 'back', 'submit', 'giveup', 'mode')),
  node_path      text        not null,
  destination_id text,
  depth          int         not null,
  ts             timestamptz not null
);

create index if not exists events_session_idx on events (session_id, scenario_id, task_index, seq);

alter table sessions enable row level security;
alter table events   enable row level security;

-- A session row is written at the start and updated once at the end, so the
-- client needs update on its own row as well as insert.
--
-- Dropped first because create policy has no "if not exists", and this file is
-- meant to be safe to re-run after an edit.
drop policy if exists sessions_insert on sessions;
drop policy if exists sessions_update on sessions;
drop policy if exists events_insert   on events;

create policy sessions_insert on sessions for insert to anon with check (true);
create policy sessions_update on sessions for update to anon using (true) with check (true);
create policy events_insert   on events   for insert to anon with check (true);

-- Table privileges, which are separate from the policies above and easy to
-- forget. A policy narrows an existing privilege; it does not grant one. Without
-- these the API returns "permission denied for table sessions" (SQLSTATE 42501)
-- and no write can ever succeed, however permissive the policies are.
--
-- anon gets exactly what the study needs and nothing more. No select: that is
-- what keeps the public bundle unable to read anyone's answers, and it is why
-- the report is a local tool rather than a page behind a login.
grant insert, update on table sessions to anon;
grant insert          on table events   to anon;

-- events.id is a bigserial, so inserting a row also consumes the sequence.
grant usage on sequence events_id_seq to anon;

-- Marking a run finished is "update sessions set finished_at = ... where id = ...",
-- and Postgres requires select privilege on every column named in a where clause.
-- So the update needs select on id, and only on id: a column-level grant rather
-- than the table-wide one the error message suggests.
--
-- This leaks nothing. There is still no select policy on the table, so row level
-- security returns zero rows for any read anon attempts, and the ids are random
-- UUIDs the client generated itself.
grant select (id) on table sessions to anon;

-- service_role bypasses row level security but still needs the privilege. This
-- is the role scripts/pull-results.ts uses to assemble the report, and
-- scripts/discard.ts uses to remove a single run.
--
-- Delete is granted to service_role only, never to anon: a participant must not
-- be able to remove anyone's answers, including their own.
grant select, delete on table sessions, events to service_role;
