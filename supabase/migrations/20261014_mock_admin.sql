-- ============================================================================
-- MedLadder mock-test ADMIN panel — run this WHOLE file in the Supabase
-- SQL editor (after 20261013_mock_tests.sql). Idempotent.
--
-- Adds role-gated admin RPCs (SECURITY DEFINER). A caller is admin only when
-- their JWT app_metadata.role = 'admin' (set via supabase/grant-admin.sql).
-- Browsers can never touch the tables directly; everything goes through these.
--
--   admin_list_tests()        — all tests (any status) + question counts
--   admin_create_test(...)    — creates a test as 'draft'
--   admin_update_test(...)    — edit fields / change status
--   admin_delete_test(...)    — deletes test (questions + attempts cascade)
--   admin_list_questions()    — full question rows incl. answers (admin only)
--   admin_add_question(...)   — appends at the next sort_order
--   admin_update_question(...)— edit a question
--   admin_delete_question(...)— delete + renumber sort_order
--   admin_fill_from_bank(...) — snapshot N random bank questions into a test
-- ============================================================================

-- ── admin gate ──────────────────────────────────────────────────────────────
create or replace function public.mock_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function public.mock_is_admin() from anon;
grant execute on function public.mock_is_admin() to authenticated;


-- ── list all tests (admin sees drafts too) ──────────────────────────────────
create or replace function public.admin_list_tests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  return (
    select coalesce(jsonb_agg(row_to_json(r) order by r.starts_at desc), '[]'::jsonb)
    from (
      select t.*,
             (select count(*) from public.mock_test_questions q
              where q.mock_test_id = t.id)::int as question_count,
             (select count(*) from public.mock_attempts a
              where a.mock_test_id = t.id and a.status = 'submitted')::int as submissions
      from public.mock_tests t
    ) r
  );
end;
$$;
revoke all on function public.admin_list_tests() from anon;
grant execute on function public.admin_list_tests() to authenticated;


