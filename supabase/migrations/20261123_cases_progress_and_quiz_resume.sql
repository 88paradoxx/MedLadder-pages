-- Clinical cases: resume halfway (saved per answer, any device), bookmarks,
-- and counts for Continue / Bookmarked / Completed. Subject quizzes: an
-- unfinished quiz saved per topic so it can be resumed on any device.

-- ---------- tables ----------
create table if not exists public.case_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.clinical_cases(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,      -- {"1":"C","2":"A"}: step number -> picked option
  updated_at timestamptz not null default now(),
  primary key (user_id, case_id)
);
create table if not exists public.case_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.clinical_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, case_id)
);
alter table public.case_progress enable row level security;     -- RPC only
alter table public.case_bookmarks enable row level security;    -- RPC only

create table if not exists public.quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  pool_key text not null,                           -- the quiz's progress key, e.g. "3:anatomy-upper-limb"
  payload jsonb not null,                           -- question ids in order, answers, position, timer, attempt id
  updated_at timestamptz not null default now(),
  primary key (user_id, pool_key)
);
alter table public.quiz_sessions enable row level security;
drop policy if exists quiz_sessions_own on public.quiz_sessions;
create policy quiz_sessions_own on public.quiz_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- answering a step also saves progress (signed-in users) ----------
create or replace function public.case_check(p_case uuid, p_step int, p_key text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare c clinical_cases; s case_steps; nx case_steps; uid uuid := auth.uid();
begin
  select * into c from clinical_cases where id = p_case;
  if not found or not (c.published or public.mock_is_admin()) then raise exception 'not_found'; end if;
  if not public.case_can_open(c) then raise exception 'pro_required'; end if;
  select * into s from case_steps where case_id = p_case and step_no = p_step;
  if not found then raise exception 'not_found'; end if;
  select * into nx from case_steps where case_id = p_case and step_no > p_step order by step_no limit 1;
  if uid is not null then
    insert into case_progress as p (user_id, case_id, answers) values (uid, p_case, jsonb_build_object(p_step::text, upper(coalesce(p_key, ''))))
    on conflict (user_id, case_id) do update set answers = p.answers || excluded.answers, updated_at = now();
  end if;
  return jsonb_build_object(
    'correct', upper(coalesce(p_key, '')) = upper(s.correct_key),
    'correct_key', s.correct_key,
    'explanation', s.explanation,
    'learning_point', s.learning_point,
    'next', case when nx.id is null then null else public.case_step_json(nx) end);
end $$;

-- ---------- open: also says whether there is a saved place, and the bookmark ----------
create or replace function public.case_open(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clinical_cases; s case_steps; n int; pr case_progress; uid uuid := auth.uid(); answered int := 0; correct int := 0;
begin
  select * into c from clinical_cases where id = p_case;
  if not found or not (c.published or public.mock_is_admin()) then raise exception 'not_found'; end if;
  if not public.case_can_open(c) then raise exception 'pro_required'; end if;
  select count(*) into n from case_steps where case_id = c.id;
  if n = 0 then raise exception 'no_steps'; end if;
  select * into s from case_steps where case_id = c.id order by step_no limit 1;
  if uid is not null then
    select * into pr from case_progress where user_id = uid and case_id = c.id;
    if found then
      select count(*), count(*) filter (where upper(pr.answers ->> st.step_no::text) = upper(st.correct_key))
        into answered, correct from case_steps st where st.case_id = c.id and pr.answers ? st.step_no::text;
    end if;
  end if;
  return jsonb_build_object(
    'id', c.id, 'region_id', c.region_id, 'level', c.level, 'title', c.title, 'exam_tags', c.exam_tags,
    'vignette', c.vignette, 'est_minutes', c.est_minutes, 'total', n, 'draft', not c.published,
    'bookmarked', uid is not null and exists (select 1 from case_bookmarks b where b.user_id = uid and b.case_id = c.id),
    'resume', case when answered > 0 and answered < n then jsonb_build_object('answered', answered, 'correct', correct, 'at', pr.updated_at) end,
    'step', public.case_step_json(s));
end $$;

-- ---------- resume: answered steps with their results, then the next step ----------
create or replace function public.case_resume(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clinical_cases; pr case_progress; uid uuid := auth.uid(); done jsonb := '[]'::jsonb; nxt jsonb := null; st case_steps; k text;
begin
  if uid is null then raise exception 'sign_in_required'; end if;
  select * into c from clinical_cases where id = p_case;
  if not found or not (c.published or public.mock_is_admin()) then raise exception 'not_found'; end if;
  if not public.case_can_open(c) then raise exception 'pro_required'; end if;
  select * into pr from case_progress where user_id = uid and case_id = p_case;
  for st in select * from case_steps where case_id = p_case order by step_no loop
    k := upper(coalesce(pr.answers ->> st.step_no::text, ''));
    if k = '' then nxt := public.case_step_json(st); exit; end if;
    done := done || jsonb_build_array(public.case_step_json(st) || jsonb_build_object(
      'picked', k, 'correct', k = upper(st.correct_key), 'correct_key', st.correct_key,
      'explanation', st.explanation, 'learning_point', st.learning_point));
  end loop;
  return jsonb_build_object('done', done, 'step', nxt);
end $$;

create or replace function public.case_restart(p_case uuid)
returns void language sql volatile security definer set search_path = public as $$
  delete from case_progress where user_id = auth.uid() and case_id = p_case;
$$;

create or replace function public.case_finish(p_case uuid, p_score int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; sc int; r case_attempts;
begin
  if uid is null then return null; end if;
  select count(*) into n from case_steps where case_id = p_case;
  if n = 0 then raise exception 'not_found'; end if;
  sc := greatest(0, least(coalesce(p_score, 0), n));
  insert into case_attempts as a (user_id, case_id, score, total, best_score)
  values (uid, p_case, sc, n, sc)
  on conflict (user_id, case_id) do update
    set score = excluded.score, total = excluded.total,
        best_score = greatest(a.best_score, excluded.score),
        attempts = a.attempts + 1, last_at = now()
  returning * into r;
  delete from case_progress where user_id = uid and case_id = p_case;
  return jsonb_build_object('best', r.best_score, 'tries', r.attempts);
end $$;

create or replace function public.case_bookmark(p_case uuid, p_on boolean)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign_in_required'; end if;
  if p_on then
    insert into case_bookmarks (user_id, case_id) values (uid, p_case) on conflict do nothing;
  else
    delete from case_bookmarks where user_id = uid and case_id = p_case;
  end if;
  return p_on;
end $$;

grant execute on function public.case_resume(uuid) to authenticated;
grant execute on function public.case_restart(uuid) to authenticated;
grant execute on function public.case_bookmark(uuid, boolean) to authenticated;
revoke all on function public.case_resume(uuid) from anon;
revoke all on function public.case_restart(uuid) from anon;
revoke all on function public.case_bookmark(uuid, boolean) from anon;

-- ---------- overview: + my counts ----------
create or replace function public.cases_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with adm as (select public.mock_is_admin() a), pro as (select public.battle_is_pro(auth.uid()) p),
  vis as (
    select c.id, c.region_id, c.is_free, c.exam_tags, (a.case_id is not null) as done,
      exists (select 1 from case_progress p where p.user_id = auth.uid() and p.case_id = c.id and p.answers <> '{}'::jsonb) as in_progress,
      exists (select 1 from case_bookmarks b where b.user_id = auth.uid() and b.case_id = c.id) as bookmarked
    from clinical_cases c cross join adm
    left join case_attempts a on a.case_id = c.id and a.user_id = auth.uid()
    where c.published or adm.a
  )
  select jsonb_build_object(
    'is_pro', (select p from pro) or (select a from adm),
    'total', (select count(*) from vis),
    'done', (select count(*) from vis where done),
    'mine', jsonb_build_object(
      'progress', (select count(*) from vis where in_progress),
      'bookmarked', (select count(*) from vis where bookmarked),
      'done', (select count(*) from vis where done)),
    'regions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'blurb', r.blurb, 'icon', r.icon, 'topics', r.topics,
        'total', (select count(*) from vis v where v.region_id = r.id),
        'done', (select count(*) from vis v where v.region_id = r.id and v.done),
        'free', (select count(*) from vis v where v.region_id = r.id and v.is_free)
      ) order by r.sort) from case_regions r), '[]'),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('tag', t, 'n', n) order by n desc, t)
      from (select t, count(*) n from vis, unnest(vis.exam_tags) t group by t) x), '[]')
  );
