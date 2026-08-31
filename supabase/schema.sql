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

-- service_role bypasses row level security but still needs the privilege. This
-- is the role scripts/pull-results.ts uses to assemble the report.
grant select on table sessions, events to service_role;
