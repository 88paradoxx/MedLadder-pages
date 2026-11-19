-- ============================================================================
-- MedLadder mock tests + live leaderboard — run this WHOLE file in the
-- Supabase SQL editor (same flow as supabase/schema.sql).
-- Idempotent: safe to run again after any change.
--
-- What it does
--   1. mock_tests            — scheduled test events (title, window, scoring)
--   2. mock_test_questions   — per-test question snapshots. The `answer`
--                              column exists ONLY for server-side grading.
--                              Browsers can never read this table directly.
--   3. mock_attempts         — one ranked attempt per user per test.
--                              Browsers can only read SUBMITTED attempts,
--                              and only the leaderboard-safe columns
--                              (answers are never granted to clients).
--   4. RPCs (SECURITY DEFINER) — start_mock_attempt, get_mock_questions,
--                              submit_mock_attempt (server-side grading),
--                              get_my_attempt (owner review), get_leaderboard.
--   5. Realtime on mock_attempts so the leaderboard updates live.
--
-- Design notes
--   * "Live" is derived from starts_at/ends_at — no cron needed to flip status.
--   * Grading happens in submit_mock_attempt. The client never sees answers
--     before submitting (fixes the known questions.answer leak for mocks).
--   * is_free = true  -> any signed-in user can take it (lead magnet).
--     is_free = false -> requires an active row in public.subscriptions.
-- ============================================================================

-- ── 1. mock_tests ───────────────────────────────────────────────────────────
create table if not exists public.mock_tests (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  exam             text not null default 'NEET PG',
  description      text,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  duration_minutes integer not null default 210,
  total_questions  integer not null default 200,
  positive_marks   numeric not null default 4,
  negative_marks   numeric not null default 1,
  status           text not null default 'draft',
  is_free          boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint mock_tests_status_check check (status in ('draft', 'published', 'archived')),
  constraint mock_tests_window_check check (ends_at > starts_at)
);

alter table public.mock_tests add column if not exists is_free boolean not null default true;

create index if not exists mock_tests_starts_idx on public.mock_tests (starts_at desc);

alter table public.mock_tests enable row level security;

drop policy if exists "mock_tests_public_read" on public.mock_tests;
create policy "mock_tests_public_read"
  on public.mock_tests for select to anon, authenticated
  using (status = 'published');

revoke all on public.mock_tests from anon;
revoke insert, update, delete, truncate on public.mock_tests from authenticated;


-- ── 2. mock_test_questions (snapshots; answers never leave the server) ──────
create table if not exists public.mock_test_questions (
  id            uuid primary key default gen_random_uuid(),
  mock_test_id  uuid not null references public.mock_tests(id) on delete cascade,
  sort_order    integer not null,
  question_num  integer,
  question_text text not null,
  option_a      text,
  option_b      text,
  option_c      text,
  option_d      text,
  option_e      text,
  answer        text not null,   -- server-side grading ONLY. Never granted to clients.
  explanation   text,
  subject       text,
  constraint mock_test_questions_order_uidx unique (mock_test_id, sort_order)
);

create index if not exists mock_test_questions_test_idx
  on public.mock_test_questions (mock_test_id, sort_order);

alter table public.mock_test_questions enable row level security;
-- No policies at all: browsers can NEVER read this table, even via RLS.
revoke all on public.mock_test_questions from anon, authenticated;


