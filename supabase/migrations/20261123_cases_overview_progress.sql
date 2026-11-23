-- Clinical cases: overall and per-system progress (accuracy) for the hub's progress card.
-- Adds score/max (sum of best scores and steps over attempted cases) and attempted-today counts.
create or replace function public.cases_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with adm as (select public.mock_is_admin() a), pro as (select public.battle_is_pro(auth.uid()) p),
  vis as (
    select c.id, c.region_id, c.is_free, c.exam_tags, (a.case_id is not null) as done,
      coalesce(a.best_score, 0) as score,
      case when a.case_id is null then 0 else (select count(*) from case_steps s where s.case_id = c.id) end as max_score,
      a.last_at,
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
    'score', (select coalesce(sum(score), 0) from vis where done),
    'max', (select coalesce(sum(max_score), 0) from vis where done),
    'week', (select count(*) from vis where done and last_at > now() - interval '7 days'),
    'mine', jsonb_build_object(
      'progress', (select count(*) from vis where in_progress),
      'bookmarked', (select count(*) from vis where bookmarked),
      'done', (select count(*) from vis where done)),
    'regions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'blurb', r.blurb, 'icon', r.icon, 'topics', r.topics,
        'total', (select count(*) from vis v where v.region_id = r.id),
        'done', (select count(*) from vis v where v.region_id = r.id and v.done),
        'free', (select count(*) from vis v where v.region_id = r.id and v.is_free),
        'score', (select coalesce(sum(score), 0) from vis v where v.region_id = r.id and v.done),
        'max', (select coalesce(sum(max_score), 0) from vis v where v.region_id = r.id and v.done)
      ) order by r.sort) from case_regions r), '[]'),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('tag', t, 'n', n) order by n desc, t)
      from (select t, count(*) n from vis, unnest(vis.exam_tags) t group by t) x), '[]')
  );
$$;
