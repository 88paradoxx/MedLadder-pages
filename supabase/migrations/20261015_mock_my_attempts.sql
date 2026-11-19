-- Past mock results for the signed-in user, so they can revisit any submitted
-- attempt any time: score, rank, and (via get_my_attempt) the full review with
-- questions, answers and explanations.
--
-- Run in the Supabase SQL editor (safe to re-run; create or replace).

create or replace function public.get_my_mock_attempts(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'SIGNIN_REQUIRED';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(r) order by r.submitted_at desc), '[]'::jsonb)
    from (
      select
        a.id as attempt_id,
        a.mock_test_id,
        t.title as test_title,
        t.exam,
        a.score,
        a.correct_count as correct,
        a.wrong_count as wrong,
        a.skipped_count as skipped,
        a.time_taken_seconds as time_taken,
        a.submitted_at,
        -- same ranking rule as the leaderboard: score desc, faster time wins ties
        (select count(*) + 1
         from public.mock_attempts b
         where b.mock_test_id = a.mock_test_id
           and b.status = 'submitted'
           and (b.score > a.score
                or (b.score = a.score and b.time_taken_seconds < a.time_taken_seconds))
        ) as rank
      from public.mock_attempts a
      join public.mock_tests t on t.id = a.mock_test_id
      where a.user_id = v_user_id
        and a.status = 'submitted'
      order by a.submitted_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) r
  );
end;
$$;

revoke all on function public.get_my_mock_attempts(integer) from anon;
grant execute on function public.get_my_mock_attempts(integer) to authenticated;
