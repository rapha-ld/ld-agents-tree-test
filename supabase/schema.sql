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
