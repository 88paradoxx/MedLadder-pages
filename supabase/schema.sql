-- ============================================================================
-- MedLadder backend schema — run this WHOLE file in the Supabase SQL editor.
-- Idempotent: safe to run again after any change.
--
-- What it does
--   1. subscriptions   — the ONLY source of truth for "is this user Pro?"
--                        (written by Edge Functions with the service role; users can only read their own)
--   2. payments        — server-written payment ledger (users can only read their own)
--   3. free_modules    — which modules are free (first 8 per subject)
--   4. questions RLS   — free users: free modules only. Pro / admin: everything.
--                        PYQ rows (is_pyq) are Pro-only.
--   5. module_progress RLS, admin_audit, admin_find_user_id()
--
-- Admin access is NOT granted here. See supabase/grant-admin.sql.
-- ============================================================================


-- ── 1. subscriptions ────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  plan_id              text,
  status               text not null default 'active',
  starts_at            timestamptz not null default now(),
  expires_at           timestamptz not null,
  razorpay_payment_id  text,
  razorpay_order_id    text,
  granted_by           text,               -- 'razorpay' or the admin's email
  created_at           timestamptz not null default now()
);

-- If an older version of this table already exists, bring it up to date.
alter table public.subscriptions add column if not exists starts_at         timestamptz not null default now();
alter table public.subscriptions add column if not exists razorpay_order_id text;
alter table public.subscriptions add column if not exists granted_by        text;
alter table public.subscriptions add column if not exists updated_at        timestamptz not null default now();

do $$
begin
  alter table public.subscriptions drop constraint if exists subscriptions_status_check;
  alter table public.subscriptions
    add constraint subscriptions_status_check check (status in ('active', 'expired', 'cancelled', 'refunded', 'disputed'));
end $$;

-- One subscription row per Razorpay payment => webhook + verify can both run safely.
create unique index if not exists subscriptions_payment_uidx
  on public.subscriptions (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists subscriptions_user_active_idx
  on public.subscriptions (user_id, expires_at desc) where status = 'active';

alter table public.subscriptions enable row level security;

drop policy if exists "Users read own subscriptions" on public.subscriptions;
drop policy if exists "subscriptions_select_own"     on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies exist, so browsers can never write here.
-- Belt and braces: also remove the table privileges.
revoke all on public.subscriptions from anon;
revoke insert, update, delete, truncate on public.subscriptions from authenticated;


-- ── 2. payments (server-written ledger) ─────────────────────────────────────
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id) on delete set null,
  user_email           text,
  razorpay_order_id    text,
  razorpay_payment_id  text,
  razorpay_signature   text,
  plan_id              text,
  plan_name            text,
  amount_paise         integer,
  currency             text default 'INR',
  status               text not null default 'created',   -- created | paid | failed
  verified_on_server   boolean not null default false,
  expires_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.payments add column if not exists user_email          text;
alter table public.payments add column if not exists razorpay_order_id   text;
alter table public.payments add column if not exists razorpay_payment_id text;
alter table public.payments add column if not exists razorpay_signature  text;
alter table public.payments add column if not exists plan_id             text;
alter table public.payments add column if not exists plan_name           text;
alter table public.payments add column if not exists amount_paise        integer;
alter table public.payments add column if not exists currency            text default 'INR';
alter table public.payments add column if not exists verified_on_server  boolean not null default false;
alter table public.payments add column if not exists expires_at          timestamptz;
alter table public.payments add column if not exists updated_at          timestamptz not null default now();

-- Ensure columns that are populated only after payment are not constrained to NOT NULL
alter table public.payments alter column razorpay_payment_id drop not null;
alter table public.payments alter column razorpay_signature drop not null;

create index if not exists payments_order_idx on public.payments (razorpay_order_id);
create index if not exists payments_user_idx  on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;

-- Browsers used to INSERT their own payment rows (and could claim
-- verified_on_server = true). Only Edge Functions write here now.
drop policy if exists "Users insert own payment logs" on public.payments;
drop policy if exists "Users read own payment logs"   on public.payments;
drop policy if exists "payments_select_own"           on public.payments;
create policy "payments_select_own"
  on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.payments from anon;
revoke insert, update, delete, truncate on public.payments from authenticated;


-- ── 3. free_modules ─────────────────────────────────────────────────────────
create table if not exists public.free_modules (
  module_id integer primary key
);
alter table public.free_modules enable row level security;
drop policy if exists "free_modules_read" on public.free_modules;
create policy "free_modules_read"
  on public.free_modules for select to authenticated using (true);
revoke all on public.free_modules from anon;
revoke insert, update, delete, truncate on public.free_modules from authenticated;

