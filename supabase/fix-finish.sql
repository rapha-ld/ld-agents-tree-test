-- Fix: let the study mark a session finished and save the end-of-study survey.
--
-- The site used a plain update for this. anon has no select policy (so it can't
-- read anyone's answers), and row level security then hides every row from an
-- update's where clause: the update matched nothing and still reported success.
-- This function does the update with the table owner's rights, for one session
-- id, and says whether it found it. Safe to re-run. Also included in schema.sql.

create or replace function public.agents_finish_session(
  p_id          uuid,
  p_finished_at timestamptz,
  p_label       text,
  p_survey      jsonb,
  p_confusing   text
) returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update agents_sessions
       set finished_at       = p_finished_at,
           participant_label = coalesce(p_label, participant_label),
           survey            = p_survey,
           survey_confusing  = p_confusing
     where id = p_id
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke execute on function public.agents_finish_session(uuid, timestamptz, text, jsonb, text) from public;
grant  execute on function public.agents_finish_session(uuid, timestamptz, text, jsonb, text) to anon;
