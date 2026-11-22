-- Clinical Cases as a searchable library: topics inside regions, hidden search
-- keywords, and one paged list function with search, filters and sorting.

alter table public.clinical_cases add column if not exists topic text not null default '';
alter table public.clinical_cases add column if not exists keywords text not null default '';  -- searchable, never shown (e.g. the diagnosis)
alter table public.case_regions add column if not exists topics text[] not null default '{}';    -- standard topic order for each region
create index if not exists clinical_cases_region_topic_idx on public.clinical_cases (region_id, topic);

update public.case_regions r set topics = t.topics from (values
  ('cardio', array['Acute coronary syndromes','Heart failure','Arrhythmias','Valvular heart disease','Cardiomyopathies','Pericardial diseases','Hypertension','Congenital heart disease','Aortic diseases','Shock']),
  ('resp',   array['Asthma & COPD','Pneumonia','Tuberculosis','Pulmonary embolism','Interstitial lung disease','Pleural disease','Lung cancer','Respiratory failure','Sleep & ventilation']),
  ('neuro',  array['Stroke','Seizures & epilepsy','Headache','CNS infections','Neuromuscular disease','Movement disorders','Demyelinating disease','Coma & raised ICP','Spinal cord disease']),
  ('gi',     array['GI bleeding','Liver disease','Jaundice & biliary disease','Pancreatitis','Inflammatory bowel disease','Malabsorption','Acute abdomen','GI cancers','Oesophagus & stomach']),
  ('renal',  array['Acute kidney injury','Chronic kidney disease','Glomerular disease','Sodium & water','Potassium','Acid–base','Calcium & phosphate','Urinary tract & stones','Renovascular disease']),
  ('endo',   array['Diabetes & emergencies','Thyroid','Adrenal','Pituitary','Calcium & bone','Endocrine hypertension','Lipids & obesity','Reproductive endocrinology']),
  ('heme',   array['Anaemia','Bleeding disorders','Thrombosis','Leukaemia','Lymphoma & myeloma','Myeloproliferative disease','Transfusion','Oncologic emergencies']),
  ('id',     array['Fever & sepsis','Tropical infections','HIV','Tuberculosis','Meningitis & encephalitis','Hospital infections','Zoonoses','Fungal & parasitic','Vaccine-preventable disease']),
  ('msk',    array['Inflammatory arthritis','Crystal arthritis','Connective tissue disease','Vasculitis','Back pain & spine','Bone disease','Soft tissue & sports','Bone & joint infection']),
  ('obgyn',  array['Early pregnancy','Antepartum haemorrhage','Hypertension in pregnancy','Medical disorders in pregnancy','Labour & delivery','Postpartum','Menstrual disorders','Gynaecological oncology','Infertility & contraception']),
  ('peds',   array['Neonatology','Growth & development','Paediatric infections','Congenital heart disease','Genetic & metabolic','Paediatric emergencies','Nutrition','Paediatric neurology','Paediatric surgery']),
  ('psych',  array['Psychosis','Mood disorders','Anxiety & OCD','Substance use','Delirium & dementia','Personality & behaviour','Child psychiatry','Psychiatric emergencies','Drug side effects']),
  ('emerg',  array['Resuscitation','Trauma','Poisoning','Shock & sepsis','Environmental emergencies','Airway & breathing','Anaphylaxis','Burns'])
) as t(id, topics) where r.id = t.id;

