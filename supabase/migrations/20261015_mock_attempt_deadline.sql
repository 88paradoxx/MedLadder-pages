-- Cap the mock attempt deadline at the test window end.
--
-- Before this change, deadline_at was always started_at + duration_minutes, so a
-- user joining late (e.g. 12:30 into a 12:00-14:00 test) got a full 2-hour timer
-- running past the window end (until 14:30).
--
-- After this change, deadline_at = least(started_at + duration, ends_at), so the
-- same late joiner gets a 90-minute timer ending exactly at 14:00 with the test.
-- Applies to both fresh attempts and resumed attempts.
--
-- Run in the Supabase SQL editor (safe to re-run; create or replace).

create or replace function public.start_mock_attempt(p_mock_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_test      public.mock_tests%rowtype;
  v_attempt   public.mock_attempts%rowtype;
  v_name      text;
begin
  if v_user_id is null then
    raise exception 'SIGNIN_REQUIRED';
  end if;

  select * into v_test from public.mock_tests where id = p_mock_test_id;
  if not found then
    raise exception 'TEST_NOT_FOUND';
  end if;
  if v_test.status <> 'published' then
    raise exception 'TEST_NOT_PUBLISHED';
  end if;
  if now() < v_test.starts_at then
    raise exception 'TEST_NOT_STARTED';
  end if;
  if now() > v_test.ends_at then
    raise exception 'TEST_ENDED';
  end if;
  if not v_test.is_free and not public.mock_is_pro(v_user_id) then
    raise exception 'PRO_REQUIRED';
  end if;

  select * into v_attempt
  from public.mock_attempts
  where mock_test_id = p_mock_test_id and user_id = v_user_id;

  if found then
    -- Resume the in-progress attempt, or report the submitted one.
    -- Deadline never extends past the test window end.
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'resumed', v_attempt.status = 'in_progress',
      'already_submitted', v_attempt.status = 'submitted',
      'started_at', v_attempt.started_at,
      'deadline_at', least(
        v_attempt.started_at + (v_test.duration_minutes || ' minutes')::interval,
        v_test.ends_at
      ),
      'server_now', now()
    );
  end if;

  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''),
                  nullif(u.raw_user_meta_data->>'full_name', ''),
                  split_part(u.email, '@', 1),
                  'Anonymous')
    into v_name
  from auth.users u where u.id = v_user_id;

  insert into public.mock_attempts (mock_test_id, user_id, display_name)
  values (p_mock_test_id, v_user_id, v_name)
  returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'resumed', false,
    'already_submitted', false,
    'started_at', v_attempt.started_at,
    'deadline_at', least(
      v_attempt.started_at + (v_test.duration_minutes || ' minutes')::interval,
      v_test.ends_at
    ),
    'server_now', now()
  );
end;
$$;

revoke all on function public.start_mock_attempt(uuid) from anon;
grant execute on function public.start_mock_attempt(uuid) to authenticated;
