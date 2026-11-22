-- Clinical Cases: long, unfolding vignettes (NEET SS / INI-CET / USMLE style),
-- organised by body region with Core and Advanced levels. Kept separate from
-- the question bank (`questions`).
--
-- Content flow: a case opens with a vignette; each step may reveal new findings
-- and then asks one question. Answers and explanations are only returned by
-- case_check, one step at a time, so later findings never spoil earlier steps.
--
-- Access: published + is_free cases are open to everyone (guests included);
-- other published cases need Pro. Admins (app_metadata.role = 'admin') also
-- see drafts, so a reviewer can check a case before it is published.

create table if not exists public.case_regions (
  id text primary key,
  name text not null,
  blurb text not null default '',
  icon text not null default '',
  sort int not null default 0
);

create table if not exists public.clinical_cases (
  id uuid primary key default gen_random_uuid(),
  region_id text not null references public.case_regions(id),
  level text not null check (level in ('core', 'advanced')),
  title text not null,
  summary text not null default '',          -- one line shown on the list (no spoilers)
  exam_tags text[] not null default '{}',     -- e.g. {NEET SS, INI-CET, USMLE}
  vignette text not null,                     -- HTML allowed (sanitised client side)
  est_minutes int not null default 8,
  is_free boolean not null default false,
  published boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinical_cases_region_idx on public.clinical_cases (region_id, level, sort);

create table if not exists public.case_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.clinical_cases(id) on delete cascade,
  step_no int not null,
  reveal text,                                -- new findings shown before this step's question
  stem text not null,
  options jsonb not null,                     -- [{"key":"A","text":"..."}, ...]
  correct_key text not null,
  explanation text not null default '',
  learning_point text not null default '',
  unique (case_id, step_no)
);

create table if not exists public.case_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.clinical_cases(id) on delete cascade,
  score int not null,
  total int not null,
  best_score int not null,
  attempts int not null default 1,
  last_at timestamptz not null default now(),
  primary key (user_id, case_id)
);

-- Everything goes through the RPCs below; no direct table access.
alter table public.case_regions enable row level security;
alter table public.clinical_cases enable row level security;
alter table public.case_steps enable row level security;
alter table public.case_attempts enable row level security;

-- ---------- helpers ----------
create or replace function public.case_can_open(c public.clinical_cases)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mock_is_admin()
      or (c.published and (c.is_free or public.battle_is_pro(auth.uid())));
$$;
revoke all on function public.case_can_open(public.clinical_cases) from public, anon, authenticated;

create or replace function public.case_step_json(s public.case_steps)
returns jsonb language sql immutable as $$
  select jsonb_build_object('step_no', s.step_no, 'reveal', s.reveal, 'stem', s.stem, 'options', s.options);
$$;
revoke all on function public.case_step_json(public.case_steps) from public, anon, authenticated;

-- ---------- catalogue: regions + case cards (no case content) ----------
create or replace function public.cases_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  with admin as (select public.mock_is_admin() as a),
  pro as (select public.battle_is_pro(auth.uid()) as p),
  vis as (
    select c.*, (select count(*) from case_steps s where s.case_id = c.id) as steps
    from clinical_cases c, admin
    where c.published or admin.a
  )
  select jsonb_build_object(
    'is_pro', (select p from pro) or (select a from admin),
    'regions', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'blurb', r.blurb, 'icon', r.icon) order by r.sort) from case_regions r), '[]'),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'region_id', v.region_id, 'level', v.level, 'title', v.title, 'summary', v.summary,
        'exam_tags', v.exam_tags, 'est_minutes', v.est_minutes, 'is_free', v.is_free, 'steps', v.steps,
        'draft', not v.published,
        'locked', not (v.is_free or (select p from pro) or (select a from admin)),
        'best', a.best_score, 'tries', a.attempts
      ) order by v.region_id, case v.level when 'core' then 0 else 1 end, v.sort, v.created_at)
      from vis v left join case_attempts a on a.case_id = v.id and a.user_id = auth.uid()
    ), '[]')
  );
$$;
grant execute on function public.cases_catalog() to anon, authenticated;