-- ---------- overview: regions with counts (hub) ----------
create or replace function public.cases_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with adm as (select public.mock_is_admin() a), pro as (select public.battle_is_pro(auth.uid()) p),
  vis as (
    select c.region_id, c.is_free, c.exam_tags, (a.case_id is not null) as done
    from clinical_cases c cross join adm
    left join case_attempts a on a.case_id = c.id and a.user_id = auth.uid()
    where c.published or adm.a
  )
  select jsonb_build_object(
    'is_pro', (select p from pro) or (select a from adm),
    'total', (select count(*) from vis),
    'done', (select count(*) from vis where done),
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
grant execute on function public.cases_overview() to anon, authenticated;

-- ---------- paged list: search + filters + sort ----------
-- p_status: all | new (never finished) | done (finished at least once)
-- p_sort:   recommended | newest | lowest | az
-- Search matches every word (at word start) against search_text: title, summary,
-- topic, region, exam tags, hidden keywords, the case and every step.
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
      (select count(*) from case_steps s where s.case_id = c.id) as steps
    from clinical_cases c
    join case_regions r on r.id = c.region_id
    cross join adm cross join words
    left join case_attempts a on a.case_id = c.id and a.user_id = auth.uid()
    where (c.published or adm.a)
      and (p_region is null or p_region = '' or c.region_id = p_region)
      and (p_level is null or p_level = '' or c.level = p_level)
      and (p_exam is null or p_exam = '' or exists (select 1 from unnest(c.exam_tags) t where lower(t) = lower(p_exam)))
      and (coalesce(p_status, 'all') = 'all'
           or (p_status = 'new' and a.case_id is null)
           or (p_status = 'done' and a.case_id is not null))
      and not exists (
        select 1 from unnest(words.ws) w
        -- word-start match: "hypot" finds "hypotension", "mi" does not match "vomiting"
        where c.search_text !~ ('\m' || w))
  ),
  filtered as (select * from base where p_topic is null or p_topic = '' or topic = p_topic or (p_topic = '-' and topic = ''))
  select jsonb_build_object(
    'is_pro', (select p from pro) or (select a from adm),
    'total', (select count(*) from filtered),
    -- counts per topic under the current filters (topic itself not applied), for the chips
    'topics', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'n', n) order by pos, topic)
      from (select topic, min(topic_pos) pos, count(*) n from base group by topic) t), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'region_id', f.region_id, 'region_name', f.region_name, 'region_icon', f.region_icon,
        'topic', f.topic, 'level', f.level, 'title', f.title, 'summary', f.summary, 'exam_tags', f.exam_tags,
        'est_minutes', f.est_minutes, 'is_free', f.is_free, 'steps', f.steps, 'draft', not f.published,
        'locked', not (f.is_free or (select p from pro) or (select a from adm)),
        'best', f.best_score, 'tries', f.tries, 'created_at', f.created_at) order by f.rn)
      from (
        select x.*, row_number() over (order by
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
grant execute on function public.cases_list(text, text, text, text, text, text, text, int, int) to anon, authenticated;

-- ---------- admin: topic + keywords ----------
create or replace function public.admin_cases_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'region_id', c.region_id, 'topic', c.topic, 'level', c.level, 'title', c.title, 'summary', c.summary,
      'is_free', c.is_free, 'published', c.published, 'sort', c.sort, 'updated_at', c.updated_at,
      'steps', (select count(*) from case_steps s where s.case_id = c.id),
      'has_images', (c.vignette ~* '<img' or exists (select 1 from case_steps s where s.case_id = c.id
                     and (coalesce(s.reveal,'') || s.stem || s.explanation) ~* '<img')),
      'attempts', (select count(*) from case_attempts a where a.case_id = c.id)
    ) order by r.sort, coalesce(array_position(r.topics, c.topic), 999), c.topic, case c.level when 'core' then 0 else 1 end, c.sort, c.created_at)
    from clinical_cases c join case_regions r on r.id = c.region_id), '[]');
end $$;

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
    insert into clinical_cases (region_id, topic, keywords, level, title, summary, exam_tags, vignette, est_minutes, is_free, published, sort)
    values (p->>'region_id', left(trim(coalesce(p->>'topic','')), 80), left(trim(coalesce(p->>'keywords','')), 500),
      p->>'level', trim(p->>'title'), coalesce(trim(p->>'summary'),''),
      coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p->'exam_tags','[]')) x where trim(x) <> ''), '{}'),
      p->>'vignette', greatest(1, least(coalesce((p->>'est_minutes')::int, 8), 120)),
      coalesce((p->>'is_free')::boolean, false), coalesce((p->>'published')::boolean, false), coalesce((p->>'sort')::int, 0))
    returning id into cid;
  else
    update clinical_cases set region_id = p->>'region_id',
      topic = left(trim(coalesce(p->>'topic','')), 80), keywords = left(trim(coalesce(p->>'keywords','')), 500),
      level = p->>'level', title = trim(p->>'title'), summary = coalesce(trim(p->>'summary'),''),
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