-- ── 3. mock_attempts ────────────────────────────────────────────────────────
create table if not exists public.mock_attempts (
  id                 uuid primary key default gen_random_uuid(),
  mock_test_id       uuid not null references public.mock_tests(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  display_name       text not null default 'Anonymous',
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  answers            jsonb not null default '{}',
  score              numeric,
  correct_count      integer not null default 0,
  wrong_count        integer not null default 0,
  skipped_count      integer not null default 0,
  time_taken_seconds integer,
  status             text not null default 'in_progress',
  created_at         timestamptz not null default now(),
  constraint mock_attempts_status_check check (status in ('in_progress', 'submitted')),
  constraint mock_attempts_one_ranked_per_user unique (mock_test_id, user_id)
);

create index if not exists mock_attempts_test_score_idx
  on public.mock_attempts (mock_test_id, score desc, time_taken_seconds asc)
  where status = 'submitted';

alter table public.mock_attempts enable row level security;

-- Column-level grants: clients may read leaderboard-safe columns ONLY.
-- `answers` is never granted — owners read their own detail via get_my_attempt().
revoke all on public.mock_attempts from anon, authenticated;
grant select (id, mock_test_id, display_name, submitted_at, score,
              correct_count, wrong_count, skipped_count,
              time_taken_seconds, status)
  on public.mock_attempts to authenticated;

drop policy if exists "mock_attempts_leaderboard_read" on public.mock_attempts;
create policy "mock_attempts_leaderboard_read"
  on public.mock_attempts for select to authenticated
  using (status = 'submitted');
-- No insert/update/delete policies: attempts are created/graded via RPCs only.


-- ── 4. RPCs ─────────────────────────────────────────────────────────────────

-- Helper: is this user currently Pro? (mirrors subscriptions as source of truth)
create or replace function public.mock_is_pro(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and status = 'active'
      and expires_at > now()
  );
$$;

revoke all on function public.mock_is_pro(uuid) from anon;
grant execute on function public.mock_is_pro(uuid) to authenticated;


-- 4a. Start (or resume) an attempt. Stamps started_at server-side.
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
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'resumed', v_attempt.status = 'in_progress',
      'already_submitted', v_attempt.status = 'submitted',
      'started_at', v_attempt.started_at,
      'deadline_at', v_attempt.started_at + (v_test.duration_minutes || ' minutes')::interval,
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
    'deadline_at', v_attempt.started_at + (v_test.duration_minutes || ' minutes')::interval,
    'server_now', now()
  );
end;
$$;

revoke all on function public.start_mock_attempt(uuid) from anon;
grant execute on function public.start_mock_attempt(uuid) to authenticated;


-- 4b. Fetch questions for an attempt — WITHOUT answers or explanations.
create or replace function public.get_mock_questions(p_mock_test_id uuid)
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
  if not exists (
    select 1 from public.mock_attempts
    where mock_test_id = p_mock_test_id and user_id = v_user_id
  ) then
    raise exception 'ATTEMPT_REQUIRED';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(q) order by q.sort_order), '[]'::jsonb)
    from (
      select sort_order, question_num, question_text,
             option_a, option_b, option_c, option_d, option_e, subject
      from public.mock_test_questions
      where mock_test_id = p_mock_test_id
      order by sort_order
    ) q
  );
end;
$$;

revoke all on function public.get_mock_questions(uuid) from anon;
grant execute on function public.get_mock_questions(uuid) to authenticated;


-- 4c. Submit + server-side grading. p_answers: {"<sort_order>": "a"|"b"|...}
create or replace function public.submit_mock_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_attempt  public.mock_attempts%rowtype;
  v_test     public.mock_tests%rowtype;
  v_q        record;
  v_given    text;
  v_correct  integer := 0;
  v_wrong    integer := 0;
  v_skipped  integer := 0;
  v_score    numeric := 0;
  v_time     integer;
  v_rank     integer;
begin
  if v_user_id is null then
    raise exception 'SIGNIN_REQUIRED';
  end if;

  select * into v_attempt from public.mock_attempts where id = p_attempt_id;
  if not found or v_attempt.user_id <> v_user_id then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status = 'submitted' then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  select * into v_test from public.mock_tests where id = v_attempt.mock_test_id;

  for v_q in
    select sort_order, lower(trim(answer)) as ans
    from public.mock_test_questions
    where mock_test_id = v_attempt.mock_test_id
    order by sort_order
  loop
    v_given := lower(trim(coalesce(p_answers ->> v_q.sort_order::text, '')));
    if v_given is null or v_given = '' then
      v_skipped := v_skipped + 1;
    elsif v_given = v_q.ans then
      v_correct := v_correct + 1;
      v_score := v_score + v_test.positive_marks;
    else
      v_wrong := v_wrong + 1;
      v_score := v_score - v_test.negative_marks;
    end if;
  end loop;

  v_time := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);

  update public.mock_attempts
  set status = 'submitted',
      submitted_at = now(),
      answers = coalesce(p_answers, '{}'),
      score = v_score,
      correct_count = v_correct,
      wrong_count = v_wrong,
      skipped_count = v_skipped,
      time_taken_seconds = v_time
  where id = p_attempt_id;

  select count(*) + 1 into v_rank
  from public.mock_attempts
  where mock_test_id = v_attempt.mock_test_id
    and status = 'submitted'
    and id <> p_attempt_id
    and (score > v_score
         or (score = v_score and coalesce(time_taken_seconds, 99999999) < v_time));

  return jsonb_build_object(
    'score', v_score,
    'correct', v_correct,
    'wrong', v_wrong,
    'skipped', v_skipped,
    'time_taken_seconds', v_time,
    'rank', v_rank,
    'total_questions', v_test.total_questions
  );
