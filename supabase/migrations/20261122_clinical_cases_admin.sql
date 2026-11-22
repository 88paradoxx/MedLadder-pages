-- Admin authoring for Clinical Cases (admin panel → Clinical cases).
-- All writes go through these admin-only RPCs (mock_is_admin()).
-- Images live inside the HTML fields (vignette, reveal, stem, explanation) as
-- <img src="https://..."> uploaded to R2 by /api/upload-image, the same way
-- bank questions carry images.

create or replace function public.admin_cases_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'region_id', c.region_id, 'level', c.level, 'title', c.title, 'summary', c.summary,
      'is_free', c.is_free, 'published', c.published, 'sort', c.sort, 'updated_at', c.updated_at,
      'steps', (select count(*) from case_steps s where s.case_id = c.id),
      'has_images', (c.vignette ~* '<img' or exists (select 1 from case_steps s where s.case_id = c.id
                     and (coalesce(s.reveal,'') || s.stem || s.explanation) ~* '<img')),
      'attempts', (select count(*) from case_attempts a where a.case_id = c.id)
    ) order by r.sort, case c.level when 'core' then 0 else 1 end, c.sort, c.created_at)
    from clinical_cases c join case_regions r on r.id = c.region_id), '[]');
end $$;

create or replace function public.admin_case_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clinical_cases;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into c from clinical_cases where id = p_id;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  return to_jsonb(c) || jsonb_build_object('steps', coalesce((
    select jsonb_agg(jsonb_build_object('step_no', s.step_no, 'reveal', s.reveal, 'stem', s.stem, 'options', s.options,
      'correct_key', s.correct_key, 'explanation', s.explanation, 'learning_point', s.learning_point) order by s.step_no)
    from case_steps s where s.case_id = p_id), '[]'));
end $$;

-- Save a whole case in one go: the case row plus its steps (steps are replaced).
-- p jsonb: {id?, region_id, level, title, summary, exam_tags[], vignette, est_minutes,
--           is_free, published, sort, steps:[{reveal, stem, options:[{key,text}], correct_key, explanation, learning_point}]}
create or replace function public.admin_case_save(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare cid uuid := nullif(p->>'id', '')::uuid; st jsonb; i int := 0; keys text[];
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from case_regions where id = p->>'region_id') then raise exception 'BAD_REGION'; end if;
  if coalesce(p->>'level','') not in ('core','advanced') then raise exception 'BAD_LEVEL'; end if;
  if length(trim(coalesce(p->>'title',''))) < 3 then raise exception 'BAD_TITLE'; end if;
  if length(trim(coalesce(p->>'vignette',''))) < 10 then raise exception 'BAD_VIGNETTE'; end if;
  if jsonb_typeof(p->'steps') <> 'array' or jsonb_array_length(p->'steps') = 0 then raise exception 'NO_STEPS'; end if;
  if jsonb_array_length(p->'steps') > 15 then raise exception 'TOO_MANY_STEPS'; end if;
  for st in select * from jsonb_array_elements(p->'steps') loop
    i := i + 1;
    if length(trim(coalesce(st->>'stem',''))) < 3 then raise exception 'BAD_STEM %', i; end if;
    if jsonb_typeof(st->'options') <> 'array' or jsonb_array_length(st->'options') < 2 then raise exception 'BAD_OPTIONS %', i; end if;
    select array_agg(upper(o->>'key')) into keys from jsonb_array_elements(st->'options') o where length(trim(coalesce(o->>'text',''))) > 0;
    if coalesce(array_length(keys,1),0) < 2 then raise exception 'BAD_OPTIONS %', i; end if;
    if not (upper(coalesce(st->>'correct_key','')) = any(keys)) then raise exception 'BAD_ANSWER %', i; end if;
  end loop;

  if cid is null then
    insert into clinical_cases (region_id, level, title, summary, exam_tags, vignette, est_minutes, is_free, published, sort)
    values (p->>'region_id', p->>'level', trim(p->>'title'), coalesce(trim(p->>'summary'),''),
      coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p->'exam_tags','[]')) x where trim(x) <> ''), '{}'),
      p->>'vignette', greatest(1, least(coalesce((p->>'est_minutes')::int, 8), 120)),
      coalesce((p->>'is_free')::boolean, false), coalesce((p->>'published')::boolean, false), coalesce((p->>'sort')::int, 0))
    returning id into cid;
  else
    update clinical_cases set region_id = p->>'region_id', level = p->>'level', title = trim(p->>'title'),
      summary = coalesce(trim(p->>'summary'),''),
      exam_tags = coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p->'exam_tags','[]')) x where trim(x) <> ''), '{}'),
      vignette = p->>'vignette', est_minutes = greatest(1, least(coalesce((p->>'est_minutes')::int, 8), 120)),
      is_free = coalesce((p->>'is_free')::boolean, false), published = coalesce((p->>'published')::boolean, false),
      sort = coalesce((p->>'sort')::int, 0), updated_at = now()
    where id = cid;
    if not found then raise exception 'CASE_NOT_FOUND'; end if;
    delete from case_steps where case_id = cid;
  end if;

  insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point)
  select cid, e.n::int, nullif(trim(coalesce(e.s->>'reveal','')), ''), e.s->>'stem',
    (select jsonb_agg(jsonb_build_object('key', upper(o->>'key'), 'text', trim(o->>'text'))) from jsonb_array_elements(e.s->'options') o where length(trim(coalesce(o->>'text',''))) > 0),
    upper(e.s->>'correct_key'), coalesce(e.s->>'explanation',''), coalesce(trim(e.s->>'learning_point'),'')
  from jsonb_array_elements(p->'steps') with ordinality as e(s, n);

  return cid;
end $$;

create or replace function public.admin_case_set_published(p_id uuid, p_published boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  update clinical_cases set published = p_published, updated_at = now() where id = p_id;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
end $$;

create or replace function public.admin_case_delete(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from clinical_cases where id = p_id;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
end $$;

revoke all on function public.admin_cases_list() from public, anon;
revoke all on function public.admin_case_get(uuid) from public, anon;
revoke all on function public.admin_case_save(jsonb) from public, anon;
revoke all on function public.admin_case_set_published(uuid, boolean) from public, anon;
revoke all on function public.admin_case_delete(uuid) from public, anon;
grant execute on function public.admin_cases_list() to authenticated;
grant execute on function public.admin_case_get(uuid) to authenticated;
grant execute on function public.admin_case_save(jsonb) to authenticated;
grant execute on function public.admin_case_set_published(uuid, boolean) to authenticated;
grant execute on function public.admin_case_delete(uuid) to authenticated;