-- Topics for the cases that already exist.
update public.clinical_cases set topic = 'Acute coronary syndromes' where topic = '' and title in ('Crushing chest pain and a falling BP', 'Sudden breathlessness after myocardial infarction');
update public.clinical_cases set topic = 'Valvular heart disease' where topic = '' and title = 'Syncope with a harsh systolic murmur';
update public.clinical_cases set topic = 'Arrhythmias' where topic = '' and title = 'Irregularly irregular pulse with sudden weakness';
update public.clinical_cases set topic = 'Pericardial diseases' where topic = '' and title = 'Chest pain that improves on leaning forward';
update public.clinical_cases set topic = 'Hypertension' where topic = '' and title = 'Resistant hypertension with hypokalemia';
update public.clinical_cases set keywords = 'RCA, right ventricular infarction, RV infarct, V4R, STEMI' where keywords = '' and title = 'Crushing chest pain and a falling BP';
update public.clinical_cases set keywords = 'papillary muscle rupture, acute mitral regurgitation, mechanical complication' where keywords = '' and title = 'Sudden breathlessness after myocardial infarction';
update public.clinical_cases set keywords = 'aortic stenosis, aortic valve replacement, TAVI' where keywords = '' and title = 'Syncope with a harsh systolic murmur';
update public.clinical_cases set keywords = 'atrial fibrillation, cardioembolic stroke, thrombolysis' where keywords = '' and title = 'Irregularly irregular pulse with sudden weakness';
update public.clinical_cases set keywords = 'acute pericarditis, colchicine, friction rub' where keywords = '' and title = 'Chest pain that improves on leaning forward';
update public.clinical_cases set keywords = 'primary hyperaldosteronism, Conn syndrome, aldosterone renin ratio' where keywords = '' and title = 'Resistant hypertension with hypokalemia';

-- ---------- search text: case + every step (findings, question, explanation, key point) ----------
-- Kept in one column, refreshed by a trigger whenever a case or its steps change,
-- so search can find symptoms ("hypotension") that only appear in later steps.
-- Cards never show why a case matched, so this reveals nothing.
alter table public.clinical_cases add column if not exists search_text text not null default '';

create or replace function public.case_refresh_search(p_case uuid)
returns void language sql volatile security definer set search_path = public as $$
  update clinical_cases c set search_text = lower(regexp_replace(
      c.title || ' ' || c.summary || ' ' || c.topic || ' ' || c.keywords || ' ' || array_to_string(c.exam_tags, ' ') || ' ' ||
      coalesce((select r.name from case_regions r where r.id = c.region_id), '') || ' ' || c.vignette || ' ' ||
      coalesce((select string_agg(coalesce(s.reveal, '') || ' ' || s.stem || ' ' || s.explanation || ' ' || s.learning_point, ' ')
                from case_steps s where s.case_id = c.id), ''),
      '<[^>]*>|&[a-z]+;', ' ', 'g'))
  where c.id = p_case;
$$;
revoke all on function public.case_refresh_search(uuid) from public, anon, authenticated;

create or replace function public.case_search_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_table_name = 'case_steps' then
    if tg_op = 'DELETE' then perform public.case_refresh_search(old.case_id);
    else perform public.case_refresh_search(new.case_id); end if;
  else
    perform public.case_refresh_search(new.id);
  end if;
  return null;
end $$;
drop trigger if exists clinical_cases_search on public.clinical_cases;
create trigger clinical_cases_search after insert or update of title, summary, topic, keywords, exam_tags, region_id, vignette
  on public.clinical_cases for each row execute function public.case_search_trg();
drop trigger if exists case_steps_search on public.case_steps;
create trigger case_steps_search after insert or update or delete on public.case_steps
  for each row execute function public.case_search_trg();
select public.case_refresh_search(id) from public.clinical_cases;