-- ── create test (starts as draft) ───────────────────────────────────────────
create or replace function public.admin_create_test(
  p_title text, p_exam text, p_description text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_duration_minutes integer, p_total_questions integer,
  p_positive_marks numeric, p_negative_marks numeric, p_is_free boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_ends_at <= p_starts_at then raise exception 'BAD_WINDOW'; end if;
  insert into public.mock_tests
    (title, exam, description, starts_at, ends_at, duration_minutes,
     total_questions, positive_marks, negative_marks, status, is_free)
  values
    (p_title, p_exam, p_description, p_starts_at, p_ends_at, p_duration_minutes,
     p_total_questions, p_positive_marks, p_negative_marks, 'draft', coalesce(p_is_free, true))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.admin_create_test(text,text,text,timestamptz,timestamptz,integer,integer,numeric,numeric,boolean) from anon;
grant execute on function public.admin_create_test(text,text,text,timestamptz,timestamptz,integer,integer,numeric,numeric,boolean) to authenticated;


-- ── update test ─────────────────────────────────────────────────────────────
create or replace function public.admin_update_test(
  p_test_id uuid, p_title text, p_exam text, p_description text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_duration_minutes integer, p_total_questions integer,
  p_positive_marks numeric, p_negative_marks numeric,
  p_is_free boolean, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'BAD_STATUS'; end if;
  if p_ends_at <= p_starts_at then raise exception 'BAD_WINDOW'; end if;
  update public.mock_tests
  set title = p_title, exam = p_exam, description = p_description,
      starts_at = p_starts_at, ends_at = p_ends_at,
      duration_minutes = p_duration_minutes, total_questions = p_total_questions,
      positive_marks = p_positive_marks, negative_marks = p_negative_marks,
      is_free = coalesce(p_is_free, true), status = p_status
  where id = p_test_id;
  if not found then raise exception 'TEST_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_update_test(uuid,text,text,text,timestamptz,timestamptz,integer,integer,numeric,numeric,boolean,text) from anon;
grant execute on function public.admin_update_test(uuid,text,text,text,timestamptz,timestamptz,integer,integer,numeric,numeric,boolean,text) to authenticated;


-- ── delete test ─────────────────────────────────────────────────────────────
create or replace function public.admin_delete_test(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from public.mock_tests where id = p_test_id;
  if not found then raise exception 'TEST_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_delete_test(uuid) from anon;
grant execute on function public.admin_delete_test(uuid) to authenticated;


-- ── list questions (full rows incl. answers — admin only) ────────────────────
create or replace function public.admin_list_questions(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  return (
    select coalesce(jsonb_agg(row_to_json(q) order by q.sort_order), '[]'::jsonb)
    from (select * from public.mock_test_questions
          where mock_test_id = p_test_id order by sort_order) q
  );
end;
$$;
revoke all on function public.admin_list_questions(uuid) from anon;
grant execute on function public.admin_list_questions(uuid) to authenticated;


-- ── add one question (appended at next sort_order) ───────────────────────────
create or replace function public.admin_add_question(
  p_test_id uuid, p_question_text text,
  p_option_a text, p_option_b text, p_option_c text, p_option_d text, p_option_e text,
  p_answer text, p_explanation text, p_subject text, p_question_num integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ord integer; v_id uuid;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_question_text is null or trim(p_question_text) = '' then raise exception 'BAD_QUESTION'; end if;
  if lower(trim(coalesce(p_answer, ''))) not in ('a','b','c','d','e') then raise exception 'BAD_ANSWER'; end if;
  if not exists (select 1 from public.mock_tests where id = p_test_id) then
    raise exception 'TEST_NOT_FOUND';
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_ord
  from public.mock_test_questions where mock_test_id = p_test_id;
  insert into public.mock_test_questions
    (mock_test_id, sort_order, question_num, question_text,
     option_a, option_b, option_c, option_d, option_e, answer, explanation, subject)
  values
    (p_test_id, v_ord, p_question_num, p_question_text,
     nullif(p_option_a,''), nullif(p_option_b,''), nullif(p_option_c,''),
     nullif(p_option_d,''), nullif(p_option_e,''),
     lower(trim(p_answer)), p_explanation, nullif(p_subject,''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'sort_order', v_ord);
end;
$$;
revoke all on function public.admin_add_question(uuid,text,text,text,text,text,text,text,text,text,integer) from anon;
grant execute on function public.admin_add_question(uuid,text,text,text,text,text,text,text,text,text,integer) to authenticated;


-- ── update one question ─────────────────────────────────────────────────────
create or replace function public.admin_update_question(
  p_question_id uuid, p_question_text text,
  p_option_a text, p_option_b text, p_option_c text, p_option_d text, p_option_e text,
  p_answer text, p_explanation text, p_subject text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if lower(trim(coalesce(p_answer, ''))) not in ('a','b','c','d','e') then raise exception 'BAD_ANSWER'; end if;
  update public.mock_test_questions
  set question_text = p_question_text,
      option_a = nullif(p_option_a,''), option_b = nullif(p_option_b,''),
      option_c = nullif(p_option_c,''), option_d = nullif(p_option_d,''),
      option_e = nullif(p_option_e,''),
      answer = lower(trim(p_answer)), explanation = p_explanation,
      subject = nullif(p_subject,'')
  where id = p_question_id;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_update_question(uuid,text,text,text,text,text,text,text,text,text) from anon;
grant execute on function public.admin_update_question(uuid,text,text,text,text,text,text,text,text,text) to authenticated;


-- ── delete one question + renumber ──────────────────────────────────────────
create or replace function public.admin_delete_question(p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_test uuid;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  select mock_test_id into v_test from public.mock_test_questions where id = p_question_id;
  if v_test is null then raise exception 'QUESTION_NOT_FOUND'; end if;
  delete from public.mock_test_questions where id = p_question_id;
  with ordered as (
    select id, row_number() over (order by sort_order) as rn
    from public.mock_test_questions where mock_test_id = v_test
  )
  update public.mock_test_questions q
  set sort_order = o.rn from ordered o where q.id = o.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_delete_question(uuid) from anon;
grant execute on function public.admin_delete_question(uuid) to authenticated;


-- ── fill from bank: snapshot N random bank questions ────────────────────────
create or replace function public.admin_fill_from_bank(p_test_id uuid, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_base integer; v_n integer;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from public.mock_tests where id = p_test_id) then
    raise exception 'TEST_NOT_FOUND';
  end if;
  v_n := greatest(1, least(coalesce(p_count, 50), 500));
  select coalesce(max(sort_order), 0) into v_base
  from public.mock_test_questions where mock_test_id = p_test_id;
  insert into public.mock_test_questions
    (mock_test_id, sort_order, question_num, question_text,
     option_a, option_b, option_c, option_d, option_e, answer, explanation, subject)
  select p_test_id,
         v_base + row_number() over (),
         question_num, question_text,
         option_a, option_b, option_c, option_d, option_e, answer, explanation, subject
  from public.questions
  where answer is not null and question_text is not null
  order by random()
  limit v_n;
  return jsonb_build_object('added', v_n);
end;
$$;
revoke all on function public.admin_fill_from_bank(uuid, integer) from anon;
grant execute on function public.admin_fill_from_bank(uuid, integer) to authenticated;