-- ---------- open a case: vignette + first step ----------
create or replace function public.case_open(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clinical_cases; s case_steps; n int;
begin
  select * into c from clinical_cases where id = p_case;
  if not found or not (c.published or public.mock_is_admin()) then raise exception 'not_found'; end if;
  if not public.case_can_open(c) then raise exception 'pro_required'; end if;
  select count(*) into n from case_steps where case_id = c.id;
  if n = 0 then raise exception 'no_steps'; end if;
  select * into s from case_steps where case_id = c.id order by step_no limit 1;
  return jsonb_build_object(
    'id', c.id, 'region_id', c.region_id, 'level', c.level, 'title', c.title, 'exam_tags', c.exam_tags,
    'vignette', c.vignette, 'est_minutes', c.est_minutes, 'total', n, 'draft', not c.published,
    'step', public.case_step_json(s));
end $$;
grant execute on function public.case_open(uuid) to anon, authenticated;

-- ---------- answer a step: verdict + explanation + the next step ----------
create or replace function public.case_check(p_case uuid, p_step int, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clinical_cases; s case_steps; nx case_steps;
begin
  select * into c from clinical_cases where id = p_case;
  if not found or not (c.published or public.mock_is_admin()) then raise exception 'not_found'; end if;
  if not public.case_can_open(c) then raise exception 'pro_required'; end if;
  select * into s from case_steps where case_id = p_case and step_no = p_step;
  if not found then raise exception 'not_found'; end if;
  select * into nx from case_steps where case_id = p_case and step_no > p_step order by step_no limit 1;
  return jsonb_build_object(
    'correct', upper(coalesce(p_key, '')) = upper(s.correct_key),
    'correct_key', s.correct_key,
    'explanation', s.explanation,
    'learning_point', s.learning_point,
    'next', case when nx.id is null then null else public.case_step_json(nx) end);
end $$;
grant execute on function public.case_check(uuid, int, text) to anon, authenticated;

-- ---------- save a finished case (signed-in users) ----------
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
  return jsonb_build_object('best', r.best_score, 'tries', r.attempts);
end $$;
revoke all on function public.case_finish(uuid, int) from anon;
grant execute on function public.case_finish(uuid, int) to authenticated;

-- ---------- regions ----------
insert into public.case_regions (id, name, blurb, icon, sort) values
  ('cardio',   'Cardiovascular',               'Chest pain, heart failure, arrhythmia, shock',           '🫀', 1),
  ('resp',     'Respiratory',                  'Breathlessness, cough, hypoxia, pleural disease',        '🫁', 2),
  ('neuro',    'Neurology',                    'Stroke, seizures, weakness, headache, coma',             '🧠', 3),
  ('gi',       'Gastro & Hepatobiliary',       'GI bleed, jaundice, abdominal pain, liver failure',      '🩺', 4),
  ('renal',    'Renal & Electrolytes',         'AKI, nephrotic and nephritic, acid–base, sodium',        '💧', 5),
  ('endo',     'Endocrine & Metabolic',        'Diabetes emergencies, thyroid, adrenal, calcium',        '⚖️', 6),
  ('heme',     'Haematology & Oncology',       'Anaemia, bleeding, clots, leukaemia, lymphoma',          '🩸', 7),
  ('id',       'Infectious Disease',           'Fever, sepsis, tropical infections, HIV, TB',            '🦠', 8),
  ('msk',      'Musculoskeletal & Rheumatology','Joint pain, vasculitis, lupus, bone disease',           '🦴', 9),
  ('obgyn',    'Obstetrics & Gynaecology',     'Pregnancy complications, bleeding, pelvic pain',         '🤰', 10),
  ('peds',     'Paediatrics & Neonatology',    'Sick newborn, fever, growth, congenital disease',        '👶', 11),
  ('psych',    'Psychiatry',                   'Psychosis, mood, toxicology, behavioural emergencies',   '🧩', 12),
  ('emerg',    'Emergency & Critical Care',    'Trauma, poisoning, resuscitation, ICU decisions',        '🚑', 13)
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, icon = excluded.icon, sort = excluded.sort;
