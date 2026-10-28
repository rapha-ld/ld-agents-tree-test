-- Click test tables (clicktest.html), alongside the tree-test tables in
-- schema.sql. Same rules: anon can insert, and update its own session row at the
-- end, and nothing else. Results are read with the service role by
-- scripts/score-clicktest.ts. Safe to re-run.

create table if not exists ct_sessions (
  id           uuid primary key,
  pid          text,
  src          text,
  task_order   text[]      not null,
  build_sha    text,
  viewport     text,
  user_agent   text,
  started_at   timestamptz not null,
  finished_at  timestamptz
);

-- Added when the intro started asking for a name. Existing rows keep null.
alter table ct_sessions add column if not exists participant_name text;

create table if not exists ct_events (
  id          bigserial primary key,
  session_id  uuid        not null,
  task_id     text,
  seq         int         not null,
  kind        text        not null,
  track_id    text,
  page        text,
  meta        jsonb,
  ts          timestamptz not null
);

-- `create table if not exists` leaves an existing check alone, so it is replaced
-- explicitly. Add new kinds here and in src/clicktest/harness/types.ts together.
alter table ct_events drop constraint if exists ct_events_kind_check;
alter table ct_events add constraint ct_events_kind_check
  check (kind in ('task_start', 'click', 'page', 'drawer', 'backtrack', 'found', 'giveup', 'timeout', 'select', 'answer'));

create index if not exists ct_events_session_idx on ct_events (session_id, task_id, seq);

-- One row per event, so a retried batch is ignored on conflict instead of doubled.
create unique index if not exists ct_events_session_seq_key on ct_events (session_id, seq);

alter table ct_sessions enable row level security;
alter table ct_events   enable row level security;

drop policy if exists ct_sessions_insert on ct_sessions;
drop policy if exists ct_sessions_update on ct_sessions;
drop policy if exists ct_sessions_select_id on ct_sessions;
drop policy if exists ct_events_insert   on ct_events;

create policy ct_sessions_insert on ct_sessions for insert to anon with check (true);
create policy ct_sessions_update on ct_sessions for update to anon using (true) with check (true);
-- An update that filters on id also has to pass a select policy, or it matches no rows and still
-- reports success. The column grant below keeps anon to the id column.
create policy ct_sessions_select_id on ct_sessions for select to anon using (true);
create policy ct_events_insert   on ct_events   for insert to anon with check (true);

-- A policy narrows a privilege; it does not grant one. Without these every write
-- fails with SQLSTATE 42501. See schema.sql for the longer explanation.
grant insert, update on table ct_sessions to anon;
grant insert         on table ct_events   to anon;
grant usage on sequence ct_events_id_seq to anon;

-- The finish update filters on id, which needs select on that column only.
grant select (id) on table ct_sessions to anon;

grant select, delete on table ct_sessions, ct_events to service_role;