$$;

-- ---------- list: + statuses "progress" and "bookmarked"; items carry both ----------
-- p_status: all | new (never finished, not started) | progress | done | bookmarked
-- p_sort:   recommended | newest | lowest | az | recent (last touched first)
create or replace function public.cases_list(
  p_region text default null, p_topic text default null, p_level text default null,
  p_status text default 'all', p_exam text default null, p_q text default null,
  p_sort text default 'recommended', p_offset int default 0, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  with adm as (select public.mock_is_admin() a), pro as (select public.battle_is_pro(auth.uid()) p),
  words as (
    select array(select w from regexp_split_to_table(lower(trim(regexp_replace(coalesce(p_q, ''), '[^[:alnum:][:space:]]', ' ', 'g'))), '\s+') w where length(w) >= 2) ws
  ),
  base as (
    select c.*, r.name as region_name, r.icon as region_icon, r.sort as region_sort,
      coalesce(array_position(r.topics, c.topic), 999) as topic_pos,
      a.best_score, a.attempts as tries, a.last_at,
      (select count(*) from case_steps s where s.case_id = c.id) as steps,
      pg.answers as prog, pg.updated_at as prog_at,
      bm.created_at as bm_at
    from clinical_cases c
    join case_regions r on r.id = c.region_id
    cross join adm cross join words
    left join case_attempts a on a.case_id = c.id and a.user_id = auth.uid()
    left join case_progress pg on pg.case_id = c.id and pg.user_id = auth.uid() and pg.answers <> '{}'::jsonb
    left join case_bookmarks bm on bm.case_id = c.id and bm.user_id = auth.uid()
    where (c.published or adm.a)
      and (p_region is null or p_region = '' or c.region_id = p_region)
      and (p_level is null or p_level = '' or c.level = p_level)
      and (p_exam is null or p_exam = '' or exists (select 1 from unnest(c.exam_tags) t where lower(t) = lower(p_exam)))
      and (coalesce(p_status, 'all') = 'all'
           or (p_status = 'new' and a.case_id is null and pg.case_id is null)
           or (p_status = 'progress' and pg.case_id is not null)
           or (p_status = 'done' and a.case_id is not null)
           or (p_status = 'bookmarked' and bm.case_id is not null))
      and not exists (
        select 1 from unnest(words.ws) w
        where c.search_text !~ ('\m' || w))
  ),
  filtered as (select * from base where p_topic is null or p_topic = '' or topic = p_topic or (p_topic = '-' and topic = ''))
  select jsonb_build_object(
    'is_pro', (select p from pro) or (select a from adm),
    'total', (select count(*) from filtered),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'n', n) order by pos, topic)
      from (select topic, min(topic_pos) pos, count(*) n from base group by topic) t), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'region_id', f.region_id, 'region_name', f.region_name, 'region_icon', f.region_icon,
        'topic', f.topic, 'level', f.level, 'title', f.title, 'summary', f.summary, 'exam_tags', f.exam_tags,
        'est_minutes', f.est_minutes, 'is_free', f.is_free, 'steps', f.steps, 'draft', not f.published,
        'locked', not (f.is_free or (select p from pro) or (select a from adm)),
        'best', f.best_score, 'tries', f.tries, 'created_at', f.created_at,
        'progress', case when f.prog is null then null else (select count(*) from jsonb_object_keys(f.prog)) end,
        'bookmarked', f.bm_at is not null) order by f.rn)
      from (
        select x.*, row_number() over (order by
          case when p_sort = 'recent' then extract(epoch from greatest(x.prog_at, x.last_at, x.bm_at)) end desc nulls last,
          case when p_sort = 'newest' then extract(epoch from x.created_at) end desc nulls last,
          case when p_sort = 'lowest' then (x.best_score is null) end asc,
          case when p_sort = 'lowest' then x.best_score::numeric / greatest(x.steps, 1) end asc nulls last,
          case when p_sort = 'az' then lower(x.title) end asc,
          x.region_sort, x.topic_pos, x.topic, case x.level when 'core' then 0 else 1 end, x.sort, x.created_at, x.id) rn
        from filtered x
      ) f
      where f.rn > greatest(coalesce(p_offset, 0), 0)
        and f.rn <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 20), 1), 50)), '[]')
  );
$$;