-- 152 free modules (8 per subject, generated from syllabus.js)
delete from public.free_modules;
insert into public.free_modules (module_id) values
  (1), (2), (3), (4), (5), (6), (7), (8), (59), (60),
  (61), (62), (63), (64), (65), (66), (99), (100), (101), (102),
  (103), (104), (105), (106), (126), (127), (128), (129), (130), (131),
  (132), (133), (190), (191), (192), (193), (194), (195), (196), (197),
  (221), (222), (223), (224), (225), (226), (227), (228), (272), (273),
  (274), (275), (276), (277), (278), (279), (293), (294), (295), (296),
  (297), (298), (299), (300), (329), (330), (331), (332), (333), (334),
  (335), (336), (355), (356), (357), (358), (359), (360), (361), (362),
  (411), (412), (413), (414), (415), (416), (417), (418), (480), (481),
  (482), (483), (484), (485), (486), (487), (531), (532), (533), (534),
  (535), (536), (537), (538), (575), (576), (577), (578), (579), (580),
  (581), (582), (609), (610), (611), (612), (613), (614), (615), (616),
  (633), (634), (635), (636), (637), (638), (639), (640), (657), (658),
  (659), (660), (661), (662), (663), (664), (687), (688), (689), (690),
  (691), (692), (693), (694), (720), (721), (722), (723), (724), (725),
  (726), (727);


-- ── 4. helper functions (created after the tables they read) ────────────────
-- True only when the caller's JWT carries app_metadata.role = 'admin'.
-- app_metadata can only be changed server-side (dashboard / SQL / service role),
-- unlike user_metadata which every signed-in user can edit on themselves.
create or replace function public.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.has_pro_access()
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid())
      and s.status = 'active'
      and s.expires_at > now()
  );
$$;

-- What the browser calls to render "Pro until <date>". It only DISPLAYS state —
-- the real enforcement is the questions policy below.
create or replace function public.my_pro_status()
returns table (is_pro boolean, expires_at timestamptz, plan_id text)
language sql stable
set search_path = ''
as $$
  select (s.user_id is not null) as is_pro, s.expires_at, s.plan_id
  from (select 1) d
  left join lateral (
    select sub.user_id, sub.expires_at, sub.plan_id
    from public.subscriptions sub
    where sub.user_id = (select auth.uid())
      and sub.status = 'active'
      and sub.expires_at > now()
    order by sub.expires_at desc
    limit 1
  ) s on true;
$$;

revoke all on function public.is_admin()        from public, anon;
revoke all on function public.has_pro_access()  from public, anon;
revoke all on function public.my_pro_status()   from public, anon;
grant execute on function public.is_admin()        to authenticated;
grant execute on function public.has_pro_access()  to authenticated;
grant execute on function public.my_pro_status()   to authenticated;


-- ── 5. questions: real row-level security ───────────────────────────────────
alter table public.questions enable row level security;

-- Remove EVERY existing policy on questions (including the old
-- "Authenticated read questions ... USING (true)"), then add the one below.
-- Imports/edits still work: the SQL editor and service-role scripts bypass RLS.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'questions'
  loop
    execute format('drop policy %I on public.questions', p.policyname);
  end loop;
end $$;

create policy "questions_select_entitled"
  on public.questions for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_pro_access())
    or (
      coalesce(is_pyq, false) = false
      and module_id in (select fm.module_id from public.free_modules fm)
    )
  );

revoke all on public.questions from anon;
revoke insert, update, delete, truncate on public.questions from authenticated;


-- ── 6. module_progress: each user sees / writes only their own rows ─────────
create table if not exists public.module_progress (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  module_key      text not null,
  answered_count  integer not null default 0,
  correct_count   integer not null default 0,
  total_questions integer not null default 0,
  updated_at      timestamptz not null default now(),
  constraint module_progress_user_module_uq unique (user_id, module_key)
);
create index if not exists module_progress_user_idx on public.module_progress (user_id);

alter table public.module_progress enable row level security;
drop policy if exists "progress_select_own" on public.module_progress;
drop policy if exists "progress_insert_own" on public.module_progress;
drop policy if exists "progress_update_own" on public.module_progress;
drop policy if exists "progress_delete_own" on public.module_progress;
create policy "progress_select_own" on public.module_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "progress_insert_own" on public.module_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progress_update_own" on public.module_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "progress_delete_own" on public.module_progress for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.module_progress from anon;


-- ── 7. admin plumbing (used only by the admin-grant-pro Edge Function) ──────
create table if not exists public.admin_audit (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  admin_email text,
  action     text not null,
  target_id  uuid,
  target_email text,
  details    jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;   -- no policies: service role only
revoke all on public.admin_audit from anon, authenticated;

-- Look up an auth user by email WITHOUT paging through listUsers().
create or replace function public.admin_find_user_id(p_email text)
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.admin_find_user_id(text) from public, anon, authenticated;
grant execute on function public.admin_find_user_id(text) to service_role;