end;
$$;

revoke all on function public.submit_mock_attempt(uuid, jsonb) from anon;
grant execute on function public.submit_mock_attempt(uuid, jsonb) to authenticated;


-- 4d. Owner-only detailed review (with answers + explanations) after submit.
create or replace function public.get_my_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.mock_attempts%rowtype;
begin
  if v_user_id is null then
    raise exception 'SIGNIN_REQUIRED';
  end if;

  select * into v_attempt from public.mock_attempts where id = p_attempt_id;
  if not found or v_attempt.user_id <> v_user_id then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'submitted' then
    raise exception 'NOT_SUBMITTED';
  end if;

  return jsonb_build_object(
    'attempt', row_to_json(v_attempt),
    'questions', (
      select coalesce(jsonb_agg(row_to_json(q) order by q.sort_order), '[]'::jsonb)
      from (
        select sort_order, question_num, question_text,
               option_a, option_b, option_c, option_d, option_e,
               answer, explanation, subject
        from public.mock_test_questions
        where mock_test_id = v_attempt.mock_test_id
        order by sort_order
      ) q
    )
  );
end;
$$;

revoke all on function public.get_my_attempt(uuid) from anon;
grant execute on function public.get_my_attempt(uuid) to authenticated;


-- 4e. Leaderboard (safe columns only; rank computed in SQL).
create or replace function public.get_leaderboard(p_mock_test_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'SIGNIN_REQUIRED';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(r) order by r.rank), '[]'::jsonb)
    from (
      select
        rank() over (order by a.score desc, a.time_taken_seconds asc) as rank,
        a.display_name,
        a.score,
        a.correct_count  as correct,
        a.wrong_count    as wrong,
        a.skipped_count  as skipped,
        a.time_taken_seconds as time_taken,
        a.submitted_at,
        (a.user_id = auth.uid()) as is_you
      from public.mock_attempts a
      where a.mock_test_id = p_mock_test_id
        and a.status = 'submitted'
      order by a.score desc, a.time_taken_seconds asc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) r
  );
end;
$$;

revoke all on function public.get_leaderboard(uuid, integer) from anon;
grant execute on function public.get_leaderboard(uuid, integer) to authenticated;


-- ── 5. Realtime for the live leaderboard ─────────────────────────────────────
alter table public.mock_attempts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mock_attempts'
  ) then
    alter publication supabase_realtime add table public.mock_attempts;
  end if;
end $$;


-- ── 6. OPTIONAL seed template (commented out — review before running) ───────
-- Creates a "Grand Test" from the existing questions bank.
-- 1) Create the event row, then 2) snapshot N questions into it.
--
-- insert into public.mock_tests
--   (title, exam, description, starts_at, ends_at, duration_minutes,
--    total_questions, positive_marks, negative_marks, status, is_free)
-- values
--   ('NEET PG Grand Test #1 — Free All-India Mock',
--    'NEET PG',
--    '200 questions · 3.5 hours · +4/-1 · All-India rank on the live leaderboard.',
--    '2026-10-19 10:00:00+05:30',   -- next Sunday 10:00 IST
--    '2026-10-19 14:00:00+05:30',
--    210, 200, 4, 1, 'published', true)
-- returning id;  -- copy the id into the insert below
--
-- insert into public.mock_test_questions
--   (mock_test_id, sort_order, question_num, question_text,
--    option_a, option_b, option_c, option_d, option_e, answer, explanation, subject)
-- select
--   '<PASTE_TEST_ID>'::uuid,
--   row_number() over (order by random()),
--   question_num, question_text,
--   option_a, option_b, option_c, option_d, option_e, answer, explanation, subject
-- from public.questions
-- where answer is not null and question_text is not null
-- order by random()
-- limit 200;
